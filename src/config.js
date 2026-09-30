/**
 * Configuration and Settings Management for Hongguo Downloader Desktop.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

const APP_TITLE = "PS DOWNLOAD";
const APP_VERSION = "3.1.0";

const PORT = parseInt(process.env.HONGGUO_PORT || '1994', 10);
const HOST = process.env.HONGGUO_HOST || '127.0.0.1';
const UPSTREAM_WEB_URL = "https://hongguoduanju.com";

const APP_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(APP_DIR, 'data');
const CACHE_DIR = path.join(APP_DIR, 'cache');
const LIB_DIR = path.join(APP_DIR, 'lib');
const WEB_DIR = path.join(APP_DIR, 'web');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure directories exist
for (const dir of [DATA_DIR, CACHE_DIR, WEB_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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
  DEFAULT_GITHUB_REPO
};
