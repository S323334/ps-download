/**
 * MVFFM (mvffm.net) Short Drama Service & Downloader Engine.
 * Supports hot recommendations, latest releases, high ratings, drama search with Dooplay API,
 * multi-source episode extraction, HLS .m3u8 streaming, and fast ffmpeg batch downloading.
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { getOutputDir, DATA_DIR } = require('./config.js');
const { mergeDramaEpisodes } = require('./video_merger.js');
const { libraryManager } = require('./library_manager.js');

function sanitizeFilename(name) {
  const cleaned = String(name || '').replace(/[\\/*?:"<>|\r\n\t]/g, '_').trim();
  return cleaned.slice(0, 80) || 'MVFFM_Drama';
}

function findFfmpeg() {
  const customPaths = [
    'ffmpeg',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-8.1.2-full_build', 'bin', 'ffmpeg.exe')
  ];
  for (const p of customPaths) {
    if (p === 'ffmpeg') return 'ffmpeg';
    if (fs.existsSync(p)) return p;
  }
  return 'ffmpeg';
}

function loadFallbackCatalog() {
  const possiblePaths = [
    path.join(DATA_DIR, 'mvffm_catalog.json'),
    path.join(__dirname, '..', 'data', 'mvffm_catalog.json'),
    path.join(__dirname, '..', 'scratch', 'short_dramas_details.json')
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (raw && (raw.hot || raw.latest || raw.monthly)) {
          return raw;
        }
      }
    } catch (_) {}
  }
  return null;
}

function fetchText(url, headers = {}, timeoutMs = 4500, maxRedirects = 3) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) return resolve({ status: 508, body: '' });

    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://www.mvffm.net/',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };

    let client = https;
    try {
      const parsed = new URL(url);
      client = parsed.protocol === 'http:' ? http : https;
    } catch (e) {
      return reject(e);
    }

    const req = client.get(url, { headers: { ...defaultHeaders, ...headers }, timeout: timeoutMs }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, url).toString();
        }
        return fetchText(redirectUrl, headers, timeoutMs, maxRedirects - 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 408, body: '' });
    });
    req.on('error', (err) => {
      resolve({ status: 500, body: '', error: err.message });
    });
  });
}

class MvffmDownloader {
  constructor() {
    this.tasks = new Map(); // taskId -> task object
    this.activeProcesses = new Map(); // taskId -> childProcess
    this.nonce = 'ace3890dff';
    this.nonceFetchedAt = 0;
    this._recsCache = new Map();
  }

  getMvffmOutputDir() {
    const root = getOutputDir();
    const mvffmDir = path.join(root, 'MVFFM');
    if (!fs.existsSync(mvffmDir)) {
      try { fs.mkdirSync(mvffmDir, { recursive: true }); } catch (e) {}
    }
    return mvffmDir;
  }

  async getValidNonce() {
    const now = Date.now();
    if (this.nonce && (now - this.nonceFetchedAt < 30 * 60 * 1000)) {
      return this.nonce;
    }
    try {
      const res = await fetchText('https://www.mvffm.net/drama/', {}, 4000);
      const match = res.body.match(/"nonce":"([a-f0-9]+)"/i);
      if (match) {
        this.nonce = match[1];
        this.nonceFetchedAt = now;
        return this.nonce;
      }
    } catch (e) {
      console.warn('[MVFFM] Failed to refresh nonce:', e.message);
    }
    return this.nonce || 'ace3890dff';
  }

  /**
   * Fetch recommendations / listings from mvffm.net with fallback catalog
   * @param {string} type - 'hot' (总人气), 'latest' (按时间), 'monthly' (月人气), 'rating' (按评分), 'all'
   */
  async getRecommendations(type = 'hot') {
    const cleanType = String(type || 'hot').toLowerCase();
    const cacheKey = `recs_${cleanType}`;
    if (this._recsCache.has(cacheKey)) {
      const cached = this._recsCache.get(cacheKey);
      if (Date.now() - cached.ts < 5 * 60 * 1000 && Array.isArray(cached.data) && cached.data.length >= 80) {
        return cached.data;
      }
    }

    let orderParam = 'view';
    if (cleanType === 'latest') orderParam = 'date';
    else if (cleanType === 'update') orderParam = 'modified';
    else if (cleanType === 'monthly') orderParam = 'month';
    else if (cleanType === 'weekly') orderParam = 'week';
    else if (cleanType === 'rating') orderParam = 'rating';

    const url = `https://www.mvffm.net/drama/?genres&region&dtyear&cats&orderby=${orderParam}&tvtype=miniseries`;
    let items = [];

    try {
      const res = await fetchText(url, {}, 4500);
      if (res && res.status === 200 && res.body && !res.body.includes('error code: 522') && !res.body.includes('站点维护中')) {
        const articleRegex = /<article id="post-(\d+)" class="item drama">([\s\S]*?)<\/article>/gi;
        let match;
        while ((match = articleRegex.exec(res.body)) !== null) {
          const postId = match[1];
          const block = match[2];
          const titleMatch = block.match(/<h3><a [^>]*>([^<]+)<\/a><\/h3>/i) || block.match(/alt="([^"]+)"/i);
          const linkMatch = block.match(/href="(https:\/\/www\.mvffm\.net\/drama\/\d+\/)"/i);
          const imgMatch = block.match(/data-lazy-src="([^"]+)"/i) || block.match(/src="([^"]+)"/i);
          const tagMatch = block.match(/<div class="dramaleixing">([^<]+)<\/div>/i);

          if (titleMatch && linkMatch) {
            items.push({
              id: postId,
              title: titleMatch[1].trim(),
              url: linkMatch[1],
              cover: imgMatch ? imgMatch[1] : '',
              remarks: '短劇',
              type: tagMatch ? tagMatch[1].trim() : '短劇'
            });
          }
        }
      }
    } catch (err) {
      console.warn('[MVFFM] Notice fetching recommendations:', err.message);
    }

    // If live fetch returned items, cache and return
    if (items.length > 0) {
      this._recsCache.set(cacheKey, { ts: Date.now(), data: items });
      return items;
    }

    // Upstream outage / maintenance (522/503): Fall back to rich pre-cached catalog
    const catalog = loadFallbackCatalog();
    if (catalog) {
      const list = catalog[cleanType] || catalog['monthly'] || catalog['hot'] || catalog['latest'] || [];
      if (list.length > 0) {
        const enriched = list.map(it => ({
          ...it,
          is_fallback: true
        }));
        this._recsCache.set(cacheKey, { ts: Date.now(), data: enriched });
        return enriched;
      }
    }

    return [];
  }

  /**
   * Search dramas by keyword using Dooplay search API with offline fallback
   */
  async search(keyword) {
    const kw = String(keyword || '').trim();
    if (!kw) return [];

    let results = [];
    try {
      let nonce = await this.getValidNonce();
      let searchUrl = `https://www.mvffm.net/wp-json/dooplay/search/?keyword=${encodeURIComponent(kw)}&nonce=${nonce}`;
      let res = await fetchText(searchUrl, {}, 4500);
      if (res.body && !res.body.includes('522') && !res.body.includes('站点维护中')) {
        let parsed = {};
        try {
          parsed = JSON.parse(res.body);
          for (const [id, item] of Object.entries(parsed)) {
            if (typeof item === 'object' && item && item.title) {
              results.push({
                id: String(id),
                title: item.title,
                url: item.url || `https://www.mvffm.net/drama/${id}/`,
                cover: item.img || '',
                remarks: '短劇'
              });
            }
          }
        } catch (_) {}
      }
    } catch (_) {}

    if (results.length > 0) return results;

    // Fallback: search in offline catalog
    const catalog = loadFallbackCatalog();
    if (catalog) {
      const allDramas = [...(catalog.hot || []), ...(catalog.latest || []), ...(catalog.monthly || [])];
      const seen = new Set();
      const kwLower = kw.toLowerCase();
      for (const d of allDramas) {
        if (!seen.has(d.id) && (d.title.toLowerCase().includes(kwLower) || (d.id === kw))) {
          seen.add(d.id);
          results.push({
            id: d.id,
            title: d.title,
            url: d.url,
            cover: d.cover,
            remarks: '短劇'
          });
        }
      }
    }

    return results;
  }

  /**
   * Extract drama details and all episode stream URLs
   * @param {string} input - URL or ID or title
   */
  async getDetail(input) {
    let dramaId = '';
    const str = String(input || '').trim();

    // Check if full URL or raw ID
    const urlMatch = str.match(/\/drama\/(\d+)/i) || str.match(/\/play\/(\d+)/i);
    if (urlMatch) {
      dramaId = urlMatch[1];
    } else if (/^\d+$/.test(str)) {
      dramaId = str;
    } else {
      // Search drama by keyword if user pasted a title
      const searchResults = await this.search(str);
      if (searchResults && searchResults.length > 0) {
        dramaId = searchResults[0].id;
      }
    }

    if (!dramaId) {
      throw new Error('រកមិនឃើញ ID រឿង ឬតំណភ្ជាប់មិនត្រឹមត្រូវ (Cannot find valid MVFFM drama ID or link)');
    }

    const dramaUrl = `https://www.mvffm.net/drama/${dramaId}/`;
    const res = await fetchText(dramaUrl);
    if (res.status !== 200 || !res.body) {
      throw new Error(`បរាជ័យក្នុងការបើករឿង ID: ${dramaId} (HTTP ${res.status})`);
    }

    const html = res.body;

    // Title
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                       html.match(/<div class="data">[\s\S]*?<h1>([^<]+)<\/h1>/i) ||
                       html.match(/<div class="title"><h4>([^<]+)<\/h4>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'MVFFM Drama';

    // Poster
    const coverMatch = html.match(/<div class="poster">[\s\S]*?(?:src|data-lazy-src)="([^"]+)"/i) ||
                       html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    const cover = coverMatch ? coverMatch[1].trim() : '';

    // Description
    const descMatch = html.match(/<div class="wp-content">[\s\S]*?<p>([\s\S]*?)<\/p>/i) ||
                      html.match(/<div class="texto">([\s\S]*?)<\/div>/i);
    const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : 'MVFFM 精品短劇';

    // Tags & Year
    const yearMatch = html.match(/<span class="date">([^<]+)<\/span>/i) || html.match(/<div class="update upyear">([^<]+)<\/div>/i);
    const year = yearMatch ? yearMatch[1].trim() : '2026';

    const tags = ['短劇', `${year}年`, 'HLS HD'];

    // Parse Sources & Episodes from Vue Player
    let sources = [];
    let allEpisodes = [];

    const vueMatch = html.match(/videourls:\s*(\[\[[\s\S]*?\]\])\s*,\s*tables:/i);
    const tablesMatch = html.match(/tables:\s*(\[[\s\S]*?\])\s*,\s*tbcur:/i);

    let tableNames = [];
    if (tablesMatch) {
      try {
        const parsedTables = JSON.parse(tablesMatch[1]);
        tableNames = parsedTables.map(t => (t.ht || '').replace(/<[^>]+>/g, '').trim());
      } catch (e) {}
    }

    if (vueMatch) {
      try {
        const rawVideoUrls = JSON.parse(vueMatch[1]);
        rawVideoUrls.forEach((srcList, sIdx) => {
          const sName = tableNames[sIdx] || `ខ្សែទី ${sIdx + 1} (Source ${sIdx + 1})`;
          const epList = srcList.map((ep, eIdx) => ({
            episode: eIdx + 1,
            label: ep.name ? (ep.name === '全' ? '全集 (Full Movie)' : `第${ep.name}集`) : `第${eIdx + 1}集`,
            url: ep.url
          }));
          sources.push({
            id: sIdx,
            name: sName,
            count: epList.length,
            episodes: epList
          });
        });
      } catch (e) {
        console.warn('[MVFFM] Failed to parse videourls JSON:', e.message);
      }
    }

    // Single videourl fallback
    if (sources.length === 0) {
      const singleUrlMatch = html.match(/videourl:\s*['"]([^'"]+)['"]/i);
      if (singleUrlMatch) {
        sources.push({
          id: 0,
          name: 'FLV 1',
          count: 1,
          episodes: [{ episode: 1, label: '全集 (Full Movie)', url: singleUrlMatch[1] }]
        });
      }
    }

    // Select the best source by default (source with maximum episodes, or source 0)
    let bestSource = sources[0];
    for (const src of sources) {
      if (src.episodes && src.episodes.length > (bestSource ? bestSource.episodes.length : 0)) {
        bestSource = src;
      }
    }

    allEpisodes = bestSource ? bestSource.episodes : [];

    return {
      id: String(dramaId),
      title,
      cover,
      desc,
      year,
      tags,
      sources,
      total_episodes: allEpisodes.length,
      episodes: allEpisodes
    };
  }

  /**
   * Start batch downloading episodes of an MVFFM drama
   */
  async startDownload({ drama_id, title, episodes = [], customDir = null, range = 'all', download_mode = 'separate' }) {
    if (!episodes || episodes.length === 0) {
      throw new Error('គ្មានភាគសម្រាប់ទាញយកទេ (No episodes selected to download)');
    }

    const safeTitle = sanitizeFilename(title || `MVFFM_${drama_id}`);
    const rootDir = customDir && fs.existsSync(customDir) ? customDir : this.getMvffmOutputDir();
    const dramaDir = path.join(rootDir, safeTitle);
    if (!fs.existsSync(dramaDir)) {
      try { fs.mkdirSync(dramaDir, { recursive: true }); } catch (e) {}
    }

    const taskId = `mvffm_${drama_id}_${Date.now()}`;
    const task = {
      task_id: taskId,
      drama_id: String(drama_id),
      title: title || 'MVFFM Drama',
      drama_dir: dramaDir,
      total_episodes: episodes.length,
      completed_episodes: 0,
      current_episode: 0,
      current_episode_label: '',
      status: 'downloading', // 'downloading', 'completed', 'error', 'canceled'
      progress_pct: 0,
      speed_str: '',
      error_message: '',
      created_at: Date.now(),
      episodes: episodes,
      download_mode: download_mode || 'separate'
    };

    // Save metadata file in drama folder for persistent library & memory tracking
    try {
      const meta = {
        series_id: String(drama_id),
        platform: 'mvffm',
        title: title || 'MVFFM Drama',
        cover: '',
        episode_cnt: episodes.length,
        saved_at: new Date().toISOString()
      };
      fs.writeFileSync(path.join(dramaDir, '.series.json'), JSON.stringify(meta, null, 2), 'utf-8');
    } catch (e) {}

    libraryManager.registerSeries(drama_id, title, '', episodes.length, range || 'all', 'mvffm').catch(() => {});

    this.tasks.set(taskId, task);
    this._runDownloadQueue(task);

    return task;
  }

  async _runDownloadQueue(task) {
    const ffmpegPath = findFfmpeg();

    for (let i = 0; i < task.episodes.length; i++) {
      if (task.status === 'canceled') break;

      const ep = task.episodes[i];
      task.current_episode = i + 1;
      task.current_episode_label = ep.label || `Episode ${ep.episode}`;
      task.progress_pct = Math.round((i / task.total_episodes) * 100);

      const epNumStr = String(ep.episode || (i + 1)).padStart(3, '0');
      const safeLabel = String(ep.label || `Ep_${epNumStr}`).replace(/[\\/*?:"<>|\r\n\t]/g, '_');
      const outPath = path.join(task.drama_dir, `${safeLabel}.mp4`);

      // Skip if already exists and size > 1MB
      if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1024 * 1024) {
        task.completed_episodes++;
        task.progress_pct = Math.round((task.completed_episodes / task.total_episodes) * 100);
        libraryManager.updateProgress(task.drama_id, task.completed_episodes, task.total_episodes, task.progress_pct);
        continue;
      }

      try {
        await this._downloadEpisodeM3u8({
          m3u8Url: ep.url,
          outPath,
          ffmpegPath,
          taskId: task.task_id,
          onProgress: (speed) => {
            task.speed_str = speed || '';
          }
        });
        task.completed_episodes++;
        task.progress_pct = Math.round((task.completed_episodes / task.total_episodes) * 100);
        libraryManager.updateProgress(task.drama_id, task.completed_episodes, task.total_episodes, task.progress_pct);
      } catch (err) {
        if (task.status === 'canceled') break;
        console.warn(`[MVFFM] Download failed for ${ep.label}:`, err.message);
      }
    }

    if (task.status !== 'canceled') {
      if (task.completed_episodes > 0 && (task.download_mode === 'merged' || task.download_mode === 'both')) {
        task.status = 'merging';
        await mergeDramaEpisodes({
          dramaDir: task.drama_dir,
          seriesTitle: task.title,
          mode: task.download_mode,
          onLog: (msg) => console.log(`[MVFFM] ${msg}`)
        });
      }
      task.status = task.completed_episodes > 0 ? 'completed' : 'error';
      task.progress_pct = 100;
      task.speed_str = '';
      if (task.completed_episodes >= task.total_episodes) {
        libraryManager.markCompleted(task.drama_id);
      }
    }
  }

  _downloadEpisodeM3u8({ m3u8Url, outPath, ffmpegPath, taskId, onProgress }) {
    return new Promise((resolve, reject) => {
      const tempPath = outPath + '.tmp';
      const args = [
        '-y',
        '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\nReferer: https://www.mvffm.net/\r\n',
        '-i', m3u8Url,
        '-c', 'copy',
        '-bsf:a', 'aac_adtstoasc',
        tempPath
      ];

      const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      this.activeProcesses.set(taskId, child);

      child.stderr.on('data', (d) => {
        const str = d.toString();
        const speedMatch = str.match(/speed=\s*([\d.]+x)/i);
        if (speedMatch && onProgress) {
          onProgress(speedMatch[1]);
        }
      });

      child.on('close', (code) => {
        this.activeProcesses.delete(taskId);
        if (code === 0 && fs.existsSync(tempPath)) {
          try {
            fs.renameSync(tempPath, outPath);
            resolve();
          } catch (e) {
            reject(e);
          }
        } else {
          try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e) {}
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        this.activeProcesses.delete(taskId);
        reject(err);
      });
    });
  }

  getTasks() {
    return Array.from(this.tasks.values()).sort((a, b) => b.created_at - a.created_at);
  }

  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.status = 'canceled';
    const proc = this.activeProcesses.get(taskId);
    if (proc) {
      try { proc.kill('SIGKILL'); } catch (e) {}
      this.activeProcesses.delete(taskId);
    }
    return true;
  }

  cancelAll() {
    for (const taskId of this.tasks.keys()) {
      this.cancelTask(taskId);
    }
    return true;
  }

  clearFinished() {
    for (const [id, task] of this.tasks.entries()) {
      if (task.status === 'completed' || task.status === 'canceled' || task.status === 'error') {
        this.tasks.delete(id);
      }
    }
    return this.getTasks();
  }
}

const mvffmDownloader = new MvffmDownloader();

module.exports = {
  mvffmDownloader
};
