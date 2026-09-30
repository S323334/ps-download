/**
 * Download Memory & History Manager
 * Tracks clicked/downloaded drama posters and YouTube downloads persistently.
 */

const fs = require('fs');
const path = require('path');
const { DATA_DIR, getOutputDir } = require('./config.js');
const { translateDramaTitle } = require('./translator.js');

const MEMORY_FILE = path.join(DATA_DIR, 'download_memory.json');
const LIBRARY_FILE = path.join(DATA_DIR, 'library_db.json');

class DownloadMemoryManager {
  constructor() {
    this.memory = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(MEMORY_FILE)) {
        const raw = fs.readFileSync(MEMORY_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.memory = parsed;
        }
      }
    } catch (e) {
      console.warn('[DownloadMemoryManager] Failed to load download_memory.json:', e.message);
      this.memory = [];
    }
  }

  _save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.memory, null, 2), 'utf-8');
    } catch (e) {
      console.error('[DownloadMemoryManager] Failed to save download_memory.json:', e.message);
    }
  }

  /**
   * Seed existing library items into memory if memory is new or items missing
   */
  async seedFromLibraryIfEmpty() {
    const knownKeys = new Set(this.memory.map(m => `${m.platform || 'hongguo'}_${m.id}`));

    // 1. Read library_db.json
    try {
      if (fs.existsSync(LIBRARY_FILE)) {
        const libRaw = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
        if (Array.isArray(libRaw)) {
          for (const it of libRaw) {
            const sid = String(it.series_id || it.id || '');
            const plat = it.platform || 'hongguo';
            const key = `${plat}_${sid}`;
            if (sid && !knownKeys.has(key)) {
              let ts = Date.now();
              if (it.added_at) {
                const parsed = new Date(it.added_at).getTime();
                if (!isNaN(parsed)) ts = parsed;
              } else if (it.path && fs.existsSync(it.path)) {
                try {
                  const st = fs.statSync(it.path);
                  ts = st.birthtimeMs || st.mtimeMs || Date.now();
                } catch (e) {}
              }

              this.memory.push({
                id: sid,
                platform: plat,
                title: it.title || `Drama ${sid}`,
                khmer_title: it.khmer_title || it.title || `Drama ${sid}`,
                cover: it.poster_url || it.cover || '',
                total_episodes: it.total_episodes || it.episode_count || 1,
                url: '',
                timestamp: ts,
                saved_at: new Date(ts).toISOString()
              });
              knownKeys.add(key);
            }
          }
        }
      }
    } catch (e) {}

    // 2. Check YouTube folder
    try {
      const ytDir = path.join(getOutputDir(), 'YouTube');
      if (fs.existsSync(ytDir)) {
        const files = fs.readdirSync(ytDir);
        for (const f of files) {
          const lower = f.toLowerCase();
          if (['.mp4', '.mkv', '.webm', '.mp3'].some(ext => lower.endsWith(ext))) {
            const key = `youtube_${f}`;
            if (!knownKeys.has(key)) {
              let ts = Date.now();
              try {
                const st = fs.statSync(path.join(ytDir, f));
                ts = st.birthtimeMs || st.mtimeMs || Date.now();
              } catch (e) {}

              this.memory.push({
                id: f,
                platform: 'youtube',
                title: f.replace(/\.[^/.]+$/, ''),
                khmer_title: f.replace(/\.[^/.]+$/, ''),
                cover: '',
                total_episodes: 1,
                url: '',
                timestamp: ts,
                saved_at: new Date(ts).toISOString()
              });
              knownKeys.add(key);
            }
          }
        }
      }
    } catch (e) {}

    // Sort by timestamp desc
    this.memory.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    this._save();
  }

  /**
   * Get all memory items
   */
  async getMemory() {
    if (this.memory.length === 0) {
      await this.seedFromLibraryIfEmpty();
    }
    return this.memory;
  }

  /**
   * Add or update an item in memory
   */
  async addMemory(item) {
    if (!item || !item.id) return null;
    const sid = String(item.id);
    const plat = item.platform || 'hongguo';
    const key = `${plat}_${sid}`;

    const title = item.title || item.original_title || `Drama ${sid}`;
    let khmerTitle = item.khmer_title;
    if (!khmerTitle || khmerTitle === title) {
      khmerTitle = await translateDramaTitle(title, 'km');
    }

    const ts = item.timestamp ? Number(item.timestamp) : Date.now();

    const record = {
      id: sid,
      platform: plat,
      title: title,
      khmer_title: khmerTitle || title,
      cover: item.cover || item.poster || item.thumbnail || '',
      url: item.url || '',
      total_episodes: item.total_episodes || item.episode_cnt || 1,
      timestamp: ts,
      saved_at: new Date(ts).toISOString()
    };

    // Remove existing duplicate if present
    this.memory = this.memory.filter(m => `${m.platform || 'hongguo'}_${m.id}` !== key && m.id !== sid);
    
    // Put at beginning (newest first)
    this.memory.unshift(record);

    // Keep max 200 items in history
    if (this.memory.length > 200) {
      this.memory = this.memory.slice(0, 200);
    }

    this._save();
    return record;
  }

  /**
   * Remove single item by ID
   */
  removeMemory(id) {
    if (!id) return false;
    const sId = String(id);
    const initialLen = this.memory.length;
    this.memory = this.memory.filter(m => m.id !== sId && `${m.platform}_${m.id}` !== sId);
    if (this.memory.length !== initialLen) {
      this._save();
      return true;
    }
    return false;
  }

  /**
   * Clear all download memory
   */
  clearMemory() {
    this.memory = [];
    this._save();
    return true;
  }
}

const downloadMemoryManager = new DownloadMemoryManager();

module.exports = {
  downloadMemoryManager
};
