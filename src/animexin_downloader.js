/**
 * ANIMEXIN (animexin.dev) Donghua (3D Chinese Anime) Streaming & Downloader Engine.
 * Supports popular 3D Donghua series, latest releases, genre filters (Action, Cultivation, Fantasy, Martial Arts...),
 * full series detail parsing, multi-server episode stream extraction (Dailymotion, Odysee, Ok.ru, Rumble, Streamwish),
 * episode downloading with yt-dlp & ffmpeg, and real-time task tracking.
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
  return cleaned.slice(0, 80) || 'Animexin_Donghua';
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

function fetchAnimexin(url, headers = {}, maxRedirects = 4, timeoutMs = 15000) {
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
        'Referer': 'https://animexin.dev/',
        ...headers
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, url).toString();
        }
        return fetchAnimexin(redirectUrl, headers, maxRedirects - 1, timeoutMs).then(resolve).catch(reject);
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

class AnimexinDownloader {
  constructor() {
    this.tasks = new Map(); // taskId -> task
    this.activeProcesses = new Map(); // taskId -> childProcess
    this._recsCache = new Map(); // cacheKey -> { ts, data }
    this._detailCache = new Map(); // id -> { ts, data }
  }

  getAnimexinOutputDir() {
    const root = getOutputDir();
    const axDir = path.join(root, 'Animexin');
    if (!fs.existsSync(axDir)) {
      try { fs.mkdirSync(axDir, { recursive: true }); } catch (e) {}
    }
    return axDir;
  }

  _parseCards(html) {
    const cards = [];
    const seen = new Set();
    const regex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const item = match[1];
      const linkMatch = item.match(/href="([^"]+)"/);
      const titleMatch = item.match(/title="([^"]+)"/) || item.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
      const imgMatch = item.match(/src="([^"]+)"/);
      const epMatch = item.match(/class="epx"[^>]*>([\s\S]*?)<\/span>/i);
      const typeMatch = item.match(/class="typez[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const statusMatch = item.match(/class="status\s+([^"]+)"/i);

      if (linkMatch && titleMatch) {
        const url = linkMatch[1];
        const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
        const idMatch = url.match(/https?:\/\/[^\/]+\/(?:anime\/)?([^\/]+)\/?/);
        const id = idMatch ? idMatch[1] : url;

        if (!seen.has(id)) {
          seen.add(id);
          cards.push({
            id,
            title,
            url,
            cover: imgMatch ? imgMatch[1] : '',
            ep: epMatch ? epMatch[1].replace(/<[^>]+>/g, '').trim() : '',
            type: typeMatch ? typeMatch[1].replace(/<[^>]+>/g, '').trim() : 'Donghua',
            status: statusMatch ? statusMatch[1].trim() : 'Ongoing'
          });
        }
      }
    }
    return cards;
  }

  /**
   * Fetch recommendations / catalog by category
   * Categories: 'all', 'popular', 'latest', 'action', 'cultivation', 'fantasy', 'magic', 'martial', 'comedy', 'movie', 'completed'
   */
  async getRecommendations(category = 'all') {
    const cat = String(category || 'all').toLowerCase();

    // 1. Try loading from bundled data/animexin_catalog.json
    try {
      const catalogPaths = [
        path.join(__dirname, '..', 'data', 'animexin_catalog.json'),
        path.join(__dirname, 'data', 'animexin_catalog.json'),
        path.join(process.cwd(), 'data', 'animexin_catalog.json')
      ];
      for (const p of catalogPaths) {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf-8');
          const list = JSON.parse(raw);
          if (Array.isArray(list) && list.length > 0) {
            let filtered = list;
            if (cat === 'popular') {
              filtered = list.filter(item => item.is_popular);
              if (filtered.length < 15) filtered = list.slice(0, 40);
            } else if (cat === 'completed') {
              filtered = list.filter(item => (item.status || '').toLowerCase() === 'completed' || (item.ep || '').toLowerCase().includes('completed'));
            } else if (cat === 'movie') {
              filtered = list.filter(item => (item.type || '').toLowerCase().includes('movie') || (item.title || '').toLowerCase().includes('movie'));
            } else if (cat !== 'all' && cat !== 'latest') {
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
      console.warn('[Animexin] Catalog read error:', e.message);
    }

    // 2. Online live fallback
    let targetUrl = 'https://animexin.dev/anime/?page=1';
    if (cat === 'latest') {
      targetUrl = 'https://animexin.dev/';
    } else if (cat === 'popular') {
      targetUrl = 'https://animexin.dev/anime/?order=popular';
    } else if (cat !== 'all') {
      targetUrl = `https://animexin.dev/genres/${encodeURIComponent(cat)}/`;
    }

    try {
      const res = await fetchAnimexin(targetUrl);
      if (res.status === 200 && res.body) {
        const cards = this._parseCards(res.body);
        if (cards.length > 0) return cards;
      }
    } catch (err) {
      console.error('[Animexin] Online recommendations error:', err.message);
    }

    return [];
  }

  /**
   * Search donghua by title or keyword
   */
  async search(keyword) {
    const kw = (keyword || '').trim();
    if (!kw) return [];

    try {
      const searchUrl = `https://animexin.dev/?s=${encodeURIComponent(kw)}`;
      const res = await fetchAnimexin(searchUrl);
      if (res.status === 200 && res.body) {
        return this._parseCards(res.body);
      }
    } catch (err) {
      console.error('[Animexin] Search error:', err.message);
    }
    return [];
  }

  /**
   * Parse full anime/donghua details and episode playlist
   * Resolves parent series automatically if an episode URL is passed
   */
  async getDetail(input) {
    const str = String(input || '').trim();
    if (!str) {
      throw new Error('សូមបញ្ចូលឈ្មោះ ឬលីង Donghua (Please provide anime title or URL)');
    }

    let targetUrl = '';
    if (/^https?:\/\//i.test(str)) {
      targetUrl = str;
    } else {
      const searchResults = await this.search(str);
      if (searchResults && searchResults.length > 0) {
        targetUrl = searchResults[0].url;
      } else {
        targetUrl = `https://animexin.dev/${encodeURIComponent(str.replace(/\s+/g, '-').toLowerCase())}/`;
      }
    }

    // Cache lookup
    const cacheKey = targetUrl;
    if (this._detailCache.has(cacheKey)) {
      const cached = this._detailCache.get(cacheKey);
      if (Date.now() - cached.ts < 20 * 60 * 1000) {
        return cached.data;
      }
    }

    let res = await fetchAnimexin(targetUrl);
    if (res.status !== 200 || !res.body) {
      throw new Error(`មិនអាចទាញយកទិន្នន័យ Donghua បានទេ (HTTP ${res.status})`);
    }

    let html = res.body;

    // Check if this is an episode page instead of the parent series
    let parentSeriesUrl = null;
    let targetEpNum = null;

    // 1. Check ts_config for series and episode number
    const tsConfigMatch = html.match(/const ts_config = ({[\s\S]*?});/);
    if (tsConfigMatch) {
      try {
        const cfg = JSON.parse(tsConfigMatch[1]);
        const it = cfg.series_history && cfg.series_history.item;
        if (it && it.c) targetEpNum = parseInt(it.c, 10);
      } catch (_) {}
    }

    if (!targetEpNum) {
      const epNumMatch = targetUrl.match(/-episode-(\d+)/i) || targetUrl.match(/-eps-(\d+)/i);
      if (epNumMatch) targetEpNum = parseInt(epNumMatch[1], 10);
    }

    // 2. Extract parent series link from breadcrumbs
    const bBox = html.match(/<div[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (bBox) {
      const bLinks = [...bBox[1].matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
        .map(m => ({ url: m[1], text: m[2].replace(/<[^>]+>/g, '').trim() }))
        .filter(l => l.url !== 'https://animexin.dev/' && !l.url.endsWith('animexin.dev') && l.url.startsWith('https://animexin.dev/'));
      if (bLinks.length > 0) {
        parentSeriesUrl = bLinks[0].url;
      }
    }

    // 3. Fallback: check naveps / all episodes link
    if (!parentSeriesUrl) {
      const navepsMatch = html.match(/<div class="nvs nvsc"><a href=['"]([^'"]+)['"]/i) ||
                          html.match(/<a[^>]+aria-label=['"]All Episodes['"][^>]*href=['"]([^'"]+)['"]/i);
      if (navepsMatch && navepsMatch[1] && navepsMatch[1] !== 'https://animexin.dev/') {
        parentSeriesUrl = navepsMatch[1];
      }
    }

    // 4. If parent series URL exists and differs from current targetUrl, fetch parent series!
    if (parentSeriesUrl && parentSeriesUrl !== targetUrl && parentSeriesUrl !== 'https://animexin.dev/') {
      const seriesRes = await fetchAnimexin(parentSeriesUrl);
      if (seriesRes.status === 200 && seriesRes.body) {
        html = seriesRes.body;
        targetUrl = parentSeriesUrl;
      }
    }

    // Title
    const titleMatch = html.match(/<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i) ||
                       html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'Donghua Series';
    // Clean up episode suffix from title if it was an episode page
    title = title.replace(/\s+Episode\s+\d+.*$/i, '').replace(/\s+Eps\s+\d+.*$/i, '').trim();

    // Alt Title (Chinese romanization / 仙逆...)
    const altMatch = html.match(/class="alter">([\s\S]*?)<\/span>/i);
    const alt_title = altMatch ? altMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    // Cover
    const coverMatch = html.match(/class="thumb"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i) ||
                       html.match(/itemprop="image"[^>]+src="([^"]+)"/i);
    const cover = coverMatch ? coverMatch[1] : '';

    // Synopsis
    const synMatch = html.match(/itemprop="description"[^>]*>([\s\S]*?)<\/div>/i) ||
                     html.match(/class="entry-content"[^>]*>([\s\S]*?)<\/div>/i);
    let synopsis = synMatch ? synMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    // Meta details
    const statusMatch = html.match(/<b>Status:<\/b>\s*<span>([^<]+)<\/span>/i) || html.match(/Status:<\/span>\s*<span>([^<]+)<\/span>/i);
    const typeMatch = html.match(/<b>Type:<\/b>\s*<span>([^<]+)<\/span>/i);
    const studioMatch = html.match(/<b>Studio:<\/b>\s*<span><a[^>]*>([^<]+)<\/a>/i);
    const yearMatch = html.match(/<b>Released:<\/b>\s*<span>([^<]+)<\/span>/i) || html.match(/(\b202\d\b)/);

    // Genres
    const genreMatches = [...html.matchAll(/rel="tag">([^<]+)<\/a>/gi)]
      .map(m => m[1].trim())
      .filter(g => !g.toLowerCase().startsWith('anime ') && !g.toLowerCase().startsWith('download ') && !g.toLowerCase().startsWith('nonton '));

    // Episodes from eplister
    const episodes = [];
    const epBox = html.match(/class="eplister"[\s\S]*?<\/ul>/i);
    if (epBox) {
      const lis = [...epBox[0].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
      lis.forEach((m, idx) => {
        const text = m[1];
        const link = (text.match(/href="([^"]+)"/) || [])[1] || '';
        const numStr = (text.match(/class="epl-num">([^<]+)<\/div>/) || [])[1] || `${idx + 1}`;
        const epTitle = (text.match(/class="epl-title">([^<]+)<\/div>/) || [])[1] || `Episode ${numStr}`;
        const date = (text.match(/class="epl-date">([^<]+)<\/div>/) || [])[1] || '';
        const num = parseInt(numStr.replace(/[^\d]/g, ''), 10) || (idx + 1);
        if (link && link !== '/') {
          episodes.push({
            episode: num,
            episode_label: numStr.trim(),
            title: epTitle.trim(),
            url: link,
            date: date.trim()
          });
        }
      });
    }

    // Sort ascending so episode 1 is first
    episodes.sort((a, b) => a.episode - b.episode);

    // If still no episodes (single movie or standalone episode), add at least 1 entry
    if (episodes.length === 0) {
      episodes.push({
        episode: targetEpNum || 1,
        episode_label: targetEpNum ? `Ep ${targetEpNum}` : 'Full Movie',
        title: title,
        url: str.startsWith('http') ? str : targetUrl,
        date: ''
      });
    }

    // Extract ID
    const idMatch = targetUrl.match(/https?:\/\/[^\/]+\/(?:anime\/)?([^\/]+)\/?/);
    const id = idMatch ? idMatch[1] : targetUrl;

    const result = {
      id,
      title,
      alt_title,
      url: targetUrl,
      cover,
      synopsis,
      status: statusMatch ? statusMatch[1].trim() : 'Ongoing',
      type: typeMatch ? typeMatch[1].trim() : 'Donghua',
      studio: studioMatch ? studioMatch[1].trim() : '',
      year: yearMatch ? (yearMatch[1] || yearMatch[0]) : '2026',
      genres: [...new Set(genreMatches)].slice(0, 10),
      total_episodes: episodes.length,
      target_episode: targetEpNum || (episodes.length > 0 ? episodes[0].episode : 1),
      episodes
    };

    this._detailCache.set(cacheKey, { ts: Date.now(), data: result });
    return result;
  }

  /**
   * Get episode video streams and servers
   */
  async getEpisodeStream(epUrl) {
    if (!epUrl) throw new Error('Episode URL is required');

    const res = await fetchAnimexin(epUrl);
    if (res.status !== 200 || !res.body) {
      throw new Error(`Failed to load episode page (${res.status})`);
    }

    const html = res.body;
    const rawServers = [];

    // Parse mirrors from <select class="mirror">
    const selectMatch = html.match(/<select[^>]*class="mirror"[^>]*>([\s\S]*?)<\/select>/i);
    if (selectMatch) {
      const optionRegex = /<option\s+value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/gi;
      let opt;
      while ((opt = optionRegex.exec(selectMatch[1])) !== null) {
        const rawVal = opt[1].trim();
        const label = opt[2].replace(/<[^>]+>/g, '').trim();
        if (!rawVal) continue;

        let iframeHtml = '';
        try {
          iframeHtml = Buffer.from(rawVal, 'base64').toString('utf-8');
        } catch (_) {}

        const srcMatch = iframeHtml.match(/src="([^"]+)"/i);
        if (srcMatch) {
          let src = srcMatch[1];
          if (src.startsWith('//')) src = 'https:' + src;

          // Discard broken, unembeddable or spam servers
          const lower = src.toLowerCase();
          if (lower.includes('mega.nz') || lower.includes('d.tube') || lower.includes('playmogo') || lower.includes('seekplayer') || lower.includes('streamwish')) {
            continue;
          }

          let serverType = 'embed';
          let dmVideoId = null;

          if (lower.includes('dailymotion.com')) {
            serverType = 'dailymotion';
            const dmMatch = src.match(/video=([a-zA-Z0-9]+)/) || src.match(/\/video\/([a-zA-Z0-9]+)/);
            if (dmMatch) dmVideoId = dmMatch[1];
          } else if (lower.includes('ok.ru') || lower.includes('odnoklassniki')) {
            serverType = 'okru';
          } else if (lower.includes('rumble.com')) {
            serverType = 'rumble';
          } else if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
            serverType = 'youtube';
          } else if (lower.includes('odysee.com')) {
            serverType = 'odysee';
          }

          rawServers.push({
            name: label,
            server_type: serverType,
            embed_url: src,
            dm_video_id: dmVideoId
          });
        }
      }
    }

    // Direct iframe on the episode page (often Dailymotion)
    const directIframes = [...html.matchAll(/<iframe[^>]+src="([^"]+)"/gi)];
    for (const m of directIframes) {
      let src = m[1];
      if (src.startsWith('//')) src = 'https:' + src;
      const lower = src.toLowerCase();
      if (lower.includes('mega.nz') || lower.includes('d.tube') || lower.includes('playmogo') || lower.includes('seekplayer')) continue;
      let serverType = 'embed';
      let dmVideoId = null;
      if (lower.includes('dailymotion.com')) {
        serverType = 'dailymotion';
        const dmMatch = src.match(/video=([a-zA-Z0-9]+)/) || src.match(/\/video\/([a-zA-Z0-9]+)/);
        if (dmMatch) dmVideoId = dmMatch[1];
      } else if (lower.includes('ok.ru')) {
        serverType = 'okru';
      } else if (lower.includes('rumble.com')) {
        serverType = 'rumble';
      }
      // Only push if not already present
      if (!rawServers.some(s => s.embed_url === src || (dmVideoId && s.dm_video_id === dmVideoId))) {
        rawServers.unshift({
          name: 'Main Embed Stream',
          server_type: serverType,
          embed_url: src,
          dm_video_id: dmVideoId
        });
      }
    }

    // Filter, Rank & Label servers
    const dmList = rawServers.filter(s => s.server_type === 'dailymotion');
    const okruList = rawServers.filter(s => s.server_type === 'okru');
    const otherList = rawServers.filter(s => s.server_type !== 'dailymotion' && s.server_type !== 'okru');

    const cleanServers = [];

    // 1. Ok.ru servers - Top Priority (100% unblocked, seamless iframe embedding, zero CORS error)
    // Prioritize English Sub first, then Indo Sub, then any other Ok.ru
    const okruSorted = [...okruList].sort((a, b) => {
      const aEng = a.name.toLowerCase().includes('eng') ? 1 : 0;
      const bEng = b.name.toLowerCase().includes('eng') ? 1 : 0;
      if (aEng !== bEng) return bEng - aEng;
      const aIndo = a.name.toLowerCase().includes('indo') ? 1 : 0;
      const bIndo = b.name.toLowerCase().includes('indo') ? 1 : 0;
      return bIndo - aIndo;
    });

    okruSorted.forEach((s, idx) => {
      const isEng = s.name.toLowerCase().includes('eng');
      const isIndo = s.name.toLowerCase().includes('indo');
      let tag = isEng ? 'English Sub' : (isIndo ? 'Indo Sub' : (idx === 0 ? 'VIP' : 'HD'));
      cleanServers.push({
        ...s,
        display_label: `⚡ Ok.ru (${tag})`,
        is_okru: true,
        is_recommended: idx === 0
      });
    });

    // 2. Rumble, YouTube, Odysee (Embeddable backup streams)
    otherList.forEach((s) => {
      let lbl = 'Server Backup';
      if (s.server_type === 'rumble') lbl = '🥊 Rumble HD';
      else if (s.server_type === 'youtube') lbl = '🔴 YouTube HD';
      else if (s.server_type === 'odysee') lbl = '🌐 Odysee HD';
      cleanServers.push({
        ...s,
        display_label: lbl
      });
    });

    // 3. Dailymotion servers (as fallback)
    for (let idx = 0; idx < dmList.length; idx++) {
      const s = dmList[idx];
      let streamUrl = null;
      if (s.dm_video_id) {
        try {
          const { dailymotionDownloader } = require('./dailymotion_downloader.js');
          streamUrl = await dailymotionDownloader.getStreamUrl(s.dm_video_id);
        } catch (_) {}
      }
      cleanServers.push({
        ...s,
        stream_url: streamUrl,
        display_label: idx === 0 ? '⚡ Dailymotion FHD' : `⚡ Dailymotion ${idx + 1}`,
        is_dm: true
      });
    }

    // Default server:
    // 1. Ok.ru English or first Ok.ru (Tested rock-solid in Electron)
    // 2. First clean server
    const defaultServer = cleanServers.find(s => s.server_type === 'okru') ||
                          cleanServers[0] || null;

    return {
      ok: true,
      servers: cleanServers,
      default_server: defaultServer
    };
  }

  /**
   * Start downloading selected or all episodes of a Donghua series
   * Modes: 'separate' | 'merged' | 'both'
   */
  async startDownload({ anime_id, title, episodes, download_mode = 'separate', quality = 'original', cover = '' }) {
    if (!episodes || !episodes.length) {
      throw new Error('No episodes provided for download');
    }

    const taskId = `ax_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const outputDir = this.getAnimexinOutputDir();
    const safeTitle = sanitizeFilename(title || 'Animexin_Donghua');
    const seriesFolder = path.join(outputDir, safeTitle);

    if (!fs.existsSync(seriesFolder)) {
      try { fs.mkdirSync(seriesFolder, { recursive: true }); } catch (_) {}
    }

    const task = {
      task_id: taskId,
      platform: 'animexin',
      anime_id: anime_id || safeTitle,
      title: title || 'Animexin Donghua',
      cover: cover || '',
      total_episodes: episodes.length,
      completed_episodes: 0,
      current_episode_label: `ភាគ ${episodes[0].episode}`,
      download_mode: download_mode, // 'separate' | 'merged' | 'both'
      quality: quality,
      status: 'downloading', // 'downloading' | 'completed' | 'error' | 'canceled'
      progress_pct: 0,
      speed_str: '0 KB/s',
      eta_str: 'Calculating...',
      series_folder: seriesFolder,
      downloaded_files: [],
      created_at: new Date().toISOString()
    };

    this.tasks.set(taskId, task);

    // Save poster image and series metadata
    if (cover) {
      downloadAndSaveCover(cover, seriesFolder, safeTitle).catch(() => {});
    }
    saveSeriesMetadata(seriesFolder, {
      series_id: anime_id || safeTitle,
      platform: 'animexin',
      title: task.title,
      cover: cover || '',
      total_episodes: episodes.length
    });
    libraryManager.registerSeries(anime_id || safeTitle, task.title, cover || '', episodes.length, 'all', 'animexin').catch(() => {});

    // Register with global library manager
    try {
      libraryManager.addTask({
        id: taskId,
        task_id: taskId,
        platform: 'animexin',
        title: task.title,
        cover: cover || '',
        status: 'downloading',
        progress_pct: 0,
        output_dir: seriesFolder
      });
    } catch (_) {}

    // Run async queue
    this._processDownloadQueue(task, episodes);

    return { ok: true, task };
  }

  async _processDownloadQueue(task, episodes) {
    const ytDlpPath = findYtDlp();
    const ffmpegPath = findFfmpeg();

    for (let i = 0; i < episodes.length; i++) {
      if (task.status === 'canceled') break;

      const ep = episodes[i];
      task.current_episode_label = `ភាគ ${ep.episode || (i + 1)} (${i + 1}/${episodes.length})`;

      try {
        const streamData = await this.getEpisodeStream(ep.url);
        const servers = streamData.servers || [];
        if (servers.length === 0) {
          throw new Error(`រកមិនឃើញ Server សម្រាប់ភាគ ${ep.episode} ទេ`);
        }

        // Build list of candidate mirrors to attempt in order
        const candidates = [];

        // 1. Direct Dailymotion HLS stream URL (fastest direct CDN delivery)
        for (const s of servers) {
          if (s.stream_url) {
            candidates.push({ url: s.stream_url, label: s.display_label || 'Dailymotion Direct FHD' });
          }
        }

        // 2. Dailymotion video URLs
        for (const s of servers) {
          if (s.dm_video_id) {
            candidates.push({ url: `https://www.dailymotion.com/video/${s.dm_video_id}`, label: 'Dailymotion' });
          }
        }

        // 3. Rumble servers (very reliable, unblocked)
        for (const s of servers) {
          if (s.server_type === 'rumble' && s.embed_url) {
            candidates.push({ url: s.embed_url, label: 'Rumble' });
          }
        }

        // 4. YouTube servers (very reliable, unblocked)
        for (const s of servers) {
          if (s.server_type === 'youtube' && s.embed_url) {
            candidates.push({ url: s.embed_url, label: 'YouTube' });
          }
        }

        // 5. Odysee servers
        for (const s of servers) {
          if (s.server_type === 'odysee' && s.embed_url) {
            candidates.push({ url: s.embed_url, label: 'Odysee' });
          }
        }

        // 6. Ok.ru servers (fallback)
        for (const s of servers) {
          if (s.server_type === 'okru' && s.embed_url) {
            candidates.push({ url: s.embed_url, label: 'Ok.ru' });
          }
        }

        // 7. Any remaining embed URLs
        for (const s of servers) {
          if (s.embed_url && !candidates.some(c => c.url === s.embed_url)) {
            candidates.push({ url: s.embed_url, label: s.name || 'Embed Backup' });
          }
        }

        const epNumStr = String(ep.episode || (i + 1)).padStart(3, '0');
        const epFileName = `EP${epNumStr}.mp4`;
        const epFilePath = path.join(task.series_folder, epFileName);

        let epSuccess = false;
        let lastErr = null;

        // Try candidate mirrors sequentially until one succeeds!
        for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
          if (task.status === 'canceled') break;
          const cand = candidates[cIdx];
          try {
            task.current_episode_label = `ភាគ ${ep.episode || (i + 1)} (${cand.label})`;
            await this._downloadSingleEpisodeWithYtDlp(task, cand.url, epFilePath, ytDlpPath, i, episodes.length);
            if (fs.existsSync(epFilePath) && fs.statSync(epFilePath).size > 1000000) {
              epSuccess = true;
              break;
            }
          } catch (candErr) {
            lastErr = candErr;
            console.warn(`[Animexin Downloader] Ep ${ep.episode} [${cand.label}] failed: ${candErr.message}. Trying next mirror...`);
            try { if (fs.existsSync(epFilePath)) fs.unlinkSync(epFilePath); } catch (_) {}
            const partFile = `${epFilePath}.part`;
            try { if (fs.existsSync(partFile)) fs.unlinkSync(partFile); } catch (_) {}
          }
        }

        if (epSuccess && fs.existsSync(epFilePath)) {
          task.downloaded_files.push(epFilePath);
          task.completed_episodes = i + 1;
          task.progress_pct = Math.round(((i + 1) / episodes.length) * 100);
          try {
            libraryManager.updateTask(task.task_id, {
              progress_pct: task.progress_pct,
              status: 'downloading'
            });
          } catch (_) {}
        } else {
          console.error(`[Animexin Downloader] Ep ${ep.episode} failed across all ${candidates.length} mirrors:`, lastErr ? lastErr.message : 'Unknown error');
        }
      } catch (epErr) {
        console.warn(`[Animexin Downloader] Ep ${ep.episode} stream error:`, epErr.message);
      }
    }

    if (task.status === 'canceled') return;

    if (task.downloaded_files.length === 0) {
      task.status = 'error';
      task.error = 'មិនអាចទាញយកភាគណាមួយបានទេ (All episodes failed to download)';
      return;
    }

    // Merge episodes if requested (Rule 14)
    if (task.download_mode === 'merged' || task.download_mode === 'both') {
      try {
        task.current_episode_label = '⚡ កំពុងបញ្ចូលវីដេអូពេញ (Merging Full Movie)...';
        const mergedFileName = `${sanitizeFilename(task.title)}_Full.mp4`;
        const mergedFilePath = path.join(task.series_folder, mergedFileName);

        await mergeDramaEpisodes(task.downloaded_files, mergedFilePath, ffmpegPath);

        // Rule 14: If merged mode, clean up separate episode files!
        if (task.download_mode === 'merged' && fs.existsSync(mergedFilePath)) {
          for (const f of task.downloaded_files) {
            try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
          }
          task.downloaded_files = [mergedFilePath];
        } else if (task.download_mode === 'both' && fs.existsSync(mergedFilePath)) {
          task.downloaded_files.push(mergedFilePath);
        }
      } catch (mergeErr) {
        console.warn('[Animexin Downloader] Merge error:', mergeErr.message);
      }
    }

    task.status = 'completed';
    task.progress_pct = 100;
    task.speed_str = '';
    task.eta_str = 'Done';
    task.current_episode_label = `✓ បានបញ្ចប់ ${task.completed_episodes} ភាគ`;

    try {
      libraryManager.markCompleted(task.task_id);
    } catch (_) {}
  }

  _downloadSingleEpisodeWithYtDlp(task, url, outPath, ytDlpPath, epIndex = 0, totalEpisodes = 1) {
    return new Promise((resolve, reject) => {
      const args = [
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '-N', '16',
        '--concurrent-fragments', '16',
        '--buffer-size', '16M',
        '--http-chunk-size', '10M',
        '--socket-timeout', '15',
        '--no-playlist',
        '--retries', '10',
        '--fragment-retries', '10',
        '--no-check-certificates',
        '--no-warnings',
        '-o', outPath,
        url
      ];

      const proc = spawn(ytDlpPath, args);
      this.activeProcesses.set(task.task_id, proc);

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        const speedMatch = text.match(/at\s+([0-9.]+[kKMmGg][iI]?[bB]\/s)/);
        if (speedMatch) task.speed_str = speedMatch[1];
        const etaMatch = text.match(/ETA\s+([0-9:]+)/);
        if (etaMatch) task.eta_str = etaMatch[1];

        const pctMatch = text.match(/([0-9.]+)%/);
        if (pctMatch) {
          const subPct = parseFloat(pctMatch[1]);
          const basePct = (epIndex / totalEpisodes) * 100;
          const chunkPct = (subPct / 100) * (100 / totalEpisodes);
          task.progress_pct = Math.min(99, Math.round(basePct + chunkPct));
          try {
            libraryManager.updateTask(task.task_id, {
              progress_pct: task.progress_pct,
              status: 'downloading'
            });
          } catch (_) {}
        }
      });

      proc.on('close', (code) => {
        this.activeProcesses.delete(task.task_id);
        if (code === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 100000) {
          resolve();
        } else {
          // If code != 0, still check if file exists and has size > 1MB
          if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000000) {
            resolve();
          } else {
            reject(new Error(`yt-dlp exited with code ${code}`));
          }
        }
      });

      proc.on('error', (err) => {
        this.activeProcesses.delete(task.task_id);
        reject(err);
      });
    });
  }

  cancelTask(taskId) {
    if (!taskId || taskId === 'all') {
      for (const [id, t] of this.tasks.entries()) {
        if (t.status === 'downloading' || t.status === 'queued') {
          t.status = 'canceled';
          if (this.activeProcesses.has(id)) {
            try { this.activeProcesses.get(id).kill('SIGKILL'); } catch (_) {}
            this.activeProcesses.delete(id);
          }
        }
      }
      return { success: true };
    }

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

  clearFinishedTasks() {
    for (const [id, t] of this.tasks.entries()) {
      if (t.status === 'completed' || t.status === 'error' || t.status === 'canceled') {
        this.tasks.delete(id);
      }
    }
    return { success: true };
  }

  getTasks() {
    return Array.from(this.tasks.values()).reverse();
  }
}

const animexinDownloader = new AnimexinDownloader();

module.exports = {
  animexinDownloader
};
