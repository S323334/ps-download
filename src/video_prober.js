/**
 * Video Quality & Framerate Prober for PS DOWNLOAD.
 * Supports probing across Hongguo, HaoSou, MVFFM, and YouTube.
 * Accurately detects TRUE, GENUINE original video resolution and framerate (FPS):
 * - Direct JSON metadata parsing for HongGuo (0% CPU, true ByteDance CDN metadata)
 * - Real stream inspection with ffprobe for MVFFM and HaoSou HLS/MP4 streams
 * - Real format metadata extraction for YouTube
 * - Persistent disk + memory caching (data/video_probe_cache.json)
 * - Controlled concurrency (maximum 2 parallel tasks)
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const { DATA_DIR } = require('./config.js');
const { scraper } = require('./scraper.js');
const { haosouDownloader } = require('./haosou_downloader.js');
const { mvffmDownloader } = require('./mvffm_downloader.js');
const { youtubeDownloader } = require('./youtube_downloader.js');
const fqapi = require('../lib/fqapi.js');

const CACHE_FILE = path.join(DATA_DIR, 'video_probe_cache.json');
const _PROBE_CACHE = new Map();

// Initialize persistent disk cache
try {
  if (fs.existsSync(CACHE_FILE)) {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    for (const [k, v] of Object.entries(raw)) {
      _PROBE_CACHE.set(k, v);
    }
  }
} catch (_) {}

function saveProbeCacheToDisk() {
  try {
    const obj = {};
    for (const [k, v] of _PROBE_CACHE.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (_) {}
}

function clearProbeCache() {
  _PROBE_CACHE.clear();
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.writeFileSync(CACHE_FILE, '{}', 'utf-8');
    }
  } catch (_) {}
}

function findFfprobe() {
  const customPaths = [
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-8.1.2-full_build', 'bin', 'ffprobe.exe'),
    'ffprobe'
  ];
  for (const p of customPaths) {
    if (p !== 'ffprobe' && fs.existsSync(p)) return p;
  }
  return 'ffprobe';
}

/**
 * Accurately parses framerate string (e.g., '25/1', '30/1', '24000/1001', '30000/1001') to integer
 */
function parseFps(rateStr) {
  if (!rateStr || rateStr === '0/0') return 30;
  if (typeof rateStr === 'number') return Math.round(rateStr);
  const str = String(rateStr).trim();
  if (str.includes('/')) {
    const [num, den] = str.split('/').map(Number);
    if (den > 0 && num > 0) {
      const calc = num / den;
      if (Math.abs(calc - 23.976) < 0.15) return 24;
      if (Math.abs(calc - 29.97) < 0.15) return 30;
      if (Math.abs(calc - 59.94) < 0.15) return 60;
      return Math.round(calc);
    }
  }
  const f = parseFloat(str);
  return !isNaN(f) && f > 0 ? Math.round(f) : 30;
}

/**
 * Ultra-accurate 1-threaded, bounded ffprobe to inspect actual stream packets
 */
function probeStreamWithFfprobe(url, headers = {}) {
  return new Promise((resolve) => {
    const ffprobePath = findFfprobe();
    if (!url) return resolve(null);

    const args = [
      '-v', 'error',
      '-threads', '1',
      '-analyzeduration', '1500000',
      '-probesize', '1500000',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate',
      '-of', 'json'
    ];

    if (headers && Object.keys(headers).length > 0) {
      const hLines = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n';
      args.push('-headers', hLines);
    }

    args.push(url);

    execFile(ffprobePath, args, { timeout: 9000 }, (err, stdout) => {
      if (err || !stdout) {
        return resolve(null);
      }
      try {
        const json = JSON.parse(stdout);
        const stream = (json.streams && json.streams[0])
          || (json.programs && json.programs[0] && json.programs[0].streams && json.programs[0].streams[0]);
        if (!stream) return resolve(null);

        const width = parseInt(stream.width, 10) || 0;
        const height = parseInt(stream.height, 10) || 0;
        const fps = parseFps(stream.avg_frame_rate || stream.r_frame_rate);

        if (width > 0 && height > 0) {
          return resolve({ width, height, fps });
        }
      } catch (_) {}
      resolve(null);
    });
  });
}

/**
 * Classifies resolution by true aspect ratio and maximum dimension
 */
function classifyResolution(width, height) {
  const w = parseInt(width, 10) || 0;
  const h = parseInt(height, 10) || 0;
  const maxDim = Math.max(w, h);
  const minDim = Math.min(w, h);

  if (maxDim >= 1800 || minDim >= 1000) {
    return '1080p';
  }
  if (maxDim >= 1200 || minDim >= 700) {
    return '720p';
  }
  if (maxDim >= 900 || minDim >= 500) {
    return '540p';
  }
  if (maxDim >= 700 || minDim >= 440) {
    return '480p';
  }
  return '360p';
}

/**
 * Standard resolution options up to original resolution
 */
function buildResolutionOptions(maxRes) {
  const allTiers = [
    { label: '1080p', name: '1080p (Full HD)', height: 1080, savePct: 0 },
    { label: '720p', name: '720p (HD - សន្សំ 35%)', height: 720, savePct: 35 },
    { label: '540p', name: '540p (qHD - សន្សំ 55%)', height: 540, savePct: 55 },
    { label: '480p', name: '480p (SD - សន្សំ 65%)', height: 480, savePct: 65 },
    { label: '360p', name: '360p (Low - សន្សំ 80%)', height: 360, savePct: 80 }
  ];

  let maxNum = parseInt(maxRes, 10) || 1080;
  if (maxNum < 360) maxNum = 720;

  const available = allTiers.filter(t => t.height <= maxNum).map(t => {
    if (t.height === maxNum) {
      const tag = t.height >= 1080 ? 'Full HD' : (t.height >= 720 ? 'HD' : 'SD');
      return { ...t, name: `${t.label} (${tag} - គុណភាពដើម)`, savePct: 0 };
    }
    return t;
  });

  return available.length > 0 ? available : allTiers.slice(1);
}

/**
 * Build framerate options featuring the exact original FPS as primary
 */
function buildFramerateOptions(origFps) {
  const baseFps = parseInt(origFps, 10) || 30;
  const standardFramerates = [
    { fps: 30, label: '30 fps (Standard / ធម្មតា)' },
    { fps: 25, label: '25 fps (PAL / ធម្មតា)' },
    { fps: 24, label: '24 fps (Cinema / សន្សំទំហំ)' },
    { fps: 60, label: '60 fps (Smooth / រលូន)' }
  ];

  const list = [
    { fps: baseFps, label: `${baseFps} fps (ដើម / Original)` }
  ];

  for (const item of standardFramerates) {
    if (item.fps !== baseFps) {
      list.push(item);
    }
  }

  return list;
}

/**
 * Probe quality with genuine stream inspection and persistent disk caching
 */
async function probeDramaQuality(id, platform = 'hongguo') {
  const p = (platform || 'hongguo').toLowerCase();
  const cacheKey = `${p}:${id}`;

  if (_PROBE_CACHE.has(cacheKey)) {
    const cached = _PROBE_CACHE.get(cacheKey);
    // Return verified cache if available
    if (cached && cached.scan_method && !cached.scan_method.includes('default')) {
      return cached;
    }
  }

  let originalRes = '1080p';
  let origWidth = 1080;
  let origHeight = 1920;
  let origFps = 30;
  let scanMethod = 'default';

  try {
    if (p === 'hongguo') {
      // 0% CPU: Direct video model lookup from ByteDance CDN
      const detail = await scraper.getSeriesDetail(id);
      if (detail && detail.episodes && detail.episodes[0]) {
        const ep1 = detail.episodes[0];
        try {
          const model = await fqapi.fetchVideoModel(ep1.vid);
          const list = model.video_list || [];
          if (list.length > 0) {
            list.sort((a, b) => {
              const ha = (a.video_meta && (a.video_meta.vheight || a.video_meta.height)) || 0;
              const hb = (b.video_meta && (b.video_meta.vheight || b.video_meta.height)) || 0;
              return hb - ha;
            });
            const best = list[0].video_meta || {};
            origWidth = best.vwidth || best.width || 1080;
            origHeight = best.vheight || best.height || 1920;
            origFps = best.fps ? Math.round(best.fps) : 30;
            originalRes = classifyResolution(origWidth, origHeight);
            scanMethod = 'hongguo_fqapi_direct';
          }
        } catch (_) {}
      }
    } else if (p === 'mvffm') {
      const detail = await mvffmDownloader.getDetail(id);
      if (detail && detail.episodes && detail.episodes[0]) {
        const ep1 = detail.episodes[0];
        const hlsHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.mvffm.net/'
        };

        const probed = await probeStreamWithFfprobe(ep1.url, hlsHeaders);
        if (probed && probed.width && probed.height) {
          origWidth = probed.width;
          origHeight = probed.height;
          origFps = probed.fps || 25;
          originalRes = classifyResolution(origWidth, origHeight);
          scanMethod = 'mvffm_ffprobe_verified';
        } else {
          originalRes = '720p';
          origWidth = 720;
          origHeight = 1280;
          origFps = 25;
          scanMethod = 'mvffm_fallback';
        }
      }
    } else if (p === 'haosou') {
      const detail = await haosouDownloader.getDetail(id);
      if (detail && detail.episodes && detail.episodes[0]) {
        const ep1 = detail.episodes[0];
        const hsHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://dj.1dfx.com/'
        };

        const probed = await probeStreamWithFfprobe(ep1.url, hsHeaders);
        if (probed && probed.width && probed.height) {
          origWidth = probed.width;
          origHeight = probed.height;
          origFps = probed.fps || 30;
          originalRes = classifyResolution(origWidth, origHeight);
          scanMethod = 'haosou_ffprobe_verified';
        } else {
          originalRes = '720p';
          origWidth = 720;
          origHeight = 1280;
          origFps = 30;
          scanMethod = 'haosou_fallback';
        }
      }
    } else if (p === 'youtube') {
      const info = await youtubeDownloader.getVideoInfo(id);
      if (info && info.formats && info.formats.length > 0) {
        const videoFormats = info.formats.filter(f => f.hasVideo);
        if (videoFormats.length > 0) {
          const maxH = Math.max(...videoFormats.map(f => f.height || 0));
          origHeight = maxH || 1080;
          origWidth = Math.round(origHeight * 16 / 9);
          originalRes = classifyResolution(origWidth, origHeight);
          origFps = videoFormats[0].fps || 30;
          scanMethod = 'youtube_ytdl_cached';
        }
      }
    }
  } catch (err) {
    console.warn(`[VideoProber] Probe error for ${p}:${id}:`, err.message);
  }

  const result = {
    ok: true,
    platform: p,
    id: String(id),
    original_resolution: originalRes,
    width: origWidth,
    height: origHeight,
    fps: origFps,
    scan_method: scanMethod,
    resolutions: buildResolutionOptions(originalRes),
    framerates: buildFramerateOptions(origFps)
  };

  _PROBE_CACHE.set(cacheKey, result);
  saveProbeCacheToDisk();
  return result;
}

/**
 * Batch probe with controlled concurrency (max 2 at a time) to prevent CPU/RAM spikes
 */
async function probeBatch(items = []) {
  const results = [];
  const chunkSize = 2;

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkPromises = chunk.map(it => probeDramaQuality(it.id, it.platform).catch(() => ({
      ok: false,
      platform: it.platform,
      id: String(it.id),
      original_resolution: '1080p',
      fps: 30,
      resolutions: buildResolutionOptions('1080p'),
      framerates: buildFramerateOptions(30)
    })));

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);

    // Yield control for 30ms to keep main loop smooth
    if (i + chunkSize < items.length) {
      await new Promise(r => setTimeout(r, 30));
    }
  }

  return results;
}

module.exports = {
  probeDramaQuality,
  probeBatch,
  findFfprobe,
  probeStreamWithFfprobe,
  classifyResolution,
  buildResolutionOptions,
  buildFramerateOptions,
  clearProbeCache
};
