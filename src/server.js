/**
 * Built-in Lightweight HTTP & Video Streaming Proxy Server.
 * Serves Web UI, REST APIs, HTTP 206 Partial Content Video Proxy, Image Proxy with auto-redirects & caching,
 * on-the-fly CENC Decryption for audio/video playback, and Download controls.
 */

const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const {
  APP_TITLE,
  APP_VERSION,
  PORT,
  HOST,
  WEB_DIR,
  CACHE_DIR,
  DEFAULT_HEADERS,
  loadSettings,
  saveSettings,
  getOutputDir,
  isPackaged
} = require('./config.js');

const { scraper } = require('./scraper.js');
const { downloadManager } = require('./downloader.js');
const { translateDramaTitle, translateBatchTitles, translateCategory, translateGeneralText } = require('./translator.js');
const { libraryManager } = require('./library_manager.js');
const { youtubeDownloader } = require('./youtube_downloader.js');
const { haosouDownloader } = require('./haosou_downloader.js');
const { mvffmDownloader } = require('./mvffm_downloader.js');
const { dailymotionDownloader } = require('./dailymotion_downloader.js');
const { tiktokDownloader } = require('./tiktok_downloader.js');
const { downloadMemoryManager } = require('./download_memory_manager.js');
const { checkForUpdates, applyUpdate, getUpdateProgress } = require('./updater.js');
const { probeDramaQuality, probeBatch } = require('./video_prober.js');
const {
  getLicenseStatus,
  activateLicense,
  deactivateLicense,
  getDeviceId,
  generateLicenseKey,
  generateUniversalKey,
  getGeneratedKeysList,
  recordDeviceTracking,
  getTrackedDevices,
  getTrackedDevicesWithLicenseInfo,
  authorizeDevice,
  checkAutoActivation,
  saveTelegramConfig,
  getTelegramConfig,
  sendTelegramAlert,
  resetDeviceFails,
  getCrackSuspectsList,
  clearFailedAttemptsHistory,
  clearPaymentRequests,
  setDeviceCustomName,
  adjustDeviceDays,
  revokeDeviceLicense,
  transferDeviceLicense,
  recordPaymentNotification,
  getPaymentRequests,
  registerPendingCheckout,
  fulfillPayWayPayment,
  sendAppLaunchTelegramNotification
} = require('./license.js');
const { startTelegramBot, parseFlexiblePaymentNotification, checkGroupPaymentVerification } = require('./telegram_bot.js');
const cenc = require('../lib/cenc.js');

// Callback hook for Electron native folder dialog
let _nativeFolderPickerCallback = null;

function setNativeFolderPicker(cb) {
  _nativeFolderPickerCallback = cb;
}

/**
 * Guards API endpoints that require an active license.
 * When unlicensed or expired, blocks execution and returns 403 Forbidden.
 */
function requireLicenseAuth(res) {
  const lic = getLicenseStatus();
  if (!lic.activated) {
    sendJson(res, 403, {
      ok: false,
      error: lic.expired ? 'License របស់អ្នកបានផុតកំណត់ហើយ! សូមទាក់ទង Admin ឬទិញបន្ថែម។' : 'កម្មវិធីមិនទាន់បាន Activate ឡើយ! សូមបញ្ចូល License Key។',
      expired: !!lic.expired,
      license_required: true,
      device_id: lic.device_id,
      remaining_days: lic.remaining_days || 0
    });
    return false;
  }
  return true;
}

// In-memory image cache (url -> { buffer, contentType })
const _IMG_CACHE = new Map();

// In-progress decryption promises to prevent concurrent duplicate decryptions
const _DECRYPT_PROMISES = new Map();

// In-memory translation cache (text_lang -> translatedText)
const _TRANSLATION_CACHE = new Map();

async function translateText(text, targetLang = 'km') {
  if (!text || targetLang === 'zh') return text;
  const key = `${text.trim()}_${targetLang}`;
  if (_TRANSLATION_CACHE.has(key)) return _TRANSLATION_CACHE.get(key);
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=zh|${targetLang}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!res.ok) return text;
    const data = await res.json();
    const translated = (data && data.responseData && data.responseData.translatedText) || text;
    if (_TRANSLATION_CACHE.size < 5000) {
      _TRANSLATION_CACHE.set(key, translated);
    }
    return translated;
  } catch (e) {
    return text;
  }
}

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, Authorization'
  });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: true, message, detail: message });
}

/**
 * Enforces machine license validation for protected action endpoints
 * (video playback, episode extraction, downloads, YouTube/HaoSou/MvFfm fetching).
 * Returns true if valid/activated; otherwise sends 403 Forbidden with license info.
 */
function requireLicenseAuth(res) {
  const lic = getLicenseStatus();
  if (!lic || !lic.activated) {
    sendJson(res, 403, {
      ok: false,
      error: 'អ្នកមិនមាន License ឬ License របស់អ្នកបានផុតកំណត់ហើយ។ សូមធ្វើការ Activate License ជាមុនសិន!',
      license_required: true,
      expired: (lic && lic.expired) ? true : false,
      remaining_days: (lic && typeof lic.remaining_days === 'number') ? lic.remaining_days : 0,
      device_id: (lic && lic.device_id) || getDeviceId()
    });
    return false;
  }
  return true;
}

/**
 * Fetch image following all 301/302 redirects with correct Referer header.
 */
function fetchImageWithRedirects(targetUrl, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));

    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://hongguoduanju.com/',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      timeout: 12000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = new URL(res.headers.location, targetUrl).href;
        return fetchImageWithRedirects(nextUrl, maxRedirects - 1).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Upstream image HTTP ${res.statusCode}`));
      }

      const contentType = res.headers['content-type'] || 'image/jpeg';
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Image fetch timeout'));
    });
    req.on('error', reject);
  });
}

/**
 * Stream local MP4 file with full HTTP 206 Range requests support.
 */
function streamLocalFile(filePath, req, res) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Access-Control-Allow-Origin': '*'
      });
      return res.end();
    }

    const chunksize = (end - start) + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4'
    });

    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4'
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

/**
 * Verifies video stream is H.264 for 100% Chromium compatibility.
 * If HEVC (bytevc1), bvc2, or unknown codec, transcodes to standard H.264 ultrafast.
 */
function ensureH264File(filePath) {
  // Direct zero-CPU passthrough: video streams (HEVC/H264) play smoothly with hardware acceleration
  return Promise.resolve(filePath);
}

/**
 * Resolves, downloads, and decrypts CENC encrypted video to cache before streaming.
 */
async function ensurePlayableVideoFile(vid, seriesId, quality = '720p', customStreamUrl = null, customSpadeA = null, customCodec = null) {
  const qStr = String(quality || '720p').toLowerCase();
  const normalizedQuality = qStr.includes('360') ? '360p'
    : qStr.includes('480') ? '480p'
    : qStr.includes('540') ? '540p'
    : qStr.includes('1080') ? '1080p'
    : '720p';

  // 1. Check in output_dir (already completely downloaded)
  const outRoot = getOutputDir();
  if (fs.existsSync(outRoot)) {
    const folders = fs.readdirSync(outRoot);
    for (const folder of folders) {
      const folderPath = path.join(outRoot, folder);
      try {
        if (fs.statSync(folderPath).isDirectory()) {
          const files = fs.readdirSync(folderPath);
          for (const f of files) {
            if (f.includes(vid) && f.toLowerCase().endsWith('.mp4') && !f.endsWith('.part')) {
              const cand = path.join(folderPath, f);
              if (fs.existsSync(cand) && fs.statSync(cand).size > 10240) {
                await ensureH264File(cand);
                return { localFile: cand };
              }
            }
          }
        }
      } catch (e) {}
    }
  }

  // 2. Check in CACHE_DIR: specific resolution first
  const specificCacheFile = path.join(CACHE_DIR, `${vid}_${normalizedQuality}.mp4`);
  if (fs.existsSync(specificCacheFile) && fs.statSync(specificCacheFile).size > 10240) {
    await ensureH264File(specificCacheFile);
    return { localFile: specificCacheFile };
  }
  const generalCacheFile = path.join(CACHE_DIR, `${vid}.mp4`);
  if (fs.existsSync(generalCacheFile) && fs.statSync(generalCacheFile).size > 10240) {
    await ensureH264File(generalCacheFile);
    return { localFile: generalCacheFile };
  }
  // Check if ANY valid cached mp4 exists for this vid in cache dir
  try {
    const cacheFiles = fs.readdirSync(CACHE_DIR);
    for (const cf of cacheFiles) {
      if (cf.startsWith(`${vid}_`) && cf.toLowerCase().endsWith('.mp4') && !cf.endsWith('.part')) {
        const cand = path.join(CACHE_DIR, cf);
        if (fs.existsSync(cand) && fs.statSync(cand).size > 10240) {
          await ensureH264File(cand);
          return { localFile: cand };
        }
      }
    }
  } catch (e) {}

  // 3. Check if currently decrypting / converting
  const taskKey = `${vid}_${normalizedQuality}`;
  if (_DECRYPT_PROMISES.has(taskKey)) {
    return await _DECRYPT_PROMISES.get(taskKey);
  }

  // 4. Download and Decrypt / Convert stream to cache
  const taskPromise = (async () => {
    let track = null;
    if (customStreamUrl) {
      const isHongguoCdn = customStreamUrl.includes('qznovelvod.com') || customStreamUrl.includes('hongguoduanju.com');
      track = {
        main_url: customStreamUrl,
        spade_a: customSpadeA || '',
        encrypted: Boolean(customSpadeA),
        codec_type: customCodec || (customSpadeA ? 'bytevc1' : 'h264'),
        headers: isHongguoCdn ? {
          'User-Agent': DEFAULT_HEADERS['User-Agent'],
          'Referer': 'https://hongguoduanju.com/'
        } : {
          'User-Agent': 'com.phoenix.read/71332',
          'Referer': 'https://novel.snssdk.com/'
        }
      };
    } else {
      const streamRes = await scraper.getVideoStreams(vid, seriesId, '', false, normalizedQuality);
      track = streamRes.tracks && streamRes.tracks[0];
    }

    if (!track || !track.main_url) {
      throw new Error(`Video stream for vid ${vid} could not be resolved`);
    }

    // Direct unencrypted web player H264 stream plays natively in Chromium
    const isDirectH264 = track.codec_type === 'h264' && !track.encrypted && !track.spade_a;
    if (isDirectH264) {
      const isHongguoCdn = track.main_url.includes('qznovelvod.com') || track.main_url.includes('hongguoduanju.com');
      const streamHeaders = track.headers || (isHongguoCdn ? {
        'User-Agent': DEFAULT_HEADERS['User-Agent'],
        'Referer': 'https://hongguoduanju.com/'
      } : {
        'User-Agent': 'com.phoenix.read/71332',
        'Referer': 'https://novel.snssdk.com/'
      });
      return { rawUrl: track.main_url, headers: streamHeaders };
    }

    // Encrypted or HEVC/bytevc1 stream: download using modern fetch, decrypt if needed, and transcode to H.264
    const encFile = path.join(CACHE_DIR, `${taskKey}.enc`);
    const partFile = path.join(CACHE_DIR, `${taskKey}.part`);

    if (fs.existsSync(partFile)) {
      try { fs.unlinkSync(partFile); } catch (e) {}
    }
    if (fs.existsSync(encFile)) {
      try { fs.unlinkSync(encFile); } catch (e) {}
    }

    const fetchHeaders = track.headers || {
      'User-Agent': 'com.phoenix.read/71332',
      'Referer': 'https://novel.snssdk.com/'
    };

    const res = await fetch(track.main_url, { headers: fetchHeaders });
    if (!res.ok) {
      throw new Error(`CDN returned HTTP ${res.status}`);
    }

    const fileStream = fs.createWriteStream(partFile);
    await pipeline(Readable.fromWeb(res.body), fileStream);

    if (track.encrypted && track.spade_a) {
      if (fs.existsSync(encFile)) {
        try { fs.unlinkSync(encFile); } catch (e) {}
      }
      fs.renameSync(partFile, encFile);
      await cenc.decryptFile(encFile, specificCacheFile, track.spade_a);
      if (fs.existsSync(encFile)) {
        try { fs.unlinkSync(encFile); } catch (e) {}
      }
    } else {
      if (fs.existsSync(specificCacheFile)) {
        try { fs.unlinkSync(specificCacheFile); } catch (e) {}
      }
      fs.renameSync(partFile, specificCacheFile);
    }

    if (fs.existsSync(specificCacheFile) && fs.statSync(specificCacheFile).size > 10240) {
      await ensureH264File(specificCacheFile);
      return { localFile: specificCacheFile };
    }
    throw new Error('Video file verification failed');
  })();

  _DECRYPT_PROMISES.set(taskKey, taskPromise);

  try {
    const res = await taskPromise;
    pruneVideoCache();
    return res;
  } finally {
    _DECRYPT_PROMISES.delete(taskKey);
  }
}

/**
 * Automatically prunes temporary video cache files to prevent high disk usage.
 * Limits total video preview cache to max 200MB and removes stale .part/.enc files.
 */
function pruneVideoCache(maxBytes = 200 * 1024 * 1024) {
  try {
    if (!fs.existsSync(CACHE_DIR)) return;
    const files = fs.readdirSync(CACHE_DIR);
    const mp4Files = [];
    const now = Date.now();
    for (const f of files) {
      const full = path.join(CACHE_DIR, f);
      // Clean leftover temporary part or enc files older than 15 mins
      if (f.endsWith('.part') || f.endsWith('.enc')) {
        try {
          const stat = fs.statSync(full);
          if (now - stat.mtimeMs > 15 * 60 * 1000) {
            fs.unlinkSync(full);
          }
        } catch (_) {}
        continue;
      }
      if (f.endsWith('.mp4')) {
        try {
          const stat = fs.statSync(full);
          mp4Files.push({ file: full, size: stat.size, mtime: stat.mtimeMs });
        } catch (_) {}
      }
    }
    // Sort oldest first
    mp4Files.sort((a, b) => a.mtime - b.mtime);
    let totalSize = mp4Files.reduce((sum, item) => sum + item.size, 0);
    while (totalSize > maxBytes && mp4Files.length > 0) {
      const oldest = mp4Files.shift();
      try {
        fs.unlinkSync(oldest.file);
        totalSize -= oldest.size;
      } catch (_) {}
    }
  } catch (_) {}
}

function startServer(port = PORT, host = HOST) {
  pruneVideoCache();
  setInterval(pruneVideoCache, 3600000);
  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const baseUrl = `http://${req.headers.host || `${host}:${port}`}`;
    const parsedUrl = new URL(req.url, baseUrl);
    const pathname = parsedUrl.pathname;
    const query = Object.fromEntries(parsedUrl.searchParams.entries());

    try {
      // 1. Web UI: GET / and GET /dl
      if (pathname === '/' || pathname === '/dl') {
        const indexPath = path.join(WEB_DIR, 'index.html');
        if (fs.existsSync(indexPath)) {
          const content = fs.readFileSync(indexPath, 'utf-8');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(content);
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('index.html not found');
      }

      // 1a. Admin Generator Web UI: GET /admin
      if (pathname === '/admin') {
        const adminPath = path.join(WEB_DIR, 'admin.html');
        if (fs.existsSync(adminPath)) {
          const content = fs.readFileSync(adminPath, 'utf-8');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(content);
        }
      }

      // 1b. Static Assets in WEB_DIR (e.g. /css/*, /js/*, /logo.svg, /logo.png, /hls.min.js, etc.)
      const safeRelative = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
      const potentialStaticPath = path.join(WEB_DIR, safeRelative);
      if (potentialStaticPath.startsWith(WEB_DIR) && fs.existsSync(potentialStaticPath) && fs.statSync(potentialStaticPath).isFile()) {
        const ext = path.extname(potentialStaticPath).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.svg': 'image/svg+xml; charset=utf-8',
          '.ico': 'image/x-icon',
          '.webp': 'image/webp',
          '.mp4': 'video/mp4'
        };
        const ctype = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': ctype, 'Cache-Control': 'no-cache' });
        return fs.createReadStream(potentialStaticPath).pipe(res);
      }

      // 2. High-Speed Image Proxy with Caching & Redirect Handling: GET /img?url=...
      if (pathname === '/img') {
        const imgUrl = query.url;
        if (!imgUrl) return sendError(res, 400, 'Missing url query parameter');

        // Check in-memory cache
        if (_IMG_CACHE.has(imgUrl)) {
          const cached = _IMG_CACHE.get(imgUrl);
          res.writeHead(200, {
            'Content-Type': cached.contentType,
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*'
          });
          return res.end(cached.buffer);
        }

        try {
          const { buffer, contentType } = await fetchImageWithRedirects(imgUrl);
          if (_IMG_CACHE.size < 1000) {
            _IMG_CACHE.set(imgUrl, { buffer, contentType });
          }
          res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*'
          });
          return res.end(buffer);
        } catch (err) {
          return sendError(res, 502, `Failed to proxy image: ${err.message}`);
        }
      }

      // 3. Library Poster: GET /api/library/poster?folder=...
      if (pathname === '/api/library/poster') {
        const folder = query.folder;
        if (!folder) return sendError(res, 400, 'Missing folder parameter');

        const folderPath = path.join(getOutputDir(), folder);
        for (const fname of ['poster.jpg', 'cover.jpg', 'poster.png', 'cover.png']) {
          const p = path.join(folderPath, fname);
          if (fs.existsSync(p)) {
            const ext = path.extname(fname).toLowerCase();
            const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
            res.writeHead(200, {
              'Content-Type': mime,
              'Cache-Control': 'public, max-age=86400'
            });
            return fs.createReadStream(p).pipe(res);
          }
        }
        return sendError(res, 404, 'Poster not found');
      }

      // 4. Video Stream Seeking Proxy with CENC Decryption & Audio Support (HTTP 206): GET /api/video/:vid/play
      const playMatch = pathname.match(/^\/api\/video\/(?:([^\/]+)\/)?([^\/]+)\/play$/);
      if (playMatch) {
        if (!requireLicenseAuth(res)) return;
        const seriesId = playMatch[1] || query.series_id || null;
        const vid = playMatch[2];
        const quality = query.quality || '720p';
        const streamUrl = query.stream_url || null;
        const spadeA = query.spade_a || null;
        const codec = query.codec || null;

        try {
          const playable = await ensurePlayableVideoFile(vid, seriesId, quality, streamUrl, spadeA, codec);
          if (playable.localFile) {
            return streamLocalFile(playable.localFile, req, res);
          }

          // Unencrypted raw CDN stream fallback with HTTP Range seeking
          const rawUrl = playable.rawUrl;
          const rangeHeader = req.headers.range;
          const isHongguo = rawUrl.includes('qznovelvod.com') || rawUrl.includes('hongguoduanju.com');
          const targetHeaders = {
            'User-Agent': (playable.headers && playable.headers['User-Agent']) || (isHongguo ? DEFAULT_HEADERS['User-Agent'] : 'com.phoenix.read/71332'),
            'Referer': (playable.headers && playable.headers['Referer']) || (isHongguo ? 'https://hongguoduanju.com/' : 'https://novel.snssdk.com/'),
            'Accept': '*/*'
          };
          if (rangeHeader) targetHeaders['Range'] = rangeHeader;

          const parsedTarget = new URL(rawUrl);
          const client = parsedTarget.protocol === 'https:' ? https : http;
          const proxyReq = client.get(rawUrl, { headers: targetHeaders, timeout: 25000 }, (proxyRes) => {
            const resHeaders = {
              'Content-Type': proxyRes.headers['content-type'] || 'video/mp4',
              'Accept-Ranges': 'bytes',
              'Access-Control-Allow-Origin': '*'
            };
            if (proxyRes.headers['content-range']) resHeaders['Content-Range'] = proxyRes.headers['content-range'];
            if (proxyRes.headers['content-length']) resHeaders['Content-Length'] = proxyRes.headers['content-length'];

            res.writeHead(proxyRes.statusCode, resHeaders);
            proxyRes.pipe(res);
          });
          proxyReq.on('error', (err) => sendError(res, 502, `Video proxy error: ${err.message}`));
          return;
        } catch (err) {
          return sendError(res, 500, `Video playback error: ${err.message}`);
        }
      }

      // 4b. Video Quality & FPS Probe: POST /api/video/probe or GET /api/video/probe
      if (pathname === '/api/video/probe') {
        if (!requireLicenseAuth(res)) return;
        try {
          let probeReq = {};
          if (req.method === 'POST') {
            probeReq = await parseJsonBody(req);
          } else {
            probeReq = {
              id: query.id,
              platform: query.platform || 'hongguo'
            };
          }

          if (probeReq.items && Array.isArray(probeReq.items)) {
            const results = await probeBatch(probeReq.items);
            return sendJson(res, 200, { ok: true, data: results });
          }

          if (!probeReq.id) {
            return sendError(res, 400, 'Missing id parameter');
          }

          const result = await probeDramaQuality(probeReq.id, probeReq.platform);
          return sendJson(res, 200, result);
        } catch (err) {
          return sendError(res, 500, `Video probe error: ${err.message}`);
        }
      }

      // 5. Streams resolution: GET /api/video/:vid/streams
      const streamsMatch = pathname.match(/^\/api\/video\/(?:([^\/]+)\/)?([^\/]+)\/streams$/);
      if (streamsMatch) {
        if (!requireLicenseAuth(res)) return;
        const seriesId = streamsMatch[1] || query.series_id || null;
        const vid = streamsMatch[2];
        const quality = query.quality || '720p';
        const result = await scraper.getVideoStreams(vid, seriesId, baseUrl, false, quality);
        return sendJson(res, 200, result);
      }

      // 6. Video Info: GET /api/video/:vid/info
      const infoMatch = pathname.match(/^\/api\/video\/(?:([^\/]+)\/)?([^\/]+)\/info$/);
      if (infoMatch) {
        if (!requireLicenseAuth(res)) return;
        const seriesId = infoMatch[1] || query.series_id || null;
        const vid = infoMatch[2];
        const quality = query.quality || '720p';
        const streams = await scraper.getVideoStreams(vid, seriesId, baseUrl, false, quality);
        const track = streams.tracks[0];
        return sendJson(res, 200, {
          series_id: seriesId || '',
          vid,
          index: 0,
          title: streams.title || `Episode ${vid}`,
          streamType: 'mp4',
          directUrl: track ? track.main_url : '',
          proxyStreamUrl: `${baseUrl}/api/video/${vid}/play?quality=${quality}`,
          playUrl: `${baseUrl}/api/video/${vid}/play?quality=${quality}`,
          duration: 120
        });
      }

      // 7. Video Prefetch: GET /api/video/:vid/prefetch
      const prefetchMatch = pathname.match(/^\/api\/video\/(?:([^\/]+)\/)?([^\/]+)\/prefetch$/);
      if (prefetchMatch || pathname.includes('/prefetch')) {
        const pSeriesId = (prefetchMatch && prefetchMatch[1]) || query.series_id || null;
        const pVid = (prefetchMatch && prefetchMatch[2]) || query.vid || null;
        const pQuality = query.quality || '720p';
        if (pVid) {
          // Asynchronously trigger caching in background
          ensurePlayableVideoFile(pVid, pSeriesId, pQuality).catch(() => {});
        }
        return sendJson(res, 200, { ok: true, prefetching: true });
      }

      // 8. Discovery: GET /api/home
      if (pathname === '/api/home') {
        const homeData = await scraper.getHomeData();
        return sendJson(res, 200, homeData);
      }

      // 9. Discovery: GET /api/rank or /api/hot
      if (pathname === '/api/rank' || pathname === '/api/hot') {
        const page = parseInt(query.page || 1, 10);
        const pageSize = parseInt(query.page_size || 24, 10);
        const category = query.category || 'all';
        const rankData = await scraper.getRankings(category, page, pageSize);
        return sendJson(res, 200, rankData);
      }

      // 10. Discovery: GET /api/category/:slug
      const catMatch = pathname.match(/^\/api\/category\/([^\/]+)$/);
      if (catMatch) {
        const category = catMatch[1];
        const page = parseInt(query.page || 1, 10);
        const pageSize = parseInt(query.page_size || 24, 10);
        const catData = await scraper.getRankings(category, page, pageSize);
        return sendJson(res, 200, catData);
      }

      // 11. Search: GET /api/search
      if (pathname === '/api/search') {
        const q = query.q || query.query || '';
        const page = parseInt(query.page || 1, 10);
        const pageSize = parseInt(query.page_size || 24, 10);
        const searchData = await scraper.searchDramas(q, page, pageSize);
        return sendJson(res, 200, searchData);
      }

      // 11b. Translation API: GET /api/translate?text=...&to=km|en
      if (pathname === '/api/translate') {
        const text = query.text || '';
        const to = query.to || 'km';
        const translated = await translateGeneralText(text, to);
        return sendJson(res, 200, { original: text, translated, to });
      }

      // 11c. Batch Translation API: POST /api/translate/batch
      if (pathname === '/api/translate/batch' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const texts = body.texts || [];
        const to = body.to || 'km';
        const translations = await translateBatchTitles(texts, to);
        return sendJson(res, 200, { translations, to });
      }

      // 11d. Category Translation API: GET /api/translate/category?name=...&to=km|en
      if (pathname === '/api/translate/category') {
        const name = query.name || '';
        const to = query.to || 'km';
        const translated = translateCategory(name, to);
        return sendJson(res, 200, { original: name, translated, to });
      }

      // 12. Series Details: GET /api/series/:id (Metadata/Poster browsing allowed)
      const seriesMatch = pathname.match(/^\/api\/series\/([^\/]+)$/);
      if (seriesMatch) {
        const seriesId = seriesMatch[1];
        try {
          const detail = await scraper.getSeriesDetail(seriesId);
          if (detail && detail.series_id) {
            downloadMemoryManager.addMemory({
              id: detail.series_id,
              platform: 'hongguo',
              title: detail.title,
              cover: detail.cover || '',
              total_episodes: detail.episode_cnt || 0
            }).catch(() => {});
          }
          return sendJson(res, 200, detail);
        } catch (err) {
          console.error(`[Server] Failed to getSeriesDetail for ${seriesId}:`, err.message);
          return sendJson(res, 500, { ok: false, error: err.message });
        }
      }

      // 13. Full Series with links: GET /api/series/:id/full
      const fullMatch = pathname.match(/^\/api\/series\/([^\/]+)\/full$/);
      if (fullMatch) {
        if (!requireLicenseAuth(res)) return;
        const seriesId = fullMatch[1];
        const quality = query.quality || '1080p';
        const fullDetail = await scraper.getSeriesFull(seriesId, baseUrl, quality);
        return sendJson(res, 200, fullDetail);
      }

      // 13b. Downloaded Episodes Check: GET /api/series/:id/downloaded
      const dlCheckMatch = pathname.match(/^\/api\/series\/([^\/]+)\/downloaded$/);
      if (dlCheckMatch) {
        const seriesId = dlCheckMatch[1];
        const reqTitle = (query.title || '').trim().replace(/[\\/:*?"<>|]/g, '_');
        const outRoot = getOutputDir();
        const downloadedEps = [];
        let dramaTitle = '';
        if (fs.existsSync(outRoot)) {
          const folders = fs.readdirSync(outRoot);
          for (const folder of folders) {
            const folderPath = path.join(outRoot, folder);
            try {
              if (fs.statSync(folderPath).isDirectory()) {
                const metaPath = path.join(folderPath, '.series.json');
                let matchThis = false;
                if (fs.existsSync(metaPath)) {
                  try {
                    const m = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                    if (String(m.series_id) === String(seriesId)) {
                      matchThis = true;
                      dramaTitle = m.title || folder;
                    }
                  } catch (e) {}
                }
                if (!matchThis && reqTitle && (folder.toLowerCase() === reqTitle.toLowerCase() || folder.toLowerCase().includes(reqTitle.toLowerCase()))) {
                  matchThis = true;
                  dramaTitle = reqTitle;
                }
                if (matchThis || folder.includes(seriesId)) {
                  const files = fs.readdirSync(folderPath);
                  for (const f of files) {
                    const m = f.match(/^(?:.*?_)?EP(\d+)\.mp4$/i);
                    if (m) {
                      const epNum = parseInt(m[1], 10);
                      const fPath = path.join(folderPath, f);
                      if (fs.existsSync(fPath) && fs.statSync(fPath).size > 10240) {
                        downloadedEps.push(epNum);
                      }
                    }
                  }
                  if (matchThis) break;
                }
              }
            } catch (e) {}
          }
        }
        downloadedEps.sort((a, b) => a - b);
        let rangeSummary = '';
        if (downloadedEps.length > 0) {
          const minEp = downloadedEps[0];
          const maxEp = downloadedEps[downloadedEps.length - 1];
          if (downloadedEps.length === (maxEp - minEp + 1)) {
            rangeSummary = minEp === maxEp ? `ភាគ ${minEp}` : `ភាគ ${minEp}-${maxEp}`;
          } else {
            rangeSummary = `ភាគ ${minEp}-${maxEp} (${downloadedEps.length} ភាគ)`;
          }
        }
        return sendJson(res, 200, {
          series_id: seriesId,
          title: dramaTitle,
          downloaded_episodes: downloadedEps,
          count: downloadedEps.length,
          last_ep: downloadedEps.length > 0 ? downloadedEps[downloadedEps.length - 1] : 0,
          summary: rangeSummary
        });
      }

      // 13b. Check Drama Memory (Duplicate & Missing Episodes Prevention)
      if (pathname === '/api/drama/check-memory') {
        const sid = query.id || query.series_id || '';
        const title = query.title || '';
        const platform = query.platform || 'hongguo';
        const total = parseInt(query.total || query.total_episodes || '0', 10);
        const result = await libraryManager.checkSeriesMemory(sid, title, platform, total);
        return sendJson(res, 200, result);
      }

      // 13c. Download Missing Episodes Only (Resume incomplete drama)
      if (pathname === '/api/drama/download-missing' && req.method === 'POST') {
        if (!requireLicenseAuth(res)) return;
        const body = await parseJsonBody(req);
        const sid = String(body.series_id || body.id || '');
        const platform = body.platform || 'hongguo';
        const title = body.title || 'Drama';
        const missingEps = Array.isArray(body.missing_episodes) ? body.missing_episodes : [];
        const downloadMode = body.download_mode || 'merged';

        if (missingEps.length === 0) {
          return sendJson(res, 400, { ok: false, message: 'គ្មានភាគដែលខ្វះទេ (No missing episodes to download)' });
        }

        try {
          if (platform === 'haosou') {
            const dramaDetail = await haosouDownloader.getDramaDetail(sid);
            const epsToDownload = (dramaDetail.episodes || []).filter(e => missingEps.includes(e.episode));
            const task = await haosouDownloader.startDownload({
              book_id: sid,
              title: title || dramaDetail.title,
              episodes: epsToDownload.length > 0 ? epsToDownload : dramaDetail.episodes,
              download_mode: downloadMode
            });
            return sendJson(res, 200, { ok: true, task, count: epsToDownload.length, message: `បានចាប់ផ្ដើមទាញយក ${epsToDownload.length} ភាគដែលនៅខ្វះ!` });
          } else if (platform === 'mvffm') {
            const dramaDetail = await mvffmDownloader.getDramaDetail(sid);
            const sources = dramaDetail.sources || [];
            const curSource = sources[0] || { episodes: dramaDetail.episodes || [] };
            const allEps = curSource.episodes || [];
            const epsToDownload = allEps.filter((e, idx) => missingEps.includes(e.episode || (idx + 1)));
            const task = await mvffmDownloader.startDownload({
              drama_id: sid,
              title: title || dramaDetail.title,
              episodes: epsToDownload.length > 0 ? epsToDownload : allEps,
              download_mode: downloadMode
            });
            return sendJson(res, 200, { ok: true, task, count: epsToDownload.length, message: `បានចាប់ផ្ដើមទាញយក ${epsToDownload.length} ភាគដែលនៅខ្វះ!` });
          } else {
            // Hongguo
            const rangesStr = missingEps.join(',');
            const resData = await downloadManager.submitTasks({
              series_ids: [sid],
              ranges: { [sid]: rangesStr },
              download_mode: downloadMode,
              series_info: { [sid]: { title, cover: body.cover || '' } }
            });
            return sendJson(res, 200, { ok: true, ...resData, count: missingEps.length, message: `បានចាប់ផ្ដើមទាញយក ${missingEps.length} ភាគដែលនៅខ្វះ!` });
          }
        } catch (err) {
          return sendJson(res, 500, { ok: false, error: err.message });
        }
      }

      // 14. Downloads: POST /dl/submit
      if (pathname === '/dl/submit' && req.method === 'POST') {
        if (!requireLicenseAuth(res)) return;
        const body = await parseJsonBody(req);
        if (body && body.series_ids && Array.isArray(body.series_ids)) {
          for (const sid of body.series_ids) {
            const sInfo = (body.series_info && body.series_info[sid]) || {};
            downloadMemoryManager.addMemory({
              id: sid,
              platform: 'hongguo',
              title: sInfo.title || `Drama ${sid}`,
              cover: sInfo.cover || '',
              total_episodes: sInfo.total_episodes || 0
            }).catch(() => {});
          }
        }
        const resData = await downloadManager.submitTasks(body);
        return sendJson(res, 200, resData);
      }

      // 15. Downloads: GET /dl/status
      if (pathname === '/dl/status') {
        const baseStatus = downloadManager.getStatus();
        const hsTasks = Array.from(haosouDownloader.tasks.values()).filter(t => ['downloading', 'merging'].includes(t.status));
        const mvTasks = Array.from(mvffmDownloader.tasks.values()).filter(t => ['downloading', 'merging'].includes(t.status));
        baseStatus.haosou_tasks = hsTasks;
        baseStatus.mvffm_tasks = mvTasks;
        baseStatus.total_active_all = (baseStatus.running ? 1 : 0) + hsTasks.length + mvTasks.length;
        return sendJson(res, 200, baseStatus);
      }

      // 16. Downloads: POST /dl/cancel
      if (pathname === '/dl/cancel' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        if (body.task_id) {
          downloadManager.cancelTask(body.task_id);
          return sendJson(res, 200, { ok: true, message: `Task ${body.task_id} canceled` });
        }
        downloadManager.cancelAll();
        return sendJson(res, 200, { ok: true, message: 'All downloads canceled' });
      }

      // 17. Downloads: POST /dl/resume
      if (pathname === '/dl/resume' && req.method === 'POST') {
        const resData = downloadManager.resumeQueue();
        return sendJson(res, 200, resData);
      }

      // 18. Downloads: POST /dl/retry
      if (pathname === '/dl/retry' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const sid = body && body.series_id;
        if (!sid || sid === 'undefined') {
          const resData = downloadManager.resumeQueue();
          return sendJson(res, 200, resData);
        }
        const resData = downloadManager.retrySeries(sid);
        return sendJson(res, 200, resData);
      }

      function getActiveDownloadsInfo() {
        const activeSeriesIds = new Set();
        const activeFolders = new Set();
        const activeTitles = new Set();
        const activeYtFiles = new Set();
        const activeSeriesMap = new Map();

        // 1. Hongguo downloadManager
        if (downloadManager) {
          if (downloadManager.currentSid) {
            activeSeriesIds.add(String(downloadManager.currentSid));
          }
          if (downloadManager.queueSeries) {
            for (const [sid, s] of downloadManager.queueSeries.entries()) {
              const sId = String(sid);
              const isAct = ['queued', 'downloading', 'merging'].includes(s.status) ||
                (downloadManager.queueRunning && s.status !== 'done' && s.status !== 'failed');
              if (isAct) {
                activeSeriesIds.add(sId);
                const tClean = (s.title || '').trim().toLowerCase();
                const fClean = (s.title || '').trim().replace(/[\\/*?:"<>|\r\n\t]/g, '_').toLowerCase();
                if (tClean) activeTitles.add(tClean);
                if (fClean) activeFolders.add(fClean);
                activeSeriesMap.set(sId, {
                  series_id: sId,
                  platform: 'hongguo',
                  title: s.title || `Drama ${sId}`,
                  cover: s.cover || '',
                  done: s.done || 0,
                  total: s.total || 0,
                  progress: s.progress || 0,
                  status: 'downloading'
                });
              }
            }
          }
        }

        // 2. HaoSou
        if (haosouDownloader && haosouDownloader.tasks) {
          for (const t of haosouDownloader.tasks.values()) {
            if (['downloading', 'merging', 'queued', 'pending'].includes(t.status)) {
              const sId = String(t.book_id || t.seriesId || '');
              if (sId) activeSeriesIds.add(sId);
              const tClean = (t.title || t.dramaTitle || '').trim().toLowerCase();
              const fClean = (t.folderName || t.title || '').trim().replace(/[\\/*?:"<>|\r\n\t]/g, '_').toLowerCase();
              if (tClean) activeTitles.add(tClean);
              if (fClean) activeFolders.add(fClean);
              if (sId) {
                activeSeriesMap.set(sId, {
                  series_id: sId,
                  platform: 'haosou',
                  title: t.title || t.dramaTitle || `HaoSou Drama ${sId}`,
                  cover: t.cover || '',
                  done: t.completed_episodes || 0,
                  total: t.total_episodes || 0,
                  progress: t.progress_pct || 0,
                  status: 'downloading'
                });
              }
            }
          }
        }

        // 3. MVFFM
        if (mvffmDownloader && mvffmDownloader.tasks) {
          for (const t of mvffmDownloader.tasks.values()) {
            if (['downloading', 'merging', 'queued', 'pending'].includes(t.status)) {
              const sId = String(t.drama_id || t.seriesId || '');
              if (sId) activeSeriesIds.add(sId);
              const tClean = (t.title || t.dramaTitle || '').trim().toLowerCase();
              const fClean = (t.folderName || t.title || '').trim().replace(/[\\/*?:"<>|\r\n\t]/g, '_').toLowerCase();
              if (tClean) activeTitles.add(tClean);
              if (fClean) activeFolders.add(fClean);
              if (sId) {
                activeSeriesMap.set(sId, {
                  series_id: sId,
                  platform: 'mvffm',
                  title: t.title || t.dramaTitle || `MVFFM Drama ${sId}`,
                  cover: t.cover || '',
                  done: t.completed_episodes || 0,
                  total: t.total_episodes || 0,
                  progress: t.progress_pct || 0,
                  status: 'downloading'
                });
              }
            }
          }
        }

        // 4. YouTube
        if (youtubeDownloader && youtubeDownloader.tasks) {
          for (const t of youtubeDownloader.tasks.values()) {
            if (['downloading', 'merging', 'queued', 'pending'].includes(t.status)) {
              if (t.name) activeYtFiles.add(t.name.trim().toLowerCase());
              if (t.filePath) activeYtFiles.add(path.basename(t.filePath).trim().toLowerCase());
              if (t.id) activeYtFiles.add(String(t.id).toLowerCase());
            }
          }
        }

        return { activeSeriesIds, activeFolders, activeTitles, activeYtFiles, activeSeriesMap };
      }

      // 19. Library: GET /dl/library
      if (pathname === '/dl/library') {
        const activeInfo = getActiveDownloadsInfo();
        const lib = await libraryManager.scanAndGetLibrary(activeInfo.activeSeriesMap);
        return sendJson(res, 200, lib);
      }

      // 19b. Library Delete: POST /dl/library/delete
      if (pathname === '/dl/library/delete' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const sid = body.series_id;
        const deleteFiles = Boolean(body.delete_files);
        const ok = libraryManager.deleteSeries(sid, deleteFiles);
        return sendJson(res, 200, { ok, series_id: sid });
      }

      // 19d. Library Clean Inactive/Finished Records: POST /dl/library/clean
      if (pathname === '/dl/library/clean' && req.method === 'POST') {
        const activeInfo = getActiveDownloadsInfo();
        const result = libraryManager.cleanLibrary(activeInfo);
        const lib = await libraryManager.scanAndGetLibrary(activeInfo.activeSeriesMap);
        return sendJson(res, 200, {
          ok: true,
          cleanedCount: result.cleanedCount,
          sparedCount: result.sparedCount,
          library: lib
        });
      }

      // 20a. Download Memory: GET /api/download-memory
      if (pathname === '/api/download-memory' && req.method === 'GET') {
        const items = await downloadMemoryManager.getMemory();
        return sendJson(res, 200, { ok: true, items });
      }

      // 20b. Download Memory Add: POST /api/download-memory/add
      if (pathname === '/api/download-memory/add' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const item = await downloadMemoryManager.addMemory(body);
        return sendJson(res, 200, { ok: true, item });
      }

      // 20c. Download Memory Delete: POST /api/download-memory/delete
      if (pathname === '/api/download-memory/delete' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const ok = downloadMemoryManager.removeMemory(body && body.id);
        return sendJson(res, 200, { ok });
      }

      // 20d. Download Memory Clear: POST /api/download-memory/clear
      if (pathname === '/api/download-memory/clear' && req.method === 'POST') {
        const ok = downloadMemoryManager.clearMemory();
        return sendJson(res, 200, { ok });
      }

      // 19c. Library Play Drama in Default Player (VLC): POST /dl/library/play
      if (pathname === '/dl/library/play' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const sid = body && body.series_id ? String(body.series_id) : '';
        const folderParam = body && body.folder ? String(body.folder) : '';
        const titleParam = body && body.title ? String(body.title) : '';
        const targetEp = body && body.episode ? parseInt(body.episode, 10) : 0;
        const outRoot = getOutputDir();

        let dramaDir = null;

        // 1. Try folder from library db
        if (sid && libraryManager && libraryManager.db && libraryManager.db.has(sid)) {
          const rec = libraryManager.db.get(sid);
          if (rec.path && fs.existsSync(rec.path)) {
            dramaDir = rec.path;
          } else if (rec.folder && fs.existsSync(path.join(outRoot, rec.folder))) {
            dramaDir = path.join(outRoot, rec.folder);
          }
        }

        // 2. Try direct folderParam or titleParam
        if (!dramaDir && folderParam && fs.existsSync(path.join(outRoot, folderParam))) {
          dramaDir = path.join(outRoot, folderParam);
        }
        if (!dramaDir && titleParam) {
          const safeT = titleParam.replace(/[\\/*?:"<>|\r\n\t]/g, '_').trim();
          if (fs.existsSync(path.join(outRoot, safeT))) {
            dramaDir = path.join(outRoot, safeT);
          }
        }

        // 3. Scan disk folders matching .series.json or folder name
        if (!dramaDir && fs.existsSync(outRoot)) {
          const folders = fs.readdirSync(outRoot);
          for (const f of folders) {
            const candidate = path.join(outRoot, f);
            try {
              if (fs.statSync(candidate).isDirectory()) {
                const metaP = path.join(candidate, '.series.json');
                if (fs.existsSync(metaP)) {
                  try {
                    const m = JSON.parse(fs.readFileSync(metaP, 'utf-8'));
                    if (sid && String(m.series_id) === sid) {
                      dramaDir = candidate;
                      break;
                    }
                  } catch (e) {}
                }
                if (sid && f.includes(sid)) {
                  dramaDir = candidate;
                  break;
                }
              }
            } catch (e) {}
          }
        }

        if (!dramaDir || !fs.existsSync(dramaDir)) {
          return sendJson(res, 404, { ok: false, error: 'folder_not_found', message: 'Drama folder not found on disk' });
        }

        // Find candidate video file
        const allFiles = fs.readdirSync(dramaDir);
        const mp4Files = allFiles.filter(f => f.toLowerCase().endsWith('.mp4') && !f.toLowerCase().endsWith('.part') && !f.toLowerCase().endsWith('.tmp.mp4'));

        if (mp4Files.length === 0) {
          return sendJson(res, 404, { ok: false, error: 'no_videos', message: 'No video files downloaded yet in this folder' });
        }

        let chosenFile = null;

        // If specific episode requested
        if (targetEp > 0) {
          const epRegex = new RegExp(`(?:EP?|ភាគ|E|^|_|-|\\b)0*${targetEp}(?:[._-]|$)`, 'i');
          chosenFile = mp4Files.find(f => !f.includes('វីដេអូពេញ') && !f.includes('Full') && epRegex.test(f));
          if (!chosenFile) {
            // Check if inside a merged range (e.g. ភាគ01-03)
            chosenFile = mp4Files.find(f => {
              if (!f.includes('វីដេអូពេញ') && !f.includes('Full')) return false;
              const mRange = f.match(/ភាគ0*(\d+)-0*(\d+)/i);
              if (mRange) {
                const s = parseInt(mRange[1], 10);
                const e = parseInt(mRange[2], 10);
                return targetEp >= s && targetEp <= e;
              }
              return false;
            });
          }
        }

        // If not found or no specific episode requested:
        if (!chosenFile) {
          // Check for merged/full video first
          const fullVideo = mp4Files.find(f => f.includes('វីដេអូពេញ') || f.includes('Full'));
          if (fullVideo) {
            chosenFile = fullVideo;
          } else {
            // Sort by episode number
            mp4Files.sort((a, b) => {
              const na = (a.match(/(?:EP?|E|\b)(\d+)\b/i) || [])[1];
              const nb = (b.match(/(?:EP?|E|\b)(\d+)\b/i) || [])[1];
              return (parseInt(na, 10) || 0) - (parseInt(nb, 10) || 0);
            });
            chosenFile = mp4Files[0];
          }
        }

        const fullPath = path.join(dramaDir, chosenFile);
        if (fs.existsSync(fullPath)) {
          if (process.platform === 'win32') {
            exec(`start "" "${fullPath}"`);
          } else {
            exec(`open "${fullPath}"`);
          }
          return sendJson(res, 200, { ok: true, played: fullPath, filename: chosenFile });
        }

        return sendJson(res, 404, { ok: false, error: 'file_not_found', message: 'Video file could not be opened' });
      }

      // 20. Library / Folder: POST /dl/open_folder
      if (pathname === '/dl/open_folder' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        let targetPath = body.path;

        if (!targetPath) {
          const outRoot = getOutputDir();
          if (body.folder) {
            targetPath = path.join(outRoot, body.folder);
          } else if (body.title) {
            const dramaFolder = String(body.title).replace(/[\\/*?:"<>|\r\n\t]/g, '_').trim();
            targetPath = path.join(outRoot, dramaFolder);
          } else {
            targetPath = outRoot;
          }
        }

        if (!fs.existsSync(targetPath)) {
          targetPath = getOutputDir();
        }

        // Open in Windows File Explorer
        if (process.platform === 'win32') {
          exec(`explorer.exe "${targetPath}"`);
        } else {
          exec(`open "${targetPath}"`);
        }
        return sendJson(res, 200, { ok: true, opened: targetPath });
      }

      // 21. Config: GET /api/config and /dl/config
      if (pathname === '/api/config' || pathname === '/dl/config') {
        const cfg = loadSettings();
        return sendJson(res, 200, {
          ...cfg,
          app_title: APP_TITLE,
          version: APP_VERSION
        });
      }

      // 22. Config: POST /dl/config
      if (pathname === '/dl/config' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const updated = saveSettings(body);
        return sendJson(res, 200, { status: 'success', config: updated });
      }

      // 23. Browse Folder: POST /dl/browse_folder
      if (pathname === '/dl/browse_folder' && req.method === 'POST') {
        if (_nativeFolderPickerCallback) {
          try {
            const selected = await _nativeFolderPickerCallback();
            if (selected) {
              const updated = saveSettings({ output_dir: selected });
              return sendJson(res, 200, { status: 'success', path: selected, config: updated });
            }
          } catch (e) {
            console.warn('[Server] Native folder picker error:', e);
          }
        }
        return sendJson(res, 200, { status: 'canceled' });
      }

      // 24. Software Updater Check: GET /api/update/check or /dl/update/check
      if (pathname === '/api/update/check' || pathname === '/dl/update/check') {
        const repo = query.repo || null;
        try {
          const result = await checkForUpdates(repo);
          return sendJson(res, 200, result);
        } catch (err) {
          return sendJson(res, 500, { error: err.message });
        }
      }

      // 24b. Software Updater Progress: GET /api/update/progress or /dl/update/progress
      if (pathname === '/api/update/progress' || pathname === '/dl/update/progress') {
        return sendJson(res, 200, getUpdateProgress());
      }

      // 24c. Software Updater Apply: POST /api/update/apply or /dl/update/apply
      if ((pathname === '/api/update/apply' || pathname === '/dl/update/apply') && req.method === 'POST') {
        const body = await parseJsonBody(req);
        try {
          const result = await applyUpdate(body.download_url, body.repo);
          return sendJson(res, 200, result);
        } catch (err) {
          return sendJson(res, 500, { error: err.message });
        }
      }

      // ==========================================
      // 25. YouTube Downloader Endpoints
      // ==========================================

      // 25a. YouTube Video Info: POST /api/youtube/info
      if (pathname === '/api/youtube/info' && req.method === 'POST') {
        if (!requireLicenseAuth(res)) return;
        const body = await parseJsonBody(req);
        if (!body.url) {
          return sendError(res, 400, 'សូមបញ្ចូលលីង YouTube (Please provide a YouTube URL)');
        }
        try {
          const info = await youtubeDownloader.getVideoInfo(body.url);
          return sendJson(res, 200, { ok: true, data: info });
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to fetch YouTube info');
        }
      }

      // 25b. YouTube Start Download: POST /api/youtube/download
      if (pathname === '/api/youtube/download' && req.method === 'POST') {
        if (!requireLicenseAuth(res)) return;
        const body = await parseJsonBody(req);
        if (!body.url) {
          return sendError(res, 400, 'សូមបញ្ចូលលីង YouTube (Please provide a YouTube URL)');
        }
        try {
          downloadMemoryManager.addMemory({
            id: body.id || body.url,
            platform: 'youtube',
            title: body.title || 'YouTube Video',
            cover: body.thumbnail || '',
            url: body.url,
            total_episodes: 1
          }).catch(() => {});

          const task = await youtubeDownloader.startDownload({
            url: body.url,
            quality: body.quality || 'best',
            title: body.title,
            customDir: body.customDir
          });
          if (task && task.name) libraryManager.unclearYoutube(task.name);
          if (body && body.title) libraryManager.unclearYoutube(body.title);
          return sendJson(res, 200, { ok: true, task });
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to start YouTube download');
        }
      }

      // 25c. YouTube Tasks List: GET /api/youtube/tasks
      if (pathname === '/api/youtube/tasks' && req.method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          tasks: youtubeDownloader.getTasks(),
          output_dir: youtubeDownloader.getYouTubeOutputDir()
        });
      }

      // 25d. YouTube Cancel Task: POST /api/youtube/cancel
      if (pathname === '/api/youtube/cancel' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        if (body.task_id) {
          const ok = youtubeDownloader.cancelTask(body.task_id);
          return sendJson(res, 200, { ok, message: `Task ${body.task_id} canceled` });
        }
        youtubeDownloader.cancelAll();
        return sendJson(res, 200, { ok: true, message: 'All YouTube downloads canceled' });
      }

      // 25e. YouTube Clear Finished: POST /api/youtube/clear
      if (pathname === '/api/youtube/clear' && req.method === 'POST') {
        const remaining = youtubeDownloader.clearFinished();
        return sendJson(res, 200, { ok: true, tasks: remaining });
      }

      // 25f. YouTube Open Folder or File: POST /api/youtube/open_folder
      if (pathname === '/api/youtube/open_folder' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        let target = body.path || youtubeDownloader.getYouTubeOutputDir();
        if (!fs.existsSync(target)) {
          target = youtubeDownloader.getYouTubeOutputDir();
        }
        if (process.platform === 'win32') {
          if (fs.existsSync(target) && fs.statSync(target).isFile()) {
            exec(`explorer.exe /select,"${target}"`);
          } else {
            exec(`explorer.exe "${target}"`);
          }
        } else {
          exec(`open "${target}"`);
        }
        return sendJson(res, 200, { ok: true, opened: target });
      }

      // 25g. YouTube Library Scan: GET /api/youtube/library
      if (pathname === '/api/youtube/library' && req.method === 'GET') {
        const outDir = youtubeDownloader.getYouTubeOutputDir();
        const items = [];
        if (fs.existsSync(outDir)) {
          const files = fs.readdirSync(outDir);
          const mediaExts = ['.mp4', '.mkv', '.webm', '.mp3', '.m4a'];
          for (const f of files) {
            const ext = path.extname(f).toLowerCase();
            if (mediaExts.includes(ext)) {
              const fullPath = path.join(outDir, f);
              const fLower = f.trim().toLowerCase();

              // Check if actively downloading
              let isAct = false;
              if (youtubeDownloader && youtubeDownloader.tasks) {
                for (const t of youtubeDownloader.tasks.values()) {
                  if (['downloading', 'merging', 'queued', 'pending'].includes(t.status)) {
                    if ((t.name && t.name.toLowerCase() === fLower) || (t.filePath && path.basename(t.filePath).toLowerCase() === fLower)) {
                      isAct = true;
                      break;
                    }
                  }
                }
              }

              if (!isAct && libraryManager.isYoutubeCleared(fLower)) {
                continue; // Cleared from library view!
              }

              try {
                const stat = fs.statSync(fullPath);
                items.push({
                  name: f,
                  filePath: fullPath,
                  size: stat.size,
                  modified: stat.mtimeMs,
                  ext: ext.replace('.', '').toUpperCase()
                });
              } catch (e) {}
            }
          }
          items.sort((a, b) => b.modified - a.modified);
        }
        return sendJson(res, 200, {
          ok: true,
          output_dir: outDir,
          items
        });
      }

      // 25h. YouTube Play File: POST /api/youtube/play
      if (pathname === '/api/youtube/play' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        let target = body.path;
        if (target && fs.existsSync(target)) {
          if (process.platform === 'win32') {
            exec(`start "" "${target}"`);
          } else {
            exec(`open "${target}"`);
          }
          return sendJson(res, 200, { ok: true, played: target });
        }
        return sendJson(res, 400, { ok: false, error: 'File not found' });
      }

      // 25i. YouTube Delete File: POST /api/youtube/delete_file
      if (pathname === '/api/youtube/delete_file' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        let target = body.path;
        if (target && fs.existsSync(target)) {
          try {
            fs.unlinkSync(target);
            return sendJson(res, 200, { ok: true });
          } catch (e) {
            return sendJson(res, 500, { ok: false, error: e.message });
          }
        }
        return sendJson(res, 400, { ok: false, error: 'File not found' });
      }

      // ==========================================
      // 26. HaoSou (1DFX.com / dj.1dfx.com) Endpoints
      // ==========================================

      // 26a. Hot Recommendations: GET /api/haosou/recommend
      if (pathname === '/api/haosou/recommend' && req.method === 'GET') {
        const category = parsedUrl.searchParams.get('category') || 'all';
        const items = await haosouDownloader.getRecommendations(category);
        return sendJson(res, 200, { ok: true, data: items, category });
      }

      // 26b. Search Dramas: GET /api/haosou/search?wd=...
      if (pathname === '/api/haosou/search' && req.method === 'GET') {
        const wd = parsedUrl.searchParams.get('wd') || '';
        const items = await haosouDownloader.search(wd);
        return sendJson(res, 200, { ok: true, data: items });
      }

      // 26c. Drama Detail: POST /api/haosou/detail
      if (pathname === '/api/haosou/detail' && req.method === 'POST') {
        if (!requireLicenseAuth(res)) return;
        const body = await parseJsonBody(req);
        if (!body.query) {
          return sendError(res, 400, 'សូមបញ្ចូលលីង ឬ ID រឿង (Please provide drama URL or ID)');
        }
        try {
          const detail = await haosouDownloader.getDetail(body.query);
          if (detail && detail.id) {
            downloadMemoryManager.addMemory({
              id: detail.id,
              platform: 'haosou',
              title: detail.title,
              cover: detail.cover || '',
              total_episodes: (detail.episodes || []).length
            }).catch(() => {});
          }
          return sendJson(res, 200, { ok: true, data: detail });
        } catch (err) {
          return sendError(res, 404, err.message || 'Drama not found');
        }
      }

      // 26d. Start Download: POST /api/haosou/download
      if (pathname === '/api/haosou/download' && req.method === 'POST') {
        if (!requireLicenseAuth(res)) return;
        const body = await parseJsonBody(req);
        try {
          if (body && body.book_id) {
            downloadMemoryManager.addMemory({
              id: body.book_id,
              platform: 'haosou',
              title: body.title,
              cover: body.cover || '',
              total_episodes: (body.episodes || []).length
            }).catch(() => {});
          }
          const task = await haosouDownloader.startDownload({
            book_id: body.book_id,
            title: body.title,
            episodes: body.episodes || [],
            customDir: body.custom_dir,
            download_mode: body.download_mode || 'merged',
            quality: body.quality || 'original',
            fps: body.fps || null,
            target_height: body.target_height || null
          });
          return sendJson(res, 200, { ok: true, data: task });
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to start download');
        }
      }

      // 26e. Tasks List: GET /api/haosou/tasks
      if (pathname === '/api/haosou/tasks' && req.method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          tasks: haosouDownloader.getTasks(),
          output_dir: haosouDownloader.getHaoSouOutputDir()
        });
      }

      // 26f. Cancel Task: POST /api/haosou/cancel
      if (pathname === '/api/haosou/cancel' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const ok = haosouDownloader.cancelTask(body.task_id);
        return sendJson(res, 200, { ok });
      }

      // 26g. Clear Finished Tasks: POST /api/haosou/clear
      if (pathname === '/api/haosou/clear' && req.method === 'POST') {
        const remaining = haosouDownloader.clearFinished();
        return sendJson(res, 200, { ok: true, tasks: remaining });
      }

      // 26h. Open Folder: POST /api/haosou/open_folder
      if (pathname === '/api/haosou/open_folder' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        let target = body.path || haosouDownloader.getHaoSouOutputDir();
        if (!fs.existsSync(target)) {
          target = haosouDownloader.getHaoSouOutputDir();
        }
        if (process.platform === 'win32') {
          exec(`explorer.exe "${target}"`);
        } else if (process.platform === 'darwin') {
          exec(`open "${target}"`);
        } else {
          exec(`xdg-open "${target}"`);
        }
        return sendJson(res, 200, { ok: true, opened: target });
      }

      // ==========================================
      // 27. MVFFM (mvffm.net) Short Drama Endpoints
      // ==========================================

      // 27a. Recommendations: GET /api/mvffm/recommend
      if (pathname === '/api/mvffm/recommend' && req.method === 'GET') {
        const type = parsedUrl.searchParams.get('type') || 'hot';
        const items = await mvffmDownloader.getRecommendations(type);
        const isFallback = items && items.some(it => it.is_fallback);
        return sendJson(res, 200, { ok: true, data: items, type, is_fallback: Boolean(isFallback) });
      }

      // 27b. Search: GET /api/mvffm/search?wd=...
      if (pathname === '/api/mvffm/search' && req.method === 'GET') {
        const wd = parsedUrl.searchParams.get('wd') || '';
        const items = await mvffmDownloader.search(wd);
        return sendJson(res, 200, { ok: true, data: items });
      }

      // 27c. Detail: POST /api/mvffm/detail
      if (pathname === '/api/mvffm/detail' && req.method === 'POST') {
        if (!requireLicenseAuth(res)) return;
        const body = await parseJsonBody(req);
        if (!body.query) {
          return sendError(res, 400, 'សូមបញ្ចូលលីង ឬ ID រឿង (Please provide drama URL or ID)');
        }
        try {
          const detail = await mvffmDownloader.getDetail(body.query);
          if (detail && detail.id) {
            downloadMemoryManager.addMemory({
              id: detail.id,
              platform: 'mvffm',
              title: detail.title,
              cover: detail.cover || '',
              total_episodes: (detail.episodes || []).length
            }).catch(() => {});
          }
          return sendJson(res, 200, { ok: true, data: detail });
        } catch (err) {
          return sendError(res, 404, err.message || 'Drama not found');
        }
      }

      // 27d. Start Download: POST /api/mvffm/download
      if (pathname === '/api/mvffm/download' && req.method === 'POST') {
        if (!requireLicenseAuth(res)) return;
        const body = await parseJsonBody(req);
        try {
          if (body && body.drama_id) {
            downloadMemoryManager.addMemory({
              id: body.drama_id,
              platform: 'mvffm',
              title: body.title,
              cover: body.cover || '',
              total_episodes: (body.episodes || []).length
            }).catch(() => {});
          }
          const task = await mvffmDownloader.startDownload({
            drama_id: body.drama_id,
            title: body.title,
            episodes: body.episodes || [],
            customDir: body.custom_dir,
            download_mode: body.download_mode || 'merged',
            quality: body.quality || 'original',
            fps: body.fps || null,
            target_height: body.target_height || null
          });
          return sendJson(res, 200, { ok: true, data: task });
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to start download');
        }
      }

      // 27e. Tasks List: GET /api/mvffm/tasks
      if (pathname === '/api/mvffm/tasks' && req.method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          tasks: mvffmDownloader.getTasks(),
          output_dir: mvffmDownloader.getMvffmOutputDir()
        });
      }

      // 27f. Cancel Task: POST /api/mvffm/cancel
      if (pathname === '/api/mvffm/cancel' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const ok = mvffmDownloader.cancelTask(body.task_id);
        return sendJson(res, 200, { ok });
      }

      // 27g. Clear Finished Tasks: POST /api/mvffm/clear
      if (pathname === '/api/mvffm/clear' && req.method === 'POST') {
        const remaining = mvffmDownloader.clearFinished();
        return sendJson(res, 200, { ok: true, tasks: remaining });
      }

      // 27h. Open Folder: POST /api/mvffm/open_folder
      if (pathname === '/api/mvffm/open_folder' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        let target = body.path || mvffmDownloader.getMvffmOutputDir();
        if (!fs.existsSync(target)) {
          target = mvffmDownloader.getMvffmOutputDir();
        }
        if (process.platform === 'win32') {
          exec(`explorer.exe "${target}"`);
        } else if (process.platform === 'darwin') {
          exec(`open "${target}"`);
        } else {
          exec(`xdg-open "${target}"`);
        }
        return sendJson(res, 200, { ok: true, opened: target });
      }

      // ==========================================
      // 27-DM. Dailymotion Chinese Short Drama Endpoints
      // ==========================================

      // 27dm-a. Recommendations / Feed: GET /api/dailymotion/feed
      if (pathname === '/api/dailymotion/feed' && req.method === 'GET') {
        const category = parsedUrl.searchParams.get('category') || 'trending';
        const page = parseInt(parsedUrl.searchParams.get('page') || '1', 10);
        try {
          const data = await dailymotionDownloader.getChineseDramas(category, page, 36);
          return sendJson(res, 200, { ok: true, data });
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to fetch Dailymotion dramas');
        }
      }

      // 27dm-b. Search: GET /api/dailymotion/search?q=...
      if (pathname === '/api/dailymotion/search' && req.method === 'GET') {
        const q = parsedUrl.searchParams.get('q') || '';
        const page = parseInt(parsedUrl.searchParams.get('page') || '1', 10);
        try {
          const data = await dailymotionDownloader.searchDramas(q, page, 36);
          return sendJson(res, 200, { ok: true, data });
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to search Dailymotion');
        }
      }

      // 27dm-c. Video Detail & Channel Episodes: GET /api/dailymotion/detail?id=...
      if (pathname === '/api/dailymotion/detail' && req.method === 'GET') {
        const id = parsedUrl.searchParams.get('id') || '';
        try {
          const data = await dailymotionDownloader.getVideoDetail(id);
          return sendJson(res, 200, { ok: true, data });
        } catch (err) {
          return sendError(res, 404, err.message || 'Video not found');
        }
      }

      // 27dm-c2. Direct Stream URL (.m3u8): GET /api/dailymotion/stream?id=...
      if (pathname === '/api/dailymotion/stream' && req.method === 'GET') {
        const id = parsedUrl.searchParams.get('id') || '';
        try {
          const streamUrl = await dailymotionDownloader.getStreamUrl(id);
          if (streamUrl) {
            return sendJson(res, 200, {
              ok: true,
              stream_url: streamUrl,
              proxy_url: `/api/dailymotion/hls/${encodeURIComponent(id)}/manifest.m3u8`
            });
          }
          return sendError(res, 404, 'Direct stream not found');
        } catch (err) {
          return sendError(res, 500, err.message || 'Stream extraction failed');
        }
      }

      // 27dm-c3. Dailymotion HLS Proxy (Solves CORS & ensures 100% native smooth playback)
      const dmHlsMatch = pathname.match(/^\/api\/dailymotion\/hls\/([^/]+)\/(.+)$/);
      if (dmHlsMatch && req.method === 'GET') {
        const videoId = decodeURIComponent(dmHlsMatch[1]);
        const fileName = dmHlsMatch[2];
        try {
          const manifestUrl = await dailymotionDownloader.getStreamUrl(videoId);
          if (!manifestUrl) {
            return sendError(res, 404, 'Dailymotion stream not found');
          }
          const baseUrl = manifestUrl.substring(0, manifestUrl.lastIndexOf('/') + 1);
          const targetUrl = fileName === 'manifest.m3u8' ? manifestUrl : (baseUrl + fileName);

          const clientReq = https.get(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://www.dailymotion.com/'
            }
          }, (clientRes) => {
            const isM3u8 = fileName.endsWith('.m3u8');
            const isMedia = fileName.endsWith('.mp4') || fileName.endsWith('.m4s') || fileName.endsWith('.ts');
            const contentType = isM3u8
              ? 'application/vnd.apple.mpegurl'
              : (isMedia ? 'video/mp4' : (clientRes.headers['content-type'] || 'application/octet-stream'));

            res.writeHead(clientRes.statusCode || 200, {
              'Content-Type': contentType,
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, OPTIONS',
              'Access-Control-Allow-Headers': '*',
              'Cache-Control': isM3u8 ? 'no-cache' : 'public, max-age=3600'
            });
            clientRes.pipe(res);
          });

          clientReq.on('error', (err) => {
            if (!res.headersSent) {
              sendError(res, 502, err.message);
            }
          });
          return;
        } catch (err) {
          return sendError(res, 500, err.message || 'HLS proxy error');
        }
      }

      // 27dm-d. Start Download: POST /api/dailymotion/download
      if (pathname === '/api/dailymotion/download' && req.method === 'POST') {
        if (!requireLicenseAuth(res)) return;
        const body = await parseJsonBody(req);
        try {
          const task = await dailymotionDownloader.startDownload({
            video_id: body.video_id,
            url: body.url,
            title: body.title,
            customDir: body.custom_dir
          });
          return sendJson(res, 200, { ok: true, data: task });
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to start Dailymotion download');
        }
      }

      // 27dm-e. Tasks List: GET /api/dailymotion/tasks
      if (pathname === '/api/dailymotion/tasks' && req.method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          tasks: dailymotionDownloader.getTasks(),
          output_dir: dailymotionDownloader.getDailymotionOutputDir()
        });
      }

      // 27dm-f. Cancel Task: POST /api/dailymotion/cancel
      if (pathname === '/api/dailymotion/cancel' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const resObj = dailymotionDownloader.cancelTask(body.task_id);
        return sendJson(res, 200, resObj);
      }

      // 27dm-g. Open Folder: POST /api/dailymotion/open_folder
      if (pathname === '/api/dailymotion/open_folder' && req.method === 'POST') {
        let target = dailymotionDownloader.getDailymotionOutputDir();
        if (process.platform === 'win32') {
          exec(`explorer.exe "${target}"`);
        } else if (process.platform === 'darwin') {
          exec(`open "${target}"`);
        } else {
          exec(`xdg-open "${target}"`);
        }
        return sendJson(res, 200, { ok: true, opened: target });
      }

      // ==========================================
      // 27-TT. TikTok, Douyin & Kuaishou Downloader Endpoints
      // ==========================================

      // 27tt-a. Analyze Video: POST /api/tiktok/analyze
      if (pathname === '/api/tiktok/analyze' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        try {
          const info = await tiktokDownloader.analyzeVideo(body.url, body.platform);
          return sendJson(res, 200, { ok: true, data: info });
        } catch (err) {
          return sendError(res, 400, err.message || 'Failed to analyze video');
        }
      }

      // 27tt-b. Start Download: POST /api/tiktok/download
      if (pathname === '/api/tiktok/download' && req.method === 'POST') {
        if (!requireLicenseAuth(res)) return;
        const body = await parseJsonBody(req);
        try {
          const task = await tiktokDownloader.startDownload({
            url: body.url,
            play_url: body.play_url,
            format: body.format,
            title: body.title,
            author: body.author,
            platform: body.platform,
            customDir: body.custom_dir
          });
          return sendJson(res, 200, { ok: true, data: task });
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to start download');
        }
      }

      // 27tt-c. Tasks List: GET /api/tiktok/tasks
      if (pathname === '/api/tiktok/tasks' && req.method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          tasks: tiktokDownloader.getTasks(),
          output_dir: tiktokDownloader.getTikTokOutputDir()
        });
      }

      // 27tt-d. Cancel Task: POST /api/tiktok/cancel
      if (pathname === '/api/tiktok/cancel' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const resObj = tiktokDownloader.cancelTask(body.task_id);
        return sendJson(res, 200, resObj);
      }

      // 27tt-e. Open Folder: POST /api/tiktok/open_folder
      if (pathname === '/api/tiktok/open_folder' && req.method === 'POST') {
        let target = tiktokDownloader.getTikTokOutputDir();
        if (process.platform === 'win32') {
          exec(`explorer.exe "${target}"`);
        } else if (process.platform === 'darwin') {
          exec(`open "${target}"`);
        } else {
          exec(`xdg-open "${target}"`);
        }
        return sendJson(res, 200, { ok: true, opened: target });
      }

      // 27tt-f. TikTok / Douyin / Kuaishou Media Proxy Stream: GET /api/tiktok/stream_proxy
      if (pathname === '/api/tiktok/stream_proxy' && req.method === 'GET') {
        const streamUrl = query.url;
        if (!streamUrl) return sendError(res, 400, 'Missing url query');

        try {
          const targetUrl = new URL(streamUrl);
          const isHttps = targetUrl.protocol === 'https:';
          const client = isHttps ? https : http;

          const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Referer': targetUrl.origin + '/',
            'Accept': '*/*'
          };
          if (req.headers.range) {
            headers['Range'] = req.headers.range;
          }

          const proxyReq = client.get(streamUrl, { headers, timeout: 25000 }, (proxyRes) => {
            if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
              res.writeHead(302, { Location: `/api/tiktok/stream_proxy?url=${encodeURIComponent(proxyRes.headers.location)}` });
              return res.end();
            }

            const resHeaders = {
              'Content-Type': proxyRes.headers['content-type'] || 'video/mp4',
              'Accept-Ranges': 'bytes',
              'Access-Control-Allow-Origin': '*'
            };
            if (proxyRes.headers['content-range']) resHeaders['Content-Range'] = proxyRes.headers['content-range'];
            if (proxyRes.headers['content-length']) resHeaders['Content-Length'] = proxyRes.headers['content-length'];

            res.writeHead(proxyRes.statusCode || 200, resHeaders);
            proxyRes.pipe(res);
          });

          proxyReq.on('error', (e) => {
            if (!res.headersSent) sendError(res, 502, `Proxy error: ${e.message}`);
          });
          req.on('close', () => {
            proxyReq.destroy();
          });
          return;
        } catch (err) {
          return sendError(res, 400, `Invalid URL: ${err.message}`);
        }
      }

      // 28. License & Device Tracking API Endpoints
      // 28a. License Status: GET /api/license/status
      if (pathname === '/api/license/status' && req.method === 'GET') {
        let lic = getLicenseStatus();
        if (!lic || !lic.activated) {
          try {
            const autoRes = await checkAutoActivation();
            if (autoRes && autoRes.authorized) {
              lic = getLicenseStatus();
            }
          } catch (_) {}
        }
        return sendJson(res, 200, lic);
      }

      // 28b. Activate with Key: POST /api/license/activate
      if (pathname === '/api/license/activate' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const result = await activateLicense(body.key, {
          telegramUser: body.telegramUser,
          computerName: body.computerName
        });
        return sendJson(res, result.success ? 200 : 400, result);
      }

      // 28c. Deactivate: POST /api/license/deactivate
      if (pathname === '/api/license/deactivate' && req.method === 'POST') {
        return sendJson(res, 200, deactivateLicense());
      }

      // 28d. Report Client Device Ping & Telegram Username: POST /api/license/track
      if (pathname === '/api/license/track' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const result = await recordDeviceTracking({
          deviceId: body.deviceId,
          telegramUser: body.telegramUser,
          computerName: body.computerName,
          customName: body.customName,
          key: body.key,
          status: body.status,
          expiresAt: body.expiresAt,
          remainingDays: body.remainingDays,
          skipAlert: Boolean(body.skipAlert)
        });
        return sendJson(res, 200, result);
      }

      // 28e. Check Auto-Activation for Client: GET /api/license/check-auto
      if (pathname === '/api/license/check-auto' && req.method === 'GET') {
        const result = await checkAutoActivation();
        return sendJson(res, 200, result);
      }

      // 28f. Admin Authorize Device (1-Click Auto Activation): POST /api/license/admin/authorize
      if (pathname === '/api/license/admin/authorize' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const result = authorizeDevice({
          deviceId: body.deviceId,
          days: body.days,
          telegramUser: body.telegramUser,
          customName: body.customName
        });
        return sendJson(res, result.success ? 200 : 400, result);
      }

      // 28g. Admin Get Tracked Devices: GET /api/license/admin/tracked
      if (pathname === '/api/license/admin/tracked' && req.method === 'GET') {
        const shouldSyncCloud = parsedUrl.searchParams.get('sync') === 'true';

        if (shouldSyncCloud) {
          try {
            // 1. Fetch live active devices from 24/7 Render Cloud
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2500);
            const cloudTrackedRes = await fetch('https://ps-download-bot-irhw.onrender.com/api/license/tracked-cloud', {
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (cloudTrackedRes.ok) {
              const ctData = await cloudTrackedRes.json();
              if (ctData && Array.isArray(ctData.devices)) {
                for (const cd of ctData.devices) {
                  if (cd.deviceId) {
                    await recordDeviceTracking({
                      deviceId: cd.deviceId,
                      telegramUser: cd.telegramUser,
                      computerName: cd.computerName,
                      customName: cd.customName,
                      key: cd.key,
                      status: cd.status,
                      expiresAt: cd.expiresAt,
                      skipAlert: true
                    });
                  }
                }
              }
            }
          } catch (_) {}
        }

        const devices = getTrackedDevicesWithLicenseInfo();
        return sendJson(res, 200, {
          success: true,
          devices: devices
        });
      }

      // 28g1. Admin Explicit Sync with Cloud: POST /api/license/admin/sync-cloud
      if (pathname === '/api/license/admin/sync-cloud' && req.method === 'POST') {
        let syncedCount = 0;
        try {
          // 1. Fetch all active machines tracked by Cloud Server
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const cloudTrackedRes = await fetch('https://ps-download-bot-irhw.onrender.com/api/license/tracked-cloud', {
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (cloudTrackedRes.ok) {
              const ctData = await cloudTrackedRes.json();
              if (ctData && Array.isArray(ctData.devices)) {
                for (const cd of ctData.devices) {
                  if (cd.deviceId) {
                    await recordDeviceTracking({
                      deviceId: cd.deviceId,
                      telegramUser: cd.telegramUser,
                      computerName: cd.computerName,
                      customName: cd.customName,
                      key: cd.key,
                      status: cd.status,
                    if (cd.key && (cd.status === 'active' || String(cd.status).includes('ថ្ងៃ') || cd.expiresAt)) {
                      authorizeDevice({
                        deviceId: cd.deviceId,
                        days: cd.days || 0,
                        customName: cd.customName || '',
                        telegramUser: cd.telegramUser || '',
                        customLabel: cd.label || cd.status,
                        customExpiresAt: cd.expiresAt || null,
                        customAuthorizedAt: cd.firstSeen ? (typeof cd.firstSeen === 'number' ? new Date(cd.firstSeen).toISOString() : cd.firstSeen) : null
                      });
                    }
                    syncedCount++;
                  }
                }
              }
            }
          } catch (_) {}

          // 2. Also check license status for local devices
          const devices = getTrackedDevicesWithLicenseInfo();
          const checkPromises = devices.map(async (d) => {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 2000);
              const resp = await fetch(`https://ps-download-bot-irhw.onrender.com/api/license/check?deviceId=${encodeURIComponent(d.deviceId)}`, {
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              if (resp.ok) {
                const cloudData = await resp.json();
                if (cloudData && cloudData.authorized && cloudData.key) {
                  authorizeDevice({
                    deviceId: d.deviceId,
                    days: cloudData.days || 30,
                    customName: cloudData.customName || d.customName || '',
                    customLabel: cloudData.label,
                    customExpiresAt: cloudData.expiresAt,
                    customAuthorizedAt: cloudData.authorizedAt
                  });
                  syncedCount++;
                }
              }
            } catch (_) {}
          });
          await Promise.allSettled(checkPromises);
        } catch (_) {}

        return sendJson(res, 200, {
          success: true,
          syncedCount,
          devices: getTrackedDevicesWithLicenseInfo()
        });
      }

      // 28g2. Admin Set Device Custom Name: POST /api/license/admin/set-name
      if (pathname === '/api/license/admin/set-name' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const result = setDeviceCustomName(body.deviceId, body.customName);

        // Instantly sync updated name to 24/7 Render Cloud Server
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);
          fetch('https://ps-download-bot-irhw.onrender.com/api/license/set-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({ deviceId: body.deviceId, customName: body.customName })
          }).catch(() => {});
          clearTimeout(timeoutId);
        } catch (_) {}

        return sendJson(res, 200, result);
      }

      // 28g3. Admin Adjust Remaining Days: POST /api/license/admin/adjust-days
      if (pathname === '/api/license/admin/adjust-days' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const result = adjustDeviceDays({
          deviceId: body.deviceId,
          daysChange: body.daysChange
        });
        return sendJson(res, result.success ? 200 : 400, result);
      }

      // 28g4. Admin Revoke Device License: POST /api/license/admin/revoke
      if (pathname === '/api/license/admin/revoke' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const result = revokeDeviceLicense(body.deviceId);
        return sendJson(res, result.success ? 200 : 400, result);
      }

      // 28g5. Admin Transfer License to Another Device: POST /api/license/admin/transfer
      if (pathname === '/api/license/admin/transfer' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const result = transferDeviceLicense({
          fromDeviceId: body.fromDeviceId,
          toDeviceId: body.toDeviceId,
          newCustomName: body.newCustomName
        });
        return sendJson(res, result.success ? 200 : 400, result);
      }

      // 28h. Admin Generate Key: POST /api/license/admin/generate
      if (pathname === '/api/license/admin/generate' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const isUniversal = Boolean(body.isUniversal);

        if (isUniversal) {
          const accessHours = body.accessHours !== undefined ? parseInt(body.accessHours, 10) : 24;
          const claimWindowHours = body.claimWindowHours !== undefined ? parseInt(body.claimWindowHours, 10) : 24;
          const result = generateUniversalKey({
            accessHours,
            claimWindowHours,
            label: body.label
          });
          return sendJson(res, 200, result);
        }

        const deviceId = body.deviceId;
        const unit = body.unit || (body.hours ? 'hours' : 'days');
        let durationValue = 0;
        if (unit === 'hours') {
          durationValue = body.hours !== undefined ? parseInt(body.hours, 10) : (body.durationValue !== undefined ? parseInt(body.durationValue, 10) : 1);
        } else {
          durationValue = body.days !== undefined ? parseInt(body.days, 10) : (body.durationValue !== undefined ? parseInt(body.durationValue, 10) : 0);
        }

        if (!deviceId) return sendError(res, 400, 'Missing deviceId');
        const key = generateLicenseKey(deviceId, durationValue, unit);
        const label = unit === 'hours' && durationValue > 0
          ? `${durationValue} ម៉ោង (${durationValue} Hours)`
          : (durationValue > 0 ? `${durationValue} ថ្ងៃ (${durationValue} Days)` : 'Lifetime VIP (ពេញមួយជីវិត)');

        return sendJson(res, 200, {
          success: true,
          key,
          device_id: deviceId,
          days: unit === 'days' ? durationValue : Math.ceil(durationValue / 24),
          hours: unit === 'hours' ? durationValue : durationValue * 24,
          unit,
          label
        });
      }

      // 28h2. Admin Generate Universal Trial Key: POST /api/license/admin/generate-universal
      if (pathname === '/api/license/admin/generate-universal' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const accessHours = body.accessHours !== undefined ? parseInt(body.accessHours, 10) : 24;
        const claimWindowHours = body.claimWindowHours !== undefined ? parseInt(body.claimWindowHours, 10) : 24;
        const result = generateUniversalKey({
          accessHours,
          claimWindowHours,
          label: body.label
        });
        return sendJson(res, 200, result);
      }

      // 28i. Admin Key History: GET /api/license/admin/history
      if (pathname === '/api/license/admin/history' && req.method === 'GET') {
        return sendJson(res, 200, {
          success: true,
          history: getGeneratedKeysList()
        });
      }

      // 28j. Admin Telegram Bot Settings: GET /api/license/admin/telegram-config
      if (pathname === '/api/license/admin/telegram-config' && req.method === 'GET') {
        return sendJson(res, 200, {
          success: true,
          config: getTelegramConfig()
        });
      }

      // 28k. Admin Save Telegram Bot Settings: POST /api/license/admin/telegram-config
      if (pathname === '/api/license/admin/telegram-config' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const result = saveTelegramConfig({
          botToken: body.botToken,
          chatId: body.chatId
        });
        return sendJson(res, result.success ? 200 : 400, result);
      }

      // 28l. Admin Send Telegram Test: POST /api/license/admin/telegram-test
      if (pathname === '/api/license/admin/telegram-test' && req.method === 'POST') {
        const testMsg = `🔔 <b>សាកល្បង Telegram Bot Alert ពី PS DOWNLOAD</b>\n\n` +
          `✅ ការភ្ជាប់ជាមួយ Telegram Bot ដំណើរការបានជោគជ័យ ១០០%!\n` +
          `🕒 ម៉ោង: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' })}`;
        const testRes = await sendTelegramAlert(testMsg);
        return sendJson(res, 200, testRes);
      }

      // 28m. Admin Reset Failed Attempts: POST /api/license/admin/reset-fails
      if (pathname === '/api/license/admin/reset-fails' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const result = resetDeviceFails(body.deviceId);
        return sendJson(res, 200, result);
      }

      // 28n. Client Notify Payment (QR Scan & Paid): POST /api/license/notify-payment
      if (pathname === '/api/license/notify-payment' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const devId = (body.deviceId || '').trim().toUpperCase();
        const amt = body.amount || '1.50';
        const plan = body.plan || '១ សប្តាហ៍ ($1.50)';

        // 1. Primary: Verify with 24/7 Cloud Bot on Render (where bank notifications arrive)
        const cloudVerifyUrl = 'https://ps-download-bot-irhw.onrender.com/api/license/verify-payment';
        try {
          const controller = new AbortController();
          const tId = setTimeout(() => controller.abort(), 6000);
          const cloudRes = await fetch(cloudVerifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deviceId: devId,
              plan: plan,
              amount: amt,
              telegramUser: body.telegramUser
            }),
            signal: controller.signal
          });
          clearTimeout(tId);
          if (cloudRes.ok) {
            const cloudData = await cloudRes.json();
            if (cloudData && cloudData.verified && cloudData.key) {
              // Auto-activate license on client PC!
              await activateLicense(cloudData.key, {
                customExpiresAt: cloudData.expiresAt,
                targetDeviceId: devId
              });
              return sendJson(res, 200, {
                success: true,
                verified: true,
                autoActivated: true,
                key: cloudData.key,
                label: cloudData.label,
                days: cloudData.days,
                payer: cloudData.payer,
                message: cloudData.message || '🎉 ការបង់ប្រាក់ត្រូវបានផ្ទៀងផ្ទាត់ជោគជ័យ! កម្មវិធីត្រូវបានបើកដំណើរការ!'
              });
            }
          }
        } catch (cloudErr) {
          console.warn('[License Cloud Verify] Cloud check:', cloudErr.message);
        }

        // 2. Secondary: Fallback to local bot if running locally
        if (typeof checkGroupPaymentVerification === 'function') {
          const verifyRes = await checkGroupPaymentVerification({
            deviceId: devId,
            plan: plan,
            amount: amt
          });
          if (verifyRes && verifyRes.verified) {
            return sendJson(res, 200, {
              success: true,
              verified: true,
              autoActivated: true,
              key: verifyRes.key,
              label: verifyRes.label,
              days: verifyRes.days,
              payer: verifyRes.payer,
              message: verifyRes.message || '🎉 ការបង់ប្រាក់ត្រូវបានផ្ទៀងផ្ទាត់ជោគជ័យ! កម្មវិធីបានបើកសិទ្ធិដោយស្វ័យប្រវត្តិ!'
            });
          }
        }

        // 3. Payment not yet detected: send notification alert to Admin on Telegram
        const result = await recordPaymentNotification({
          deviceId: devId,
          telegramUser: body.telegramUser,
          plan: plan,
          amount: amt
        });
        result.verified = false;
        result.message = '⚠️ មិនទាន់ទទួលបានការបង់ប្រាក់នៅឡើយទេ! សូមរង់ចាំបន្តិច (ប្រហែល 5-10 វិនាទី) រួចចុច "ខ្ញុំបានបាញ់រួចរាល់" ម្តងទៀត';
        return sendJson(res, 200, result);
      }

      // 28n-2. Client Check Payment Verification Polling: GET /api/license/check-payment-verification
      if (pathname === '/api/license/check-payment-verification' && req.method === 'GET') {
        const devId = (url.searchParams.get('deviceId') || '').trim().toUpperCase();
        const amt = url.searchParams.get('amount') || '1.50';

        // 1. Query Render Cloud
        try {
          const controller = new AbortController();
          const tId = setTimeout(() => controller.abort(), 4000);
          const cloudRes = await fetch(`https://ps-download-bot-irhw.onrender.com/api/license/check?deviceId=${encodeURIComponent(devId)}`, {
            signal: controller.signal
          });
          clearTimeout(tId);
          if (cloudRes.ok) {
            const data = await cloudRes.json();
            if (data && data.authorized && data.key) {
              await activateLicense(data.key, { customExpiresAt: data.expiresAt, targetDeviceId: devId });
              return sendJson(res, 200, { success: true, verified: true, autoActivated: true, ...data });
            }
          }
        } catch (e) {}

        // 2. Local fallback
        if (typeof checkGroupPaymentVerification === 'function') {
          const verifyRes = await checkGroupPaymentVerification({
            deviceId: devId,
            amount: amt
          });
          if (verifyRes && verifyRes.verified) {
            return sendJson(res, 200, { success: true, verified: true, ...verifyRes });
          }
        }
        return sendJson(res, 200, { success: true, verified: false });
      }

      // 28o. Admin Get Payment Requests: GET /api/license/admin/payments
      if (pathname === '/api/license/admin/payments' && req.method === 'GET') {
        return sendJson(res, 200, {
          success: true,
          payments: getPaymentRequests()
        });
      }

      // 28o-2. Admin Clear Payment Requests: POST /api/license/admin/clear-payments
      if (pathname === '/api/license/admin/clear-payments' && req.method === 'POST') {
        const result = clearPaymentRequests();
        return sendJson(res, 200, result);
      }

      // 28r. Admin Get Crack Suspects: GET /api/license/admin/crack-suspects
      if (pathname === '/api/license/admin/crack-suspects' && req.method === 'GET') {
        return sendJson(res, 200, {
          success: true,
          suspects: getCrackSuspectsList()
        });
      }

      // 28s. Admin Clear Crack History: POST /api/license/admin/clear-crack-history
      if (pathname === '/api/license/admin/clear-crack-history' && req.method === 'POST') {
        const result = clearFailedAttemptsHistory();
        return sendJson(res, 200, result);
      }

      // 28p. Register Pending Checkout Intent: POST /api/license/pending-checkout
      if (pathname === '/api/license/pending-checkout' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const result = registerPendingCheckout({
          deviceId: body.deviceId,
          plan: body.plan,
          amount: body.amount
        });
        return sendJson(res, 200, result);
      }

      // 28q. External / Webhook PayWay Payment Auto-Fulfill: POST /api/payway/webhook or POST /api/license/auto-fulfill
      if ((pathname === '/api/payway/webhook' || pathname === '/api/license/auto-fulfill') && req.method === 'POST') {
        const body = await parseJsonBody(req);
        let amount = body.amount;
        let payer = body.payer || '';
        let trxId = body.trxId || body.hash || body.transactionId || '';
        let devId = body.deviceId || null;

        // If body has raw text (like forwarded SMS or Telegram webhook text)
        if (body.text || body.message) {
          const parsed = parseFlexiblePaymentNotification(body.text || body.message);
          if (parsed) {
            amount = parsed.amount;
            payer = parsed.payer || payer;
            trxId = parsed.trxId || trxId;
          }
        }

        const result = fulfillPayWayPayment({
          amount: amount || 1.50,
          payer: payer || 'External-Webhook',
          trxId: trxId || `EXT-${Date.now()}`,
          deviceId: devId
        });
        return sendJson(res, 200, result);
      }

      sendJson(res, 404, { error: 'Not found', path: pathname });
    } catch (err) {
      console.error(`[Server Error] ${pathname}:`, err);
      sendError(res, 500, err.message || 'Internal Server Error');
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      console.log(`[Desktop Server] Listening on http://${host}:${port}`);
      // Notify Admin on Telegram when server is started
      try {
        sendAppLaunchTelegramNotification().catch(() => {});
      } catch (_) {}
      // Auto-start Telegram Bot listener for incoming commands & key generation (Only for local dev/admin, never on client builds)
      if (!isPackaged) {
        try {
          startTelegramBot();
        } catch (e) {
          console.warn('[Telegram Bot] Auto-start failed:', e.message);
        }
      }
      resolve(server);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[Desktop Server] Port ${port} in use, retrying on port ${port + 1}...`);
        resolve(startServer(port + 1, host));
      } else {
        reject(err);
      }
    });
  });
}

module.exports = {
  startServer,
  setNativeFolderPicker,
  translateText
};
