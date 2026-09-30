/**
 * Offline & Live Downloaded Library Manager
 * Tracks completed and currently downloading series persistently.
 */

const fs = require('fs');
const path = require('path');
const { DATA_DIR, getOutputDir } = require('./config.js');
const { translateDramaTitle } = require('./translator.js');

const LIBRARY_FILE = path.join(DATA_DIR, 'library_db.json');
const CLEARED_FILE = path.join(DATA_DIR, 'cleared_library.json');

class LibraryManager {
  constructor() {
    this.db = new Map(); // series_id -> record
    this.clearedSeries = new Set(); // lowercase IDs, folders, titles
    this.clearedYoutube = new Set(); // lowercase filenames / paths
    this._load();
    this._loadCleared();
  }

  _load() {
    try {
      if (fs.existsSync(LIBRARY_FILE)) {
        const raw = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
        for (const item of raw) {
          if (item && item.series_id) {
            this.db.set(String(item.series_id), item);
          }
        }
      }
    } catch (e) {
      console.warn('[LibraryManager] Failed to load library_db.json:', e.message);
    }
  }

  _loadCleared() {
    try {
      if (fs.existsSync(CLEARED_FILE)) {
        const raw = JSON.parse(fs.readFileSync(CLEARED_FILE, 'utf-8'));
        if (raw && Array.isArray(raw.series)) {
          for (const s of raw.series) {
            if (s) {
              this.clearedSeries.add(String(s));
              this.clearedSeries.add(String(s).trim().toLowerCase());
            }
          }
        }
        if (raw && Array.isArray(raw.youtube)) {
          for (const y of raw.youtube) {
            if (y) {
              this.clearedYoutube.add(String(y));
              this.clearedYoutube.add(String(y).trim().toLowerCase());
            }
          }
        }
      }
    } catch (e) {
      console.warn('[LibraryManager] Failed to load cleared_library.json:', e.message);
    }
  }

  _save() {
    try {
      const list = Array.from(this.db.values());
      fs.writeFileSync(LIBRARY_FILE, JSON.stringify(list, null, 2), 'utf-8');
    } catch (e) {
      console.error('[LibraryManager] Failed to save library_db.json:', e.message);
    }
  }

  _saveCleared() {
    try {
      const data = {
        series: Array.from(this.clearedSeries),
        youtube: Array.from(this.clearedYoutube)
      };
      fs.writeFileSync(CLEARED_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[LibraryManager] Failed to save cleared_library.json:', e.message);
    }
  }

  clearSeries(sid, folder, title) {
    if (sid) {
      this.clearedSeries.add(String(sid));
      this.clearedSeries.add(String(sid).trim().toLowerCase());
    }
    if (folder) {
      this.clearedSeries.add(String(folder));
      this.clearedSeries.add(String(folder).trim().toLowerCase());
    }
    if (title) {
      this.clearedSeries.add(String(title));
      this.clearedSeries.add(String(title).trim().toLowerCase());
    }
  }

  unclearSeries(sid, folder, title) {
    let changed = false;
    const toDel = [];
    if (sid) {
      toDel.push(String(sid), String(sid).trim().toLowerCase());
    }
    if (folder) {
      toDel.push(String(folder), String(folder).trim().toLowerCase());
    }
    if (title) {
      toDel.push(String(title), String(title).trim().toLowerCase());
    }
    for (const k of toDel) {
      if (this.clearedSeries.has(k)) {
        this.clearedSeries.delete(k);
        changed = true;
      }
    }
    if (changed) this._saveCleared();
  }

  isCleared(sid, folder, title) {
    if (sid) {
      const s = String(sid).trim().toLowerCase();
      if (this.clearedSeries.has(String(sid)) || this.clearedSeries.has(s)) return true;
    }
    if (folder) {
      const f = String(folder).trim().toLowerCase();
      if (this.clearedSeries.has(String(folder)) || this.clearedSeries.has(f)) return true;
    }
    if (title) {
      const t = String(title).trim().toLowerCase();
      if (this.clearedSeries.has(String(title)) || this.clearedSeries.has(t)) return true;
    }
    return false;
  }

  clearYoutube(nameOrPath) {
    if (!nameOrPath) return;
    const str = String(nameOrPath);
    this.clearedYoutube.add(str);
    this.clearedYoutube.add(str.trim().toLowerCase());
  }

  unclearYoutube(nameOrPath) {
    if (!nameOrPath) return;
    const str = String(nameOrPath);
    this.clearedYoutube.delete(str);
    this.clearedYoutube.delete(str.trim().toLowerCase());
    this._saveCleared();
  }

  isYoutubeCleared(nameOrPath) {
    if (!nameOrPath) return false;
    const str = String(nameOrPath);
    return this.clearedYoutube.has(str) || this.clearedYoutube.has(str.trim().toLowerCase());
  }

  getClearedYoutube() {
    return this.clearedYoutube;
  }

  /**
   * Adds or updates a series in the library database.
   */
  async registerSeries(sid, title, coverUrl = '', totalEps = 0, range = 'all', platform = 'hongguo') {
    const sId = String(sid);
    const existing = this.db.get(sId) || {};

    const khmerTitle = await translateDramaTitle(title || existing.title || `Drama ${sid}`, 'km');
    const englishTitle = await translateDramaTitle(title || existing.title || `Drama ${sid}`, 'en');

    const folderName = existing.folder || (title ? String(title).replace(/[\\/*?:"<>|\r\n\t]/g, '_').trim() : sId);
    this.unclearSeries(sId, folderName, title);
    let seriesPath = existing.path;
    if (!seriesPath) {
      const rootDir = getOutputDir();
      if (platform === 'haosou') seriesPath = path.join(rootDir, 'HaoSou', folderName);
      else if (platform === 'mvffm') seriesPath = path.join(rootDir, 'MVFFM', folderName);
      else seriesPath = path.join(rootDir, folderName);
    }

    const updated = {
      series_id: sId,
      platform: platform || existing.platform || 'hongguo',
      title: title || existing.title || `Drama ${sId}`,
      khmer_title: khmerTitle,
      english_title: englishTitle,
      cover: coverUrl || existing.cover || '',
      poster_url: existing.has_poster
        ? `/api/library/poster?folder=${encodeURIComponent(existing.folder || title)}`
        : (coverUrl || existing.cover || ''),
      total_episodes: totalEps || existing.total_episodes || 0,
      episode_count: existing.episode_count || 0,
      missing_count: Math.max(0, (totalEps || existing.total_episodes || 0) - (existing.episode_count || 0)),
      missing_episodes: existing.missing_episodes || [],
      progress: existing.progress || 0,
      status: existing.status === 'completed' ? 'completed' : 'downloading',
      range: range || existing.range || 'all',
      total_size: existing.total_size || 0,
      total_size_str: existing.total_size_str || '0 MB',
      folder: folderName,
      path: seriesPath,
      added_at: existing.added_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.db.set(sId, updated);
    this._save();
    return updated;
  }

  /**
   * Update download progress for a series.
   */
  updateProgress(sid, doneCount, totalEps, progress, currentBytes = 0) {
    const sId = String(sid);
    if (!this.db.has(sId)) return;
    const item = this.db.get(sId);
    item.episode_count = doneCount;
    if (totalEps > 0) item.total_episodes = totalEps;
    item.progress = Math.min(100, Math.max(0, Math.round(progress)));
    if (item.total_episodes > 0) {
      item.missing_count = Math.max(0, item.total_episodes - doneCount);
    }
    if (item.progress >= 100 && doneCount >= (item.total_episodes || 1)) {
      item.status = 'completed';
      item.missing_count = 0;
    } else {
      item.status = 'downloading';
    }
    if (currentBytes > 0) {
      item.total_size = currentBytes;
      const mb = currentBytes / (1024 * 1024);
      const gb = mb / 1024;
      item.total_size_str = gb >= 1 ? `${gb.toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
    }
    item.updated_at = new Date().toISOString();
    this._save();
  }

  /**
   * Mark a series as completed.
   */
  markCompleted(sid, totalSize = 0) {
    const sId = String(sid);
    if (!this.db.has(sId)) return;
    const item = this.db.get(sId);
    item.status = 'completed';
    item.progress = 100;
    item.missing_count = 0;
    item.missing_episodes = [];
    if (totalSize > 0) {
      item.total_size = totalSize;
      const mb = totalSize / (1024 * 1024);
      const gb = mb / 1024;
      item.total_size_str = gb >= 1 ? `${gb.toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
    }
    item.updated_at = new Date().toISOString();
    this._save();
  }

  /**
   * Scans disk folders (root, HaoSou, MVFFM) and merges with database and active queue.
   */
  async scanAndGetLibrary(activeQueueSeries = null) {
    const outRoot = getOutputDir();

    const candidateDirs = [];
    if (fs.existsSync(outRoot)) {
      // 1. Root level drama folders
      try {
        const rootEntries = fs.readdirSync(outRoot, { withFileTypes: true });
        for (const ent of rootEntries) {
          if (!ent.isDirectory()) continue;
          if (ent.name === 'HaoSou' || ent.name === 'MVFFM' || ent.name === 'YouTube' || ent.name.startsWith('.')) continue;
          candidateDirs.push({ folderPath: path.join(outRoot, ent.name), folderName: ent.name, defaultPlatform: 'hongguo' });
        }
      } catch (e) {}

      // 2. HaoSou subfolders
      const hsRoot = path.join(outRoot, 'HaoSou');
      if (fs.existsSync(hsRoot)) {
        try {
          const hsEntries = fs.readdirSync(hsRoot, { withFileTypes: true });
          for (const ent of hsEntries) {
            if (ent.isDirectory() && !ent.name.startsWith('.')) {
              candidateDirs.push({ folderPath: path.join(hsRoot, ent.name), folderName: ent.name, defaultPlatform: 'haosou' });
            }
          }
        } catch (e) {}
      }

      // 3. MVFFM subfolders
      const mvRoot = path.join(outRoot, 'MVFFM');
      if (fs.existsSync(mvRoot)) {
        try {
          const mvEntries = fs.readdirSync(mvRoot, { withFileTypes: true });
          for (const ent of mvEntries) {
            if (ent.isDirectory() && !ent.name.startsWith('.')) {
              candidateDirs.push({ folderPath: path.join(mvRoot, ent.name), folderName: ent.name, defaultPlatform: 'mvffm' });
            }
          }
        } catch (e) {}
      }
    }

    // Process all candidate directories
    for (const item of candidateDirs) {
      const { folderPath, folderName, defaultPlatform } = item;
      let seriesMeta = null;
      const metaPath = path.join(folderPath, '.series.json');
      if (fs.existsSync(metaPath)) {
        try {
          seriesMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        } catch (e) {}
      }

      let episodeCount = 0;
      let totalBytes = 0;
      let hasPoster = false;
      let hasFullVideo = false;
      let fullVideoName = '';
      const downloadedEpNums = new Set();

      try {
        const files = fs.readdirSync(folderPath);
        for (const f of files) {
          const lower = f.toLowerCase();
          if (lower.endsWith('.mp4') && !lower.endsWith('.part') && !lower.endsWith('.tmp.mp4')) {
            try {
              const sz = fs.statSync(path.join(folderPath, f)).size;
              if (sz > 10240) {
                if (f.includes('Full') || f.includes('វីដេអូពេញ')) {
                  hasFullVideo = true;
                  fullVideoName = f;
                  const matchFull = f.match(/Full_(\d+)ភាគ/i);
                  if (matchFull) {
                    const fullCount = parseInt(matchFull[1], 10);
                    if (fullCount > episodeCount) episodeCount = fullCount;
                  } else if (episodeCount === 0) {
                    episodeCount = 1;
                  }
                } else {
                  episodeCount++;
                  const m = f.match(/(?:EP?|ភាគ|E|第|_|-|\b)0*(\d+)(?:[._-]|集|$)/i);
                  if (m) {
                    downloadedEpNums.add(parseInt(m[1], 10));
                  }
                }
                totalBytes += sz;
              }
            } catch (e) {}
          }
          if (['poster.jpg', 'cover.jpg', 'poster.png', 'cover.png'].includes(lower)) {
            hasPoster = true;
          }
        }
      } catch (e) {}

      if (episodeCount === 0 && !seriesMeta && !hasFullVideo) {
        continue;
      }

      const sId = (seriesMeta && String(seriesMeta.series_id)) || folderName;
      const title = (seriesMeta && seriesMeta.title) || folderName;
      const cover = (seriesMeta && seriesMeta.cover) || '';
      const platform = (seriesMeta && seriesMeta.platform) || defaultPlatform || 'hongguo';

      // Check if this series is in activeQueueSeries
      let isInActiveQueue = false;
      if (activeQueueSeries) {
        const q = activeQueueSeries.get(sId) || activeQueueSeries.get(folderName);
        if (q && (['queued', 'downloading', 'merging'].includes(q.status) || (q.done < q.total && q.status !== 'done' && q.status !== 'failed'))) {
          isInActiveQueue = true;
        }
      }

      // If this item was cleared before and is NOT currently downloading in active queue, skip it!
      if (this.isCleared(sId, folderName, title) && !isInActiveQueue) {
        continue;
      }

      if (isInActiveQueue) {
        this.unclearSeries(sId, folderName, title);
      }

      let maxFoundEp = 0;
      for (const n of downloadedEpNums) {
        if (n > maxFoundEp) maxFoundEp = n;
      }
      const totalEps = (seriesMeta && (seriesMeta.episode_cnt || seriesMeta.total_episodes)) || (maxFoundEp > episodeCount ? maxFoundEp : episodeCount);

      // Calculate missing episodes
      let missingEps = [];
      if (!hasFullVideo && totalEps > 0) {
        for (let ep = 1; ep <= totalEps; ep++) {
          if (!downloadedEpNums.has(ep)) {
            missingEps.push(ep);
          }
        }
      }

      const sizeGb = totalBytes / (1024 * 1024 * 1024);
      const sizeMb = totalBytes / (1024 * 1024);
      const totalSizeStr = sizeGb >= 1 ? `${sizeGb.toFixed(2)} GB` : `${sizeMb.toFixed(1)} MB`;

      const isDone = hasFullVideo || (episodeCount >= totalEps && episodeCount > 0 && missingEps.length === 0);
      const existing = this.db.get(sId);

      if (!existing) {
        const km = await translateDramaTitle(title, 'km');
        const en = await translateDramaTitle(title, 'en');
        this.db.set(sId, {
          series_id: sId,
          platform,
          title,
          khmer_title: km,
          english_title: en,
          cover,
          has_poster: hasPoster,
          poster_url: hasPoster ? `/api/library/poster?folder=${encodeURIComponent(folderName)}` : (cover || ''),
          total_episodes: totalEps,
          episode_count: episodeCount,
          missing_count: missingEps.length,
          missing_episodes: missingEps,
          downloaded_episodes: Array.from(downloadedEpNums).sort((a, b) => a - b),
          progress: totalEps > 0 ? Math.min(100, Math.round((episodeCount / totalEps) * 100)) : 100,
          status: isDone ? 'completed' : 'partial',
          total_size: totalBytes,
          total_size_str: totalSizeStr,
          folder: folderName,
          path: folderPath,
          added_at: (seriesMeta && seriesMeta.saved_at) || new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      } else {
        existing.folder = folderName;
        existing.path = folderPath;
        existing.platform = existing.platform || platform;
        existing.episode_count = episodeCount;
        existing.total_episodes = Math.max(existing.total_episodes || 0, totalEps);
        existing.missing_count = missingEps.length;
        existing.missing_episodes = missingEps;
        existing.downloaded_episodes = Array.from(downloadedEpNums).sort((a, b) => a - b);
        if (totalBytes > 0) {
          existing.total_size = totalBytes;
          existing.total_size_str = totalSizeStr;
        }
        if (hasPoster) existing.has_poster = true;
        if (existing.has_poster) {
          existing.poster_url = `/api/library/poster?folder=${encodeURIComponent(folderName)}`;
        } else if (!existing.poster_url && cover) {
          existing.poster_url = cover;
        }
        if (isDone) {
          existing.status = 'completed';
          existing.progress = 100;
        } else if (existing.status !== 'downloading') {
          existing.status = 'partial';
          existing.progress = existing.total_episodes > 0 ? Math.min(100, Math.round((episodeCount / existing.total_episodes) * 100)) : 0;
        }
      }
    }

    // 2. Merge with active in-memory queue
    if (activeQueueSeries) {
      for (const [sid, q] of activeQueueSeries.entries()) {
        const sId = String(sid);
        const existing = this.db.get(sId);
        if (!existing) {
          const km = await translateDramaTitle(q.title || `Drama ${sId}`, 'km');
          const en = await translateDramaTitle(q.title || `Drama ${sId}`, 'en');
          const done = q.done || 0;
          const total = q.total || 0;
          const missingCnt = Math.max(0, total - done);
          this.db.set(sId, {
            series_id: sId,
            platform: q.platform || 'hongguo',
            title: q.title || `Drama ${sId}`,
            khmer_title: km,
            english_title: en,
            cover: q.cover || '',
            poster_url: q.cover || '',
            total_episodes: total,
            episode_count: done,
            missing_count: missingCnt,
            missing_episodes: [],
            progress: q.progress || 0,
            status: q.status || 'downloading',
            total_size: 0,
            total_size_str: '0 MB',
            folder: String(q.title || sId).replace(/[\\/*?:"<>|\r\n\t]/g, '_').trim(),
            path: path.join(outRoot, String(q.title || sId).replace(/[\\/*?:"<>|\r\n\t]/g, '_').trim()),
            added_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        } else {
          if (q.status === 'downloading' || q.status === 'running') {
            existing.status = 'downloading';
            existing.progress = q.progress || existing.progress;
            existing.episode_count = Math.max(existing.episode_count, q.done || 0);
            if (q.total > 0) {
              existing.total_episodes = q.total;
              existing.missing_count = Math.max(0, q.total - existing.episode_count);
            }
          } else if (q.status === 'done' || q.status === 'completed') {
            existing.status = 'completed';
            existing.progress = 100;
            existing.missing_count = 0;
            existing.missing_episodes = [];
          }
        }
      }
    }

    this._save();

    // Convert map to array and sort latest first
    const list = Array.from(this.db.values());
    list.sort((a, b) => {
      const tA = new Date(a.updated_at || a.added_at || 0).getTime();
      const tB = new Date(b.updated_at || b.added_at || 0).getTime();
      return tB - tA;
    });

    return list;
  }

  /**
   * Check if a series has already been downloaded (partially or completely)
   * to avoid duplicate downloads (កុំឲ្យដោនជាន់រឿងគ្នា).
   */
  async checkSeriesMemory(sid, title = '', platform = 'hongguo', totalEpisodes = 0) {
    const sId = String(sid || '').trim();
    const cleanTitle = (title || '').trim().replace(/[\\/*?:"<>|\r\n\t]/g, '_');
    const outRoot = getOutputDir();

    // 1. Check in-memory DB
    let record = null;
    if (sId && this.db.has(sId)) {
      record = this.db.get(sId);
    }
    if (!record && cleanTitle) {
      for (const item of this.db.values()) {
        if (item.title && item.title.trim().toLowerCase() === title.trim().toLowerCase()) {
          record = item;
          break;
        }
      }
    }

    // 2. Also check physical disk folder
    const checkPaths = [];
    if (record && record.path && fs.existsSync(record.path)) {
      checkPaths.push(record.path);
    }
    if (cleanTitle) {
      if (platform === 'haosou') checkPaths.push(path.join(outRoot, 'HaoSou', cleanTitle));
      else if (platform === 'mvffm') checkPaths.push(path.join(outRoot, 'MVFFM', cleanTitle));
      else checkPaths.push(path.join(outRoot, cleanTitle));
      // Also check root as fallback
      checkPaths.push(path.join(outRoot, cleanTitle));
    }

    let foundPath = null;
    for (const p of checkPaths) {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        foundPath = p;
        break;
      }
    }

    const downloadedEpNums = new Set();
    if (foundPath) {
      try {
        const files = fs.readdirSync(foundPath);
        for (const f of files) {
          if (f.toLowerCase().endsWith('.mp4') && !f.toLowerCase().endsWith('.part')) {
            const m = f.match(/(?:EP?|ភាគ|E|第|_|-|\b)0*(\d+)(?:[._-]|集|$)/i);
            if (m) downloadedEpNums.add(parseInt(m[1], 10));
          }
        }
      } catch (e) {}
    }

    const downloadedList = Array.from(downloadedEpNums).sort((a, b) => a - b);
    const count = downloadedList.length > 0 ? downloadedList.length : (record ? (record.episode_count || 0) : 0);
    const expectedTotal = totalEpisodes > 0 ? totalEpisodes : (record ? (record.total_episodes || 0) : count);

    const missingEps = [];
    if (expectedTotal > 0) {
      for (let i = 1; i <= expectedTotal; i++) {
        if (!downloadedEpNums.has(i)) {
          missingEps.push(i);
        }
      }
    }

    const isCompleted = count >= expectedTotal && expectedTotal > 0 && missingEps.length === 0;
    const isPartial = count > 0 && (!isCompleted || missingEps.length > 0);

    return {
      exists: count > 0 || isCompleted,
      series_id: sId,
      title: title || (record ? record.title : ''),
      platform: (record ? record.platform : platform) || platform,
      is_completed: isCompleted,
      is_partial: isPartial,
      status: isCompleted ? 'completed' : (isPartial ? 'partial' : 'none'),
      downloaded_count: count,
      total_episodes: expectedTotal,
      downloaded_episodes: downloadedList,
      missing_count: missingEps.length,
      missing_episodes: missingEps,
      folder: foundPath ? path.basename(foundPath) : (record ? record.folder : cleanTitle),
      path: foundPath || (record ? record.path : '')
    };
  }

  /**
   * Delete a series from library.
   */
  deleteSeries(sid, deleteLocalFiles = false) {
    const sId = String(sid);
    const item = this.db.get(sId);
    if (!item) return false;

    if (deleteLocalFiles && item.path && fs.existsSync(item.path)) {
      try {
        fs.rmSync(item.path, { recursive: true, force: true });
      } catch (e) {
        console.warn('[LibraryManager] Failed to delete directory:', e.message);
      }
    }

    this.clearSeries(sId, item.folder, item.title);
    this.db.delete(sId);
    this._saveCleared();
    this._save();
    return true;
  }

  /**
   * Cleans completed and inactive series records from the library view.
   * Actively downloading series (e.g. 4/10 done, 6 downloading) are strictly SPARED and preserved.
   */
  cleanLibrary(activeInfo = {}) {
    const activeIds = activeInfo.activeSeriesIds || new Set();
    const activeFolders = activeInfo.activeFolders || new Set();
    const activeTitles = activeInfo.activeTitles || new Set();
    const activeYt = activeInfo.activeYtFiles || new Set();

    let cleanedCount = 0;
    let sparedCount = 0;

    // 1. Process current DB records
    for (const [sid, item] of this.db.entries()) {
      const sIdStr = String(sid);
      const folderKey = (item.folder || '').trim().toLowerCase();
      const titleKey = (item.title || '').trim().toLowerCase();

      const isActive = activeIds.has(sIdStr) ||
                       (folderKey && activeFolders.has(folderKey)) ||
                       (titleKey && activeTitles.has(titleKey)) ||
                       (item.status === 'downloading');

      if (isActive) {
        sparedCount++;
        this.unclearSeries(sIdStr, item.folder, item.title);
      } else {
        this.clearSeries(sIdStr, item.folder, item.title);
        this.db.delete(sid);
        cleanedCount++;
      }
    }

    // 2. Also ensure all candidate disk folders that are NOT actively downloading are marked as cleared
    const outRoot = getOutputDir();
    const checkFolders = [];
    try {
      if (fs.existsSync(outRoot)) {
        const ents = fs.readdirSync(outRoot, { withFileTypes: true });
        for (const e of ents) {
          if (e.isDirectory() && !['HaoSou', 'MVFFM', 'YouTube'].includes(e.name) && !e.name.startsWith('.')) {
            checkFolders.push({ folder: e.name, p: path.join(outRoot, e.name) });
          }
        }
      }
      const hsRoot = path.join(outRoot, 'HaoSou');
      if (fs.existsSync(hsRoot)) {
        const ents = fs.readdirSync(hsRoot, { withFileTypes: true });
        for (const e of ents) {
          if (e.isDirectory() && !e.name.startsWith('.')) {
            checkFolders.push({ folder: e.name, p: path.join(hsRoot, e.name) });
          }
        }
      }
      const mvRoot = path.join(outRoot, 'MVFFM');
      if (fs.existsSync(mvRoot)) {
        const ents = fs.readdirSync(mvRoot, { withFileTypes: true });
        for (const e of ents) {
          if (e.isDirectory() && !e.name.startsWith('.')) {
            checkFolders.push({ folder: e.name, p: path.join(mvRoot, e.name) });
          }
        }
      }
    } catch (e) {}

    for (const { folder, p } of checkFolders) {
      const fKey = folder.trim().toLowerCase();
      let metaSid = null;
      let metaTitle = null;
      try {
        const metaPath = path.join(p, '.series.json');
        if (fs.existsSync(metaPath)) {
          const m = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          if (m && m.series_id) metaSid = String(m.series_id);
          if (m && m.title) metaTitle = m.title;
        }
      } catch (e) {}

      const isAct = (metaSid && activeIds.has(metaSid)) ||
                    activeFolders.has(fKey) ||
                    (metaTitle && activeTitles.has(metaTitle.trim().toLowerCase()));

      if (isAct) {
        this.unclearSeries(metaSid || folder, folder, metaTitle);
      } else {
        this.clearSeries(metaSid || folder, folder, metaTitle);
      }
    }

    // 3. YouTube files
    const ytDir = path.join(outRoot, 'YouTube');
    if (fs.existsSync(ytDir)) {
      try {
        const ytFiles = fs.readdirSync(ytDir);
        for (const f of ytFiles) {
          const fKey = f.trim().toLowerCase();
          if (activeYt.has(fKey)) {
            this.unclearYoutube(fKey);
          } else {
            this.clearYoutube(fKey);
            this.clearYoutube(f);
          }
        }
      } catch (e) {}
    }

    this._saveCleared();
    this._save();

    return { ok: true, cleanedCount, sparedCount };
  }
}

const libraryManager = new LibraryManager();

module.exports = {
  libraryManager
};
