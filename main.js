const {
  app, BrowserWindow, ipcMain, dialog, Menu, shell,
  nativeTheme, Notification, safeStorage
} = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { execFile } = require('child_process');
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
let activeGameProcesses = new Map();

// Discord Rich Presence (optional)
let discordRpc = null;
function initDiscord() {
  try {
    const DiscordRPC = require('discord-rpc');
    const clientId = 'YOUR_DISCORD_APP_ID';
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
  try {
    return safeStorage.encryptString(plaintext).toString('base64');
  } catch { return plaintext; }
}
function decryptToken(stored) {
  if (!stored || !safeStorage.isEncryptionAvailable()) return stored;
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'));
  } catch { return stored; }
}

async function ensureFiles() {
  await fs.mkdir(COVERS_DIR, { recursive: true });
  const defaults = [
    [CONFIG_FILE, { vndb_token: '', theme: 'auto', auto_check_updates: true, sync_to_vndb: false, collections: [] }],
    [LIBRARY_FILE, { library: [] }],
    [RATINGS_FILE, { ratings: {} }],
  ];
  for (const [file, def] of defaults) {
    try { await fs.access(file); } catch { await fs.writeFile(file, JSON.stringify(def, null, 2)); }
  }
}

// VNDB client
class VNDBClient {
  constructor(token) { this.token = token ? token.trim() : ''; }
  async searchVN(query, limit = 10) {
    const res = await axios.post('https://api.vndb.org/kana/vn', {
      filters: ['search', '=', query],
      fields: 'id,title,alttitle,image.url,description,rating,votecount,released',
      results: limit
    }, { headers: this._headers(), timeout: 15000 });
    return res.data.results || [];
  }
  async getVN(vnId) {
    const res = await axios.post('https://api.vndb.org/kana/vn', {
      filters: ['id', '=', vnId],
      fields: 'id,title,alttitle,image.url,description,rating,votecount,released,tags.name,developers.name'
    }, { headers: this._headers(), timeout: 15000 });
    return (res.data.results || [])[0] || null;
  }
  async testToken() {
    try {
      const res = await axios.get('https://api.vndb.org/kana/authinfo', { headers: this._headers(), timeout: 8000 });
      return { valid: true, username: res.data.username, permissions: res.data.permissions };
    } catch (err) {
      return { valid: false, error: err.response?.status === 401 ? 'Invalid or expired token' : err.message };
    }
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

// IPC handlers
async function setupIpcHandlers() {
  ipcMain.handle('load-config', async () => {
    const cfg = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
    cfg.vndb_token = decryptToken(cfg.vndb_token || '');
    return cfg;
  });
  ipcMain.handle('save-config', async (event, cfg) => {
    const toWrite = { ...cfg, vndb_token: encryptToken(cfg.vndb_token || '') };
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
      execFile(exePath, args, { cwd: cwd || path.dirname(exePath), detached: true }, err => { if (err) reject(err); else resolve(true); });
    });
  });
  ipcMain.handle('start-playtime-tracking', async (_, vnId) => {
    if (activeGameProcesses.has(vnId)) return;
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
    activeGameProcesses.set(vnId, { interval });
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
  ipcMain.handle('vndb-authinfo', async (_, token) => new VNDBClient(token).testToken());
  ipcMain.handle('vndb-ulist-set', async (_, { token, vnId, vote, notes }) => {
    const vndbVote = (vote != null && vote > 0) ? Math.round(vote * 10) : null;
    const body = {};
    if (vndbVote !== null) body.vote = vndbVote;
    if (notes && notes.trim()) body.notes = notes.trim();
    await axios.post(`https://api.vndb.org/kana/ulist/${vnId}`, body, { headers: { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' }, timeout: 10000 });
    return true;
  });
  ipcMain.handle('vndb-ulist-delete', async (_, { token, vnId }) => {
    await axios.delete(`https://api.vndb.org/kana/ulist/${vnId}`, { headers: { 'Authorization': `Token ${token}` }, timeout: 10000 });
    return true;
  });
  ipcMain.handle('vndb-userlist', async (_, token) => {
    const res = await axios.post('https://api.vndb.org/kana/ulist', { filters: ['uid', '=', 'me'], fields: 'vn.id,vn.title,vn.image.url,vote,notes,status' }, { headers: { 'Authorization': `Token ${token}` }, timeout: 15000 });
    return res.data.results || [];
  });
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
  nativeTheme.on('updated', async () => {
    const cfg = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
    if (mainWindow && cfg.theme === 'auto') mainWindow.webContents.send('system-theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });