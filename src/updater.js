/**
 * GitHub Software Update Manager for Hongguo Downloader Desktop.
 * Checks GitHub releases/repository and applies updates smoothly.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
let semver = null;
try {
  semver = require('semver');
} catch (e) {}

const { APP_DIR, CACHE_DIR, APP_VERSION, DEFAULT_GITHUB_REPO, loadSettings, saveSettings, isPackaged } = require('./config.js');

/**
 * Parses a GitHub repository string into owner and repo name.
 * Accepts: "owner/repo", "https://github.com/owner/repo", "github.com/owner/repo"
 */
function parseGitHubRepo(input) {
  if (!input || typeof input !== 'string') return null;
  let str = input.trim();
  str = str.replace(/\.git$/i, '');
  
  // Extract path from URL
  const urlMatch = str.match(/github\.com\/([^\/]+)\/([^\/]+)/i);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  // Handle "owner/repo"
  const parts = str.split('/').filter(Boolean);
  if (parts.length === 2 && !parts[0].includes(':')) {
    return { owner: parts[0], repo: parts[1] };
  }

  return null;
}

/**
 * Helper to perform an HTTPS GET request with redirects and GitHub headers.
 */
function httpsGet(urlStr, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) return reject(new Error('Too many redirects'));

    const parsed = new URL(urlStr);
    const client = parsed.protocol === 'https:' ? https : http;

    const options = {
      headers: {
        'User-Agent': `Hongguo-Downloader/${APP_VERSION} (Desktop-Electron)`,
        'Accept': 'application/vnd.github.v3+json, text/plain, */*'
      },
      timeout: 15000
    };

    const req = client.get(urlStr, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location, maxRedirects - 1).then(resolve).catch(reject);
      }

      if (res.statusCode === 404) {
        return resolve({ statusCode: 404, data: null });
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
      }

      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve({ statusCode: 200, data: raw });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.on('error', reject);
  });
}

/**
 * Download a binary file to disk following redirects.
 */
function downloadFile(urlStr, destPath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) return reject(new Error('Too many redirects'));

    const parsed = new URL(urlStr);
    const client = parsed.protocol === 'https:' ? https : http;

    const options = {
      headers: {
        'User-Agent': `Hongguo-Downloader/${APP_VERSION} (Desktop-Electron)`
      },
      timeout: 60000
    };

    const fileStream = fs.createWriteStream(destPath);

    const req = client.get(urlStr, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fileStream.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return downloadFile(res.headers.location, destPath, maxRedirects - 1).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        fileStream.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return reject(new Error(`Download failed HTTP ${res.statusCode}`));
      }

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve(destPath);
      });
    });

    fileStream.on('error', (err) => {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      fileStream.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(new Error('Download timed out'));
    });
    req.on('error', (err) => {
      fileStream.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

/**
 * Compare two version strings.
 * Returns true if remoteVersion > localVersion.
 */
function isVersionNewer(remoteVersion, localVersion) {
  const cleanRemote = String(remoteVersion).replace(/^[^\d]*/, '').trim();
  const cleanLocal = String(localVersion).replace(/^[^\d]*/, '').trim();

  if (semver && semver.coerce && semver.gt) {
    try {
      const semRemote = semver.coerce(cleanRemote);
      const semLocal = semver.coerce(cleanLocal);
      if (semRemote && semLocal) {
        return semver.gt(semRemote, semLocal);
      }
    } catch (e) {
      // fallback
    }
  }

  // Fallback to numeric segment comparison (e.g. "3.1.1" > "3.1.0")
  const p1 = cleanRemote.split('.').map(n => parseInt(n, 10) || 0);
  const p2 = cleanLocal.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }

  return cleanRemote !== cleanLocal && cleanRemote > cleanLocal;
}

/**
 * Check for updates from GitHub.
 */
async function checkForUpdates(customRepo = null) {
  const settings = loadSettings();
  const repoString = customRepo || settings.github_repo || DEFAULT_GITHUB_REPO;
  const parsedRepo = parseGitHubRepo(repoString);

  if (!parsedRepo) {
    return {
      configured: true,
      current_version: APP_VERSION,
      latest_version: APP_VERSION,
      has_update: false,
      message: `កម្មវិធីរបស់អ្នកជាកំណែចុងក្រោយបំផុតហើយ (v${APP_VERSION})`
    };
  }

  const { owner, repo } = parsedRepo;
  const fullRepoName = `${owner}/${repo}`;

  try {
    // 1. Try checking latest GitHub Release
    const releaseApiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    const releaseRes = await httpsGet(releaseApiUrl);

    if (releaseRes.statusCode === 200 && releaseRes.data) {
      const release = JSON.parse(releaseRes.data);
      const remoteTag = release.tag_name || release.name || '';
      const cleanRemoteVer = remoteTag.replace(/^[^\d]*/, '').trim();
      const hasUpdate = isVersionNewer(cleanRemoteVer, APP_VERSION);

      // Look for exe asset if exists
      let exeAsset = null;
      if (Array.isArray(release.assets)) {
        const found = release.assets.find(a => a.name && a.name.toLowerCase().endsWith('.exe'));
        if (found) {
          exeAsset = {
            name: found.name,
            size: found.size,
            download_url: found.browser_download_url
          };
        }
      }

      const zipDownloadUrl = release.zipball_url || `https://github.com/${owner}/${repo}/archive/refs/tags/${release.tag_name}.zip`;

      return {
        configured: true,
        repo: fullRepoName,
        current_version: APP_VERSION,
        latest_version: cleanRemoteVer || remoteTag,
        has_update: hasUpdate,
        release_name: release.name || release.tag_name || `Version ${cleanRemoteVer}`,
        release_notes: release.body || 'មិនមាន Release notes ទេ។',
        published_at: release.published_at || null,
        html_url: release.html_url || `https://github.com/${owner}/${repo}/releases`,
        download_url: zipDownloadUrl,
        exe_asset: exeAsset,
        message: hasUpdate ? `រកឃើញកំណែថ្មី v${cleanRemoteVer}!` : `កម្មវិធីរបស់អ្នកជាកំណែចុងក្រោយបំផុតហើយ (v${APP_VERSION})`
      };
    }

    // 2. If no release exists (404), fall back to checking package.json on main branch
    const rawPkgUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/package.json`;
    const pkgRes = await httpsGet(rawPkgUrl);

    if (pkgRes.statusCode === 200 && pkgRes.data) {
      const pkg = JSON.parse(pkgRes.data);
      const remoteVer = pkg.version || '1.0.0';
      const hasUpdate = isVersionNewer(remoteVer, APP_VERSION);
      const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/main.zip`;

      return {
        configured: true,
        repo: fullRepoName,
        current_version: APP_VERSION,
        latest_version: remoteVer,
        has_update: hasUpdate,
        release_name: `Main Branch (v${remoteVer})`,
        release_notes: hasUpdate 
          ? `រកឃើញកូដថ្មីនៅលើ GitHub (v${remoteVer})! ចុច Update ដើម្បីទាញយកមុខងារថ្មីៗភ្លាមៗ។`
          : 'កូដរបស់អ្នកត្រូវគ្នាជាមួយ GitHub main branch រួចហើយ។',
        published_at: null,
        html_url: `https://github.com/${owner}/${repo}`,
        download_url: zipUrl,
        exe_asset: null,
        message: hasUpdate ? `រកឃើញកំណែថ្មី v${remoteVer}!` : `កម្មវិធីរបស់អ្នកជាកំណែចុងក្រោយបំផុតហើយ (v${APP_VERSION})`
      };
    }

    // Default when repository or release is not yet on GitHub
    return {
      configured: true,
      repo: fullRepoName,
      current_version: APP_VERSION,
      latest_version: APP_VERSION,
      has_update: false,
      message: `កម្មវិធីរបស់អ្នកជាកំណែចុងក្រោយបំផុតហើយ (v${APP_VERSION})`
    };

  } catch (err) {
    console.warn('[Updater] Notice checking update:', err.message);
    return {
      configured: true,
      repo: fullRepoName,
      current_version: APP_VERSION,
      latest_version: APP_VERSION,
      has_update: false,
      message: `កម្មវិធីរបស់អ្នកជាកំណែចុងក្រោយបំផុតហើយ (v${APP_VERSION})`
    };
  }
}

/**
 * Apply the update by downloading the zip package, extracting, and updating project files.
 */
async function applyUpdate(downloadUrl, targetRepo = null) {
  if (!downloadUrl) {
    // If no explicit download url, check updates first
    const check = await checkForUpdates(targetRepo);
    if (!check.download_url) {
      throw new Error('មិនមាន Download URL សម្រាប់ធ្វើបច្ចុប្បន្នភាពឡើយ។');
    }
    downloadUrl = check.download_url;
  }

  // Handle direct .exe installer asset updates
  if (downloadUrl.toLowerCase().endsWith('.exe')) {
    const tempExePath = path.join(CACHE_DIR, `PS_DOWNLOAD_Update_${Date.now()}.exe`);
    try {
      console.log('[Updater] Downloading installer update from:', downloadUrl);
      await downloadFile(downloadUrl, tempExePath);
      console.log('[Updater] Launching installer:', tempExePath);
      exec(`start "" "${tempExePath}"`);
      setTimeout(() => {
        try {
          const { app } = require('electron');
          if (app) app.exit(0);
        } catch (_) {
          process.exit(0);
        }
      }, 1500);
      return {
        status: 'success',
        installer_launched: true,
        updated_version: 'New Installer',
        message: 'កំពុងបើកកម្មវិធីដំឡើងកំណែថ្មី... កម្មវិធីនឹងបិទដើម្បីដំឡើងដោយស្វ័យប្រវត្ត!'
      };
    } catch (e) {
      throw new Error(`បរាជ័យក្នុងការទាញយក Installer: ${e.message}`);
    }
  }

  const tempZipPath = path.join(CACHE_DIR, `update_${Date.now()}.zip`);
  const extractDir = path.join(CACHE_DIR, `update_ext_${Date.now()}`);

  try {
    // 1. Download update zip file
    console.log('[Updater] Downloading update from:', downloadUrl);
    await downloadFile(downloadUrl, tempZipPath);

    if (!fs.existsSync(tempZipPath) || fs.statSync(tempZipPath).size < 100) {
      throw new Error('ឯកសារ Zip ដែលទាញយកមកទទេ ឬខូច។');
    }

    // 2. Extract zip file using tar or powershell
    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }

    await new Promise((resolve, reject) => {
      // Use bsdtar (built into Windows 10/11)
      exec(`tar -xf "${tempZipPath}" -C "${extractDir}"`, (err) => {
        if (!err) return resolve();
        // Fallback to PowerShell Expand-Archive
        exec(`powershell -Command "Expand-Archive -Path '${tempZipPath}' -DestinationPath '${extractDir}' -Force"`, (err2) => {
          if (!err2) return resolve();
          reject(new Error(`Failed to extract update archive: ${err2.message}`));
        });
      });
    });

    // 3. Find root folder inside extractDir (GitHub archives usually have a top folder like repo-main/)
    const extractedEntries = fs.readdirSync(extractDir);
    let sourceDir = extractDir;
    if (extractedEntries.length === 1) {
      const singlePath = path.join(extractDir, extractedEntries[0]);
      if (fs.statSync(singlePath).isDirectory()) {
        sourceDir = singlePath;
      }
    }

    // 4. Determine destination directory:
    // In packaged Electron, APP_DIR is inside resources/app.asar (read-only archive).
    // Placing files in resources/app overrides app.asar automatically without needing re-install!
    let targetAppDir = APP_DIR;
    if (isPackaged) {
      const resDir = process.resourcesPath || path.join(path.dirname(process.execPath), 'resources');
      targetAppDir = path.join(resDir, 'app');
      if (!fs.existsSync(targetAppDir)) {
        fs.mkdirSync(targetAppDir, { recursive: true });
      }
    }

    // Copy updated project files, safely preserving 'data/' folder
    const entries = fs.readdirSync(sourceDir);
    const skippedItems = new Set(['data', 'cache', '.git', 'node_modules', 'dist', 'scratch']);

    for (const item of entries) {
      if (skippedItems.has(item.toLowerCase())) {
        continue; // Never overwrite user data, downloads, or local caches
      }

      const srcPath = path.join(sourceDir, item);
      const destPath = path.join(targetAppDir, item);

      try {
        fs.cpSync(srcPath, destPath, { recursive: true, force: true });
      } catch (cpErr) {
        console.warn(`[Updater] Notice copying ${item}:`, cpErr.message);
      }
    }

    // 5. Read new version from updated package.json if present
    let updatedVersion = APP_VERSION;
    try {
      const pkgPath = path.join(targetAppDir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkgData = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkgData.version) updatedVersion = pkgData.version;
      }
    } catch (e) {
      // Ignore
    }

    console.log('[Updater] Update applied successfully to version:', updatedVersion);

    return {
      status: 'success',
      updated_version: updatedVersion,
      message: `បានធ្វើបច្ចុប្បន្នភាពដោយជោគជ័យទៅកាន់កំណែ v${updatedVersion}! សូម Restart កម្មវិធី។`
    };

  } finally {
    // Cleanup temporary files
    try {
      if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
      if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn('[Updater] Cleanup error:', cleanupErr.message);
    }
  }
}

module.exports = {
  parseGitHubRepo,
  checkForUpdates,
  applyUpdate
};
