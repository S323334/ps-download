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
const { libraryManager, downloadAndSaveCover } = require('./library_manager.js');

function sanitizeFilename(name) {
  const cleaned = String(name || '').replace(/[\\/*?:"<>|\r\n\t]/g, '_').trim();
  return cleaned.slice(0, 100) || 'Video';
}

function findYtDlp() {
  const candidates = [
    path.join(__dirname, '..', 'bin', 'yt-dlp.exe'),
    path.join(process.resourcesPath || '', 'bin', 'yt-dlp.exe'),
    path.join(__dirname, '..', '..', 'bin', 'yt-dlp.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'Scripts', 'yt-dlp.exe'),
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'Scripts', 'yt-dlp.exe'),
    path.join(__dirname, '..', 'lib', 'yt-dlp.exe'),
    'yt-dlp'
  ];
  for (const p of candidates) {
    if (p !== 'yt-dlp' && p && fs.existsSync(p)) return p;
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
  const match = String(text).match(/https?:\/\/[^\s"'<>\u4e00-\u9fa5]+/i);
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
    if (u.includes('kuaishou.com') || u.includes('kuaishouapp.com') || u.includes('gifshow.com') || u.includes('kwai.com')) return 'kuaishou';
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

    // 1. TikTok (Global): Try tikwm.com API (Instant, No Watermark, HD)
    if (platform === 'tiktok') {
      try {
        const tikwmData = await this._fetchTikwm(cleanUrl);
        if (tikwmData && tikwmData.code === 0 && tikwmData.data) {
          const d = tikwmData.data;
          return {
            ok: true,
            platform,
            id: d.id || `${Date.now()}`,
            title: d.title || 'TikTok Short Video',
            cover: d.cover || d.origin_cover || '',
            play_url: d.play || '',
            wmplay_url: d.wmplay || '',
            music_url: d.music || '',
            duration: d.duration || 0,
            duration_str: formatDuration(d.duration),
            author: {
              nickname: d.author?.nickname || 'TikTok Creator',
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

    // 2. Douyin (TikTok ចិន): Dedicated Multi-Engine Resolver
    if (platform === 'douyin') {
      try {
        let dyData = await this._fetchDouyinTioo(cleanUrl);
        if (!dyData || !dyData.play_url) {
          await new Promise(r => setTimeout(r, 500));
          dyData = await this._fetchDouyinTioo(cleanUrl);
        }
        if (dyData && dyData.play_url) {
          return dyData;
        }
      } catch (err) {
        console.warn('[TikTokDownloader] Douyin tioo error:', err.message);
      }

      // Fallback: try tikwm in case it is supported
      try {
        const tikwmData = await this._fetchTikwm(cleanUrl);
        if (tikwmData && tikwmData.code === 0 && tikwmData.data) {
          const d = tikwmData.data;
          return {
            ok: true,
            platform: 'douyin',
            id: d.id || `${Date.now()}`,
            title: d.title || 'Douyin Video',
            cover: d.cover || d.origin_cover || '',
            play_url: d.play || '',
            wmplay_url: d.wmplay || '',
            music_url: d.music || '',
            duration: d.duration || 0,
            duration_str: formatDuration(d.duration),
            author: {
              nickname: d.author?.nickname || 'Douyin Creator',
              unique_id: d.author?.unique_id || '',
              avatar: d.author?.avatar || ''
            },
            raw_url: cleanUrl
          };
        }
      } catch (_) {}
    }

    // 3. Kuaishou (ខៅស៊ូ / ខាយស៊ូ): Dedicated Resolver & Mobile Scraper
    if (platform === 'kuaishou') {
      try {
        const ksTiooData = await this._fetchKuaishouTioo(cleanUrl);
        if (ksTiooData && ksTiooData.play_url) {
          return ksTiooData;
        }
      } catch (err) {
        console.warn('[TikTokDownloader] Kuaishou tioo error:', err.message);
      }

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

    // 4. Universal Fallback: Standalone yt-dlp binary metadata extraction
    return await this._analyzeWithYtDlp(cleanUrl, platform);
  }

  _fetchDouyinTioo(url) {
    return new Promise((resolve) => {
      const targetUrl = `https://backend1.tioo.eu.org/douyin?url=${encodeURIComponent(url)}`;
      const req = https.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        timeout: 15000
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(d);
            if (json && (json.status === true || json.success === true) && json.data) {
              const data = json.data;
              const links = Array.isArray(data.links) ? data.links : [];

              let playUrl = '';
              let wmPlayUrl = '';
              let musicUrl = '';

              for (const l of links) {
                const q = String(l.quality || '').toLowerCase();
                const u = l.url || '';
                if (q.includes('3') || q.includes('audio') || u.includes('.mp3')) {
                  musicUrl = u;
                } else if (q.includes('2') || q.includes('hd')) {
                  playUrl = u;
                } else if (!playUrl && u) {
                  playUrl = u;
                }
              }

              if (!playUrl && links.length > 0) {
                playUrl = links[0].url || '';
              }
              if (!wmPlayUrl) wmPlayUrl = playUrl;

              // If links contains JWT, extract direct CDN url if available as backup
              let directCdn = '';
              for (const l of links) {
                if (l.url && l.url.includes('token=')) {
                  try {
                    const tokenPart = l.url.split('token=')[1].split('&')[0];
                    const b64 = tokenPart.split('.')[1];
                    if (b64) {
                      const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
                      if (payload && payload.url) {
                        directCdn = payload.url;
                        break;
                      }
                    }
                  } catch (_) {}
                }
              }

              const finalPlayUrl = playUrl || directCdn;
              if (finalPlayUrl) {
                return resolve({
                  ok: true,
                  platform: 'douyin',
                  id: `${Date.now()}`,
                  title: data.title || 'Douyin Video',
                  cover: data.thumbnail || '',
                  play_url: finalPlayUrl,
                  wmplay_url: wmPlayUrl || finalPlayUrl,
                  music_url: musicUrl,
                  duration: 0,
                  duration_str: '00:00',
                  author: {
                    nickname: 'Douyin Creator',
                    unique_id: '',
                    avatar: data.thumbnail || ''
                  },
                  raw_url: url
                });
              }
            }
            resolve(null);
          } catch (_) {
            resolve(null);
          }
        });
      });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    });
  }

  _fetchKuaishouTioo(url) {
    return new Promise((resolve) => {
      const targetUrl = `https://backend1.tioo.eu.org/kuaishou?url=${encodeURIComponent(url)}`;
      const req = https.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        timeout: 15000
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(d);
            if (json && (json.success === true || json.status === true) && json.videoUrl) {
              const durSec = json.duration ? Math.round(Number(json.duration) > 1000 ? json.duration / 1000 : json.duration) : 0;
              return resolve({
                ok: true,
                platform: 'kuaishou',
                id: `${Date.now()}`,
                title: json.title || 'Kuaishou Video',
                cover: json.thumbnail || '',
                play_url: json.videoUrl,
                wmplay_url: json.videoUrl,
                music_url: '',
                duration: durSec,
                duration_str: formatDuration(durSec),
                author: {
                  nickname: json.author?.name || 'Kuaishou Creator',
                  unique_id: '',
                  avatar: ''
                },
                raw_url: url
              });
            }
            resolve(null);
          } catch (_) {
            resolve(null);
          }
        });
      });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    });
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
          let errMsg = (stderr || `Analysis failed with code ${code}`).trim();
          if (errMsg.includes('Fresh cookies') || errMsg.includes('cookies')) {
            errMsg = 'មិនអាចវិភាគវីដេអូ Douyin នេះបានទេ (សូមចុច "⚡ វិភាគវីដេអូ" ម្តងទៀត)';
          }
          reject(new Error(errMsg));
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
  async startDownload({ url, play_url, format = 'no_watermark', title = '', author = '', platform = 'tiktok', customDir = null, cover = '', music_url = '' }) {
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
      cover: cover || '',
      format,
      output_dir: outDir,
      file_path: targetFilePath,
      filename,
      raw_url: url || '',
      music_url: music_url || '',
      status: 'downloading', // 'downloading', 'completed', 'error', 'canceled'
      progress_pct: 0,
      speed_str: '0.0 MB/s',
      eta_str: '--:--',
      size_str: '',
      created_at: Date.now(),
      error_message: ''
    };

    if (cover) {
      downloadAndSaveCover(cover, outDir, cleanTitle).catch(() => {});
    }

    this.tasks.set(taskId, task);
    libraryManager.registerSeries(taskId, cleanTitle, cover || '', 1, '1', platform).catch(() => {});

    // If direct MP4/MP3 stream URL is available, download directly using fast stream
    if (isAudioOnly && music_url && music_url.startsWith('http')) {
      this._downloadDirectStream(taskId, music_url, targetFilePath);
    } else if (!isAudioOnly && play_url && play_url.startsWith('http') && !play_url.includes('.m3u8')) {
      this._downloadDirectStream(taskId, play_url, targetFilePath);
    } else {
      // Fallback to yt-dlp
      this._downloadWithYtDlp(taskId, url || play_url, targetFilePath, isAudioOnly, platform);
    }

    return task;
  }

  _downloadDirectStream(taskId, streamUrl, targetFilePath, redirectCount = 0) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    if (redirectCount > 10) {
      task.status = 'error';
      task.error_message = 'Too many redirects';
      return;
    }

    try {
      const fileStream = fs.createWriteStream(targetFilePath);
      let downloadedBytes = 0;
      let totalBytes = 0;
      let startTime = Date.now();
      let lastReportTime = startTime;
      let lastDownloaded = 0;

      const client = streamUrl.startsWith('https:') ? https : http;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': streamUrl.includes('douyin') ? 'https://www.douyin.com/' : (streamUrl.includes('kwaicdn') || streamUrl.includes('kwimgs') ? 'https://www.kuaishou.com/' : '')
      };

      const req = client.get(streamUrl, { headers, timeout: 30000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fileStream.close();
          try { fs.unlinkSync(targetFilePath); } catch (_) {}
          let nextLoc = res.headers.location;
          if (!nextLoc.startsWith('http')) {
            nextLoc = new URL(nextLoc, streamUrl).href;
          }
          return this._downloadDirectStream(taskId, nextLoc, targetFilePath, redirectCount + 1);
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          fileStream.close();
          try { fs.unlinkSync(targetFilePath); } catch (_) {}
          this.activeProcesses.delete(taskId);

          if (task.raw_url) {
            console.log(`[TikTokDownloader] Direct stream failed (HTTP ${res.statusCode}), falling back to yt-dlp...`);
            task.status = 'downloading';
            task.error_message = '';
            return this._downloadWithYtDlp(taskId, task.raw_url, targetFilePath, task.format === 'audio_only', task.platform);
          }

          task.status = 'error';
          task.error_message = `HTTP Status: ${res.statusCode}`;
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
          if (task.status === 'canceled') return;
          if (task.raw_url) {
            console.log(`[TikTokDownloader] Stream error (${err.message}), falling back to yt-dlp...`);
            task.status = 'downloading';
            task.error_message = '';
            return this._downloadWithYtDlp(taskId, task.raw_url, targetFilePath, task.format === 'audio_only', task.platform);
          }
          task.status = 'error';
          task.error_message = err.message;
        });
      });

      req.on('timeout', () => {
        req.destroy();
        fileStream.close();
        this.activeProcesses.delete(taskId);
        if (task.status === 'canceled') return;
        if (task.raw_url) {
          console.log('[TikTokDownloader] Stream timeout, falling back to yt-dlp...');
          task.status = 'downloading';
          task.error_message = '';
          return this._downloadWithYtDlp(taskId, task.raw_url, targetFilePath, task.format === 'audio_only', task.platform);
        }
        task.status = 'error';
        task.error_message = 'Download timed out';
      });

      req.on('error', (err) => {
        fileStream.close();
        this.activeProcesses.delete(taskId);
        if (task.status === 'canceled') return;
        if (task.raw_url) {
          console.log(`[TikTokDownloader] Request error (${err.message}), falling back to yt-dlp...`);
          task.status = 'downloading';
          task.error_message = '';
          return this._downloadWithYtDlp(taskId, task.raw_url, targetFilePath, task.format === 'audio_only', task.platform);
        }
        task.status = 'error';
        task.error_message = err.message;
      });

      this.activeProcesses.set(taskId, req);

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
