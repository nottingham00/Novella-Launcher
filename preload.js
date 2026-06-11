const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  loadConfig:  ()       => ipcRenderer.invoke('load-config'),
  saveConfig:  (config) => ipcRenderer.invoke('save-config', config),

  // Library
  loadLibrary: ()        => ipcRenderer.invoke('load-library'),
  saveLibrary: (library) => ipcRenderer.invoke('save-library', library),

  // Ratings
  loadRatings: ()        => ipcRenderer.invoke('load-ratings'),
  saveRatings: (ratings) => ipcRenderer.invoke('save-ratings', ratings),

  // VNDB
  vndbSearch:    (token, query) => ipcRenderer.invoke('vndb-search',    { token, query }),
  vndbDetails:   (token, vnId)  => ipcRenderer.invoke('vndb-details',   { token, vnId }),
  downloadCover: (url,   vnId)  => ipcRenderer.invoke('download-cover', { url,   vnId }),

  // File / Launch
  selectExe:  ()                => ipcRenderer.invoke('select-exe'),
  launchGame: (exePath, cwd)    => ipcRenderer.invoke('launch-game', exePath, cwd),

  // Updates
  checkUpdates:    () => ipcRenderer.invoke('check-updates'),
  openExternal:    (url) => ipcRenderer.invoke('open-external', url),
  getSystemTheme:  () => ipcRenderer.invoke('get-system-theme'),
  showNotification:(opts) => ipcRenderer.invoke('show-notification', opts),

  vndbAuthInfo:    (token)                    => ipcRenderer.invoke('vndb-authinfo',     token),
  // VNDB ulist sync
  vndbUlistSet:    (token, vnId, vote, notes) => ipcRenderer.invoke('vndb-ulist-set',    { token, vnId, vote, notes }),
  vndbUlistDelete: (token, vnId)              => ipcRenderer.invoke('vndb-ulist-delete', { token, vnId }),

  // Custom titlebar window controls
  windowMinimize:    ()  => ipcRenderer.invoke('window-minimize'),
  windowMaximize:    ()  => ipcRenderer.invoke('window-maximize'),
  windowClose:       ()  => ipcRenderer.invoke('window-close'),
  windowIsMaximized: ()  => ipcRenderer.invoke('window-is-maximized'),

  // Events from main
  onUpdateAvailable:    (cb) => ipcRenderer.on('update-available',      cb),
  onUpdateDownloaded:   (cb) => ipcRenderer.on('update-downloaded',     cb),
  onMenuCheckUpdates:   (cb) => ipcRenderer.on('menu-check-updates',    cb),
  onMenuUpdateLibrary:  (cb) => ipcRenderer.on('menu-update-library',   cb),
  onSystemThemeChanged: (cb) => ipcRenderer.on('system-theme-changed',  (_, theme) => cb(theme)),
  onWindowMaximized:    (cb) => ipcRenderer.on('window-maximized',      (_, state) => cb(state)),
});
