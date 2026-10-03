/**
 * Preload Script exposing secure desktop APIs to Renderer window.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,

  // Window Controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowStateChange: (callback) => {
    ipcRenderer.on('window-state-changed', (event, state) => callback(state));
  },

  // Native Dialogs & Shell
  selectFolder: () => ipcRenderer.invoke('dialog-select-folder'),
  openFolder: (dirPath) => ipcRenderer.invoke('shell-open-folder', dirPath),
  openExternal: (url) => ipcRenderer.invoke('shell-open-external', url),

  // Native Clipboard
  readClipboard: () => ipcRenderer.invoke('clipboard-read-text'),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard-write-text', text),

  // App Lifecycle / Update Reload
  reload: () => ipcRenderer.invoke('app-reload'),
  relaunch: () => ipcRenderer.invoke('app-relaunch'),

  // Dedicated Admin Window
  openAdminWindow: () => ipcRenderer.invoke('open-admin-window')
});
