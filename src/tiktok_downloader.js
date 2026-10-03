/**
 * TikTok, Douyin (TikTok ចិន) & Kuaishou (ខៅស៊ូ) Downloader Engine
 * Provides high-speed watermark-free video parsing and downloading,
 * in-app video playback preview, audio MP3 extraction, and library integration.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const querystring = require('querystring');
const { getOutputDir } = require('./config.js');
const { libraryManager } = require('./library_manager.js');

function sanitizeFilename(name) {
  const cleaned = String(name || '').replace(/[\\/*?:"<>|\r\n\t]/g, '_').trim();
  return cleaned.slice(0, 100) || 'Video';
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

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
  return mb.toFixed(1) + ' MB';
}

function extractFirstUrl(text) {
  if (!text) return '';
  const match = String(text).match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0] : '';
}

class TikTokDownloader {
  constructor() {
    this.tasks = new Map(); // taskId -> taskObject
    this.activeProcesses = new Map(); // taskId -> child_process / httpReq
    this.ytDlpPath = findYtDlp();
  }

  getTikTokOutputDir() {
    const root = getOutputDir();
    const ttDir = path.join(root, 'TikTok');
    if (!fs.existsSync(ttDir)) {
      try { fs.mkdirSync(ttDir, { recursive: true }); } catch (e) { return root; }
    }
    return ttDir;
  }

  detectPlatform(url) {
    const u = String(url || '').toLowerCase();
    if (u.includes('kuaishou.com') || u.includes('kuaishouapp.com')) return 'kuaishou';
    if (u.includes('douyin.com') || u.includes('iesdouyin.com')) return 'douyin';
    if (u.includes('tiktok.com')) return 'tiktok';
    return null;
  }

  /**
   * Universal Video Analyzer for TikTok, Douyin, and Kuaishou with strict platform check
   */
  async analyzeVideo(rawInput, expectedPlatform = null) {
    const cleanUrl = extractFirstUrl(rawInput);
    if (!cleanUrl) throw new Error('សូមបញ្ចូល ឬបិទភ្ជាប់លីង TikTok, Douyin, ឬ Kuaishou ឱ្យបានត្រឹមត្រូវ');

    const platform = this.detectPlatform(cleanUrl);
    if (!platform) {
      throw new Error('លីងនេះមិនមែនជាលីង TikTok, Douyin ឬ Kuaishou ឡើយ! មិនអាចទាញយកបានទេ');
    }

    if (expectedPlatform && platform !== expectedPlatform) {
      const names = {
        tiktok: 'TikTok (Global)',
        douyin: 'TikTok ចិន (Douyin)',
        kuaishou: 'ខៅស៊ូ (Kuaishou)'
      };
      throw new Error(`លីងនេះជាលីង ${names[platform] || platform} មិនអាចទាញយកក្នុងផ្ទាំង ${names[expectedPlatform] || expectedPlatform} បានទេ! សូមជ្រើសរើសផ្ទាំងត្រឹមត្រូវ។`);
    }

    // 1. TikTok & Douyin: Try tikwm.com API (Instant, No Watermark, HD)
    if (platform === 'tiktok' || platform === 'douyin') {
      try {
        const tikwmData = await this._fetchTikwm(cleanUrl);
        if (tikwmData && tikwmData.code === 0 && tikwmData.data) {
          const d = tikwmData.data;
          return {
            ok: true,
            platform,
            id: d.id || `${Date.now()}`,
            title: d.title || (platform === 'douyin' ? 'Douyin Short Video' : 'TikTok Short Video'),
            cover: d.cover || d.origin_cover || '',
            play_url: d.play || '',
            wmplay_url: d.wmplay || '',
            music_url: d.music || '',
            duration: d.duration || 0,
            duration_str: formatDuration(d.duration),
            author: {
              nickname: d.author?.nickname || (platform === 'douyin' ? 'Douyin Creator' : 'TikTok Creator'),
              unique_id: d.author?.unique_id || '',
              avatar: d.author?.avatar || ''
            },
            raw_url: cleanUrl
          };
        }
      } catch (err) {
        console.warn('[TikTokDownloader] tikwm API error:', err.message);
      }
    }

    // 2. Kuaishou: Try Mobile Web Scraper
    if (platform === 'kuaishou') {
      try {
        const ksData = await this._scrapeKuaishou(cleanUrl);
        if (ksData && ksData.play_url) {
          return {
            ok: true,
            platform: 'kuaishou',
            id: ksData.id || `${Date.now()}`,
            title: ksData.title || 'Kuaishou Video',
            cover: ksData.cover || '',
            play_url: ksData.play_url,
            wmplay_url: ksData.play_url,
            music_url: '',
            duration: ksData.duration || 0,
            duration_str: formatDuration(ksData.duration),
            author: {
              nickname: ksData.author || 'Kuaishou Creator',
              unique_id: '',
              avatar: ''
            },
            raw_url: cleanUrl
          };
        }
      } catch (err) {
        console.warn('[TikTokDownloader] Kuaishou scraper error:', err.message);
      }
    }

    // 3. Fallback: yt-dlp metadata extraction
    return await this._analyzeWithYtDlp(cleanUrl, platform);
  }

  _fetchTikwm(url) {
    return new Promise((resolve, reject) => {
      const postData = querystring.stringify({ url });
      const req = https.request('https://tikwm.com/api/', {
        method: 'POST',
        timeout: 12000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(new Error('Failed to parse tikwm response'));
          }
        });
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('tikwm request timeout')); });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  _scrapeKuaishou(url) {
    return new Promise((resolve, reject) => {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      };

      const fetchWithRedirect = (targetUrl, count = 0) => {
        if (count > 5) return reject(new Error('Too many redirects'));
        const parsed = new URL(targetUrl);
        const client = parsed.protocol === 'https:' ? https : http;

        const req = client.get(targetUrl, { headers, timeout: 12000 }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let nextLoc = res.headers.location;
            if (!nextLoc.startsWith('http')) nextLoc = new URL(nextLoc, targetUrl).href;
            return fetchWithRedirect(nextLoc, count + 1);
          }

          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => {
            const m3u8s = d.match(/https?:\/\/[^\s'"<>]+\.m3u8[^\s'"<>]*/ig);
            const mp4s = d.match(/https?:\/\/[^\s'"<>]+\.mp4[^\s'"<>]*/ig);
            const validUrl = (mp4s && mp4s[0]) || (m3u8s && m3u8s[0]) || '';

            let title = '';
            const tMatch = d.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (tMatch) title = tMatch[1].replace(/ - 快手/g, '').trim();

            let poster = '';
            const pMatch = d.match(/poster=["']([^"']+)["']/i) || d.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
            if (pMatch) poster = pMatch[1];

            if (validUrl) {
              resolve({
                play_url: validUrl,
                title: title || 'Kuaishou Video',
                cover: poster
              });
            } else {
              resolve(null);
            }
          });
        });

        req.on('timeout', () => { req.destroy(); reject(new Error('Kuaishou scraper timeout')); });
        req.on('error', reject);
      };

      fetchWithRedirect(url);
    });
  }

  _analyzeWithYtDlp(url, platform) {
    return new Promise((resolve, reject) => {
      const args = ['--dump-single-json', '--no-warnings', '--no-playlist', url];

      // Attach cookies if available
      const ksCookies = path.join(__dirname, '..', 'data', 'kuaishou_cookies.txt');
      const genCookies = path.join(__dirname, '..', 'data', 'cookies.txt');
      if (platform === 'kuaishou' && fs.existsSync(ksCookies)) {
        args.push('--cookies', ksCookies);
      } else if (fs.existsSync(genCookies)) {
        args.push('--cookies', genCookies);
      }

      const proc = spawn(this.ytDlpPath, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', d => stdout += d.toString());
      proc.stderr.on('data', d => stderr += d.toString());

      proc.on('close', (code) => {
        if (code === 0 && stdout) {
          try {
            const data = JSON.parse(stdout);
            const formats = data.formats || [];
            let bestPlay = data.url || '';
            if (!bestPlay) {
              const bestFmt = formats.filter(f => f.url && f.vcodec !== 'none').pop();
              if (bestFmt) bestPlay = bestFmt.url;
            }

            resolve({
              ok: true,
              platform,
              id: data.id || `${Date.now()}`,
              title: data.title || (platform === 'douyin' ? 'Douyin Video' : (platform === 'kuaishou' ? 'Kuaishou Video' : 'TikTok Video')),
              cover: data.thumbnail || '',
              play_url: bestPlay,
              wmplay_url: bestPlay,
              music_url: '',
              duration: data.duration || 0,
              duration_str: formatDuration(data.duration),
              author: {
                nickname: data.uploader || data.creator || (platform === 'douyin' ? 'Douyin Creator' : 'TikTok Creator'),
                unique_id: data.uploader_id || '',
                avatar: ''
              },
              raw_url: url
            });
          } catch (e) {
            reject(new Error(`Failed to parse metadata from yt-dlp: ${e.message}`));
          }
        } else {
          reject(new Error(stderr || `Analysis failed with code ${code}`));
        }
      });

      proc.on('error', (err) => reject(new Error(`yt-dlp execution error: ${err.message}`)));

      // 15s timeout
      setTimeout(() => {
        try { proc.kill(); } catch (_) {}
        reject(new Error('ការវិភាគវីដេអូបានលើសកំណត់ពេលវេលា (Analysis timed out)'));
      }, 15000);
    });
  }

  /**
   * Start video or audio download
   */
  async startDownload({ url, play_url, format = 'no_watermark', title = '', author = '', platform = 'tiktok', customDir = null }) {
    const cleanTitle = sanitizeFilename(title || `${platform}_${Date.now()}`);
    const outDir = customDir && fs.existsSync(customDir) ? customDir : this.getTikTokOutputDir();
    const taskId = `tt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const isAudioOnly = format === 'audio_only';
    const ext = isAudioOnly ? 'mp3' : 'mp4';
    const filename = `${cleanTitle}.${ext}`;
    const targetFilePath = path.join(outDir, filename);

    const task = {
      task_id: taskId,
      platform,
      title: cleanTitle,
      author: author || 'Creator',
      format,
      output_dir: outDir,
      file_path: targetFilePath,
      filename,
      status: 'downloading', // 'downloading', 'completed', 'error', 'canceled'
      progress_pct: 0,
      speed_str: '0.0 MB/s',
      eta_str: '--:--',
      size_str: '',
      created_at: Date.now(),
      error_message: ''
    };

    this.tasks.set(taskId, task);
    libraryManager.registerSeries(taskId, cleanTitle, '', 1, '1', platform).catch(() => {});

    // If direct MP4/MP3 stream URL is available, download directly using fast stream
    if (play_url && play_url.startsWith('http') && !play_url.includes('.m3u8')) {
      this._downloadDirectStream(taskId, play_url, targetFilePath);
    } else {
      // Fallback to yt-dlp
      this._downloadWithYtDlp(taskId, url || play_url, targetFilePath, isAudioOnly, platform);
    }

    return task;
  }

  _downloadDirectStream(taskId, streamUrl, targetFilePath) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    try {
      const fileStream = fs.createWriteStream(targetFilePath);
      let downloadedBytes = 0;
      let totalBytes = 0;
      let startTime = Date.now();
      let lastReportTime = startTime;
      let lastDownloaded = 0;

      const client = streamUrl.startsWith('https:') ? https : http;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };

      const req = client.get(streamUrl, { headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fileStream.close();
          try { fs.unlinkSync(targetFilePath); } catch (_) {}
          return this._downloadDirectStream(taskId, res.headers.location, targetFilePath);
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          task.status = 'error';
          task.error_message = `HTTP Status: ${res.statusCode}`;
          fileStream.close();
          return;
        }

        totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        if (totalBytes > 0) {
          task.size_str = formatBytes(totalBytes);
        }

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          fileStream.write(chunk);

          const now = Date.now();
          if (now - lastReportTime >= 500) {
            const timeDiff = (now - lastReportTime) / 1000;
            const bytesDiff = downloadedBytes - lastDownloaded;
            const speed = bytesDiff / timeDiff; // bytes/sec
            task.speed_str = (speed / (1024 * 1024)).toFixed(1) + ' MB/s';

            if (totalBytes > 0) {
              task.progress_pct = Math.min(99, Math.round((downloadedBytes / totalBytes) * 100));
              const remainingBytes = totalBytes - downloadedBytes;
              const etaSec = speed > 0 ? Math.round(remainingBytes / speed) : 0;
              task.eta_str = `${Math.floor(etaSec / 60)}:${String(etaSec % 60).padStart(2, '0')}`;
              libraryManager.updateProgress(taskId, task.progress_pct >= 100 ? 1 : 0, 1, task.progress_pct);
            }

            lastReportTime = now;
            lastDownloaded = downloadedBytes;
          }
        });

        res.on('end', () => {
          fileStream.end(() => {
            this.activeProcesses.delete(taskId);
            if (task.status === 'canceled') return;

            task.status = 'completed';
            task.progress_pct = 100;
            task.speed_str = '';
            task.eta_str = 'Done';
            task.size_str = formatBytes(downloadedBytes);
            libraryManager.markCompleted(taskId);
          });
        });

        res.on('error', (err) => {
          fileStream.close();
          this.activeProcesses.delete(taskId);
          task.status = 'error';
          task.error_message = err.message;
        });
      });

      this.activeProcesses.set(taskId, req);

      req.on('error', (err) => {
        this.activeProcesses.delete(taskId);
        task.status = 'error';
        task.error_message = err.message;
      });

    } catch (err) {
      task.status = 'error';
      task.error_message = err.message;
    }
  }

  _downloadWithYtDlp(taskId, url, targetFilePath, isAudioOnly, platform) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const args = [
      '--newline',
      '--no-playlist',
      '--no-warnings',
      '-o', targetFilePath,
      url
    ];

    if (isAudioOnly) {
      args.push('-x', '--audio-format', 'mp3');
    }

    // Attach cookies
    const ksCookies = path.join(__dirname, '..', 'data', 'kuaishou_cookies.txt');
    const genCookies = path.join(__dirname, '..', 'data', 'cookies.txt');
    if (platform === 'kuaishou' && fs.existsSync(ksCookies)) {
      args.push('--cookies', ksCookies);
    } else if (fs.existsSync(genCookies)) {
      args.push('--cookies', genCookies);
    }

    try {
      const proc = spawn(this.ytDlpPath, args, { windowsHide: true });
      this.activeProcesses.set(taskId, proc);

      proc.stdout.on('data', (data) => {
        const line = data.toString();
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
          if (!task.error_message) task.error_message = `Exit code ${code}`;
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
      const p = this.activeProcesses.get(taskId);
      if (p && typeof p.kill === 'function') {
        try { p.kill('SIGKILL'); } catch (_) {}
      } else if (p && typeof p.destroy === 'function') {
        try { p.destroy(); } catch (_) {}
      }
      this.activeProcesses.delete(taskId);
    }
    return { success: true };
  }

  getTasks() {
    return Array.from(this.tasks.values()).reverse();
  }
}

const tiktokDownloader = new TikTokDownloader();

module.exports = {
  tiktokDownloader
};
