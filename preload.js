const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  // Library
  loadLibrary: () => ipcRenderer.invoke('load-library'),
  saveLibrary: (library) => ipcRenderer.invoke('save-library', library),

  // Ratings
  loadRatings: () => ipcRenderer.invoke('load-ratings'),
  saveRatings: (ratings) => ipcRenderer.invoke('save-ratings', ratings),

  // VNDB
  vndbSearch: (token, query) => ipcRenderer.invoke('vndb-search', { token, query }),
  vndbDetails: (token, vnId) => ipcRenderer.invoke('vndb-details', { token, vnId }),
  downloadCover: (url, vnId) => ipcRenderer.invoke('download-cover', { url, vnId }),

  // File / Launch
  selectExe: () => ipcRenderer.invoke('select-exe'),
  launchGame: (exePath, cwd, args) => ipcRenderer.invoke('launch-game', exePath, cwd, args),

  // Playtime tracking
  startPlaytimeTracking: (vnId) => ipcRenderer.invoke('start-playtime-tracking', vnId),
  stopPlaytimeTracking: (vnId) => ipcRenderer.invoke('stop-playtime-tracking', vnId),

  // Updates
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getSystemTheme: () => ipcRenderer.invoke('get-system-theme'),
  showNotification: (opts) => ipcRenderer.invoke('show-notification', opts),

  // VNDB sync
  vndbAuthInfo: (token) => ipcRenderer.invoke('vndb-authinfo', token),
  vndbUlistSet: (token, vnId, vote, notes) => ipcRenderer.invoke('vndb-ulist-set', { token, vnId, vote, notes }),
  vndbUlistDelete: (token, vnId) => ipcRenderer.invoke('vndb-ulist-delete', { token, vnId }),
  vndbUserlist: (token) => ipcRenderer.invoke('vndb-userlist', token),

  // Backup & Restore
  backupLibrary: () => ipcRenderer.invoke('backup-library'),
  restoreBackup: (path) => ipcRenderer.invoke('restore-backup', path),
  showOpenDialog: (opts) => ipcRenderer.invoke('show-open-dialog', opts),

  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // Events
  onPlaytimeUpdated: (cb) => ipcRenderer.on('playtime-updated', (_, data) => cb(data)),
  onMenuCheckUpdates: (cb) => ipcRenderer.on('menu-check-updates', cb),
  onMenuUpdateLibrary: (cb) => ipcRenderer.on('menu-update-library', cb),
  onSystemThemeChanged: (cb) => ipcRenderer.on('system-theme-changed', (_, theme) => cb(theme)),
  onWindowMaximized: (cb) => ipcRenderer.on('window-maximized', (_, state) => cb(state)),
});