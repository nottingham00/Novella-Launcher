const {
  app, BrowserWindow, ipcMain, dialog, Menu, shell,
  nativeTheme, Notification, safeStorage
} = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { execFile, exec } = require('child_process');
const axios = require('axios');
const os = require('os');

const APP_NAME = 'Novella Launcher';
const VERSION = '1.0.1';
const UPDATE_URL = 'https://api.github.com/repos/nottingham00/Novella-Launcher/releases/latest';

// Portable mode detection
const portableFlag = process.argv.includes('--portable') || fsSync.existsSync(path.join(process.execPath, '..', 'portable_data'));
const userDataPath = portableFlag ? path.join(path.dirname(process.execPath), 'data') : app.getPath('userData');
const CONFIG_FILE = path.join(userDataPath, 'config.json');
const LIBRARY_FILE = path.join(userDataPath, 'library.json');
const RATINGS_FILE = path.join(userDataPath, 'user_ratings.json');
const COVERS_DIR = path.join(userDataPath, 'covers');

const MAX_COVER_BYTES = 10 * 1024 * 1024;
const ALLOWED_COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

let mainWindow;
let activeGameProcesses = new Map(); // playtime tracking

// Discord Rich Presence (optional)
let discordRpc = null;
function initDiscord() {
  try {
    const DiscordRPC = require('discord-rpc');
    const clientId = 'YOUR_DISCORD_APP_ID'; // Replace with your app ID
    DiscordRPC.register(clientId);
    discordRpc = new DiscordRPC.Client({ transport: 'ipc' });
    discordRpc.on('ready', () => {
      discordRpc.setActivity({
        details: 'Browsing visual novels',
        state: 'in Novella Launcher',
        largeImageKey: 'novella_logo',
        largeImageText: 'Novella Launcher',
        instance: false
      });
    });
    discordRpc.login({ clientId }).catch(() => {});
  } catch (e) { console.log('Discord RPC not available'); }
}
function setDiscordPlaying(title) {
  if (discordRpc) {
    discordRpc.setActivity({
      details: `Playing ${title}`,
      state: 'Visual Novel',
      largeImageKey: 'novella_logo',
      instance: false
    });
  }
}
function clearDiscord() {
  if (discordRpc) {
    discordRpc.setActivity({
      details: 'Browsing visual novels',
      state: 'in Novella Launcher',
      largeImageKey: 'novella_logo',
      instance: false
    });
  }
}

// Semver
function isNewerVersion(remote, local) {
  const parse = v => v.replace(/^v/, '').split('.').map(Number);
  const [rMaj, rMin, rPat] = parse(remote);
  const [lMaj, lMin, lPat] = parse(local);
  if (rMaj !== lMaj) return rMaj > lMaj;
  if (rMin !== lMin) return rMin > lMin;
  return rPat > lPat;
}

// Encryption
function encryptToken(plaintext) {
  if (!plaintext || !safeStorage.isEncryptionAvailable()) return plaintext;
  return safeStorage.encryptString(plaintext).toString('base64');
}
function decryptToken(stored) {
  if (!stored || !safeStorage.isEncryptionAvailable()) return stored;
  try { return safeStorage.decryptString(Buffer.from(stored, 'base64')); } catch { return stored; }
}

async function ensureFiles() {
  await fs.mkdir(COVERS_DIR, { recursive: true });
  const defaults = [
    [CONFIG_FILE, { vndb_token: '', theme: 'auto', auto_check_updates: true, sync_to_vndb: false, scan_folders: [], collections: [] }],
    [LIBRARY_FILE, { library: [] }],
    [RATINGS_FILE, { ratings: {} }],
  ];
  for (const [file, def] of defaults) {
    try { await fs.access(file); } catch { await fs.writeFile(file, JSON.stringify(def, null, 2)); }
  }
}

// VNDB client
class VNDBClient {
  constructor(token) { this.token = token; }
  async searchVN(query, limit = 10) {
    const res = await axios.post('https://api.vndb.org/kana/vn', { filters: ['search', '=', query], fields: 'id,title,alttitle,image.url,description,rating,votecount,released', results: limit }, { headers: this._headers(), timeout: 15000 });
    return res.data.results || [];
  }
  async getVN(vnId) {
    const res = await axios.post('https://api.vndb.org/kana/vn', { filters: ['id', '=', vnId], fields: 'id,title,alttitle,image.url,description,rating,votecount,released,tags.name,developers.name' }, { headers: this._headers(), timeout: 15000 });
    return (res.data.results || [])[0] || null;
  }
  _headers() { return { 'Content-Type': 'application/json', 'Authorization': `Token ${this.token}` }; }
}

function cleanHtml(text) { return text ? text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[^>]+(>|$)/g, '').trim() : ''; }

async function downloadCover(url, vnId) {
  if (!url) return null;
  const ext = path.extname(url.split('?')[0]) || '.jpg';
  const filepath = path.join(COVERS_DIR, `${vnId}${ext}`);
  try { await fs.access(filepath); return filepath; } catch {}
  let headRes;
  try { headRes = await axios.head(url, { timeout: 8000 }); } catch { headRes = null; }
  if (headRes) {
    const ct = (headRes.headers['content-type'] || '').split(';')[0].trim();
    const size = parseInt(headRes.headers['content-length'] || '0', 10);
    if (!ALLOWED_COVER_TYPES.includes(ct)) throw new Error(`Unexpected cover type: ${ct}`);
    if (size && size > MAX_COVER_BYTES) throw new Error('Cover too large');
  }
  const writer = fsSync.createWriteStream(filepath);
  const response = await axios({ url, method: 'GET', responseType: 'stream', timeout: 10000 });
  const ct = (response.headers['content-type'] || '').split(';')[0].trim();
  if (!ALLOWED_COVER_TYPES.includes(ct)) { writer.destroy(); throw new Error(`Bad content-type: ${ct}`); }
  response.data.pipe(writer);
  return new Promise((resolve, reject) => { writer.on('finish', () => resolve(filepath)); writer.on('error', reject); });
}

// Steam scanning
async function readAcfFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const nameMatch = content.match(/"name"\s+"([^"]+)"/);
  const installdirMatch = content.match(/"installdir"\s+"([^"]+)"/);
  const stateMatch = content.match(/"StateFlags"\s+"(\d+)"/);
  if (!nameMatch || !installdirMatch) return null;
  const state = stateMatch ? parseInt(stateMatch[1], 10) : 0;
  if ((state & 4) === 0) return null;
  return { title: nameMatch[1], installdir: installdirMatch[1] };
}
async function getSteamAppsFolders() {
  const possibleSteamPaths = [];
  if (process.platform === 'win32') {
    possibleSteamPaths.push('C:/Program Files (x86)/Steam');
    possibleSteamPaths.push(`${process.env.HOMEDRIVE || 'C:'}/Steam`);
  } else if (process.platform === 'darwin') {
    possibleSteamPaths.push(path.join(os.homedir(), 'Library/Application Support/Steam'));
  } else {
    possibleSteamPaths.push(path.join(os.homedir(), '.steam/steam'));
  }
  const steamAppsFolders = [];
  for (const base of possibleSteamPaths) {
    const libraryFile = path.join(base, 'steamapps/libraryfolders.vdf');
    try {
      await fs.access(libraryFile);
      steamAppsFolders.push(path.join(base, 'steamapps'));
      const libContent = await fs.readFile(libraryFile, 'utf8');
      const pathMatches = libContent.matchAll(/"path"\s+"([^"]+)"/g);
      for (const match of pathMatches) {
        let libPath = match[1];
        if (process.platform === 'win32') libPath = libPath.replace(/\\\\/g, '\\');
        steamAppsFolders.push(path.join(libPath, 'steamapps'));
      }
    } catch {}
  }
  return [...new Set(steamAppsFolders)];
}
async function scanSteamGames() {
  const steamAppsFolders = await getSteamAppsFolders();
  const games = [];
  for (const appsDir of steamAppsFolders) {
    try {
      const files = await fs.readdir(appsDir);
      const acfFiles = files.filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'));
      for (const acf of acfFiles) {
        const acfPath = path.join(appsDir, acf);
        const gameInfo = await readAcfFile(acfPath);
        if (!gameInfo) continue;
        const steamAppId = acf.match(/appmanifest_(\d+)\.acf/)[1];
        const installDir = path.join(appsDir, 'common', gameInfo.installdir);
        games.push({ source: 'steam', title: gameInfo.title, steamAppId, installDir });
      }
    } catch (err) { console.warn(err); }
  }
  return games;
}

// Executable scanning
const VN_KEYWORDS = ['visual novel', 'vn', 'renpy', 'kirikiri', 'tyrano', 'nscripter', 'rpg maker'];
function isLikelyVisualNovel(name) {
  const lower = name.toLowerCase();
  return VN_KEYWORDS.some(kw => lower.includes(kw)) ||
    ['renpy.exe', 'tyranoscript.exe', 'nscripter.exe', 'game.exe', 'start.exe'].includes(lower);
}
async function scanExecutables(folders) {
  const results = [];
  const scannedPaths = new Set();
  for (const folder of folders) {
    if (!folder || typeof folder !== 'string') continue;
    try { await fs.access(folder); } catch { continue; }
    async function scanDir(dir) {
      let entries;
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) await scanDir(fullPath);
        else if (entry.isFile() && (fullPath.endsWith('.exe') || fullPath.endsWith('.app'))) {
          const fileName = entry.name.toLowerCase();
          if (fileName.includes('uninstall') || fileName.includes('setup') || fileName.includes('installer')) continue;
          const parentDir = path.basename(path.dirname(fullPath));
          const candidateName = parentDir !== '.' ? parentDir : path.basename(fullPath, path.extname(fullPath));
          if (isLikelyVisualNovel(candidateName) || isLikelyVisualNovel(fileName)) {
            if (!scannedPaths.has(fullPath)) {
              scannedPaths.add(fullPath);
              results.push({
                source: 'filesystem',
                title: candidateName.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                execPath: fullPath,
                installDir: path.dirname(fullPath),
              });
            }
          }
        }
      }
    }
    await scanDir(folder);
  }
  return results;
}
async function scanCombinedGames() {
  const cfg = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
  const scanFolders = cfg.scan_folders || [];
  const defaultScanPaths = [];
  if (process.platform === 'win32') {
    defaultScanPaths.push('C:/Program Files', 'C:/Program Files (x86)', path.join(app.getPath('documents'), 'Visual Novels'), path.join(app.getPath('home'), 'Games'));
  } else if (process.platform === 'darwin') {
    defaultScanPaths.push('/Applications', path.join(app.getPath('home'), 'Applications'));
  } else {
    defaultScanPaths.push('/usr/local/games', path.join(app.getPath('home'), 'Games'));
  }
  const allScanPaths = [...new Set([...defaultScanPaths, ...scanFolders])];
  const [steamGames, exeGames] = await Promise.all([scanSteamGames(), scanExecutables(allScanPaths)]);
  const allGames = [...steamGames, ...exeGames];
  const unique = [];
  const seen = new Set();
  for (const game of allGames) {
    const key = game.title.toLowerCase();
    if (!seen.has(key)) { seen.add(key); unique.push(game); }
  }
  return unique;
}

// IPC handlers
async function setupIpcHandlers() {
  ipcMain.handle('load-config', async () => {
    const cfg = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
    cfg.vndb_token = decryptToken(cfg.vndb_token);
    return cfg;
  });
  ipcMain.handle('save-config', async (event, cfg) => {
    const toWrite = { ...cfg, vndb_token: encryptToken(cfg.vndb_token) };
    await fs.writeFile(CONFIG_FILE, JSON.stringify(toWrite, null, 2));
    return true;
  });
  ipcMain.handle('load-library', async () => JSON.parse(await fs.readFile(LIBRARY_FILE, 'utf8')));
  ipcMain.handle('save-library', async (_, lib) => { await fs.writeFile(LIBRARY_FILE, JSON.stringify(lib, null, 2)); return true; });
  ipcMain.handle('load-ratings', async () => JSON.parse(await fs.readFile(RATINGS_FILE, 'utf8')));
  ipcMain.handle('save-ratings', async (_, rats) => { await fs.writeFile(RATINGS_FILE, JSON.stringify(rats, null, 2)); return true; });
  ipcMain.handle('vndb-search', async (_, { token, query }) => new VNDBClient(token).searchVN(query));
  ipcMain.handle('vndb-details', async (_, { token, vnId }) => new VNDBClient(token).getVN(vnId));
  ipcMain.handle('download-cover', async (_, { url, vnId }) => downloadCover(url, vnId));
  ipcMain.handle('select-exe', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Select Executable', filters: [{ name: 'Executable', extensions: ['exe', 'app', 'sh', 'bat'] }, { name: 'All Files', extensions: ['*'] }], properties: ['openFile'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('launch-game', async (_, exePath, cwd, args = []) => {
    return new Promise((resolve, reject) => {
      const proc = execFile(exePath, args, { cwd: cwd || path.dirname(exePath), detached: true }, err => { if (err) reject(err); else resolve(true); });
      return proc;
    });
  });
  ipcMain.handle('launch-steam-game', async (_, steamAppId) => {
    return new Promise((resolve, reject) => { exec(`steam://rungameid/${steamAppId}`, err => { if (err) reject(err); else resolve(true); }); });
  });
  ipcMain.handle('start-playtime-tracking', async (_, vnId) => {
    if (activeGameProcesses.has(vnId)) return;
    const startTime = Date.now();
    const interval = setInterval(async () => {
      try {
        const lib = JSON.parse(await fs.readFile(LIBRARY_FILE, 'utf8'));
        const entry = lib.library.find(e => e.vndb_id === vnId);
        if (entry) {
          entry.playtime_minutes = (entry.playtime_minutes || 0) + 1;
          await fs.writeFile(LIBRARY_FILE, JSON.stringify(lib, null, 2));
          mainWindow.webContents.send('playtime-updated', { vnId, playtime: entry.playtime_minutes });
        }
      } catch (e) {}
    }, 60000);
    activeGameProcesses.set(vnId, { startTime, interval });
  });
  ipcMain.handle('stop-playtime-tracking', async (_, vnId) => {
    const track = activeGameProcesses.get(vnId);
    if (track) { clearInterval(track.interval); activeGameProcesses.delete(vnId); }
  });
  ipcMain.handle('check-updates', async () => {
    try {
      const res = await axios.get(UPDATE_URL, { headers: { 'User-Agent': 'Novella-Launcher' }, timeout: 10000 });
      const latestVersion = res.data.tag_name.replace(/^v/, '');
      if (isNewerVersion(latestVersion, VERSION)) {
        const asset = res.data.assets.find(a => /\.(exe|dmg|appimage|zip)$/i.test(a.name));
        return { hasUpdate: true, version: res.data.tag_name, downloadUrl: asset ? asset.browser_download_url : res.data.html_url };
      }
      return { hasUpdate: false };
    } catch { return { hasUpdate: false }; }
  });
  ipcMain.handle('open-external', (_, url) => shell.openExternal(url));
  ipcMain.handle('get-system-theme', () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  ipcMain.handle('show-notification', (_, { title, body }) => new Notification({ title, body }).show());
  ipcMain.handle('vndb-authinfo', async (_, token) => {
    const res = await axios.get('https://api.vndb.org/kana/authinfo', { headers: { 'Authorization': `Token ${token}` }, timeout: 8000 });
    return res.data;
  });
  ipcMain.handle('vndb-ulist-set', async (_, { token, vnId, vote, notes }) => {
    const vndbVote = (vote != null && vote > 0) ? Math.round(vote * 10) : null;
    const body = {};
    if (vndbVote !== null) body.vote = vndbVote;
    if (notes && notes.trim()) body.notes = notes.trim();
    const res = await axios.post(`https://api.vndb.org/kana/ulist/${vnId}`, body, { headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' }, timeout: 10000 });
    return res.status;
  });
  ipcMain.handle('vndb-ulist-delete', async (_, { token, vnId }) => {
    const res = await axios.delete(`https://api.vndb.org/kana/ulist/${vnId}`, { headers: { 'Authorization': `Token ${token}` }, timeout: 10000 });
    return res.status;
  });
  ipcMain.handle('vndb-userlist', async (_, token) => {
    const res = await axios.post('https://api.vndb.org/kana/ulist', { filters: ['uid', '=', 'me'], fields: 'vn.id,vn.title,vn.image.url,vote,notes,status' }, { headers: { 'Authorization': `Token ${token}` }, timeout: 15000 });
    return res.data.results || [];
  });
  ipcMain.handle('scan-games', async () => {
    try { const games = await scanCombinedGames(); return { success: true, games }; } catch (err) { return { success: false, error: err.message }; }
  });
  
  // Fixed backup handler using dynamic import for archiver
  ipcMain.handle('backup-library', async () => {
    const { createWriteStream } = require('fs');
    const archiverModule = await import('archiver');
    const archiver = archiverModule.default;
    const backupPath = path.join(app.getPath('documents'), `Novella_Backup_${Date.now()}.zip`);
    const output = createWriteStream(backupPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(output);
    archive.file(CONFIG_FILE, { name: 'config.json' });
    archive.file(LIBRARY_FILE, { name: 'library.json' });
    archive.file(RATINGS_FILE, { name: 'ratings.json' });
    archive.directory(COVERS_DIR, 'covers');
    await archive.finalize();
    return { success: true, path: backupPath };
  });
  
  // Fixed restore handler using dynamic import for extract-zip
  ipcMain.handle('restore-backup', async (_, zipPath) => {
    const extractModule = await import('extract-zip');
    const extract = extractModule.default;
    await extract(zipPath, { dir: userDataPath });
    return { success: true };
  });
  
  ipcMain.handle('window-minimize', () => mainWindow?.minimize());
  ipcMain.handle('window-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
  ipcMain.handle('window-close', () => mainWindow?.close());
  ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle('show-open-dialog', async (_, opts) => dialog.showOpenDialog(mainWindow, opts));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 800, minHeight: 600, frame: false, titleBarStyle: 'hidden',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true },
    title: `${APP_NAME} v${VERSION}`, show: false
  });
  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false));
  const menuTemplate = [
    { label: 'File', submenu: [{ label: 'Check for Updates', click: () => mainWindow.webContents.send('menu-check-updates') }, { type: 'separator' }, { label: 'Exit', role: 'quit' }] },
    { label: 'Library', submenu: [{ label: 'Update Library Data', click: () => mainWindow.webContents.send('menu-update-library') }] },
    { label: 'Help', submenu: [{ label: `About ${APP_NAME}`, click: () => dialog.showMessageBox(mainWindow, { type: 'info', title: `About ${APP_NAME}`, message: `${APP_NAME} v${VERSION}\n\nVisual novel launcher`, buttons: ['OK'] }) }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

app.whenReady().then(async () => {
  await ensureFiles();
  await setupIpcHandlers();
  createWindow();
  initDiscord();
  const rawCfg = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
  nativeTheme.on('updated', async () => {
    const cfg = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
    if (mainWindow && cfg.theme === 'auto') mainWindow.webContents.send('system-theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });