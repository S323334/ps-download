/**
 * HaoSou (1DFX.com / dj.1dfx.com) Short Drama Service & Downloader Engine.
 * Supports hot recommendations, drama search, episode metadata parsing,
 * fast HLS .m3u8 downloading with ffmpeg/yt-dlp, and real-time task tracking.
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getOutputDir } = require('./config.js');
const { mergeDramaEpisodes } = require('./video_merger.js');
const { libraryManager } = require('./library_manager.js');

function sanitizeFilename(name) {
  const cleaned = String(name || '').replace(/[\\/*?:"<>|\r\n\t]/g, '_').trim();
  return cleaned.slice(0, 80) || 'HaoSou_Drama';
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

class HaoSouDownloader {
  constructor() {
    this.tasks = new Map(); // taskId -> task object
    this.activeProcesses = new Map(); // taskId -> childProcess
  }

  getHaoSouOutputDir() {
    const root = getOutputDir();
    const hsDir = path.join(root, 'HaoSou');
    if (!fs.existsSync(hsDir)) {
      try { fs.mkdirSync(hsDir, { recursive: true }); } catch (e) {}
    }
    return hsDir;
  }

  /**
   * Fetch hot recommendations & rich category feeds from https://dj.1dfx.com/v/
   * Supports 'all', 'modern', 'ceo', 'action', 'rebirth', 'romance', 'historical'
   */
  async getRecommendations(category = 'all') {
    const cat = String(category || 'all').toLowerCase();
    const cacheKey = `recs_${cat}`;
    if (this._recsCache && this._recsCache.has(cacheKey)) {
      const cached = this._recsCache.get(cacheKey);
      if (Date.now() - cached.ts < 5 * 60 * 1000) {
        return cached.data;
      }
    }

    try {
      const seen = new Set();
      const allCards = [];

      const addCard = (id, cover, title, remarks) => {
        const idStr = String(id || '').trim();
        if (!idStr || seen.has(idStr)) return;
        seen.add(idStr);
        allCards.push({
          id: idStr,
          cover: cover || '/uploads/image/20250311/5754a9f551b45a5f36800c0212460d0a.png',
          title: (title || '').trim() || 'Short Drama',
          remarks: (remarks || '').trim() || '全集'
        });
      };

      // 1. If 'all', load official hot recommendations
      if (cat === 'all') {
        try {
          const res = await fetch('https://dj.1dfx.com/v/', {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
              'Referer': 'https://dj.1dfx.com/'
            },
            signal: AbortSignal.timeout(6000)
          });
          if (res.ok) {
            const html = await res.text();
            const recSectionMatch = html.match(/<section id="recommendations-section"[\s\S]*?<\/section>/i);
            if (recSectionMatch) {
              const regex = /<a\s+href="\/v\/newlist\.php\?book_id=(\d+)"[^>]*>[\s\S]*?<img\s+src="([^"]+)"[^>]*alt="([^"]*)"[\s\S]*?(?:<span[^>]*class="[^"]*rounded-full[^"]*"[^>]*>([^<]*)<\/span>)?[\s\S]*?<h3[^>]*title="([^"]+)"/gi;
              let match;
              while ((match = regex.exec(recSectionMatch[0])) !== null) {
                addCard(match[1], match[2], match[5] || match[3], match[4]);
              }
            }
          }
        } catch (e) {}
      }

      // 2. Determine keyword groups to expand catalog
      const catKeywordsMap = {
        all: ['都市', '总裁', '战神', '重生', '逆袭', '豪门'],
        modern: ['都市', '现代', '职场'],
        ceo: ['总裁', '霸总', '豪门', '千金'],
        action: ['战神', '逆袭', '至尊', '狂龙'],
        rebirth: ['重生', '神豪', '系统'],
        romance: ['甜宠', '虐恋', '婚后', '偏爱'],
        historical: ['古装', '穿越', '王爷', '娘娘']
      };

      const keywords = catKeywordsMap[cat] || [cat];
      const searchTasks = keywords.map(async (kw) => {
        try {
          const sRes = await fetch(`https://dj.1dfx.com/v/?action=search&wd=${encodeURIComponent(kw)}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://dj.1dfx.com/v/'
            },
            signal: AbortSignal.timeout(6000)
          });
          if (sRes.ok) {
            const json = await sRes.json();
            if (json && Array.isArray(json.data)) {
              return json.data;
            }
          }
        } catch (e) {}
        return [];
      });

      const batchResults = await Promise.all(searchTasks);
      for (const list of batchResults) {
        for (const it of list) {
          addCard(it.id, it.cover, it.title, it.remarks);
        }
      }

      if (!this._recsCache) this._recsCache = new Map();
      this._recsCache.set(cacheKey, { ts: Date.now(), data: allCards });
      return allCards;
    } catch (err) {
      console.error('[HaoSou] Recommendations error:', err.message);
      return [];
    }
  }

  /**
   * Search short dramas by keyword via https://dj.1dfx.com/v/?action=search&wd=...
   */
  async search(keyword) {
    const kw = (keyword || '').trim();
    if (!kw) return [];

    try {
      const res = await fetch(`https://dj.1dfx.com/v/?action=search&wd=${encodeURIComponent(kw)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Referer': 'https://dj.1dfx.com/v/'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json && json.success && Array.isArray(json.data)) {
        return json.data.map(item => ({
          id: String(item.id),
          title: item.title || 'Short Drama',
          cover: item.cover || '',
          remarks: item.remarks || '全集'
        }));
      }
      return [];
    } catch (err) {
      console.error('[HaoSou] Search error:', err.message);
      return [];
    }
  }

  /**
   * Parse drama details and episode playlist
   */
  async getDetail(input) {
    let bookId = '';
    const str = String(input || '').trim();

    // Check if full URL or raw ID
    const urlMatch = str.match(/book_id=(\d+)/i) || str.match(/\/(\d+)\.html/i);
    if (urlMatch) {
      bookId = urlMatch[1];
    } else if (/^\d+$/.test(str)) {
      bookId = str;
    } else {
      // Search drama by keyword if user pasted a title
      const searchResults = await this.search(str);
      if (searchResults && searchResults.length > 0) {
        bookId = searchResults[0].id;
      }
    }

    if (!bookId) {
      throw new Error('រកមិនឃើញ ID រឿង ឬលីងមិនត្រឹមត្រូវ (Cannot find valid drama ID or link)');
    }

    const res = await fetch(`https://dj.1dfx.com/v/newlist.php?book_id=${bookId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Referer': 'https://dj.1dfx.com/v/'
      }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const titleMatch = html.match(/<h1[^>]*id="video-title"[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    if (!title || title === '加載中...') {
      throw new Error('រឿងនេះមិនទាន់មានទិន្នន័យចាក់វីដេអូទេ (Drama not found or unavailable in player)');
    }

    const coverMatch = html.match(/<img[^>]*id="video-cover"[^>]*src="([^"]+)"/i) || html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    const cover = coverMatch ? coverMatch[1].trim() : '';

    const descMatch = html.match(/<p[^>]*id="video-desc"[^>]*>([\s\S]*?)<\/p>/i);
    const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    const tagMatches = [...html.matchAll(/<span[^>]*class="tag-pill"[^>]*>([\s\S]*?)<\/span>/gi)];
    const tags = tagMatches.map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);

    // Episodes
    const episodes = [];
    const epRegex = /data-episode="(\d+)"[^>]*data-url="([^"]+)"/gi;
    let epMatch;
    while ((epMatch = epRegex.exec(html)) !== null) {
      episodes.push({
        episode: parseInt(epMatch[1], 10),
        label: `第${epMatch[1]}集`,
        url: epMatch[2]
      });
    }

    return {
      id: String(bookId),
      title,
      cover,
      desc: desc === '簡介加載中...' ? '好搜短劇屋精品熱門短劇' : desc,
      tags,
      total_episodes: episodes.length,
      episodes
    };
  }

  /**
   * Start batch downloading episodes of a HaoSou drama
   */
  async startDownload({ book_id, title, episodes = [], customDir = null, range = 'all', download_mode = 'separate' }) {
    if (!episodes || episodes.length === 0) {
      throw new Error('គ្មានភាគសម្រាប់ទាញយកទេ (No episodes selected to download)');
    }

    const safeTitle = sanitizeFilename(title || `HaoSou_${book_id}`);
    const rootDir = customDir && fs.existsSync(customDir) ? customDir : this.getHaoSouOutputDir();
    const dramaDir = path.join(rootDir, safeTitle);
    if (!fs.existsSync(dramaDir)) {
      try { fs.mkdirSync(dramaDir, { recursive: true }); } catch (e) {}
    }

    const taskId = `haosou_${book_id}_${Date.now()}`;
    const task = {
      task_id: taskId,
      book_id: String(book_id),
      title: title || 'HaoSou Drama',
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
        series_id: String(book_id),
        platform: 'haosou',
        title: title || 'HaoSou Drama',
        cover: '',
        episode_cnt: episodes.length,
        saved_at: new Date().toISOString()
      };
      fs.writeFileSync(path.join(dramaDir, '.series.json'), JSON.stringify(meta, null, 2), 'utf-8');
    } catch (e) {}

    libraryManager.registerSeries(book_id, title, '', episodes.length, range || 'all', 'haosou').catch(() => {});

    this.tasks.set(taskId, task);

    // Run async batch download loop in background
    this._runDownloadQueue(taskId).catch(err => {
      console.error(`[HaoSou Download Error] Task ${taskId}:`, err.message);
      task.status = 'error';
      task.error_message = err.message;
    });

    return task;
  }

  async _runDownloadQueue(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const ffmpegPath = findFfmpeg();

    for (let i = 0; i < task.episodes.length; i++) {
      if (task.status === 'canceled') break;

      const ep = task.episodes[i];
      task.current_episode = ep.episode;
      task.current_episode_label = ep.label || `Episode ${ep.episode}`;
      task.progress_pct = Math.round((i / task.episodes.length) * 100);

      const epFileName = `${sanitizeFilename(task.title)}_E${String(ep.episode).padStart(2, '0')}.mp4`;
      const epFilePath = path.join(task.drama_dir, epFileName);

      // Skip already downloaded files
      if (fs.existsSync(epFilePath) && fs.statSync(epFilePath).size > 10240) {
        task.completed_episodes++;
        libraryManager.updateProgress(task.book_id, task.completed_episodes, task.total_episodes, task.progress_pct);
        continue;
      }

      await this._downloadEpisodeM3u8(taskId, ep.url, epFilePath, ffmpegPath);
      if (task.status === 'canceled') break;
      task.completed_episodes++;
      libraryManager.updateProgress(task.book_id, task.completed_episodes, task.total_episodes, task.progress_pct);
    }

    if (task.status !== 'canceled') {
      if (task.download_mode === 'merged' || task.download_mode === 'both') {
        task.status = 'merging';
        await mergeDramaEpisodes({
          dramaDir: task.drama_dir,
          seriesTitle: task.title,
          mode: task.download_mode,
          onLog: (msg) => console.log(`[HaoSou] ${msg}`)
        });
      }
      task.status = 'completed';
      task.progress_pct = 100;
      libraryManager.markCompleted(task.book_id);
    }
  }

  _downloadEpisodeM3u8(taskId, m3u8Url, outPath, ffmpegPath) {
    return new Promise((resolve) => {
      const task = this.tasks.get(taskId);
      if (!task || task.status === 'canceled') return resolve();

      const tmpOut = outPath + '.tmp.mp4';
      const args = [
        '-y',
        '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\nReferer: https://dj.1dfx.com/\r\n',
        '-i', m3u8Url,
        '-c', 'copy',
        '-bsf:a', 'aac_adtstoasc',
        tmpOut
      ];

      const proc = spawn(ffmpegPath, args);
      this.activeProcesses.set(taskId, proc);

      proc.on('close', (code) => {
        this.activeProcesses.delete(taskId);
        if (code === 0 && fs.existsSync(tmpOut) && fs.statSync(tmpOut).size > 1024) {
          try {
            if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
            fs.renameSync(tmpOut, outPath);
          } catch (e) {}
        } else if (fs.existsSync(tmpOut)) {
          try { fs.unlinkSync(tmpOut); } catch (e) {}
        }
        resolve();
      });

      proc.on('error', (err) => {
        this.activeProcesses.delete(taskId);
        if (fs.existsSync(tmpOut)) {
          try { fs.unlinkSync(tmpOut); } catch (e) {}
        }
        resolve();
      });
    });
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

  getTasks() {
    return Array.from(this.tasks.values()).reverse();
  }

  clearFinished() {
    for (const [id, t] of this.tasks.entries()) {
      if (t.status === 'completed' || t.status === 'error' || t.status === 'canceled') {
        this.tasks.delete(id);
      }
    }
    return this.getTasks();
  }
}

const haosouDownloader = new HaoSouDownloader();

module.exports = {
  HaoSouDownloader,
  haosouDownloader
};
