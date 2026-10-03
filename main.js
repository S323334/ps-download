const fs = require('fs');
const path = require('path');

const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Tray, Menu, session } = require('electron');

const { APP_TITLE, PORT, HOST, getOutputDir, saveSettings } = require('./src/config.js');
const { startServer, setNativeFolderPicker } = require('./src/server.js');
const { downloadManager } = require('./src/downloader.js');
const { youtubeDownloader } = require('./src/youtube_downloader.js');
const { sendAppLaunchTelegramNotification } = require('./src/license.js');

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
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else {
      createMainWindow();
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

    // Configure session webRequest to allow player iframe embeds (Dailymotion, etc.)
    if (session && session.defaultSession && session.defaultSession.webRequest) {
      // 1. Inject proper Referer & Origin for Dailymotion to avoid 403 Forbidden
      session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: ['*://*.dailymotion.com/*', '*://geo.dailymotion.com/*', '*://*.dmcdn.net/*'] },
        (details, callback) => {
          details.requestHeaders['Referer'] = 'https://www.dailymotion.com/';
          details.requestHeaders['Origin'] = 'https://www.dailymotion.com';
          callback({ requestHeaders: details.requestHeaders });
        }
      );

      // 2. Strip restrictive headers (X-Frame-Options, Content-Security-Policy) so iframe player renders seamlessly
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const responseHeaders = Object.assign({}, details.responseHeaders);
        delete responseHeaders['x-frame-options'];
        delete responseHeaders['X-Frame-Options'];
        delete responseHeaders['content-security-policy'];
        delete responseHeaders['Content-Security-Policy'];
        delete responseHeaders['content-security-policy-report-only'];
        callback({ responseHeaders });
      });
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

    // 4. Send Telegram Alert once per app launch session
    sendAppLaunchTelegramNotification().catch(err => {
      console.warn('[Main] Telegram launch notification error:', err.message);
    });
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
      webSecurity: true,
      backgroundThrottling: false
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

  // Safety fallback: ensure window is visible even on slower PCs
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, 1200);

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
          try {
            const { stopTelegramBot } = require('./src/telegram_bot.js');
            stopTelegramBot();
          } catch (_) {}
          try { downloadManager.cancelAll(); } catch (_) {}
          try { youtubeDownloader.cancelAll(); } catch (_) {}
          if (tray) {
            try { tray.destroy(); } catch (_) {}
            tray = null;
          }
          if (serverInstance) {
            try {
              if (typeof serverInstance.closeAllConnections === 'function') {
                serverInstance.closeAllConnections();
              }
              serverInstance.close();
            } catch (_) {}
          }
          app.quit();
          setTimeout(() => {
            app.exit(0);
          }, 200);
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

let adminWindow = null;
function createAdminWindow() {
  if (adminWindow) {
    if (adminWindow.isMinimized()) adminWindow.restore();
    adminWindow.focus();
    return;
  }
  const iconPath = fs.existsSync(path.join(__dirname, 'icon.ico'))
    ? path.join(__dirname, 'icon.ico')
    : (fs.existsSync(path.join(__dirname, 'icon.png')) ? path.join(__dirname, 'icon.png') : null);

  adminWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    title: 'PS DOWNLOAD - Admin License & Key Generator',
    icon: iconPath,
    backgroundColor: '#07090e',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'src', 'preload.js')
    }
  });

  adminWindow.loadURL(`http://127.0.0.1:${serverPort}/admin`);
  adminWindow.on('closed', () => { adminWindow = null; });
}

ipcMain.handle('open-admin-window', () => {
  createAdminWindow();
  return true;
});

app.on('before-quit', () => {
  isQuitting = true;
  if (tray) {
    try { tray.destroy(); } catch (_) {}
    tray = null;
  }
});

// Lifecycle cleanup
app.on('window-all-closed', () => {
  try {
    const { stopTelegramBot } = require('./src/telegram_bot.js');
    stopTelegramBot();
  } catch (_) {}
  try { downloadManager.cancelAll(); } catch (_) {}
  try { youtubeDownloader.cancelAll(); } catch (_) {}
  if (tray) {
    try { tray.destroy(); } catch (_) {}
    tray = null;
  }
  if (serverInstance) {
    try {
      if (typeof serverInstance.closeAllConnections === 'function') {
        serverInstance.closeAllConnections();
      }
      serverInstance.close();
    } catch (_) {}
  }
  app.quit();
  setTimeout(() => {
    app.exit(0);
  }, 200);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});
