/**
 * Beeplaylet (beeplaylet.com) Short Drama Service & Downloader Engine.
 * Supports hot recommendations, latest dramas, ranking list, drama search,
 * episode metadata parsing, fast HLS .m3u8 downloading with ffmpeg, and real-time task tracking.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getOutputDir } = require('./config.js');
const { mergeDramaEpisodes } = require('./video_merger.js');
const { libraryManager, downloadAndSaveCover, saveSeriesMetadata } = require('./library_manager.js');

const BEEPLAYLET_BASE = 'https://beeplaylet.com';
const BEEPLAYLET_CDN = 'https://cdn.17video.net';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://beeplaylet.com/',
  'Accept': 'application/json'
};

function sanitizeFilename(name) {
  const cleaned = String(name || '').replace(/[\\/*?:"<>|\r\n\t]/g, '_').trim();
  return cleaned.slice(0, 80) || 'Beeplaylet_Drama';
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

class BeeplayletDownloader {
  constructor() {
    this.tasks = new Map(); // taskId -> task object
    this.activeProcesses = new Map(); // taskId -> childProcess
    this._recsCache = new Map();
  }

  getBeeplayletOutputDir() {
    const root = getOutputDir();
    const bpDir = path.join(root, 'Beeplaylet');
    if (!fs.existsSync(bpDir)) {
      try { fs.mkdirSync(bpDir, { recursive: true }); } catch (e) {}
    }
    return bpDir;
  }

  formatCover(pathOrUrl) {
    if (!pathOrUrl) return '';
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
    return `${BEEPLAYLET_CDN}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
  }

  /**
   * Fetch recommendations & categorized feeds from beeplaylet.com
   * Categories: 'hot', 'latest', 'ranking', 'free'
   */
  async getRecommendations(category = 'hot') {
    const cat = String(category || 'hot').toLowerCase();
    const cacheKey = `recs_${cat}`;
    if (this._recsCache.has(cacheKey)) {
      const cached = this._recsCache.get(cacheKey);
      if (Date.now() - cached.ts < 5 * 60 * 1000) {
        return cached.data;
      }
    }

    try {
      let items = [];

      if (cat === 'hot' || cat === 'all') {
        const res = await fetch(`${BEEPLAYLET_BASE}/api/Playlet/HomeData`, {
          headers: DEFAULT_HEADERS,
          signal: AbortSignal.timeout(8000)
        });
        if (res.ok) {
          const json = await res.json();
          if (json.code === 0 && json.data) {
            const hot = Array.isArray(json.data.hotList) ? json.data.hotList : [];
            const latest = Array.isArray(json.data.latestList) ? json.data.latestList : [];
            const vip = Array.isArray(json.data.vipShowList) ? json.data.vipShowList : [];
            const combined = [...hot, ...latest, ...vip];
            const seen = new Set();
            for (const item of combined) {
              const id = String(item.id || item.playletId || '');
              if (!id || seen.has(id) || !item.name) continue;
              seen.add(id);
              items.push({
                id,
                title: item.name || 'Beeplaylet Drama',
                cover: this.formatCover(item.verticalCover || item.targetCover),
                desc: item.desc || '',
                seriesCount: item.seriesCount || 0,
                playCount: item.playCount || 0,
                remarks: `${item.seriesCount || 0} ភាគ`,
                platform: 'beeplaylet'
              });
            }
          }
        }
      } else if (cat === 'latest') {
        const res = await fetch(`${BEEPLAYLET_BASE}/api/Playlet/Latest`, {
          headers: DEFAULT_HEADERS,
          signal: AbortSignal.timeout(8000)
        });
        if (res.ok) {
          const json = await res.json();
          if (json.code === 0 && json.data) {
            const list = Array.isArray(json.data.data) ? json.data.data : (Array.isArray(json.data) ? json.data : []);
            for (const item of list) {
              items.push({
                id: String(item.id || item.playletId),
                title: item.name || 'Beeplaylet Drama',
                cover: this.formatCover(item.verticalCover || item.targetCover),
                desc: item.desc || '',
                seriesCount: item.seriesCount || 0,
                playCount: item.playCount || 0,
                remarks: `${item.seriesCount || 0} ភាគ`,
                platform: 'beeplaylet'
              });
            }
          }
        }
      } else if (cat === 'ranking') {
        const res = await fetch(`${BEEPLAYLET_BASE}/api/Playlet/RankingList`, {
          headers: DEFAULT_HEADERS,
          signal: AbortSignal.timeout(8000)
        });
        if (res.ok) {
          const json = await res.json();
          if (json.code === 0 && json.data) {
            const list = Array.isArray(json.data.data) ? json.data.data : (Array.isArray(json.data) ? json.data : []);
            for (const item of list) {
              items.push({
                id: String(item.id || item.playletId),
                title: item.name || 'Beeplaylet Drama',
                cover: this.formatCover(item.verticalCover || item.targetCover),
                desc: item.desc || '',
                seriesCount: item.seriesCount || 0,
                playCount: item.playCount || 0,
                remarks: `${item.seriesCount || 0} ភាគ`,
                platform: 'beeplaylet'
              });
            }
          }
        }
      } else if (cat === 'free') {
        const res = await fetch(`${BEEPLAYLET_BASE}/api/Playlet/FreeList`, {
          headers: DEFAULT_HEADERS,
          signal: AbortSignal.timeout(8000)
        });
        if (res.ok) {
          const json = await res.json();
          if (json.code === 0 && json.data) {
            const list = Array.isArray(json.data.data) ? json.data.data : (Array.isArray(json.data) ? json.data : []);
            for (const item of list) {
              items.push({
                id: String(item.id || item.playletId),
                title: item.name || 'Beeplaylet Drama',
                cover: this.formatCover(item.verticalCover || item.targetCover),
                desc: item.desc || '',
                seriesCount: item.seriesCount || 0,
                playCount: item.playCount || 0,
                remarks: `${item.seriesCount || 0} ភាគ`,
                platform: 'beeplaylet'
              });
            }
          }
        }
      }

      this._recsCache.set(cacheKey, { ts: Date.now(), data: items });
      return items;
    } catch (e) {
      console.warn(`[Beeplaylet] Recommendations error for cat ${cat}:`, e.message);
      return [];
    }
  }

  /**
   * Search Beeplaylet dramas by keyword
   */
  async search(query) {
    const q = String(query || '').trim();
    if (!q) return [];

    try {
      const res = await fetch(`${BEEPLAYLET_BASE}/api/Playlet/Search?query=${encodeURIComponent(q)}&offset=0&count=25`, {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return [];
      const json = await res.json();
      if (json.code !== 0 || !json.data) return [];

      const list = Array.isArray(json.data.data) ? json.data.data : [];
      return list.map(item => ({
        id: String(item.id || item.playletId),
        title: item.name || 'Beeplaylet Drama',
        cover: this.formatCover(item.verticalCover || item.targetCover),
        desc: item.desc || '',
        seriesCount: item.seriesCount || 0,
        playCount: item.playCount || 0,
        remarks: `${item.seriesCount || 0} ភាគ`,
        platform: 'beeplaylet'
      }));
    } catch (e) {
      console.warn('[Beeplaylet] Search error:', e.message);
      return [];
    }
  }

  /**
   * Extract drama ID from URL or input
   */
  extractDramaId(input) {
    if (!input) return null;
    const str = String(input).trim();
    if (/^\d+$/.test(str)) return str;

    const urlMatch = str.match(/PlayletPlay\/(\d+)/i) ||
                     str.match(/\/playlet\/(\d+)/i) ||
                     str.match(/[?&]id=(\d+)/i) ||
                     str.match(/\/(\d+)(?:\.html|\/|$)/);
    if (urlMatch) return urlMatch[1];
    return null;
  }

  /**
   * Get full drama details and all episode stream URLs
   */
  async getDetail(query) {
    let dramaId = this.extractDramaId(query);

    if (!dramaId) {
      // Try searching for the query title first
      const searchResults = await this.search(query);
      if (searchResults && searchResults.length > 0) {
        dramaId = searchResults[0].id;
      }
    }

    if (!dramaId) {
      throw new Error('រកមិនឃើញ ID រឿង ឬលីងមិនត្រឹមត្រូវ (Cannot find valid drama ID or link)');
    }

    const res = await fetch(`${BEEPLAYLET_BASE}/api/Playlet/PlayletPlay/${dramaId}`, {
      headers: DEFAULT_HEADERS,
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.code !== 0 || !json.data) {
      throw new Error(json.msg || 'រឿងនេះមិនទាន់មានទិន្នន័យចាក់វីដេអូទេ (Drama unavailable)');
    }

    const playlet = json.data.currentPlaylet || {};
    const rawVideos = Array.isArray(json.data.videos) ? json.data.videos : [];

    const title = playlet.name || `Beeplaylet Drama ${dramaId}`;
    const cover = this.formatCover(playlet.verticalCover || playlet.targetCover);
    const desc = playlet.desc || '蜜蜂劇場精品熱門短劇 (Beeplaylet Short Drama)';

    const episodes = rawVideos.map((v, idx) => {
      const epNum = v.seriesNumber || (idx + 1);
      let m3u8Url = v.url ? (v.url.startsWith('http') ? v.url : `${BEEPLAYLET_CDN}${v.url.startsWith('/') ? '' : '/'}${v.url}`) : '';
      if (m3u8Url && /\.mp4(\?.*)?$/i.test(m3u8Url)) {
        // Beeplaylet CDN stores streams as HLS (.m3u8). Raw .mp4 returns 404 Not Found.
        m3u8Url = m3u8Url.replace(/\.mp4(\?.*)?$/i, '.m3u8$1');
      }
      return {
        id: v.id,
        episode: epNum,
        label: v.seriesName || `第${epNum}集`,
        url: m3u8Url,
        duration: v.duration || 0
      };
    }).filter(ep => Boolean(ep.url));

    return {
      id: String(dramaId),
      title,
      cover,
      desc,
      total_episodes: episodes.length,
      episodes,
      platform: 'beeplaylet'
    };
  }

  /**
   * Start batch downloading episodes of a Beeplaylet drama
   */
  async startDownload({ drama_id, title, episodes = [], customDir = null, range = 'all', download_mode = 'merged', quality = 'original', fps = null, target_height = null, cover = '' }) {
    if (!episodes || episodes.length === 0) {
      throw new Error('គ្មានភាគសម្រាប់ទាញយកទេ (No episodes selected to download)');
    }

    const safeTitle = sanitizeFilename(title || `Beeplaylet_${drama_id}`);
    const rootDir = customDir && fs.existsSync(customDir) ? customDir : this.getBeeplayletOutputDir();
    const dramaDir = path.join(rootDir, safeTitle);
    if (!fs.existsSync(dramaDir)) {
      try { fs.mkdirSync(dramaDir, { recursive: true }); } catch (e) {}
    }

    const taskId = `beeplaylet_${drama_id}_${Date.now()}`;
    const task = {
      task_id: taskId,
      drama_id: String(drama_id),
      title: title || 'Beeplaylet Drama',
      cover: cover || '',
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
      download_mode: download_mode || 'merged',
      quality: quality || 'original',
      fps: fps ? parseInt(fps, 10) : null,
      target_height: target_height ? parseInt(target_height, 10) : (quality && parseInt(quality, 10) ? parseInt(quality, 10) : null)
    };

    // Save poster image and metadata for offline library & drawer
    if (cover) {
      downloadAndSaveCover(cover, dramaDir, safeTitle).catch(() => {});
    }
    saveSeriesMetadata(dramaDir, {
      series_id: String(drama_id),
      platform: 'beeplaylet',
      title: title || 'Beeplaylet Drama',
      cover: cover || '',
      total_episodes: episodes.length
    });

    libraryManager.registerSeries(drama_id, title, cover || '', episodes.length, range || 'all', 'beeplaylet').catch(() => {});

    this.tasks.set(taskId, task);

    // Run async batch download loop in background
    this._runDownloadQueue(taskId).catch(err => {
      console.error(`[Beeplaylet Download Error] Task ${taskId}:`, err.message);
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
        libraryManager.updateProgress(task.drama_id, task.completed_episodes, task.total_episodes, task.progress_pct);
        continue;
      }

      await this._downloadEpisodeM3u8(taskId, ep.url, epFilePath, ffmpegPath);
      if (task.status === 'canceled') break;
      task.completed_episodes++;
      libraryManager.updateProgress(task.drama_id, task.completed_episodes, task.total_episodes, task.progress_pct);
    }

    if (task.status !== 'canceled') {
      task.status = 'completed';
      task.progress_pct = 100;
      libraryManager.markCompleted(task.drama_id);

      // Mode handling (Rule 14: merged mode cleans up separate files)
      if (task.download_mode !== 'separate') {
        mergeDramaEpisodes({
          dramaDir: task.drama_dir,
          seriesTitle: task.title,
          mode: task.download_mode === 'both' ? 'both' : 'merged',
          episodes: task.episodes,
          onLog: (msg) => console.log(`[Beeplaylet] ${msg}`)
        }).catch(err => console.warn(`[Beeplaylet] Merge notice: ${err.message}`));
      }
    }
  }

  _downloadEpisodeM3u8(taskId, m3u8Url, outPath, ffmpegPath) {
    return new Promise((resolve) => {
      const task = this.tasks.get(taskId);
      if (!task || task.status === 'canceled') return resolve();

      let streamUrl = m3u8Url;
      if (streamUrl && /\.mp4(\?.*)?$/i.test(streamUrl)) {
        streamUrl = streamUrl.replace(/\.mp4(\?.*)?$/i, '.m3u8$1');
      }

      const tmpOut = outPath + '.tmp.mp4';

      const filterArgs = [];
      const targetHeight = task.target_height;
      if (targetHeight && targetHeight < 1080) {
        filterArgs.push(`scale='if(gt(iw,ih),-2,${targetHeight})':'if(gt(iw,ih),${targetHeight},-2)'`);
      }
      if (task.fps && [24, 30, 60].includes(Number(task.fps))) {
        filterArgs.push(`fps=${task.fps}`);
      }

      let args;
      if (filterArgs.length > 0) {
        args = [
          '-y',
          '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\nReferer: https://beeplaylet.com/\r\n',
          '-i', streamUrl,
          '-vf', filterArgs.join(','),
          '-c:v', 'libx264',
          '-threads', '2',
          '-preset', 'ultrafast',
          '-crf', '26',
          '-c:a', 'aac',
          '-b:a', '96k',
          tmpOut
        ];
      } else {
        args = [
          '-y',
          '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\nReferer: https://beeplaylet.com/\r\n',
          '-i', streamUrl,
          '-c', 'copy',
          '-bsf:a', 'aac_adtstoasc',
          tmpOut
        ];
      }

      const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      this.activeProcesses.set(taskId, proc);

      proc.stderr.on('data', (d) => {
        const str = d.toString();
        const speedMatch = str.match(/speed=\s*([\d.]+x)/i);
        if (speedMatch) {
          task.speed_str = speedMatch[1];
        }
      });

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

const beeplayletDownloader = new BeeplayletDownloader();

module.exports = {
  BeeplayletDownloader,
  beeplayletDownloader
};
