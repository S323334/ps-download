/**
 * High-Speed Multi-Threaded Batch Downloader & Queue Manager.
 * Handles concurrent downloads, live progress, speed tracking, AES CENC decryption,
 * poster downloading, and offline library scanning.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { EventEmitter } = require('events');
const { exec } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

function isFilePlayableVideo(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (stat.size < 500 * 1024) return false;
    const { execSync } = require('child_process');
    const out = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,codec_tag_string -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { timeout: 4000 }).toString().trim();
    if (!out || out.includes('bvc2') || out.startsWith('unknown')) {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

function ensureH264File(filePath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) return resolve(filePath);
    exec(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, (err, stdout) => {
      const codec = (stdout || '').trim().toLowerCase();
      if (!err && codec === 'h264') {
        return resolve(filePath);
      }
      const tmpOut = filePath.replace(/\.mp4$/i, '_h264.mp4');
      const cmd = `ffmpeg -y -i "${filePath}" -c:v libx264 -preset ultrafast -threads 4 -crf 23 -c:a copy "${tmpOut}"`;
      exec(cmd, (tErr) => {
        if (!tErr && fs.existsSync(tmpOut) && fs.statSync(tmpOut).size > 10240) {
          try {
            fs.unlinkSync(filePath);
            fs.renameSync(tmpOut, filePath);
          } catch (e) {}
          return resolve(filePath);
        }
        if (fs.existsSync(tmpOut)) {
          try { fs.unlinkSync(tmpOut); } catch (e) {}
        }
        resolve(filePath);
      });
    });
  });
}

const {
  getOutputDir,
  loadSettings,
  DEFAULT_HEADERS
} = require('./config.js');

const { scraper, extractSeriesId } = require('./scraper.js');
const { libraryManager } = require('./library_manager.js');
const { mergeDramaEpisodes } = require('./video_merger.js');
const cenc = require('../lib/cenc.js');

function sanitizeFilename(name) {
  const cleaned = String(name || '').replace(/[\\/*?:"<>|\r\n\t]/g, '_').trim();
  return cleaned.slice(0, 80) || 'Hongguo_Drama';
}

function parseEpisodeRange(rangeStr, totalEpisodes) {
  if (!rangeStr || ['all', '*', ''].includes(rangeStr.trim().toLowerCase())) {
    return new Set(Array.from({ length: totalEpisodes }, (_, i) => i + 1));
  }

  const clean = rangeStr.trim().toLowerCase();
  if (clean === 'free') {
    return new Set(Array.from({ length: Math.min(10, totalEpisodes) }, (_, i) => i + 1));
  }

  const result = new Set();
  const parts = clean.split(/[,，]/);
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    if (p.includes('-')) {
      const [sStr, eStr] = p.split('-');
      const start = parseInt(sStr, 10);
      const end = parseInt(eStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const s = Math.max(1, Math.min(start, end));
        const e = Math.min(totalEpisodes, Math.max(start, end));
        for (let i = s; i <= e; i++) result.add(i);
      }
    } else {
      const idx = parseInt(p, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= totalEpisodes) {
        result.add(idx);
      }
    }
  }

  return result.size > 0 ? result : new Set(Array.from({ length: totalEpisodes }, (_, i) => i + 1));
}

class DownloadManager extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map(); // taskId -> TaskObj
    this.cancelTokens = new Map(); // taskId -> { canceled: boolean, req: http.ClientRequest }

    this.queueRunning = false;
    this.queueCanceled = false;
    this.queueSeries = new Map(); // sid -> SeriesState
    this.queueLogs = [];
    this.startedTime = null;
    this.currentTitle = '';
    this.currentStatus = '';
    this.totalDone = 0;
    this.totalEps = 0;

    // Speed calculation
    this.speedSamples = []; // [{ time, bytes }]
    this.totalDownloadedBytes = 0;
    this.activeWorkers = 0;

    // Periodic speed sampler
    setInterval(() => this._sampleSpeed(), 500);
  }

  _log(msg, sid = null) {
    const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
    const line = `[${timeStr}] ${msg}`;
    this.queueLogs.push(line);
    if (this.queueLogs.length > 200) {
      this.queueLogs.shift();
    }
    const targetSid = sid || this.currentSid;
    if (targetSid && this.queueSeries && this.queueSeries.has(targetSid)) {
      const s = this.queueSeries.get(targetSid);
      s.logs = s.logs || [];
      s.logs.push(line);
      if (s.logs.length > 100) s.logs.shift();
    }
    console.log(`[Downloader] ${line}`);
  }

  _sampleSpeed() {
    const now = Date.now();
    this.speedSamples.push({ time: now, bytes: this.totalDownloadedBytes });
    while (this.speedSamples.length > 10) {
      this.speedSamples.shift();
    }
  }

  _calculateSpeed() {
    if (!this.queueRunning || this.speedSamples.length < 2) {
      return { speedStr: '0.0 MB/s', bps: 0 };
    }
    const oldest = this.speedSamples[0];
    const latest = this.speedSamples[this.speedSamples.length - 1];
    const dt = (latest.time - oldest.time) / 1000;
    if (dt <= 0.1) return { speedStr: '0.0 MB/s', bps: 0 };

    const db = latest.bytes - oldest.bytes;
    const bps = db / dt;
    const mbps = bps / (1024 * 1024);
    return {
      speedStr: `${mbps.toFixed(1)} MB/s`,
      bps
    };
  }

  getStatus() {
    const { speedStr } = this._calculateSpeed();
    const seriesList = [];
    for (const [sid, s] of this.queueSeries.entries()) {
      seriesList.push({
        sid,
        title: s.title,
        cover: s.cover || '',
        done: s.done,
        total: s.total,
        status: s.status,
        progress: s.progress,
        download_mode: s.downloadMode || 'separate'
      });
    }

    const overallProg = this.totalEps > 0
      ? Math.round((this.totalDone / this.totalEps) * 1000) / 10
      : 0;

    const completed = !this.queueRunning && this.totalEps > 0 && this.totalDone >= this.totalEps;
    const activeSeries = (this.currentSid && this.queueSeries.get(this.currentSid)) || null;
    const seriesStates = {};
    for (const [sId, s] of this.queueSeries.entries()) {
      seriesStates[sId] = {
        sid: sId,
        title: s.title,
        status: s.status,
        done: s.done || 0,
        total: s.total || 0,
        progress: s.progress || 0,
        downloadMode: s.downloadMode || 'separate',
        logs: s.logs || []
      };
    }

    return {
      running: this.queueRunning,
      started: this.startedTime,
      progress: activeSeries ? activeSeries.progress : overallProg,
      total_done: this.totalDone,
      total_eps: this.totalEps,
      completed,
      current_sid: this.currentSid || (activeSeries ? activeSeries.sid : null),
      current_title: this.currentTitle,
      current_status: this.currentStatus,
      current_series_done: activeSeries ? (activeSeries.done || 0) : this.totalDone,
      current_series_total: activeSeries ? (activeSeries.total || 0) : this.totalEps,
      current_series_progress: activeSeries ? (activeSeries.progress || 0) : overallProg,
      current_series_logs: activeSeries && activeSeries.logs && activeSeries.logs.length > 0 ? activeSeries.logs : [...this.queueLogs],
      series_states: seriesStates,
      speed: speedStr,
      series: seriesList,
      log: activeSeries && activeSeries.logs && activeSeries.logs.length > 0 ? activeSeries.logs : [...this.queueLogs],
      output_dir: getOutputDir()
    };
  }

  cancelTask(taskId) {
    if (this.cancelTokens.has(taskId)) {
      const token = this.cancelTokens.get(taskId);
      token.canceled = true;
      if (token.req) {
        try { token.req.destroy(); } catch (e) {}
      }
    }
    if (this.tasks.has(taskId)) {
      const t = this.tasks.get(taskId);
      t.status = 'canceled';
    }
  }

  cancelAll() {
    this.queueCanceled = true;
    this.queueRunning = false;
    for (const [taskId, token] of this.cancelTokens.entries()) {
      token.canceled = true;
      if (token.req) {
        try { token.req.destroy(); } catch (e) {}
      }
    }
    for (const t of this.tasks.values()) {
      if (['queued', 'downloading'].includes(t.status)) {
        t.status = 'canceled';
      }
    }
    for (const s of this.queueSeries.values()) {
      if (['queued', 'downloading'].includes(s.status)) {
        s.status = 'canceled';
      }
    }
    this._log('Canceled all active downloads.');
  }

  resumeQueue() {
    const pending = [];
    for (const [sid, s] of this.queueSeries.entries()) {
      if (['queued', 'partial', 'failed', 'canceled'].includes(s.status) || (s.total > 0 && s.done < s.total)) {
        pending.push(sid);
      }
    }
    if (pending.length === 0 && libraryManager && libraryManager.db) {
      try {
        for (const item of libraryManager.db.values()) {
          if (item && item.series_id && (['partial', 'failed', 'queued'].includes(item.status) || (item.total_episodes > 0 && item.completed_episodes < item.total_episodes))) {
            pending.push(item.series_id);
          }
        }
      } catch (e) {}
    }
    if (pending.length === 0) {
      return { ok: true, message: 'No pending series in queue' };
    }
    this.startBatchDownload({ series_ids: pending });
    return { ok: true, message: `Resuming ${pending.length} series` };
  }

  retrySeries(seriesId) {
    if (!seriesId || seriesId === 'undefined') {
      return this.resumeQueue();
    }
    const sid = String(seriesId);
    if (this.queueSeries.has(sid)) {
      const s = this.queueSeries.get(sid);
      s.status = 'queued';
    }
    this.startBatchDownload({ series_ids: [sid] });
    return { ok: true, message: `Retrying series ${sid}` };
  }

  async submitTasks(req) {
    // 1. Batch mode
    if (req.series_ids && req.series_ids.length > 0) {
      return this.startBatchDownload(req);
    }

    // 2. Single series mode
    const sid = String(req.series_id || (req.series_info && req.series_info.series_id) || '');
    if (!sid) {
      throw new Error('No series_id provided');
    }

    return this.startBatchDownload({
      series_ids: [sid],
      title: req.title,
      cover_url: req.cover_url,
      ranges: req.ranges || (req.range ? { [sid]: req.range } : (req.episodes ? { [sid]: req.episodes } : {})),
      quality: req.quality || '1080p',
      download_mode: req.download_mode || 'merged',
      download_modes: req.download_modes || (req.download_mode ? { [sid]: req.download_mode } : {}),
      series_info: req.series_info || { [sid]: { title: req.title, cover: req.cover_url } }
    });
  }

  async startBatchDownload(req) {
    const seriesIds = (req.series_ids || []).map(s => String(s)).filter(Boolean);
    if (seriesIds.length === 0) {
      return { ok: false, error: 'No series IDs provided' };
    }

    this.queueCanceled = false;
    for (const sid of seriesIds) {
      const range = (req.ranges && req.ranges[sid]) || (req.ranges && req.ranges['default']) || 'all';
      const downloadMode = (req.download_modes && req.download_modes[sid]) || req.download_mode || 'merged';
      const sInfo = (req.series_info && req.series_info[sid]) || {};
      const sTitle = sInfo.title || req.title || `Drama ${sid}`;
      const sCover = sInfo.cover || req.cover_url || '';
      const sTotal = sInfo.episode_cnt || 0;

      if (!this.queueSeries.has(sid)) {
        this.queueSeries.set(sid, {
          sid,
          title: sTitle,
          cover: sCover,
          done: 0,
          total: sTotal,
          status: 'queued',
          progress: 0,
          range,
          downloadMode,
          logs: []
        });
      } else {
        const s = this.queueSeries.get(sid);
        s.status = 'queued';
        s.done = 0;
        s.progress = 0;
        s.range = range;
        s.downloadMode = downloadMode;
        s.logs = [];
        if (sTitle) s.title = sTitle;
        if (sCover) s.cover = sCover;
      }

      // Immediately register in persistent Library so it appears in real-time
      libraryManager.registerSeries(sid, sTitle, sCover, sTotal, range).catch(() => {});
    }

    if (!this.queueRunning) {
      this.queueRunning = true;
      this.totalDone = 0;
      this.totalEps = 0;
      this.queueLogs = [];
      this.startedTime = Math.floor(Date.now() / 1000);
      this._runQueueLoop(req.quality || '1080p').catch(err => {
        this._log(`Queue runner error: ${err.message}`);
        this.queueRunning = false;
      });
    }

    return {
      ok: true,
      status: 'queued',
      queued_count: seriesIds.length,
      message: `Enqueued ${seriesIds.length} drama(s) for high-speed download`
    };
  }

  async _runQueueLoop(quality = '1080p') {
    const settings = loadSettings();
    const concurrency = Math.max(1, Math.min(8, parseInt(settings.concurrency || 5, 10)));
    const outRoot = getOutputDir();

    this._log(`Starting download processor with ${concurrency} concurrent streams into "${outRoot}"`);

    while (this.queueRunning && !this.queueCanceled) {
      // Find next queued series
      let currentEntry = null;
      for (const s of this.queueSeries.values()) {
        if (s.status === 'queued') {
          currentEntry = s;
          break;
        }
      }

      if (!currentEntry) {
        break; // All series processed
      }

      const sid = currentEntry.sid;
      this.currentSid = sid;
      currentEntry.status = 'downloading';
      currentEntry.logs = currentEntry.logs || [];
      this.currentTitle = currentEntry.title;
      this.currentStatus = 'Fetching metadata...';
      this._log(`Fetching drama details for ${sid}...`, sid);

      let detail;
      try {
        detail = await scraper.getSeriesDetail(sid);
        currentEntry.title = detail.title;
        currentEntry.cover = detail.cover || currentEntry.cover;
        this.currentTitle = detail.title;
        libraryManager.registerSeries(sid, detail.title, detail.cover, detail.episodes ? detail.episodes.length : 0, currentEntry.range).catch(() => {});
      } catch (err) {
        this._log(`Failed to fetch details for ${sid}: ${err.message}`, sid);
        currentEntry.status = 'failed';
        continue;
      }

      // Create folder
      const dramaFolderName = sanitizeFilename(detail.title);
      const dramaDir = path.join(outRoot, dramaFolderName);
      if (!fs.existsSync(dramaDir)) {
        fs.mkdirSync(dramaDir, { recursive: true });
      }

      // Save poster & series metadata
      this._saveDramaMetadata(dramaDir, detail);

      // Determine target episodes
      const targetIndices = parseEpisodeRange(currentEntry.range, detail.episodes.length);
      const targetEpisodes = detail.episodes.filter(ep => targetIndices.has(ep.index));

      currentEntry.total = targetEpisodes.length;
      currentEntry.done = 0;
      currentEntry.progress = 0;
      this.totalEps = targetEpisodes.length;
      this.totalDone = 0;
      this._log(`Selected ${targetEpisodes.length} episode(s) to download for "${detail.title}" (Range: ${currentEntry.range})`, sid);

      // Process episodes with worker pool
      let epIndex = 0;
      let seriesDoneCount = 0;

      const worker = async () => {
        while (epIndex < targetEpisodes.length && !this.queueCanceled) {
          const currentIndex = epIndex++;
          const ep = targetEpisodes[currentIndex];
          const taskId = `${sid}_ep${ep.index}`;

          this.tasks.set(taskId, {
            task_id: taskId,
            series_id: sid,
            series_title: detail.title,
            vid: ep.vid,
            episode_index: ep.index,
            episode_title: ep.title,
            status: 'downloading',
            progress: 0,
            speed: '0.0 MB/s',
            downloaded_bytes: 0
          });

          this.currentStatus = `Downloading EP ${ep.index}/${detail.episodes.length}`;

          const ok = await this._downloadSingleEpisode(ep, detail.title, sid, dramaDir, quality, taskId);
          const task = this.tasks.get(taskId);
          if (task) {
            task.status = ok ? 'done' : 'failed';
          }

          if (ok) {
            seriesDoneCount++;
            currentEntry.done = seriesDoneCount;
            currentEntry.progress = Math.round((seriesDoneCount / targetEpisodes.length) * 1000) / 10;
            this.totalDone++;
            libraryManager.updateProgress(sid, seriesDoneCount, targetEpisodes.length, currentEntry.progress, this.totalDownloadedBytes);
          }
        }
      };

      const workers = [];
      const numWorkers = Math.min(concurrency, targetEpisodes.length);
      for (let i = 0; i < numWorkers; i++) {
        workers.push(worker());
      }
      await Promise.all(workers);

      if (this.queueCanceled) {
        currentEntry.status = 'canceled';
        break;
      }

      // Automatic 2nd pass retry for any missing or incomplete episodes
      if (seriesDoneCount < targetEpisodes.length && !this.queueCanceled) {
        const missingEps = targetEpisodes.filter(ep => {
          const epNum = String(ep.index).padStart(3, '0');
          const p = path.join(dramaDir, `EP${epNum}.mp4`);
          return !isFilePlayableVideo(p);
        });
        if (missingEps.length > 0) {
          this._log(`Auto-retrying ${missingEps.length} missing/failed episode(s) for "${detail.title}"...`);
          for (const ep of missingEps) {
            if (this.queueCanceled) break;
            const taskId = `${sid}_ep${ep.index}`;
            const ok = await this._downloadSingleEpisode(ep, detail.title, sid, dramaDir, quality, taskId);
            if (ok) {
              seriesDoneCount++;
              currentEntry.done = seriesDoneCount;
              currentEntry.progress = Math.round((seriesDoneCount / targetEpisodes.length) * 1000) / 10;
              this.totalDone++;
              libraryManager.updateProgress(sid, seriesDoneCount, targetEpisodes.length, currentEntry.progress, this.totalDownloadedBytes);
            }
          }
        }
      }

      if (seriesDoneCount === targetEpisodes.length) {
        if (currentEntry.downloadMode === 'merged' || currentEntry.downloadMode === 'both') {
          currentEntry.status = 'merging';
          this.currentStatus = `តភ្ជាប់វីដេអូពេញ (${currentEntry.downloadMode === 'merged' ? 'Merged Only' : 'Keep Both'})...`;
          this._log(`Starting video merge for "${detail.title}" (Mode: ${currentEntry.downloadMode})...`, sid);
          await mergeDramaEpisodes({
            dramaDir,
            seriesTitle: detail.title,
            mode: currentEntry.downloadMode,
            onLog: (msg) => this._log(msg, sid)
          });
        }
        currentEntry.status = 'done';
        libraryManager.markCompleted(sid);
        this._log(`Finished downloading all ${seriesDoneCount} episodes of "${detail.title}"!`, sid);
      } else if (seriesDoneCount > 0) {
        if (currentEntry.downloadMode === 'merged' || currentEntry.downloadMode === 'both') {
          currentEntry.status = 'merging';
          this.currentStatus = `តភ្ជាប់វីដេអូ (${seriesDoneCount} ភាគ)...`;
          await mergeDramaEpisodes({
            dramaDir,
            seriesTitle: detail.title,
            mode: currentEntry.downloadMode,
            onLog: (msg) => this._log(msg, sid)
          });
        }
        currentEntry.status = 'partial';
        libraryManager.updateProgress(sid, seriesDoneCount, targetEpisodes.length, currentEntry.progress, this.totalDownloadedBytes);
        this._log(`Completed ${seriesDoneCount}/${targetEpisodes.length} episodes for "${detail.title}"`, sid);
      } else {
        currentEntry.status = 'failed';
        this._log(`Failed to download episodes for "${detail.title}"`, sid);
      }
    }

    this.queueRunning = false;
    this.currentStatus = this.queueCanceled ? 'Canceled' : 'All downloads finished';
    this.currentSid = null;
    this._log('Batch download queue completed.');
  }

  async _saveDramaMetadata(dramaDir, detail) {
    const coverUrl = detail.cover || (detail.episodes && detail.episodes[0] && detail.episodes[0].cover) || '';
    try {
      const meta = {
        series_id: detail.series_id,
        title: detail.title,
        intro: detail.intro,
        cover: coverUrl,
        episode_cnt: detail.episode_cnt,
        score: detail.score,
        category: detail.category,
        saved_at: new Date().toISOString()
      };
      fs.writeFileSync(path.join(dramaDir, '.series.json'), JSON.stringify(meta, null, 2), 'utf-8');
    } catch (e) {}

    // Download poster / cover image with modern fetch
    if (coverUrl) {
      const posterPath = path.join(dramaDir, 'poster.jpg');
      const coverPath = path.join(dramaDir, 'cover.jpg');
      if (!fs.existsSync(posterPath) || !fs.existsSync(coverPath)) {
        try {
          const buf = await this._downloadImageBuffer(coverUrl);
          if (buf && buf.length > 500) {
            fs.writeFileSync(posterPath, buf);
            fs.writeFileSync(coverPath, buf);
            this._log(`Saved drama poster to "${dramaDir}"`);
          }
        } catch (e) {
          this._log(`Failed to save poster: ${e.message}`);
        }
      }
    }
  }

  async _downloadImageBuffer(imgUrl) {
    if (!imgUrl) return null;
    try {
      const res = await fetch(imgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': 'https://hongguoduanju.com/',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
      });
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      return Buffer.from(arr);
    } catch (e) {
      return null;
    }
  }

  async _downloadSingleEpisode(ep, seriesTitle, seriesId, dramaDir, quality, taskId) {
    const epNumPadded = String(ep.index).padStart(3, '0');
    const finalMp4 = path.join(dramaDir, `EP${epNumPadded}.mp4`);
    const partFile = path.join(dramaDir, `EP${epNumPadded}.enc.mp4.part`);

    // Check if already completely downloaded and playable
    if (fs.existsSync(finalMp4)) {
      if (isFilePlayableVideo(finalMp4)) {
        const stat = fs.statSync(finalMp4);
        const task = this.tasks.get(taskId);
        if (task) {
          task.progress = 100;
          task.status = 'done';
          task.downloaded_bytes = stat.size;
        }
        return true;
      } else {
        // Broken file (e.g. bvc2 audio only or corrupt), delete to re-download fresh
        try { fs.unlinkSync(finalMp4); } catch (e) {}
      }
    }

    const cancelToken = { canceled: false, req: null };
    this.cancelTokens.set(taskId, cancelToken);

    // Resolve video stream at maximum 1080p quality
    let track;
    try {
      const res = await scraper.getVideoStreams(ep.vid, seriesId, '', true, quality || '1080p');
      track = res.tracks[0];
    } catch (err) {
      this._log(`Failed to resolve stream for EP ${ep.index} (${ep.vid}): ${err.message}`);
      return false;
    }

    if (!track || !track.main_url) {
      this._log(`No stream URL found for EP ${ep.index}`);
      return false;
    }

    // Stream download CDN link into .part using native fetch with retry
    let success = false;
    for (let attempt = 1; attempt <= 3 && !cancelToken.canceled && !success; attempt++) {
      try {
        const fetchHeaders = track.headers || {
          'User-Agent': 'com.phoenix.read/71332',
          'Referer': 'https://novel.snssdk.com/'
        };

        const res = await fetch(track.main_url, { headers: fetchHeaders });
        if (res.ok && res.body) {
          const totalBytes = parseInt(res.headers.get('content-length') || track.size || 0, 10);
          const out = fs.createWriteStream(partFile, { highWaterMark: 1024 * 1024 });
          let receivedBytes = 0;

          const reader = Readable.fromWeb(res.body);
          reader.on('data', (chunk) => {
            if (cancelToken.canceled) {
              reader.destroy();
              out.destroy();
              return;
            }
            receivedBytes += chunk.length;
            this.totalDownloadedBytes += chunk.length;

            const task = this.tasks.get(taskId);
            if (task) {
              task.downloaded_bytes = receivedBytes;
              if (totalBytes > 0) {
                task.progress = Math.round((receivedBytes / totalBytes) * 1000) / 10;
              }
            }
          });

          await pipeline(reader, out);
          success = !cancelToken.canceled && fs.existsSync(partFile) && fs.statSync(partFile).size > 10240;
        }
      } catch (e) {
        if (attempt < 3 && !cancelToken.canceled) {
          this._log(`Download stream attempt ${attempt} for EP ${ep.index} error: ${e.message}, retrying in 1s...`);
          await new Promise(r => setTimeout(r, 1000));
        } else {
          this._log(`Download stream error for EP ${ep.index}: ${e.message}`);
        }
      }
    }

    if (!success || cancelToken.canceled) {
      if (fs.existsSync(partFile)) {
        try { fs.unlinkSync(partFile); } catch (e) {}
      }
      return false;
    }

    // Decrypt if encrypted, or rename
    try {
      if (track.encrypted && track.spade_a) {
        await cenc.decryptFile(partFile, finalMp4, track.spade_a);
        if (fs.existsSync(partFile)) {
          fs.unlinkSync(partFile);
        }
      } else {
        if (fs.existsSync(finalMp4)) {
          fs.unlinkSync(finalMp4);
        }
        fs.renameSync(partFile, finalMp4);
      }

      // Ensure H.264 video compatibility for all video players
      await ensureH264File(finalMp4);

      const task = this.tasks.get(taskId);
      if (task) {
        task.progress = 100;
        task.status = 'done';
      }
      return true;
    } catch (err) {
      this._log(`Decryption error on EP ${ep.index}: ${err.message}`);
      if (fs.existsSync(partFile)) {
        try { fs.unlinkSync(partFile); } catch (e) {}
      }
      return false;
    }
  }

  async scanLibrary() {
    return await libraryManager.scanAndGetLibrary(this.queueSeries);
  }
}

const downloadManager = new DownloadManager();

module.exports = {
  downloadManager,
  sanitizeFilename,
  parseEpisodeRange
};
