/**
 * Configuration and Settings Management for Hongguo Downloader Desktop.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

const APP_TITLE = "PS DOWNLOAD";
const APP_VERSION = "3.2.2";

const PORT = parseInt(process.env.HONGGUO_PORT || '1994', 10);
const HOST = process.env.HONGGUO_HOST || '127.0.0.1';
const UPSTREAM_WEB_URL = "https://hongguoduanju.com";

// Determine Electron environment safely
let electronApp = null;
try {
  const electron = require('electron');
  if (electron && electron.app) {
    electronApp = electron.app;
  }
} catch (e) {}

// Check if running inside packaged asar archive or packaged app
const isAsar = __dirname.includes('app.asar');
const isPackaged = Boolean((electronApp && electronApp.isPackaged) || isAsar);

// Check if an updated 'app' directory exists in resources (placed by software updater)
let effectiveAppDir = path.resolve(__dirname, '..');
if (isPackaged) {
  try {
    const resDir = process.resourcesPath || path.join(path.dirname(process.execPath), 'resources');
    const overrideAppDir = path.join(resDir, 'app');
    if (fs.existsSync(overrideAppDir) && fs.existsSync(path.join(overrideAppDir, 'web', 'index.html'))) {
      effectiveAppDir = overrideAppDir;
    }
  } catch (_) {}
}

const APP_DIR = effectiveAppDir;
const LIB_DIR = path.join(APP_DIR, 'lib');
const WEB_DIR = path.join(APP_DIR, 'web');

/**
 * Determine persistent writable data and cache directories.
 * MUST NOT be inside app.asar because asar is a read-only archive!
 */
function resolveWritableDirs() {
  // If in development mode (not packaged)
  if (!isPackaged) {
    return {
      dataDir: path.join(APP_DIR, 'data'),
      cacheDir: path.join(APP_DIR, 'cache')
    };
  }

  // When packaged (Production / Portable / Installed):
  // Check if running in Portable mode:
  const exeDir = path.dirname(process.execPath);
  let portableBase = null;

  if (process.env.PORTABLE_EXECUTABLE_DIR && fs.existsSync(process.env.PORTABLE_EXECUTABLE_DIR)) {
    portableBase = process.env.PORTABLE_EXECUTABLE_DIR;
  } else if (
    exeDir.toLowerCase().includes('portable') ||
    fs.existsSync(path.join(exeDir, 'data')) ||
    fs.existsSync(path.join(exeDir, 'is_portable')) ||
    process.env.PORTABLE_MODE === '1'
  ) {
    // Verify write permissions in exeDir
    try {
      const testFile = path.join(exeDir, `.write_test_${Date.now()}`);
      fs.writeFileSync(testFile, '1');
      fs.unlinkSync(testFile);
      portableBase = exeDir;
    } catch (_) {
      portableBase = null;
    }
  }

  if (portableBase) {
    return {
      dataDir: path.join(portableBase, 'data'),
      cacheDir: path.join(portableBase, 'cache')
    };
  }

  // Installed app fallback: Use Electron's official writable userData path
  let userData = null;
  try {
    if (electronApp && typeof electronApp.getPath === 'function') {
      userData = electronApp.getPath('userData');
    }
  } catch (_) {}

  if (!userData) {
    const roaming = process.env.APPDATA || (os.homedir ? path.join(os.homedir(), 'AppData', 'Roaming') : os.tmpdir());
    userData = path.join(roaming, 'ps-download');
  }

  return {
    dataDir: path.join(userData, 'data'),
    cacheDir: path.join(userData, 'cache')
  };
}

const { dataDir: DATA_DIR, cacheDir: CACHE_DIR } = resolveWritableDirs();
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure writable directories exist on disk (NEVER attempt to mkdir inside app.asar)
for (const dir of [DATA_DIR, CACHE_DIR]) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (e) {
    console.warn('[Config] Could not create directory:', dir, e.message);
  }
}

// In packaged mode, copy any initial bundled template json files from asar to writable DATA_DIR
if (isPackaged) {
  try {
    const bundledDataDir = path.join(APP_DIR, 'data');
    if (fs.existsSync(bundledDataDir) && path.resolve(bundledDataDir) !== path.resolve(DATA_DIR)) {
      const files = fs.readdirSync(bundledDataDir);
      for (const file of files) {
        const targetPath = path.join(DATA_DIR, file);
        if (!fs.existsSync(targetPath)) {
          try {
            const data = fs.readFileSync(path.join(bundledDataDir, file));
            fs.writeFileSync(targetPath, data);
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
}

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://hongguoduanju.com/',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7'
};

function getSystemDefaultOutputDir() {
  const home = process.env.USERPROFILE || os.homedir();
  return path.join(home, 'Videos', 'Hongguo Downloads');
}

/**
 * ============================================================================
 * កន្លែងកំណត់អាសយដ្ឋាន GITHUB REPO សម្រាប់ AUTO-UPDATE (លាក់ទុកក្នុងកូដ):
 * ============================================================================
 * ពេលអ្នកបង្កើត GitHub Repo រួច គ្រាន់តែកែប្រែឈ្មោះខាងក្រោមនេះ (ឧ. 'username/repo-name')
 * ឬអាចកំណត់តាម Environment Variable: GITHUB_UPDATE_REPO
 */
const DEFAULT_GITHUB_REPO = process.env.GITHUB_UPDATE_REPO || 'S323334/ps-download';

function loadSettings() {
  const defaults = {
    output_dir: getSystemDefaultOutputDir(),
    concurrency: 5,
    threads: 4,
    port: PORT,
    host: HOST,
    quality: '1080p',
    github_repo: DEFAULT_GITHUB_REPO
  };

  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      return { ...defaults, ...parsed };
    } catch (e) {
      console.warn('[Config] Failed to read settings.json, using defaults:', e.message);
    }
  }

  return defaults;
}

function saveSettings(updates) {
  const current = loadSettings();
  const merged = { ...current, ...updates };
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Config] Error saving settings:', e.message);
  }
  return merged;
}

function getOutputDir() {
  const settings = loadSettings();
  const out = settings.output_dir || getSystemDefaultOutputDir();
  if (!fs.existsSync(out)) {
    try {
      fs.mkdirSync(out, { recursive: true });
    } catch (e) {
      console.warn('[Config] Could not create output dir:', e.message);
    }
  }
  return out;
}

module.exports = {
  APP_TITLE,
  APP_VERSION,
  PORT,
  HOST,
  UPSTREAM_WEB_URL,
  APP_DIR,
  DATA_DIR,
  CACHE_DIR,
  LIB_DIR,
  WEB_DIR,
  SETTINGS_FILE,
  DEFAULT_HEADERS,
  getSystemDefaultOutputDir,
  loadSettings,
  saveSettings,
  getOutputDir,
  DEFAULT_GITHUB_REPO,
  isPackaged,
  isAsar
};
