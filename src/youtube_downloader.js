/**
 * YouTube Downloader Engine using yt-dlp & ffmpeg.
 * Provides high-speed, highest-resolution (4K, 1440p, 1080p, 720p, MP3 audio) downloading
 * with real-time progress parsing, cancellation, and metadata analysis.
 */

const { spawn, execFile, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getOutputDir } = require('./config.js');

// Auto-detect yt-dlp executable path
function findYtDlp() {
  const customPaths = [
    'yt-dlp',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'Scripts', 'yt-dlp.exe'),
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'Scripts', 'yt-dlp.exe')
  ];
  for (const p of customPaths) {
    if (p === 'yt-dlp') return 'yt-dlp';
    if (fs.existsSync(p)) return p;
  }
  return 'yt-dlp';
}

// Auto-detect ffmpeg path
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
  if (views >= 1000000000) return (views / 1000000000).toFixed(1) + 'B';
  if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
  if (views >= 1000) return (views / 1000).toFixed(1) + 'K';
  return String(views);
}

class YouTubeDownloader {
  constructor() {
    this.tasks = new Map(); // taskId -> taskObject
    this.ytDlpPath = findYtDlp();
    this.ffmpegPath = findFfmpeg();
  }

  getYouTubeOutputDir() {
    const root = getOutputDir();
    const ytDir = path.join(root, 'YouTube');
    if (!fs.existsSync(ytDir)) {
      try {
        fs.mkdirSync(ytDir, { recursive: true });
      } catch (e) {
        return root;
      }
    }
    return ytDir;
  }

  /**
   * Fetch video info & available resolutions
   */
  async getVideoInfo(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('សូមបញ្ចូលលីង YouTube ត្រឹមត្រូវ (Please enter a valid YouTube URL)');
    }

    const cleanUrl = url.trim();
    return new Promise((resolve, reject) => {
      const args = [
        '--js-runtimes', 'node',
        '--dump-single-json',
        '--no-warnings',
        '--no-playlist',
        cleanUrl
      ];

      execFile(this.ytDlpPath, args, { maxBuffer: 60 * 1024 * 1024, timeout: 35000 }, (err, stdout, stderr) => {
        if (err) {
          const errMsg = stderr || err.message;
          console.error('[YouTube Info Error]', errMsg);
          return reject(new Error(errMsg.includes('Video unavailable') ? 'វីដេអូនេះមិនមាន ឬត្រូវបានបិទ (Video unavailable)' : errMsg));
        }

        try {
          const data = JSON.parse(stdout);
          const formats = data.formats || [];
          const heights = [...new Set(formats.map(f => f.height).filter(h => h && h > 0))].sort((a, b) => b - a);

          const qualities = [];
          qualities.push({
            id: 'best',
            label: '🌟 Max Quality (Auto)',
            height: heights[0] || 1080,
            note: 'Auto 4K/1080p (Best Video + Audio)'
          });

          if (heights.some(h => h >= 2160)) {
            qualities.push({
              id: '2160',
              label: '🌟 4K Ultra HD (2160p)',
              height: 2160,
              note: 'Ultra HD 4K (3840×2160)'
            });
          }
          if (heights.some(h => h >= 1440)) {
            qualities.push({
              id: '1440',
              label: '💎 2K Quad HD (1440p)',
              height: 1440,
              note: 'Quad HD 2K (2560×1440)'
            });
          }
          if (heights.some(h => h >= 1080)) {
            qualities.push({
              id: '1080',
              label: '🎬 Full HD (1080p)',
              height: 1080,
              note: 'FHD 1080p (1920×1080)'
            });
          }
          if (heights.some(h => h >= 720)) {
            qualities.push({
              id: '720',
              label: '📺 HD (720p)',
              height: 720,
              note: 'HD 720p (1280×720)'
            });
          }
          if (heights.some(h => h >= 480)) {
            qualities.push({
              id: '480',
              label: '📱 SD (480p)',
              height: 480,
              note: 'Standard SD'
            });
          }
          qualities.push({
            id: 'audio',
            label: '🎵 MP3 Audio (320kbps)',
            height: 0,
            note: 'High-Quality MP3 Music'
          });

          // Best thumbnail
          let bestThumb = data.thumbnail || '';
          if (data.thumbnails && data.thumbnails.length > 0) {
            const sortedThumbs = [...data.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
            bestThumb = sortedThumbs[0].url || bestThumb;
          }

          const result = {
            id: data.id,
            url: data.webpage_url || cleanUrl,
            title: data.title || 'YouTube Video',
            channel: data.uploader || data.channel || 'YouTube Creator',
            channel_url: data.uploader_url || data.channel_url || '',
            duration: data.duration || 0,
            duration_formatted: formatDuration(data.duration || 0),
            thumbnail: bestThumb,
            view_count: data.view_count || 0,
            view_count_formatted: formatViews(data.view_count || 0),
            upload_date: data.upload_date || '',
            qualities,
            max_height: heights[0] || 1080,
            description: (data.description || '').substring(0, 300)
          };

          resolve(result);
        } catch (parseErr) {
          reject(new Error('បរាជ័យក្នុងការវិភាគទិន្នន័យ (Failed to parse video info)'));
        }
      });
    });
  }

  /**
   * Start YouTube download task
   */
  async startDownload(params) {
    const { url, quality = 'best', title = '', customDir = '' } = params;
    if (!url) {
      throw new Error('URL is required');
    }

    const taskId = `yt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const outputDir = customDir && fs.existsSync(customDir) ? customDir : this.getYouTubeOutputDir();

    const task = {
      id: taskId,
      url,
      title: title || 'YouTube Video',
      quality,
      outputDir,
      percent: '0%',
      percentNum: 0,
      speed: '0 KiB/s',
      eta: '--:--',
      size: '0 MB',
      status: 'downloading', // 'downloading', 'merging', 'completed', 'canceled', 'error'
      filePath: null,
      error: null,
      createdAt: Date.now(),
      completedAt: null,
      process: null
    };

    this.tasks.set(taskId, task);

    const args = [
      '--js-runtimes', 'node',
      '--newline',
      '--progress-template', '%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress._total_bytes_estimate_str)s|%(progress.filename)s',
      '--no-playlist'
    ];

    // Format selection
    if (quality === 'audio') {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0', '-f', 'bestaudio/best');
    } else if (quality === '2160') {
      args.push('-f', 'bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=2160]+bestaudio/best', '--merge-output-format', 'mp4');
    } else if (quality === '1440') {
      args.push('-f', 'bestvideo[height<=1440][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1440]+bestaudio/best', '--merge-output-format', 'mp4');
    } else if (quality === '1080') {
      args.push('-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best', '--merge-output-format', 'mp4');
    } else if (quality === '720') {
      args.push('-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best', '--merge-output-format', 'mp4');
    } else if (quality === '480') {
      args.push('-f', 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best', '--merge-output-format', 'mp4');
    } else {
      // Default: best quality available
      args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best', '--merge-output-format', 'mp4');
    }

    // Output pattern
    args.push('-P', outputDir, '-o', '%(title)s [%(id)s].%(ext)s');

    // Add video URL
    args.push(url);

    try {
      const proc = spawn(this.ytDlpPath, args, { windowsHide: true });
      task.process = proc;

      proc.stdout.on('data', (data) => {
        const lines = data.toString().split(/[\r\n]+/);
        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.includes('|')) {
            const [pStr, sStr, eStr, tStr, fStr] = line.split('|');
            if (pStr) {
              const trimmedP = pStr.trim();
              task.percent = trimmedP;
              const num = parseFloat(trimmedP.replace('%', ''));
              if (!isNaN(num)) task.percentNum = Math.min(100, Math.max(0, num));
            }
            if (sStr && sStr.trim() !== 'NA') task.speed = sStr.trim();
            if (eStr && eStr.trim() !== 'NA') task.eta = eStr.trim();
            if (tStr && tStr.trim() !== 'NA') task.size = tStr.trim();
            if (fStr && fStr.trim() && fStr.trim() !== 'NA') {
              task.filePath = fStr.trim();
            }
          } else {
            // Detect merging phase
            if (line.includes('[Merger]') || line.includes('[ExtractAudio]') || line.includes('Merging formats')) {
              task.status = 'merging';
            }
            // Title extraction if available
            const mTitle = line.match(/\[download\] Destination: (.+)/);
            if (mTitle && mTitle[1]) {
              task.filePath = mTitle[1].trim();
            }
          }
        }
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        if (text.includes('Merging') || text.includes('ffmpeg')) {
          task.status = 'merging';
        }
      });

      proc.on('close', (code) => {
        task.process = null;
        task.completedAt = Date.now();
        if (task.status === 'canceled') {
          return;
        }

        if (code === 0) {
          task.status = 'completed';
          task.percent = '100%';
          task.percentNum = 100;
          task.eta = '00:00';
          // Verify downloaded file existence if filePath is set or look up by title
          if (task.filePath && !fs.existsSync(task.filePath)) {
            // Check if extension changed (e.g. .mp4 or .mp3)
            const dir = path.dirname(task.filePath);
            const baseName = path.basename(task.filePath, path.extname(task.filePath));
            const candidateMp4 = path.join(dir, `${baseName}.mp4`);
            const candidateMp3 = path.join(dir, `${baseName}.mp3`);
            const candidateMkv = path.join(dir, `${baseName}.mkv`);
            if (fs.existsSync(candidateMp4)) task.filePath = candidateMp4;
            else if (fs.existsSync(candidateMp3)) task.filePath = candidateMp3;
            else if (fs.existsSync(candidateMkv)) task.filePath = candidateMkv;
          }
        } else {
          task.status = 'error';
          task.error = `Download failed with exit code ${code}`;
        }
      });

      proc.on('error', (err) => {
        task.process = null;
        task.status = 'error';
        task.error = err.message;
      });

      return this.serializeTask(task);
    } catch (err) {
      task.status = 'error';
      task.error = err.message;
      return this.serializeTask(task);
    }
  }

  /**
   * Cancel in-progress task
   */
  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.status = 'canceled';
    if (task.process && task.process.pid) {
      try {
        if (process.platform === 'win32') {
          exec(`taskkill /pid ${task.process.pid} /f /t`);
        } else {
          task.process.kill('SIGKILL');
        }
      } catch (e) {
        console.warn('[YouTube] Could not kill process:', e.message);
      }
      task.process = null;
    }
    return true;
  }

  /**
   * Cancel all tasks
   */
  cancelAll() {
    for (const [id, task] of this.tasks.entries()) {
      if (task.status === 'downloading' || task.status === 'merging') {
        this.cancelTask(id);
      }
    }
  }

  /**
   * Clear completed/canceled/error tasks
   */
  clearFinished() {
    for (const [id, task] of this.tasks.entries()) {
      if (['completed', 'canceled', 'error'].includes(task.status)) {
        this.tasks.delete(id);
      }
    }
    return this.getTasks();
  }

  /**
   * Get all tasks
   */
  getTasks() {
    const list = Array.from(this.tasks.values()).map(t => this.serializeTask(t));
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }

  serializeTask(t) {
    return {
      id: t.id,
      url: t.url,
      title: t.title,
      quality: t.quality,
      outputDir: t.outputDir,
      percent: t.percent,
      percentNum: t.percentNum,
      speed: t.speed,
      eta: t.eta,
      size: t.size,
      status: t.status,
      filePath: t.filePath,
      error: t.error,
      createdAt: t.createdAt,
      completedAt: t.completedAt
    };
  }
}

const youtubeDownloader = new YouTubeDownloader();

module.exports = {
  YouTubeDownloader,
  youtubeDownloader
};
