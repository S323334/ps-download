/**
 * PS DOWNLOAD - Standalone Admin License & Key Generator Desktop Application
 * Dedicated native window for Admin to manage, authorize, and generate keys.
 */

const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const { APP_TITLE, PORT, HOST, DATA_DIR } = require('./src/config.js');
const { startServer } = require('./src/server.js');

const ADMIN_PORT = 1996;
let adminWindow = null;
let serverInstance = null;
let activePort = ADMIN_PORT;

// Enforce unique application identity so it doesn't conflict with main PS DOWNLOAD app
app.setName('ps-download-admin');
try {
  const appData = app.getPath('appData');
  app.setPath('userData', path.join(appData, 'ps-download-admin'));
} catch (_) {}

app.whenReady().then(initAdminApp);

// Check if a port is responding with valid Admin UI (HTTP 200)
function isPortInUse(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/admin`, { timeout: 1000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function initAdminApp() {
  try {
    const isRunning = await isPortInUse(ADMIN_PORT);
    if (!isRunning) {
      try {
        serverInstance = await startServer(ADMIN_PORT, HOST);
        activePort = ADMIN_PORT;
      } catch (err) {
        console.warn(`[Admin] Failed on ${ADMIN_PORT}, trying ${ADMIN_PORT + 1}:`, err.message);
        serverInstance = await startServer(ADMIN_PORT + 1, HOST);
        activePort = ADMIN_PORT + 1;
      }
    } else {
      activePort = ADMIN_PORT;
    }

    createAdminWindow();
  } catch (err) {
    console.error('[Admin App] Init Error:', err);
    dialog.showErrorBox('Admin Launch Error', err.message);
    app.quit();
  }
}

function createAdminWindow() {
  const iconPath = fs.existsSync(path.join(__dirname, 'admin_icon.ico'))
    ? path.join(__dirname, 'admin_icon.ico')
    : (fs.existsSync(path.join(__dirname, 'admin_icon.png'))
      ? path.join(__dirname, 'admin_icon.png')
      : path.join(__dirname, 'icon.ico'));

  adminWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#07090e',
    title: '🔑 PS DOWNLOAD - ADMIN LICENSE & KEY GENERATOR',
    icon: iconPath,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });

  adminWindow.loadURL(`http://127.0.0.1:${activePort}/admin`);

  adminWindow.once('ready-to-show', () => {
    adminWindow.show();
    adminWindow.focus();
  });

  setTimeout(() => {
    if (adminWindow && !adminWindow.isDestroyed() && !adminWindow.isVisible()) {
      adminWindow.show();
      adminWindow.focus();
    }
  }, 1000);

  adminWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  adminWindow.on('closed', () => {
    adminWindow = null;
    if (serverInstance) {
      try { serverInstance.close(); } catch (_) {}
    }
    app.quit();
  });
}

app.on('window-all-closed', () => {
  if (serverInstance) {
    try { serverInstance.close(); } catch (_) {}
  }
  app.quit();
});
