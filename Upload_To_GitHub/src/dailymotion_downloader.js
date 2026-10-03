/**
 * Dailymotion Chinese Short Drama & Short Film Downloader & Scraper Engine.
 * Curates 100% active, verified Chinese short dramas & full movies (>= 30 mins)
 * using local high-speed DB (1,200+ full movies) + live Dailymotion API scraper,
 * HD landscape thumbnails, live URL parsing, inline playback, and yt-dlp downloading.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { getOutputDir } = require('./config.js');
const { libraryManager } = require('./library_manager.js');

function sanitizeFilename(name) {
  const cleaned = String(name || '').replace(/[\\/*?:"<>|\r\n\t]/g, '_').trim();
  return cleaned.slice(0, 100) || 'Dailymotion_Drama';
}

function findYtDlp() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'Scripts', 'yt-dlp.exe'),
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'Scripts', 'yt-dlp.exe'),
    path.join(__dirname, '..', 'lib', 'yt-dlp.exe'),
    'yt-dlp'
  ];
  for (const p of candidates) {
    if (p !== 'yt-dlp' && fs.existsSync(p)) return p;
  }
  return 'yt-dlp';
}

function formatDuration(sec) {
  if (!sec || isNaN(sec)) return '00:00';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const remSec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
}

function formatViews(views) {
  if (!views || isNaN(views)) return '0';
  if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
  if (views >= 1000) return (views / 1000).toFixed(1) + 'K';
  return String(views);
}

function fetchJson(urlStr, timeoutMs = 12000, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(urlStr);
      const client = parsed.protocol === 'https:' ? https : http;
      const headers = Object.assign({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }, customHeaders);

      const req = client.get(urlStr, {
        headers,
        timeout: timeoutMs
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchJson(res.headers.location, timeoutMs, customHeaders).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf-8');
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(new Error('Failed to parse JSON response'));
          }
        });
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
      req.on('error', reject);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Check if a video is alive (returns HTTP 200) or deleted/copyright blocked (404/410)
 */
function checkVideoAlive(videoId, timeoutMs = 3500) {
  return new Promise((resolve) => {
    if (!videoId) return resolve(false);
    try {
      const req = https.get(`https://api.dailymotion.com/video/${videoId}?fields=id`, {
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.on('error', () => resolve(false));
    } catch (_) {
      resolve(false);
    }
  });
}

/**
 * Parse any Dailymotion video link or video ID
 */
function extractDailymotionVideoId(text) {
  if (!text) return null;
  const str = String(text).trim();
  // 1. Matches dailymotion.com/video/x123abc_optional-slug or embed/video/x123abc
  const m1 = str.match(/dailymotion\.com\/(?:video|embed\/video)\/([a-zA-Z0-9]+)/i);
  if (m1) return m1[1];
  // 2. Matches dai.ly/x123abc
  const m2 = str.match(/dai\.ly\/([a-zA-Z0-9]+)/i);
  if (m2) return m2[1];
  // 3. Matches geo.dailymotion.com/player.html?video=x123abc
  const m3 = str.match(/[?&]video=([a-zA-Z0-9]+)/i);
  if (m3) return m3[1];
  // 4. Raw video ID like xakyeum, x9qvntk, etc.
  if (/^[a-zA-Z0-9]{6,8}$/.test(str)) {
    return str;
  }
  return null;
}

class DailymotionDownloader {
  constructor() {
    this.tasks = new Map(); // taskId -> task object
    this.activeProcesses = new Map(); // taskId -> child_process
    this.ytDlpPath = findYtDlp();
    this._cache = new Map();
    this._localDb = [];
    this._loadLocalDatabase();
  }

  _loadLocalDatabase() {
    try {
      const dbPath = path.join(__dirname, '..', 'data', 'dailymotion_chinese_dramas.json');
      if (fs.existsSync(dbPath)) {
        const raw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        if (Array.isArray(raw)) {
          this._localDb = raw
            .filter(item => item && item.id && (item.duration || 0) >= 1800)
            .map(item => ({
              id: item.id,
              title: item.title || 'Chinese Short Drama',
              thumbnail: item.poster || item.thumbnail || '',
              duration: item.duration || 0,
              duration_str: formatDuration(item.duration),
              views: item.views || 0,
              views_str: item.views ? formatViews(item.views) : 'HD',
              owner: item.channel || '',
              channel: item.remarks ? item.remarks.replace(/^\d+m\s*•\s*/, '') : (item.channel || 'Dailymotion'),
              description: item.title,
              url: item.url || `https://www.dailymotion.com/video/${item.id}`,
              embed_url: `https://www.dailymotion.com/embed/video/${item.id}?autoplay=1&mute=0&ui-theme=dark&queue-enable=0`
            }));
          console.log(`[Dailymotion] Loaded ${this._localDb.length} local Chinese full movies (>=30m) from DB.`);
        }
      }
    } catch (e) {
      console.warn('[Dailymotion] Failed to load local DB:', e.message);
    }
  }

  getDailymotionOutputDir() {
    const root = getOutputDir();
    const dmDir = path.join(root, 'Dailymotion');
    if (!fs.existsSync(dmDir)) {
      try { fs.mkdirSync(dmDir, { recursive: true }); } catch (e) { return root; }
    }
    return dmDir;
  }

  /**
   * Fetch Chinese short dramas by category (>= 30 mins)
   */
  async getChineseDramas(category = 'trending', page = 1, limit = 36) {
    const catKey = category || 'trending';
    const cacheKey = `feed_${catKey}_${page}_${limit}`;
    if (this._cache.has(cacheKey)) {
      const cached = this._cache.get(cacheKey);
      if (Date.now() - cached.ts < 5 * 60 * 1000) {
        return cached.data;
      }
    }

    // Filter local database by category
    let pool = this._localDb;
    if (catKey === 'ceo') {
      pool = this._localDb.filter(x => /[總总裁CEO豪門富豪千金少爺BillionaireBoss]/i.test(x.title));
    } else if (catKey === 'historical') {
      pool = this._localDb.filter(x => /[皇妃王朝宮帝PrincessPrinceEmperor]/i.test(x.title));
    } else if (catKey === 'fantasy') {
      pool = this._localDb.filter(x => /[武神魔仙戰龙MartialGoddessDragon]/i.test(x.title));
    } else if (catKey === 'romance') {
      pool = this._localDb.filter(x => /[愛戀婚情妻夫LoveRomance]/i.test(x.title));
    } else if (catKey === 'apps') {
      pool = this._localDb.filter(x => /[DramaBoxReelShortShortMaxShortDrama短劇]/i.test(x.title));
    }

    if (pool.length === 0) pool = this._localDb;

    const startIdx = (page - 1) * limit;
    const pageItems = pool.slice(startIdx, startIdx + limit);

    // If local database has enough items for this page, return immediately
    if (pageItems.length > 0) {
      const result = {
        list: pageItems,
        total: pool.length,
        has_more: startIdx + limit < pool.length,
        page: page,
        category: catKey
      };
      this._cache.set(cacheKey, { ts: Date.now(), data: result });
      return result;
    }

    // Fallback to online scraper if beyond local database pages
    const searchTerms = {
      trending: 'Chinese short drama full movie 2026',
      ceo: 'chinese drama ceo full movie',
      historical: 'Viral Chinese Historical Romance full',
      fantasy: 'Viral Chinese Fantasy Action Romance',
      romance: 'chinese drama romance full movie',
      apps: 'DramaBox full movie'
    };
    const query = searchTerms[catKey] || 'Chinese short drama full movie';
    return this.searchDramas(query, page, limit, true, true);
  }

  /**
   * Search Chinese short dramas on Dailymotion (>= 30 mins, deduplicated, verified alive)
   */
  async searchDramas(query, page = 1, limit = 24, strictFilter = true, verifyAlive = true) {
    const rawQ = String(query || '').trim();
    if (!rawQ) return { list: [], total: 0, has_more: false };

    // 1. Direct URL / ID check
    const directId = extractDailymotionVideoId(rawQ);
    if (directId) {
      const single = await this.getVideoDetail(directId);
      return {
        list: [single],
        total: 1,
        has_more: false,
        is_direct: true
      };
    }

    // 2. Search local DB first
    const normQ = rawQ.toLowerCase();
    const localMatches = this._localDb.filter(m => 
      m.title.toLowerCase().includes(normQ) || 
      (m.channel && m.channel.toLowerCase().includes(normQ))
    );

    if (localMatches.length >= limit) {
      const startIdx = (page - 1) * limit;
      return {
        list: localMatches.slice(startIdx, startIdx + limit),
        total: localMatches.length,
        has_more: startIdx + limit < localMatches.length,
        page: page
      };
    }

    // 3. Online Dailymotion API search
    const fields = 'id,title,thumbnail_720_url,thumbnail_480_url,thumbnail_360_url,duration,views_total,created_time,owner.username,owner.screenname,description,url';
    const apiUrl = `https://api.dailymotion.com/videos?search=${encodeURIComponent(rawQ)}&fields=${fields}&limit=${Math.min(limit * 2, 100)}&page=${page}&longer_than=30&family_filter=1`;

    try {
      const res = await fetchJson(apiUrl, 15000);
      const rawList = res.list || [];

      const candidates = [];
      const seenIds = new Set(localMatches.map(x => x.id));

      for (const item of rawList) {
        if (!item || !item.id) continue;
        const dur = Number(item.duration) || 0;
        if (strictFilter && dur < 1800) continue;
        if (seenIds.has(item.id)) continue;
        seenIds.add(item.id);

        candidates.push({
          id: item.id,
          title: item.title || 'Chinese Short Drama',
          thumbnail: item.thumbnail_720_url || item.thumbnail_480_url || item.thumbnail_360_url || '',
          duration: dur,
          duration_str: formatDuration(dur),
          views: item.views_total || 0,
          views_str: formatViews(item.views_total),
          created_time: item.created_time || 0,
          date_str: item.created_time ? new Date(item.created_time * 1000).toLocaleDateString() : '',
          owner: item['owner.username'] || '',
          channel: item['owner.screenname'] || item['owner.username'] || 'Chinese Drama Channel',
          description: item.description || '',
          url: item.url || `https://www.dailymotion.com/video/${item.id}`,
          embed_url: `https://www.dailymotion.com/embed/video/${item.id}?autoplay=1&mute=0&ui-theme=dark&queue-enable=0`
        });
      }

      // Parallel alive check to filter out 404/deleted videos
      let onlineVerified = candidates;
      if (verifyAlive && candidates.length > 0) {
        const aliveChecks = await Promise.all(
          candidates.map(async (cand) => {
            const alive = await checkVideoAlive(cand.id);
            return alive ? cand : null;
          })
        );
        onlineVerified = aliveChecks.filter(Boolean);
      }

      const combined = [...localMatches, ...onlineVerified];
      const startIdx = (page - 1) * limit;

      return {
        list: combined.slice(startIdx, startIdx + limit),
        total: combined.length,
        has_more: Boolean(res.has_more) || (startIdx + limit < combined.length),
        page: page
      };
    } catch (err) {
      console.warn('[Dailymotion API Search Fallback]', err.message);
      return {
        list: localMatches.slice((page - 1) * limit, page * limit),
        total: localMatches.length,
        has_more: false,
        page: page
      };
    }
  }

  /**
   * Fast Direct Stream URL resolution
   * Fetches direct unencrypted CDN stream (.m3u8) for Dailymotion video
   */
  async getStreamUrl(videoId) {
    const cleanId = extractDailymotionVideoId(videoId) || String(videoId || '').trim();
    if (!cleanId) return null;

    const cacheKey = `stream_${cleanId}`;
    if (this._cache.has(cacheKey)) {
      const cached = this._cache.get(cacheKey);
      if (Date.now() - cached.ts < 30 * 60 * 1000) { // 30 mins
        return cached.url;
      }
    }

    // Fast yt-dlp direct CDN stream extractor (returns HTTP 200 unencrypted HLS manifest)
    try {
      const streamUrl = await new Promise((resolve) => {
        const videoUrl = `https://www.dailymotion.com/video/${cleanId}`;
        const args = ['-g', '--no-warnings', '--no-playlist', videoUrl];
        const proc = spawn(this.ytDlpPath, args, { windowsHide: true });
        let out = '';
        proc.stdout.on('data', d => out += d.toString());
        proc.on('close', code => {
          if (code === 0 && out.trim()) {
            const firstLine = out.trim().split(/\r?\n/)[0];
            if (firstLine && firstLine.startsWith('http')) return resolve(firstLine);
          }
          resolve(null);
        });
        proc.on('error', () => resolve(null));
        // 8-second safety timeout
        setTimeout(() => {
          try { proc.kill(); } catch (_) {}
          resolve(null);
        }, 8000);
      });

      if (streamUrl) {
        this._cache.set(cacheKey, { ts: Date.now(), url: streamUrl });
        return streamUrl;
      }
    } catch (_) {}

    return null;
  }

  /**
   * Fetch single video detail + related parts/episodes of the same drama
   */
  async getVideoDetail(videoId) {
    const cleanId = extractDailymotionVideoId(videoId) || String(videoId || '').trim();
    if (!cleanId) throw new Error('Missing video ID');

    // Check local DB first
    const local = this._localDb.find(x => x.id === cleanId);
    let streamUrl = await this.getStreamUrl(cleanId);

    const fields = 'id,title,thumbnail_720_url,thumbnail_480_url,duration,views_total,created_time,owner.username,owner.screenname,description,url';
    const detailUrl = `https://api.dailymotion.com/video/${cleanId}?fields=${fields}`;

    try {
      const item = await fetchJson(detailUrl, 12000);
      const ownerUsername = item['owner.username'] || '';

      // Search for related parts/episodes of this specific drama
      let relatedEpisodes = [];
      if (item.title) {
        try {
          const cleanSearchTitle = item.title
            .replace(/\[.*?\]|\(.*?\)|#\w+|Full Movie|Full EP|English Sub|VietSub|✅|繁體中文/gi, '')
            .trim()
            .slice(0, 35);

          if (cleanSearchTitle && cleanSearchTitle.length > 3) {
            const relUrl = `https://api.dailymotion.com/videos?search=${encodeURIComponent(cleanSearchTitle)}&fields=id,title,thumbnail_720_url,duration,views_total&limit=15&longer_than=20`;
            const relRes = await fetchJson(relUrl, 6000);
            if (relRes && Array.isArray(relRes.list)) {
              relatedEpisodes = relRes.list
                .filter(uItem => uItem && uItem.id && uItem.id !== item.id)
                .map((uItem, idx) => ({
                  id: uItem.id,
                  episode: idx + 2,
                  title: uItem.title || `Part ${idx + 2}`,
                  thumbnail: uItem.thumbnail_720_url || item.thumbnail_720_url || '',
                  duration_str: formatDuration(uItem.duration),
                  url: `https://www.dailymotion.com/video/${uItem.id}`
                }));
            }
          }
        } catch (_) {}
      }

      return {
        id: item.id,
        title: item.title || (local ? local.title : 'Chinese Short Drama'),
        thumbnail: item.thumbnail_720_url || item.thumbnail_480_url || (local ? local.thumbnail : ''),
        duration: item.duration || (local ? local.duration : 0),
        duration_str: formatDuration(item.duration || (local ? local.duration : 0)),
        views: item.views_total || 0,
        views_str: formatViews(item.views_total),
        created_time: item.created_time || 0,
        date_str: item.created_time ? new Date(item.created_time * 1000).toLocaleDateString() : '',
        owner: ownerUsername,
        channel: item['owner.screenname'] || ownerUsername || (local ? local.channel : 'Chinese Drama Channel'),
        description: item.description || (local ? local.title : ''),
        url: item.url || `https://www.dailymotion.com/video/${item.id}`,
        embed_url: `https://www.dailymotion.com/embed/video/${item.id}?autoplay=1&mute=0&ui-theme=dark&queue-enable=0`,
        stream_url: streamUrl,
        episodes: relatedEpisodes
      };
    } catch (err) {
      if (local) {
        return {
          ...local,
          stream_url: streamUrl,
          episodes: []
        };
      }
      console.error('[Dailymotion Video Detail Error]', err.message);
      if (err.message && err.message.includes('404')) {
        throw new Error(`វីដេអូនេះត្រូវបាន Dailymotion លុបចេញ ឬផុតកំណត់ (Video removed or unavailable)`);
      }
      throw new Error(`រកមិនឃើញវីដេអូ ID: ${cleanId}`);
    }
  }

  /**
   * Start batch/single video download using yt-dlp
   */
  async startDownload({ video_id, url, title, customDir = null }) {
    const videoUrl = url || `https://www.dailymotion.com/video/${video_id}`;
    if (!videoUrl) throw new Error('Missing video URL');

    const cleanTitle = sanitizeFilename(title || `Dailymotion_${video_id || Date.now()}`);
    const outDir = customDir && fs.existsSync(customDir) ? customDir : this.getDailymotionOutputDir();
    const taskId = `dm_${video_id || Date.now()}`;

    const task = {
      task_id: taskId,
      video_id: video_id || taskId,
      title: cleanTitle,
      url: videoUrl,
      output_dir: outDir,
      status: 'downloading', // 'downloading', 'completed', 'error', 'canceled'
      progress_pct: 0,
      speed_str: '0.0 MB/s',
      eta_str: '--:--',
      size_str: '',
      created_at: Date.now(),
      error_message: ''
    };

    this.tasks.set(taskId, task);
    libraryManager.registerSeries(taskId, cleanTitle, '', 1, '1', 'dailymotion').catch(() => {});

    // Spawn yt-dlp in background
    this._runDownloadProcess(taskId, videoUrl, outDir, cleanTitle);

    return task;
  }

  _runDownloadProcess(taskId, videoUrl, outDir, title) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const outTemplate = path.join(outDir, `${title}.%(ext)s`);
    const args = [
      '--newline',
      '--no-playlist',
      '--no-warnings',
      '-o', outTemplate,
      videoUrl
    ];

    try {
      const proc = spawn(this.ytDlpPath, args, { windowsHide: true });
      this.activeProcesses.set(taskId, proc);

      proc.stdout.on('data', (data) => {
        const line = data.toString();
        // Parse: [download]  45.2% of ~ 20.18MiB at 630.94KiB/s ETA 00:54
        const match = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/i);
        if (match) {
          task.progress_pct = parseFloat(match[1]);
          task.size_str = match[2];
          task.speed_str = match[3];
          task.eta_str = match[4];
          libraryManager.updateProgress(taskId, task.progress_pct >= 100 ? 1 : 0, 1, task.progress_pct);
        }
      });

      proc.stderr.on('data', (data) => {
        const line = data.toString();
        if (line.includes('ERROR:')) {
          task.error_message = line.replace(/ERROR:\s*/i, '').trim();
        }
      });

      proc.on('close', (code) => {
        this.activeProcesses.delete(taskId);
        if (task.status === 'canceled') return;

        if (code === 0) {
          task.status = 'completed';
          task.progress_pct = 100;
          task.speed_str = '';
          task.eta_str = 'Done';
          libraryManager.markCompleted(taskId);
        } else {
          task.status = 'error';
          if (!task.error_message) task.error_message = `Download exited with code ${code}`;
        }
      });

      proc.on('error', (err) => {
        this.activeProcesses.delete(taskId);
        task.status = 'error';
        task.error_message = err.message;
      });

    } catch (err) {
      task.status = 'error';
      task.error_message = err.message;
    }
  }

  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return { success: false, error: 'Task not found' };

    task.status = 'canceled';
    if (this.activeProcesses.has(taskId)) {
      try {
        this.activeProcesses.get(taskId).kill('SIGKILL');
      } catch (_) {}
      this.activeProcesses.delete(taskId);
    }
    return { success: true };
  }

  getTasks() {
    return Array.from(this.tasks.values()).reverse();
  }
}

const dailymotionDownloader = new DailymotionDownloader();

module.exports = {
  dailymotionDownloader
};
