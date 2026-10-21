/**
 * ANITAKU (anitaku.com.ro) Anime Streaming & Downloader Engine.
 * Supports popular anime, latest episode releases, genre catalogs,
 * full series detail parsing, multi-server episode stream extraction (Megaplays, Tamilembed),
 * HLS .m3u8 stream downloading with ffmpeg, and real-time task tracking.
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { getOutputDir } = require('./config.js');
const { mergeDramaEpisodes } = require('./video_merger.js');
const { libraryManager, downloadAndSaveCover, saveSeriesMetadata } = require('./library_manager.js');

function sanitizeFilename(name) {
  const cleaned = String(name || '').replace(/[\\/*?:"<>|\r\n\t]/g, '_').trim();
  return cleaned.slice(0, 80) || 'Anitaku_Anime';
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

function fetchAnitaku(url, headers = {}, maxRedirects = 4, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) return resolve({ status: 508, body: '' });
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return reject(e);
    }
    const client = parsed.protocol === 'http:' ? http : https;
    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      family: 4,
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://anitaku.com.ro/',
        ...headers
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, url).toString();
        }
        return fetchAnitaku(redirectUrl, headers, maxRedirects - 1, timeoutMs).then(resolve).catch(reject);
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 408, body: '' });
    });
    req.on('error', (err) => {
      resolve({ status: 500, body: '', error: err.message });
    });
    req.end();
  });
}

class AnitakuDownloader {
  constructor() {
    this.tasks = new Map(); // taskId -> task object
    this.activeProcesses = new Map(); // taskId -> childProcess
    this._recsCache = new Map(); // cacheKey -> { ts, data }
    this._detailCache = new Map(); // id -> { ts, data }
  }

  getAnitakuOutputDir() {
    const root = getOutputDir();
    const aniDir = path.join(root, 'Anitaku');
    if (!fs.existsSync(aniDir)) {
      try { fs.mkdirSync(aniDir, { recursive: true }); } catch (e) {}
    }
    return aniDir;
  }

  _parseCards(html) {
    const cards = [];
    const seen = new Set();
    const regex = /<article[^>]*class="[^"]*bs[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const item = match[1];
      const linkMatch = item.match(/href="([^"]+)"/);
      const titleMatch = item.match(/itemprop="headline"[^>]*>([\s\S]*?)<\/h2>/i) || item.match(/title="([^"]+)"/);
      const imgMatch = item.match(/src="([^"]+)"/);
      const epMatch = item.match(/class="epx"[^>]*>([\s\S]*?)<\/span>/i);
      const typeMatch = item.match(/class="typez"[^>]*>([\s\S]*?)<\/span>/i);
      const subMatch = item.match(/class="sb"[^>]*>([\s\S]*?)<\/span>/i);

      if (linkMatch && titleMatch) {
        const url = linkMatch[1];
        const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
        const idMatch = url.match(/https?:\/\/[^\/]+\/([^\/]+)\/?/);
        const id = idMatch ? idMatch[1] : url;

        if (!seen.has(id)) {
          seen.add(id);
          cards.push({
            id,
            title,
            url,
            cover: imgMatch ? imgMatch[1] : '',
            ep: epMatch ? epMatch[1].trim() : '',
            type: typeMatch ? typeMatch[1].trim() : 'Anime',
            sub: subMatch ? subMatch[1].trim() : 'Sub'
          });
        }
      }
    }
    return cards;
  }

  /**
   * Fetch recommendations / catalog by category
   * Categories: 'popular', 'latest', 'action', 'romance', 'fantasy', 'supernatural', 'comedy', 'drama', 'sci-fi'
   */
  async getRecommendations(category = 'all') {
    const cat = String(category || 'all').toLowerCase();

    // 1. Load from bundled / cached anitaku_catalog.json
    try {
      const catalogPaths = [
        path.join(__dirname, '..', 'data', 'anitaku_catalog.json'),
        path.join(__dirname, 'data', 'anitaku_catalog.json'),
        path.join(process.cwd(), 'data', 'anitaku_catalog.json')
      ];
      for (const p of catalogPaths) {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf-8');
          const list = JSON.parse(raw);
          if (Array.isArray(list) && list.length > 0) {
            let filtered = list;
            if (cat !== 'all' && cat !== 'popular' && cat !== 'latest') {
              filtered = list.filter(item => {
                const titleLower = (item.title || '').toLowerCase();
                const typeLower = (item.type || '').toLowerCase();
                return titleLower.includes(cat) || typeLower.includes(cat);
              });
              if (filtered.length < 10) filtered = list;
            }
            return filtered;
          }
        }
      }
    } catch (e) {
      console.warn('[Anitaku] Catalog read error:', e.message);
    }

    // 2. Online fallback if catalog file is not available
    let targetUrl = 'https://anitaku.com.ro/series/?status=&type=&order=popular';
    if (cat === 'latest') {
      targetUrl = 'https://anitaku.com.ro/';
    } else if (cat !== 'popular' && cat !== 'all') {
      targetUrl = `https://anitaku.com.ro/genres/${encodeURIComponent(cat)}/`;
    }

    try {
      const res = await fetchAnitaku(targetUrl);
      if (res.status === 200 && res.body) {
        const cards = this._parseCards(res.body);
        if (cards.length > 0) return cards;
      }
    } catch (err) {
      console.error('[Anitaku] Online recommendations error:', err.message);
    }

    return [];
  }

  /**
   * Search anime by title or keyword
   */
  async search(keyword) {
    const kw = (keyword || '').trim();
    if (!kw) return [];

    try {
      const searchUrl = `https://anitaku.com.ro/?s=${encodeURIComponent(kw)}`;
      const res = await fetchAnitaku(searchUrl);
      if (res.status === 200 && res.body) {
        return this._parseCards(res.body);
      }
    } catch (err) {
      console.error('[Anitaku] Search error:', err.message);
    }
    return [];
  }

  /**
   * Parse full anime details and episode playlist
   * Resolves parent series automatically if an episode URL is passed
   */
  async getDetail(input) {
    const str = String(input || '').trim();
    if (!str) {
      throw new Error('សូមបញ្ចូលឈ្មោះ ឬលីង Anime (Please provide anime title or URL)');
    }

    let targetUrl = '';
    if (/^https?:\/\//i.test(str)) {
      targetUrl = str;
    } else {
      // Search by keyword
      const searchResults = await this.search(str);
      if (searchResults && searchResults.length > 0) {
        targetUrl = searchResults[0].url;
      } else {
        targetUrl = `https://anitaku.com.ro/${encodeURIComponent(str.replace(/\s+/g, '-').toLowerCase())}/`;
      }
    }

    // Check detail cache
    const cacheKey = targetUrl;
    if (this._detailCache.has(cacheKey)) {
      const cached = this._detailCache.get(cacheKey);
      if (Date.now() - cached.ts < 20 * 60 * 1000) {
        return cached.data;
      }
    }

    let res = await fetchAnitaku(targetUrl);
    if (res.status !== 200 || !res.body) {
      throw new Error(`មិនអាចទាញយកទិន្នន័យ Anime បានទេ (HTTP ${res.status})`);
    }

    let html = res.body;

    // Check if this is an episode page instead of parent series
    // Episode pages have .naveps or class="nvs nvsc" linking to the series
    const seriesLinkMatch = html.match(/<div class="nvs nvsc"><a href=['"]([^'"]+)['"]/i) ||
                            html.match(/<a[^>]+href=['"]([^'"]+)['"][^>]*aria-label=['"]All Episodes['"]/i);

    if (seriesLinkMatch && seriesLinkMatch[1]) {
      const parentSeriesUrl = seriesLinkMatch[1];
      const seriesRes = await fetchAnitaku(parentSeriesUrl);
      if (seriesRes.status === 200 && seriesRes.body) {
        html = seriesRes.body;
        targetUrl = parentSeriesUrl;
      }
    }

    // Parse series metadata
    const titleMatch = html.match(/<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i) ||
                       html.match(/<div class="info-content">[\s\S]*?<h1>([\s\S]*?)<\/h1>/i) ||
                       html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'Anime Series';

    const alterMatch = html.match(/<span class="alter">([\s\S]*?)<\/span>/i);
    const altTitle = alterMatch ? alterMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    const coverMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
                       html.match(/<div class="thumb"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i) ||
                       html.match(/<div class="info-content">[\s\S]*?<img[^>]*src="([^"]+)"/i);
    const cover = coverMatch ? coverMatch[1].trim() : '';

    const descMatch = html.match(/<div class="entry-content"[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i) ||
                      html.match(/<div class="desc"[^>]*>([\s\S]*?)<\/div>/i);
    const rawSynopsis = descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const synopsis = rawSynopsis
      .replace(/&#0*39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ');

    // Status, Released, Studio, Season
    const statusMatch = html.match(/<span><b>Status:<\/b>\s*([^<]+)<\/span>/i);
    const status = statusMatch ? statusMatch[1].trim() : 'Ongoing';

    const yearMatch = html.match(/<span class="split"><b>Released:<\/b>\s*([^<]+)<\/span>/i);
    const year = yearMatch ? yearMatch[1].trim() : '2026';

    const studioMatch = html.match(/<span><b>Studio:<\/b>\s*<a[^>]*>([^<]+)<\/a>/i);
    const studio = studioMatch ? studioMatch[1].trim() : '';

    // Genres
    const genreMatches = [...html.matchAll(/<div class="genxed">([\s\S]*?)<\/div>/gi)];
    const genres = [];
    if (genreMatches.length > 0) {
      const gHtml = genreMatches[0][1];
      const aMatches = [...gHtml.matchAll(/<a[^>]*>([^<]+)<\/a>/gi)];
      aMatches.forEach(m => genres.push(m[1].trim()));
    }

    // Episode List from .eplister
    const episodes = [];
    const epRegex = /<li[^>]*data-index="(\d+)"[^>]*>[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<div class="epl-num">([^<]+)<\/div>[\s\S]*?<div class="epl-title">([^<]+)<\/div>(?:[\s\S]*?<div class="epl-date">([^<]*)<\/div>)?[\s\S]*?<\/li>/gi;
    let epMatch;
    while ((epMatch = epRegex.exec(html)) !== null) {
      const epNumRaw = epMatch[3].trim();
      const epNum = parseInt(epNumRaw.replace(/\D/g, ''), 10) || (episodes.length + 1);
      const epTitle = epMatch[4].trim();
      const epUrl = epMatch[2].trim();
      const epDate = epMatch[5] ? epMatch[5].trim() : '';
      episodes.push({
        episode: epNum,
        label: epTitle || `Episode ${epNum}`,
        url: epUrl,
        date: epDate
      });
    }

    // Sort episodes ascending (1, 2, 3...)
    episodes.sort((a, b) => a.episode - b.episode);

    // If no episodes found in .eplister, check if input was a single episode
    if (episodes.length === 0 && targetUrl.includes('episode')) {
      episodes.push({
        episode: 1,
        label: title || 'Episode 1',
        url: targetUrl,
        date: ''
      });
    }

    const idMatch = targetUrl.match(/https?:\/\/[^\/]+\/([^\/]+)\/?/);
    const animeId = idMatch ? idMatch[1] : title.toLowerCase().replace(/\s+/g, '-');

    const detailResult = {
      id: animeId,
      title,
      alt_title: altTitle,
      url: targetUrl,
      cover,
      synopsis,
      status,
      year,
      studio,
      genres,
      total_episodes: episodes.length,
      episodes
    };

    this._detailCache.set(cacheKey, { ts: Date.now(), data: detailResult });
    return detailResult;
  }

  /**
   * Extract video stream & mirror servers from an episode page
   */
  async getEpisodeStream(epUrl) {
    if (!epUrl) throw new Error('Episode URL is required');

    const epRes = await fetchAnitaku(epUrl);
    if (epRes.status !== 200 || !epRes.body) {
      throw new Error(`Failed to load episode page (HTTP ${epRes.status})`);
    }

    const html = epRes.body;
    const servers = [];

    // Parse mirror dropdown options
    const optRegex = /<option[^>]*value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/gi;
    let optMatch;
    while ((optMatch = optRegex.exec(html)) !== null) {
      const val = optMatch[1];
      const name = optMatch[2].replace(/<[^>]+>/g, '').trim();
      let decoded = val;
      try {
        decoded = Buffer.from(val, 'base64').toString('utf-8');
      } catch (_) {}
      const iframeSrc = decoded.match(/src="([^"]+)"/i)?.[1];
      if (iframeSrc) {
        servers.push({ name, embedUrl: iframeSrc });
      }
    }

    // Check direct iframe in embed_holder
    if (servers.length === 0) {
      const directIframe = html.match(/<iframe[^>]*src="([^"]+)"/i)?.[1];
      if (directIframe) {
        servers.push({ name: 'Default Server', embedUrl: directIframe });
      }
    }

    // Clean up any tamilembed ad-wrapper servers by extracting direct Blogger iframe
    for (const s of servers) {
      if (s.embedUrl && s.embedUrl.includes('tamilembed.lol')) {
        try {
          const tRes = await fetchAnitaku(s.embedUrl, { 'Referer': 'https://anitaku.com.ro/' });
          if (tRes && tRes.body) {
            const bloggerSrc = tRes.body.match(/<iframe[^>]*src="([^"]*blogger\.com[^"]*)"/i)?.[1];
            if (bloggerSrc) {
              s.embedUrl = bloggerSrc;
            }
          }
        } catch (_) {}
      }
    }

    // Check Megaplays server for direct qualities and HLS stream proxy
    let streamInfo = {
      servers,
      embedUrl: servers[0]?.embedUrl || '',
      streamUrl: '',
      qualities: {}
    };

    const mega = servers.find(s => s.embedUrl && s.embedUrl.includes('megaplays.se'));
    if (mega) {
      try {
        const megaRes = await fetchAnitaku(mega.embedUrl, { 'Referer': 'https://anitaku.com.ro/' });
        if (megaRes.status === 200 && megaRes.body) {
          const qMatch = megaRes.body.match(/var\s+qualities\s*=\s*({[\s\S]*?});/);
          const proxyMatch = megaRes.body.match(/var\s+proxyBase\s*=\s*['"]([^'"]+)['"]/);
          if (qMatch && proxyMatch) {
            const qualities = JSON.parse(qMatch[1]);
            const proxyBase = proxyMatch[1];
            streamInfo.qualities = qualities;
            streamInfo.proxyBase = proxyBase;
            streamInfo.embedUrl = mega.embedUrl;

            // Pick 1080p or 720p or first available
            const bestKey = qualities['1080p'] ? '1080p' : (qualities['720p'] ? '720p' : Object.keys(qualities)[0]);
            if (bestKey && qualities[bestKey]) {
              streamInfo.streamUrl = proxyBase + encodeURIComponent(qualities[bestKey]);
              streamInfo.bestQuality = bestKey;
            }
          }
        }
      } catch (e) {
        console.warn('[Anitaku] Megaplays extraction error:', e.message);
      }
    } else if (servers.length > 0) {
      streamInfo.embedUrl = servers[0].embedUrl;
    }

    return streamInfo;
  }

  /**
   * Start batch downloading episodes of an Anitaku anime
   */
  async startDownload({ anime_id, title, episodes = [], customDir = null, range = 'all', download_mode = 'separate', quality = 'original', cover = '' }) {
    if (!episodes || episodes.length === 0) {
      throw new Error('គ្មានភាគសម្រាប់ទាញយកទេ (No episodes selected to download)');
    }

    const safeTitle = sanitizeFilename(title || `Anitaku_${anime_id}`);
    const rootDir = customDir && fs.existsSync(customDir) ? customDir : this.getAnitakuOutputDir();
    const animeDir = path.join(rootDir, safeTitle);
    if (!fs.existsSync(animeDir)) {
      try { fs.mkdirSync(animeDir, { recursive: true }); } catch (e) {}
    }

    const taskId = `ani_${anime_id}_${Date.now()}`;
    const task = {
      task_id: taskId,
      anime_id: String(anime_id),
      title: title || 'Anitaku Anime',
      cover: cover || '',
      anime_dir: animeDir,
      total_episodes: episodes.length,
      completed_episodes: 0,
      current_episode: 0,
      current_episode_label: '',
      status: 'downloading',
      progress_pct: 0,
      speed_str: '',
      error_message: '',
      created_at: Date.now(),
      episodes: episodes,
      download_mode: download_mode || 'separate',
      quality: quality || 'original'
    };

    // Save poster image and metadata file for offline library & drawer
    if (cover) {
      downloadAndSaveCover(cover, animeDir, safeTitle).catch(() => {});
    }
    saveSeriesMetadata(animeDir, {
      series_id: String(anime_id),
      platform: 'anitaku',
      title: title || 'Anitaku Anime',
      cover: cover || '',
      total_episodes: episodes.length
    });

    libraryManager.registerSeries(anime_id, title, cover || '', episodes.length, range || 'all', 'anitaku').catch(() => {});

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
      const outPath = path.join(task.anime_dir, `${safeLabel}.mp4`);

      // Skip if already downloaded (> 1MB)
      if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1024 * 1024) {
        task.completed_episodes++;
        task.progress_pct = Math.round((task.completed_episodes / task.total_episodes) * 100);
        libraryManager.updateProgress(task.anime_id, task.completed_episodes, task.total_episodes, task.progress_pct);
        continue;
      }

      try {
        // Extract stream URL for this episode
        const streamData = await this.getEpisodeStream(ep.url);
        const streamUrl = streamData.streamUrl || streamData.embedUrl;
        if (!streamUrl) {
          throw new Error(`Cannot find stream URL for ${ep.label}`);
        }

        await this._downloadStream({
          streamUrl,
          outPath,
          ffmpegPath,
          taskId: task.task_id,
          referer: streamData.embedUrl || 'https://anitaku.com.ro/',
          onProgress: (speed) => {
            task.speed_str = speed || '';
          }
        });

        task.completed_episodes++;
        task.progress_pct = Math.round((task.completed_episodes / task.total_episodes) * 100);
        libraryManager.updateProgress(task.anime_id, task.completed_episodes, task.total_episodes, task.progress_pct);
      } catch (err) {
        console.error(`[Anitaku] Failed episode ${ep.episode}:`, err.message);
        task.error_message = `Ep ${ep.episode}: ${err.message}`;
      }
    }

    if (task.status !== 'canceled') {
      task.status = task.completed_episodes > 0 ? 'completed' : 'error';
      task.progress_pct = 100;
      task.speed_str = '✓ រួចរាល់ (Done)';

      // Auto-merge if user chose 'merged' or 'both'
      if (task.completed_episodes > 1 && (task.download_mode === 'merged' || task.download_mode === 'both')) {
        try {
          task.speed_str = '🔄 កំពុងបញ្ចូលរឿងពេញ...';
          const mergedFile = await mergeDramaEpisodes(task.anime_dir, task.title, {
            keepEpisodes: task.download_mode === 'both'
          });
          if (mergedFile) {
            task.speed_str = '✓ បញ្ចូលរឿងពេញជោគជ័យ (Merged)';
          }
        } catch (mergeErr) {
          console.warn('[Anitaku] Merge warning:', mergeErr.message);
        }
      }
    }

    this.activeProcesses.delete(task.task_id);
  }

  _downloadStream({ streamUrl, outPath, ffmpegPath, taskId, referer, onProgress }) {
    return new Promise((resolve, reject) => {
      const headers = `Referer: ${referer}\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36\r\n`;
      const tempPath = outPath + '.tmp';

      const args = [
        '-y',
        '-headers', headers,
        '-i', streamUrl,
        '-c', 'copy',
        '-bsf:a', 'aac_adtstoasc',
        '-movflags', '+faststart',
        tempPath
      ];

      const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      this.activeProcesses.set(taskId, proc);

      proc.stderr.on('data', (d) => {
        const text = d.toString();
        const speedMatch = text.match(/speed=\s*([\d.]+x)/i);
        if (speedMatch && onProgress) {
          onProgress(`⚡ ${speedMatch[1]}`);
        }
      });

      proc.on('close', (code) => {
        this.activeProcesses.delete(taskId);
        if (code === 0 && fs.existsSync(tempPath)) {
          try {
            if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
            fs.renameSync(tempPath, outPath);
            resolve(outPath);
          } catch (e) {
            reject(e);
          }
        } else {
          try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        this.activeProcesses.delete(taskId);
        reject(err);
      });
    });
  }

  getTasks() {
    return Array.from(this.tasks.values()).sort((a, b) => b.created_at - a.created_at);
  }

  cancelTask(taskId) {
    if (!taskId || taskId === 'all') {
      for (const [id, t] of this.tasks.entries()) {
        if (t.status === 'downloading' || t.status === 'queued') {
          t.status = 'canceled';
          t.speed_str = '🚫 បានបោះបង់ (Canceled)';
          const proc = this.activeProcesses.get(id);
          if (proc) {
            try { proc.kill('SIGTERM'); } catch (_) {}
            this.activeProcesses.delete(id);
          }
        }
      }
      return true;
    }

    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.status = 'canceled';
    task.speed_str = '🚫 បានបោះបង់ (Canceled)';
    const proc = this.activeProcesses.get(taskId);
    if (proc) {
      try { proc.kill('SIGTERM'); } catch (_) {}
      this.activeProcesses.delete(taskId);
    }
    return true;
  }

  clearFinished() {
    for (const [id, task] of this.tasks.entries()) {
      if (task.status === 'completed' || task.status === 'error' || task.status === 'canceled') {
        this.tasks.delete(id);
      }
    }
    return this.getTasks();
  }
}

const anitakuDownloader = new AnitakuDownloader();

module.exports = {
  anitakuDownloader,
  AnitakuDownloader
};
