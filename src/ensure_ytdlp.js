/**
 * PS DOWNLOAD - Auto-installer for yt-dlp binary (Render Cloud Linux & Local)
 * Ensures yt-dlp executable exists in bin/ and is marked executable (chmod +x)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const IS_WIN = process.platform === 'win32';
const YT_DLP_NAME = IS_WIN ? 'yt-dlp.exe' : 'yt-dlp';
const YT_DLP_PATH = path.join(BIN_DIR, YT_DLP_NAME);

const DOWNLOAD_URL = IS_WIN
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

function downloadFile(url, dest, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (redirects <= 0) return reject(new Error('Too many redirects'));

    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PSDownload/3.3.0)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try { fs.unlinkSync(dest); } catch (_) {}
        let next = res.headers.location;
        if (!next.startsWith('http')) {
          next = new URL(next, url).href;
        }
        return downloadFile(next, dest, redirects - 1).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(dest); } catch (_) {}
        return reject(new Error(`Failed to download yt-dlp: HTTP ${res.statusCode}`));
      }

      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve());
      });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(dest); } catch (_) {}
      reject(err);
    });
  });
}

async function ensureYtDlp() {
  if (!fs.existsSync(BIN_DIR)) {
    try { fs.mkdirSync(BIN_DIR, { recursive: true }); } catch (_) {}
  }

  if (fs.existsSync(YT_DLP_PATH)) {
    const stats = fs.statSync(YT_DLP_PATH);
    if (stats.size > 100000) {
      if (!IS_WIN) {
        try { fs.chmodSync(YT_DLP_PATH, 0o755); } catch (_) {}
      }
      console.log(`[yt-dlp] Verified executable at: ${YT_DLP_PATH} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
      return YT_DLP_PATH;
    }
  }

  console.log(`[yt-dlp] Downloading standalone yt-dlp binary from ${DOWNLOAD_URL}...`);
  try {
    await downloadFile(DOWNLOAD_URL, YT_DLP_PATH);
    if (!IS_WIN) {
      fs.chmodSync(YT_DLP_PATH, 0o755);
    }
    const finalStats = fs.statSync(YT_DLP_PATH);
    console.log(`[yt-dlp] Successfully installed yt-dlp at: ${YT_DLP_PATH} (${(finalStats.size / 1024 / 1024).toFixed(1)} MB)`);
    return YT_DLP_PATH;
  } catch (err) {
    console.error(`[yt-dlp] Auto-download failed: ${err.message}`);
    return null;
  }
}

if (require.main === module) {
  ensureYtDlp().then(() => process.exit(0)).catch(() => process.exit(0));
}

module.exports = {
  ensureYtDlp,
  YT_DLP_PATH
};
