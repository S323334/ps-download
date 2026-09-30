/**
 * High-performance Scraper & Stream Resolver for hongguoduanju.com
 * Handles SSR data extraction, rankings, category listings, search, and CDN resolution.
 */

const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const urlModule = require('url');

const {
  UPSTREAM_WEB_URL,
  CACHE_DIR,
  DEFAULT_HEADERS
} = require('./config.js');

const fqapi = require('../lib/fqapi.js');

// In-memory caches
let _HOME_CACHE = null; // { timestamp, data }
const _SEARCH_CACHE = new Map(); // query -> { timestamp, data }
const _STREAMS_CACHE = new Map(); // vid -> streamData
const _VID_TO_SERIES = new Map(); // vid -> seriesId

const VID_SERIES_FILE = path.join(CACHE_DIR, 'vid_series_map.json');
const STREAMS_CACHE_FILE = path.join(CACHE_DIR, 'streams_cache.json');

// Load persistent caches
try {
  if (fs.existsSync(VID_SERIES_FILE)) {
    const raw = JSON.parse(fs.readFileSync(VID_SERIES_FILE, 'utf-8'));
    for (const [k, v] of Object.entries(raw)) {
      _VID_TO_SERIES.set(k, v);
    }
  }
} catch (e) {
  console.warn('[Scraper] Failed to load vid_series_map.json:', e.message);
}

try {
  if (fs.existsSync(STREAMS_CACHE_FILE)) {
    const raw = JSON.parse(fs.readFileSync(STREAMS_CACHE_FILE, 'utf-8'));
    for (const [k, v] of Object.entries(raw)) {
      _STREAMS_CACHE.set(k, v);
    }
  }
} catch (e) {
  console.warn('[Scraper] Failed to load streams_cache.json:', e.message);
}

function persistVidSeriesMap() {
  try {
    const obj = Object.fromEntries(_VID_TO_SERIES);
    fs.writeFileSync(VID_SERIES_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Scraper] Failed to save vid_series_map.json:', e.message);
  }
}

function persistStreamsCache() {
  try {
    const obj = Object.fromEntries(_STREAMS_CACHE);
    fs.writeFileSync(STREAMS_CACHE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Scraper] Failed to save streams_cache.json:', e.message);
  }
}

/**
 * Extracts and parses Modern.js _ROUTER_DATA JSON from HTML.
 */
function extractRouterData(html) {
  if (!html) return null;
  const marker = '_ROUTER_DATA';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = html.indexOf('{', idx);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const jsonStr = html.slice(start, i + 1);
          return JSON.parse(jsonStr);
        }
      }
    }
  }
  return null;
}

/**
 * Robust extraction of series ID from text, URL, or raw ID.
 */
function extractSeriesId(text) {
  if (!text) return null;
  const cleaned = String(text).trim().replace(/^['"]+|['"]+$/g, '');
  if (/^\d{15,22}$/.test(cleaned)) {
    return cleaned;
  }
  if (cleaned.includes('://') || cleaned.includes('hongguoduanju.com')) {
    try {
      const parsed = new URL(cleaned.startsWith('http') ? cleaned : `https://${cleaned}`);
      for (const param of ['series_id', 'book_id', 'drama_id', 'id']) {
        const val = parsed.searchParams.get(param);
        if (val && /^\d+$/.test(val)) return val;
      }
      const parts = parsed.pathname.replace(/^\/|\/$/g, '').split('/');
      for (const p of parts) {
        if (/^\d{15,22}$/.test(p)) return p;
      }
    } catch (e) {}
  }
  const m1 = cleaned.match(/[?&](?:series_id|book_id|drama_id|id)=(\d{15,22})/);
  if (m1) return m1[1];
  const m2 = cleaned.match(/\b(7\d{17,19})\b/);
  if (m2) return m2[1];
  const m3 = cleaned.match(/\b(\d{18,20})\b/);
  if (m3) return m3[1];
  return null;
}

/**
 * Fetch HTTP/HTTPS URL and return text.
 */
function fetchText(requestUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(requestUrl);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(requestUrl, {
      headers: { ...DEFAULT_HEADERS, ...headers },
      timeout: 15000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, requestUrl).href;
        return fetchText(redirectUrl, headers).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${requestUrl}`));
      }
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${requestUrl}`));
    });
    req.on('error', reject);
  });
}

class HongguoScraper {
  constructor() {
    this.baseUrl = (UPSTREAM_WEB_URL || 'https://hongguoduanju.com').replace(/\/+$/, '');
  }

  /**
   * Fetches homepage sections & banners. Cached for 5 minutes.
   */
  async getHomeData() {
    const now = Date.now();
    if (_HOME_CACHE && (now - _HOME_CACHE.timestamp < 300000)) {
      return _HOME_CACHE.data;
    }

    const html = await fetchText(`${this.baseUrl}/`);
    const router = extractRouterData(html);
    if (!router) {
      throw new Error('Could not extract _ROUTER_DATA from homepage');
    }

    const page = router.loaderData?.page || {};
    const sections = page.homeSections || [];
    const banners = page.bannerList || [];

    const processedSections = [];
    for (const sec of sections) {
      const tabName = sec.tab_name || 'Dramas';
      const tabType = sec.tab_type || 'all';
      const videoList = sec.video_list || [];
      const items = [];

      for (let idx = 0; idx < videoList.length; idx++) {
        const r = videoList[idx];
        const sid = String(r.series_id || '');
        if (!sid) continue;

        const cat = (r.category_list || []).map(c => typeof c === 'object' ? c.name : c).filter(Boolean);
        const scoreText = String(r.hot_score_data?.text || '9.8');
        items.push({
          series_id: sid,
          title: r.series_title || r.series_name || 'Untitled',
          episode_cnt: parseInt(r.episode_cnt || 0, 10),
          score: scoreText,
          play_cnt: parseInt(r.hot_score_data?.score || 0, 10),
          cover: r.series_cover || '',
          intro: r.series_intro || '',
          rank: idx + 1,
          category: cat.length > 0 ? cat : [tabName],
          status: r.series_status === 1 ? 'completed' : 'ongoing'
        });
      }

      processedSections.push({
        name: tabName,
        type: tabType,
        items
      });
    }

    const processedBanners = banners.map(b => ({
      series_id: String(b.series_id || ''),
      title: b.title || b.series_title || '',
      cover: b.cover || b.image_url || '',
      intro: b.intro || ''
    })).filter(b => b.series_id);

    const result = {
      banners: processedBanners,
      sections: processedSections,
      cached_at: Math.floor(now / 1000)
    };

    _HOME_CACHE = { timestamp: now, data: result };
    return result;
  }

  /**
  /**
   * Helper to fetch items from a single category page on hongguoduanju.com.
   */
  async fetchCategoryPageItems(slug, pageNum) {
    const catUrl = `${this.baseUrl}/category/${slug}?page=${pageNum}`;
    try {
      const html = await fetchText(catUrl);
      const router = extractRouterData(html);
      if (router) {
        const catPage = router.loaderData?.category_$ || {};
        const recs = catPage.recommendList || [];
        const items = [];
        for (let idx = 0; idx < recs.length; idx++) {
          const r = recs[idx];
          const sid = String(r.series_id || '');
          if (!sid) continue;

          items.push({
            series_id: sid,
            title: r.series_title || r.series_name || 'Untitled',
            episode_cnt: parseInt(r.episode_cnt || 0, 10),
            score: String(r.score || '9.8'),
            play_cnt: parseInt(r.play_cnt || 0, 10),
            cover: r.series_cover || '',
            intro: r.series_intro || '',
            category: [slug.replace('-drama', '')],
            status: 'completed'
          });
        }
        return items;
      }
    } catch (e) {
      console.warn(`[Scraper] Category page fetch failed for ${slug} page ${pageNum}:`, e.message);
    }
    return [];
  }

  /**
   * Fetches drama rankings and paginated category lists with large catalog capacity.
   */
  async getRankings(category = 'all', page = 1, pageSize = 48) {
    const catClean = (category || 'all').toLowerCase().trim();
    const offset = (page - 1) * pageSize;

    // Homepage comprehensive list for "all" / "hot"
    if (['all', 'hot', 'top'].includes(catClean)) {
      try {
        if (page === 1) {
          const home = await this.getHomeData();
          const seenSids = new Set();
          const allItems = [];
          for (const sec of home.sections || []) {
            for (const item of sec.items || []) {
              if (!seenSids.has(item.series_id)) {
                seenSids.add(item.series_id);
                allItems.push(item);
              }
            }
          }

          // Fetch additional top dramas from categories to expand trending catalog
          const [extraReal, extraComic, extraAi] = await Promise.all([
            this.fetchCategoryPageItems('real-drama', 1),
            this.fetchCategoryPageItems('comic-drama', 1),
            this.fetchCategoryPageItems('ai-drama', 1)
          ]);

          for (const extraList of [extraReal, extraComic, extraAi]) {
            for (const item of extraList) {
              if (!seenSids.has(item.series_id)) {
                seenSids.add(item.series_id);
                allItems.push(item);
              }
            }
          }

          const paged = allItems.slice(0, pageSize);
          return {
            items: paged.map((it, idx) => ({ ...it, rank: idx + 1 })),
            total: 480,
            page: 1,
            page_size: pageSize,
            total_pages: 10,
            has_next: true,
            has_prev: false
          };
        } else {
          // Dynamic multi-category pagination for Hot tab pages 2, 3, 4, 5+
          const catP1 = (page - 1) * 2;
          const catP2 = (page - 1) * 2 + 1;
          const [real1, real2, comic1, ai1] = await Promise.all([
            this.fetchCategoryPageItems('real-drama', catP1),
            this.fetchCategoryPageItems('real-drama', catP2),
            this.fetchCategoryPageItems('comic-drama', page),
            this.fetchCategoryPageItems('ai-drama', page)
          ]);

          const seenSids = new Set();
          const combined = [];
          for (const list of [real1, real2, comic1, ai1]) {
            for (const item of list) {
              if (!seenSids.has(item.series_id)) {
                seenSids.add(item.series_id);
                combined.push(item);
              }
            }
          }

          const paged = combined.slice(0, pageSize);
          return {
            items: paged.map((it, idx) => ({ ...it, rank: offset + idx + 1 })),
            total: 480,
            page,
            page_size: pageSize,
            total_pages: Math.max(page + (paged.length >= 24 ? 5 : 0), 10),
            has_next: paged.length >= 12,
            has_prev: true
          };
        }
      } catch (e) {
        console.warn('[Scraper] getHomeData fallback in rankings failed:', e.message);
      }
    }

    const slugMap = {
      real: 'real-drama',
      'real-drama': 'real-drama',
      comic: 'comic-drama',
      'comic-drama': 'comic-drama',
      ai: 'ai-drama',
      'ai-drama': 'ai-drama',
      all: 'real-drama'
    };
    const slug = slugMap[catClean] || 'real-drama';

    // Upstream has 24 items per page; if pageSize >= 36, fetch 2 upstream pages in parallel
    const itemsPerUpstreamPage = 24;
    const fetchTwoPages = pageSize >= 36;
    const upPage1 = fetchTwoPages ? (page - 1) * 2 + 1 : page;
    const upPage2 = fetchTwoPages ? (page - 1) * 2 + 2 : null;

    try {
      const promises = [this.fetchCategoryPageItems(slug, upPage1)];
      if (upPage2) promises.push(this.fetchCategoryPageItems(slug, upPage2));

      const results = await Promise.all(promises);
      const combined = results.flat();
      const seenSids = new Set();
      const items = [];

      for (let idx = 0; idx < combined.length; idx++) {
        const item = combined[idx];
        if (!seenSids.has(item.series_id)) {
          seenSids.add(item.series_id);
          items.push({
            ...item,
            rank: offset + items.length + 1
          });
        }
      }

      const totalEstimated = Math.max(page * pageSize + 120, 360);
      return {
        items,
        total: totalEstimated,
        page,
        page_size: pageSize,
        total_pages: Math.max(page + (items.length >= 24 ? 6 : 0), 10),
        has_next: items.length >= 12,
        has_prev: page > 1
      };
    } catch (e) {
      console.warn(`[Scraper] Category fetch failed for ${slug}:`, e.message);
    }

    return {
      items: [],
      total: 0,
      page,
      page_size: pageSize,
      total_pages: 1,
      has_next: false,
      has_prev: page > 1
    };
  }

  /**
   * Searches dramas by keyword or direct series URL/ID.
   */
  async searchDramas(query, page = 1, pageSize = 24) {
    const cleaned = (query || '').trim();
    if (!cleaned) {
      return { items: [], total: 0, page: 1, page_size: pageSize, total_pages: 1, has_next: false, has_prev: false };
    }

    const cacheKey = `${cleaned}_${page}_${pageSize}`;
    const cached = _SEARCH_CACHE.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < 300000)) {
      return cached.data;
    }

    // Direct series ID or URL detection
    const directSid = extractSeriesId(cleaned);
    if (directSid) {
      try {
        const detail = await this.getSeriesDetail(directSid);
        if (detail && detail.title) {
          const res = {
            items: [{
              series_id: String(detail.series_id),
              title: detail.title,
              episode_cnt: parseInt(detail.episode_cnt || 0, 10),
              score: String(detail.score || '9.8'),
              play_cnt: 0,
              cover: detail.cover || '',
              intro: detail.intro || '',
              category: detail.category || ['Drama'],
              status: 'completed'
            }],
            total: 1,
            page: 1,
            page_size: pageSize,
            total_pages: 1,
            has_next: false,
            has_prev: false
          };
          _SEARCH_CACHE.set(cacheKey, { timestamp: Date.now(), data: res });
          return res;
        }
      } catch (e) {}
    }

    let searchTarget = cleaned;
    try {
      const { SPECIFIC_TITLES } = require('./translator.js');
      if (SPECIFIC_TITLES) {
        for (const [zhKey, tInfo] of Object.entries(SPECIFIC_TITLES)) {
          if ((tInfo.km && tInfo.km.toLowerCase().includes(cleaned.toLowerCase())) ||
              (tInfo.en && tInfo.en.toLowerCase().includes(cleaned.toLowerCase()))) {
            searchTarget = zhKey;
            break;
          }
        }
      }
    } catch (e) {}

    const searchUrl = `${this.baseUrl}/search/${encodeURIComponent(searchTarget)}`;
    try {
      const html = await fetchText(searchUrl);
      const router = extractRouterData(html);
      if (router) {
        const loader = router.loaderData || {};
        const sp = loader['search_(keyword)/page'] || loader.search_page || {};
        const rawList = sp.searchList || [];
        const items = [];

        for (let idx = 0; idx < rawList.length; idx++) {
          const item = rawList[idx];
          const vData = item.video_data || {};
          const sid = String(vData.series_id || item.series_id || item.keyword || '');
          if (!sid) continue;

          let cats = [];
          if (Array.isArray(vData.category_list)) {
            cats = vData.category_list.map(c => typeof c === 'object' ? c.name : c).filter(Boolean);
          } else if (vData.category) {
            cats = Array.isArray(vData.category) ? vData.category : [vData.category];
          } else if (item.category) {
            cats = Array.isArray(item.category) ? item.category : [item.category];
          }
          if (cats.length === 0) cats = ['短剧'];

          const title = vData.series_title || item.name || item.series_title || item.series_name || 'Untitled';
          const cover = vData.series_cover || item.series_cover || '';
          const epCnt = parseInt(vData.episode_cnt || item.episode_cnt || 0, 10);
          const intro = vData.series_intro || item.series_intro || '';
          const score = (vData.hot_score_data && vData.hot_score_data.score) ? '9.8' : String(item.score || '9.8');
          const playCnt = parseInt(vData.play_cnt || item.play_cnt || 0, 10);

          items.push({
            series_id: sid,
            title,
            episode_cnt: epCnt,
            score,
            play_cnt: playCnt,
            cover,
            intro,
            rank: idx + 1,
            category: cats,
            status: 'completed'
          });
        }

        const total = items.length;
        const res = {
          items,
          total,
          page: 1,
          page_size: pageSize,
          total_pages: Math.max(1, Math.ceil(total / pageSize)),
          has_next: false,
          has_prev: false
        };
        _SEARCH_CACHE.set(cacheKey, { timestamp: Date.now(), data: res });
        return res;
      }
    } catch (e) {
      console.warn(`[Scraper] Search failed for query "${cleaned}":`, e.message);
    }

    return { items: [], total: 0, page: 1, page_size: pageSize, total_pages: 1, has_next: false, has_prev: false };
  }

  /**
   * Scrapes complete series metadata and episode list from /detail?series_id={id}.
   */
  async getSeriesDetail(seriesId) {
    const sid = extractSeriesId(seriesId) || String(seriesId).trim();
    const detailUrl = `${this.baseUrl}/detail?series_id=${sid}`;

    const html = await fetchText(detailUrl);
    const router = extractRouterData(html);
    if (!router) {
      throw new Error(`Could not extract _ROUTER_DATA from detail page for series ${sid}`);
    }

    const dp = router.loaderData?.detail_page || {};
    const sDetail = dp.seriesDetail || {};
    if (!sDetail) {
      throw new Error(`No seriesDetail found on hongguoduanju.com for ${sid}`);
    }

    const actualSid = String(sDetail.series_id || sid);
    const title = sDetail.series_name || sDetail.series_title || `Series ${actualSid}`;
    const intro = sDetail.series_intro || '';
    const cover = sDetail.series_cover || '';
    const totalCnt = parseInt(sDetail.episode_cnt || 0, 10);
    const tags = sDetail.tags || ['Drama'];
    const vidList = sDetail.vid_list || [];

    const actualCnt = Math.max(totalCnt, vidList.length);
    const episodes = [];

    for (let idx = 1; idx <= actualCnt; idx++) {
      const vid = idx <= vidList.length ? String(vidList[idx - 1]) : `${actualSid}_${idx}`;
      episodes.push({
        index: idx,
        vid,
        title: `第${idx}集`,
        duration: 120,
        cover
      });

      if (vid && !vid.startsWith(`${actualSid}_`)) {
        _VID_TO_SERIES.set(vid, actualSid);
      }
    }

    persistVidSeriesMap();

    return {
      series_id: actualSid,
      title,
      intro,
      cover,
      episode_cnt: actualCnt,
      score: '9.8',
      category: tags,
      episodes
    };
  }

  /**
   * Fetch complete series details with fully resolved track URLs.
   */
  async getSeriesFull(seriesId, baseUrl = '', quality = '1080p') {
    const detail = await this.getSeriesDetail(seriesId);
    const bUrl = (baseUrl || '').replace(/\/+$/, '');

    const fullEps = [];
    for (const ep of detail.episodes) {
      const tracksUrl = bUrl
        ? `${bUrl}/api/video/${ep.vid}/streams?series_id=${detail.series_id}`
        : `/api/video/${ep.vid}/streams?series_id=${detail.series_id}`;
      const playUrl = bUrl
        ? `${bUrl}/api/video/${ep.vid}/play?series_id=${detail.series_id}&quality=${quality}`
        : `/api/video/${ep.vid}/play?series_id=${detail.series_id}&quality=${quality}`;

      const cachedTrack = _STREAMS_CACHE.get(ep.vid);
      const parsedTracks = cachedTrack ? cachedTrack.tracks : [];

      fullEps.push({
        index: ep.index,
        vid: ep.vid,
        title: ep.title,
        duration: ep.duration,
        cover: ep.cover,
        tracks_url: tracksUrl,
        play_url: playUrl,
        tracks: parsedTracks
      });
    }

    return {
      series_id: detail.series_id,
      title: detail.title,
      intro: detail.intro,
      cover: detail.cover,
      episode_cnt: detail.episode_cnt,
      score: detail.score,
      category: detail.category,
      loaded_cnt: fullEps.length,
      episodes: fullEps
    };
  }

  /**
   * Scrapes player info for preview episodes.
   */
  async getVideoPlayerInfo(seriesId, vid) {
    const playerUrl = `${this.baseUrl}/player/${seriesId}/${vid}`;
    try {
      const html = await fetchText(playerUrl);
      const router = extractRouterData(html);
      if (router) {
        const loader = router.loaderData || {};
        const page = loader['player_(series_id)/(vid)/page'] || loader.player_page || {};
        const vpi = page.video_player_info || {};
        if (vpi && vpi.main_url) {
          return vpi;
        }
      }
    } catch (e) {
      if (!String(e.message || '').includes('404')) {
        console.warn(`[Scraper] Player info error for ${seriesId}/${vid}:`, e.message);
      }
    }
    return null;
  }

  /**
   * Resolves direct playable video stream tracks for playback and downloads with quality selection.
   */
  async getVideoStreams(vid, seriesId = null, baseUrl = '', forceRefresh = false, quality = '1080p') {
    const vidStr = String(vid).trim();
    const bUrl = (baseUrl || '').replace(/\/+$/, '');

    let maxHeight = 1080;
    const qStr = String(quality || '1080p').toLowerCase();
    if (qStr.includes('360')) maxHeight = 360;
    else if (qStr.includes('480')) maxHeight = 480;
    else if (qStr.includes('540')) maxHeight = 540;
    else if (qStr.includes('720')) maxHeight = 720;
    else maxHeight = 1080;

    const cacheKey = `${vidStr}_${maxHeight}`;

    // Check memory cache (ignore any previously cached undecodeable bytevc2 streams)
    if (!forceRefresh && _STREAMS_CACHE.has(cacheKey)) {
      const cached = _STREAMS_CACHE.get(cacheKey);
      if (cached && cached.tracks && cached.tracks.length > 0 && cached.tracks[0].codec_type !== 'bytevc2') {
        return {
          code: 0,
          vid: vidStr,
          title: cached.title || `Episode ${vidStr}`,
          total_tracks: cached.tracks.length,
          tracks: cached.tracks,
          variants: cached.variants || [],
          play_url: bUrl ? `${bUrl}/api/video/${vidStr}/play?quality=${cached.tracks[0].definition}` : `/api/video/${vidStr}/play?quality=${cached.tracks[0].definition}`
        };
      }
    }

    let sid = seriesId || _VID_TO_SERIES.get(vidStr);
    if (!sid && vidStr.includes('_')) {
      sid = vidStr.split('_')[0];
    }

    // 1. Try Web player scraper first if sid is available (provides instant native H264 stream!)
    if (sid) {
      try {
        const vpi = await this.getVideoPlayerInfo(sid, vidStr);
        if (vpi && vpi.main_url) {
          const duration = parseFloat(vpi.duration || 120);
          const track = {
            definition: '720p',
            quality: '720p',
            vtype: 'mp4',
            main_url: vpi.main_url,
            backup_url: '',
            size: Math.round(duration * 160000),
            codec_type: 'h264',
            encrypted: false,
            spade_a: '',
            headers: {
              'User-Agent': DEFAULT_HEADERS['User-Agent'],
              'Referer': 'https://hongguoduanju.com/'
            }
          };

          const responseObj = {
            code: 0,
            vid: vidStr,
            title: `Episode ${vidStr}`,
            total_tracks: 1,
            tracks: [track],
            play_url: bUrl ? `${bUrl}/api/video/${vidStr}/play` : `/api/video/${vidStr}/play`
          };

          _STREAMS_CACHE.set(cacheKey, responseObj);
          persistStreamsCache();
          return responseObj;
        }
      } catch (e) {}
    }

    // 2. High-performance fqapi resolver for full series / high resolution (with vertical video & non-bytevc2 support)
    try {
      // For vertical / portrait short dramas (9:16), height is 1920 when width is 1080
      let effectiveMaxHeight = 2160;
      if (maxHeight <= 360) effectiveMaxHeight = 650;
      else if (maxHeight <= 480) effectiveMaxHeight = 900;
      else if (maxHeight <= 540) effectiveMaxHeight = 1050;
      else if (maxHeight <= 720) effectiveMaxHeight = 1300;
      else effectiveMaxHeight = 2160;

      let res = null;
      try {
        res = await fqapi.resolveVideo(vidStr, { maxHeight: effectiveMaxHeight });
      } catch (e) {}

      // If res is missing or codec is bytevc2 (which cannot be decoded by ffmpeg or standard players):
      if (!res || res.codec === 'bytevc2' || !res.mainUrl) {
        try {
          const model = await fqapi.fetchVideoModel(vidStr);
          const list = model.video_list || [];
          const playable = list.filter(item => {
            const codec = (item.video_meta && item.video_meta.codec_type) || '';
            return codec !== 'bytevc2';
          });
          if (playable.length > 0) {
            playable.sort((a, b) => {
              const ha = (a.video_meta && (a.video_meta.vheight || a.video_meta.height)) || 0;
              const hb = (b.video_meta && (b.video_meta.vheight || b.video_meta.height)) || 0;
              return hb - ha;
            });
            const best = playable[0];
            const meta = best.video_meta || {};
            const spade_a = best.encrypt_info && best.encrypt_info.spade_a;
            let key = null;
            if (spade_a) {
              key = fqapi.deriveContentKey(spade_a);
            }
            res = {
              mainUrl: best.main_url,
              key: key,
              width: meta.vwidth || meta.width,
              height: meta.vheight || meta.height,
              size: meta.size,
              definition: meta.definition || `${meta.vheight || 1080}p`,
              codec: meta.codec_type || 'bytevc1',
              headers: fqapi.MEDIA_HEADERS || {
                'User-Agent': 'com.phoenix.read/71332',
                'Referer': 'https://novel.snssdk.com/'
              }
            };
          }
        } catch (e) {
          console.warn(`[Scraper] Fallback non-bytevc2 variant search failed for vid ${vidStr}:`, e.message);
        }
      }

      if (res && res.mainUrl) {
        const track = {
          definition: res.definition || `${maxHeight}p`,
          quality: `${maxHeight}p`,
          vtype: 'mp4',
          main_url: res.mainUrl,
          backup_url: '',
          size: parseInt(res.size || 0, 10),
          codec_type: res.codec || 'bytevc1',
          encrypted: Boolean(res.key),
          spade_a: res.key || '',
          headers: res.headers || {
            'User-Agent': 'com.phoenix.read/71332',
            'Referer': 'https://novel.snssdk.com/'
          }
        };

        const responseObj = {
          code: 0,
          vid: vidStr,
          title: `Episode ${vidStr}`,
          total_tracks: 1,
          tracks: [track],
          variants: res.variants || [],
          play_url: bUrl ? `${bUrl}/api/video/${vidStr}/play?quality=${track.definition}` : `/api/video/${vidStr}/play?quality=${track.definition}`
        };

        _STREAMS_CACHE.set(cacheKey, responseObj);
        persistStreamsCache();
        return responseObj;
      }
    } catch (e) {
      console.warn(`[Scraper] fqapi resolution failed for vid ${vidStr} (${maxHeight}p):`, e.message);
    }

    throw new Error(`Unable to resolve video stream for vid: ${vidStr}`);
  }
}

const scraper = new HongguoScraper();

module.exports = {
  scraper,
  extractRouterData,
  extractSeriesId,
  fetchText
};
