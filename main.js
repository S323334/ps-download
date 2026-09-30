/**
 * Electron Main Process for Hongguo Downloader Desktop.
 * Manages native window lifecycle, internal HTTP server, and IPC bridge.
 */

const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const { APP_TITLE, PORT, HOST, getOutputDir, saveSettings } = require('./src/config.js');
const { startServer, setNativeFolderPicker } = require('./src/server.js');
const { downloadManager } = require('./src/downloader.js');
const { youtubeDownloader } = require('./src/youtube_downloader.js');

let mainWindow = null;
let serverInstance = null;
let serverPort = PORT;
let tray = null;
let isQuitting = false;
// Configure audio & video playback flags for Chromium
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport,AudioServiceOutOfProcess');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(initApp);
}

async function initApp() {
  try {
    // 1. Start embedded high-speed HTTP server
    serverInstance = await startServer(PORT, HOST);
    if (serverInstance && serverInstance.address) {
      const addr = serverInstance.address();
      if (typeof addr === 'object' && addr.port) {
        serverPort = addr.port;
      }
    }

    // 2. Set native folder picker hook for server API
    setNativeFolderPicker(async () => {
      if (!mainWindow) return null;
      const res = await dialog.showOpenDialog(mainWindow, {
        title: 'ជ្រើសរើស Folder ទាញយក (Select Download Folder)',
        defaultPath: getOutputDir(),
        properties: ['openDirectory', 'createDirectory']
      });
      if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
        return res.filePaths[0];
      }
      return null;
    });

    // 3. Create Desktop Window & System Tray
    createMainWindow();
    createTray();
  } catch (err) {
    console.error('[Main] Initialization failed:', err);
    dialog.showErrorBox('Initialization Error', `Failed to start application server: ${err.message}`);
    app.quit();
  }
}

function createMainWindow() {
  const iconPath = fs.existsSync(path.join(__dirname, 'icon.ico'))
    ? path.join(__dirname, 'icon.ico')
    : (fs.existsSync(path.join(__dirname, 'icon.png'))
      ? path.join(__dirname, 'icon.png')
      : path.join(__dirname, 'web', 'ps_logo.jpg'));

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#07090e',
    show: false,
    icon: iconPath,
    title: APP_TITLE,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#07090e',
      symbolColor: '#f8fafc',
      height: 44
    },
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });

  // Load local server URL
  const appUrl = `http://127.0.0.1:${serverPort}/`;
  mainWindow.loadURL(appUrl);

  // Show window smoothly when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Broadcast window state
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-changed', { maximized: true });
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-changed', { maximized: false });
  });

  // Handle external link clicks securely
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Handle close to hide to tray instead of quitting
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  if (tray) return;

  const trayIconPath = fs.existsSync(path.join(__dirname, 'web', 'favicon.ico'))
    ? path.join(__dirname, 'web', 'favicon.ico')
    : (fs.existsSync(path.join(__dirname, 'icon.ico'))
      ? path.join(__dirname, 'icon.ico')
      : path.join(__dirname, 'web', 'ps_logo.jpg'));

  try {
    tray = new Tray(trayIconPath);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '🖥️ បើក PS DOWNLOAD (Open)',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: '🌐 បើកក្នុង Web Browser',
        click: () => {
          shell.openExternal(`http://127.0.0.1:${serverPort}/`);
        }
      },
      { type: 'separator' },
      {
        label: '❌ ចាកចេញទាំងស្រុង (Exit App)',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setToolTip('PS DOWNLOAD - កំពុងដំណើរការនៅខាងក្រោយ (Running 24/7)');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  } catch (e) {
    console.warn('[Tray] Failed to initialize tray:', e.message);
  }
}

// IPC Handlers
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('dialog-select-folder', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'ជ្រើសរើស Folder ទាញយក (Select Download Folder)',
    defaultPath: getOutputDir(),
    properties: ['openDirectory', 'createDirectory']
  });
  if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
    const selected = res.filePaths[0];
    saveSettings({ output_dir: selected });
    return selected;
  }
  return null;
});

ipcMain.handle('shell-open-folder', async (event, dirPath) => {
  const target = dirPath || getOutputDir();
  try {
    await shell.openPath(target);
    return { ok: true, path: target };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('shell-open-external', async (event, externalUrl) => {
  if (externalUrl && (externalUrl.startsWith('http://') || externalUrl.startsWith('https://'))) {
    try {
      await shell.openExternal(externalUrl);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  return { ok: false };
});

ipcMain.handle('clipboard-read-text', () => {
  try {
    return clipboard.readText();
  } catch (e) {
    return '';
  }
});

ipcMain.handle('clipboard-write-text', (event, text) => {
  try {
    clipboard.writeText(text || '');
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('app-reload', () => {
  if (mainWindow) mainWindow.reload();
  return true;
});

ipcMain.handle('app-relaunch', () => {
  app.relaunch();
  app.exit(0);
});

app.on('before-quit', () => {
  isQuitting = true;
});

// Lifecycle cleanup
app.on('window-all-closed', () => {
  if (isQuitting) {
    downloadManager.cancelAll();
    youtubeDownloader.cancelAll();
    if (serverInstance) {
      serverInstance.close(() => {
        app.quit();
      });
    } else {
      app.quit();
    }
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});
