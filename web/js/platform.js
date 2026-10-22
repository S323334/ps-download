// =========================================================
// PLATFORM SWITCHER & MULTI-SOURCE DRAMA HUB
// =========================================================

// Shared Core Utilities across all modules
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;

// Fisher-Yates array shuffle for fresh / randomized drama feed on each entry/open
function shuffleArray(arr) {
    if (!Array.isArray(arr) || arr.length <= 1) return arr ? [...arr] : [];
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
window.shuffleArray = shuffleArray;

window.currentDownloadedEps = window.currentDownloadedEps || new Set();
var currentDownloadedEps = window.currentDownloadedEps;
window.downloadedSeriesCache = window.downloadedSeriesCache || new Map();
var downloadedSeriesCache = window.downloadedSeriesCache;

function getCardMemoryBadgeHtml(sid, title) {
    const cache = (window.downloadedSeriesCache && typeof window.downloadedSeriesCache.get === 'function')
        ? window.downloadedSeriesCache.get(String(sid))
        : null;
    if (cache) {
        const lang = window.currentLang || 'zh';
        if (cache.status === 'downloading') {
            const txt = (lang === 'en')
                ? `⚡ Downloading (${cache.count}/${cache.total || '...'})`
                : `⚡ កំពុងដោន (${cache.count}/${cache.total || '...'})`;
            return `<span class="card-memory-badge badge-downloading">${txt}</span>`;
        } else if (cache.count > 0 || cache.status === 'completed') {
            const txt = (lang === 'en')
                ? `✓ Saved (${cache.summary || (cache.count + ' EPs')})`
                : `✓ បានដោន ${cache.summary || (cache.count + ' ភាគ')}`;
            return `<span class="card-memory-badge badge-downloaded">${txt}</span>`;
        }
    }
    return '';
}
window.getCardMemoryBadgeHtml = getCardMemoryBadgeHtml;

function showToast(msg, icon = '🍎') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2800);
}
window.showToast = showToast;

// Global Cinema Poster Placeholder Generator (Replaces broken / empty covers with sleek cinema SVG)
function getPosterPlaceholder(title, platformName = 'Drama') {
    const clean = String(title || platformName || 'Drama').replace(/[<>&"']/g, '').trim().slice(0, 18);
    const plat = String(platformName || 'HD DRAMA').toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420">
      <defs>
        <linearGradient id="pbg_${plat.replace(/\s+/g, '')}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="50%" stop-color="#1e1b4b"/>
          <stop offset="100%" stop-color="#090d16"/>
        </linearGradient>
        <linearGradient id="pacc_${plat.replace(/\s+/g, '')}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#4f46e5"/>
          <stop offset="100%" stop-color="#38bdf8"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#pbg_${plat.replace(/\s+/g, '')})"/>
      <circle cx="150" cy="160" r="46" fill="url(#pacc_${plat.replace(/\s+/g, '')})" opacity="0.25"/>
      <path d="M140 140 L168 160 L140 180 Z" fill="#38bdf8"/>
      <rect x="25" y="260" width="250" height="2" fill="url(#pacc_${plat.replace(/\s+/g, '')})" opacity="0.4"/>
      <text x="150" y="300" fill="#f8fafc" font-size="15" font-weight="bold" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" text-anchor="middle">${clean || 'Drama'}</text>
      <text x="150" y="325" fill="#94a3b8" font-size="11" font-weight="600" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" text-anchor="middle">${plat} • FULL HD</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
window.getPosterPlaceholder = getPosterPlaceholder;

// Open Download Folder in Windows File Explorer
async function openFolderInExplorer(folderPath) {
    try {
        const target = folderPath || '';
        if (window.electronAPI && typeof window.electronAPI.openFolder === 'function') {
            await window.electronAPI.openFolder(target);
            return;
        }
        await fetch('/dl/open_folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: target })
        });
    } catch (e) {
        console.error('Error opening folder:', e);
        showToast('Error opening folder: ' + e.message, '⚠️');
    }
}
window.openFolderInExplorer = openFolderInExplorer;

// Interactive Download Complete Toast with 1-Click "Open Folder" button
function showDownloadCompleteToast(title, folderPath) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast toast-success-action';
    toast.style.cssText = 'background:linear-gradient(135deg, rgba(16,185,129,0.95), rgba(6,78,59,0.95)); border:1px solid #34d399; color:#fff; padding:12px 16px; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.5); display:flex; flex-direction:column; gap:8px; max-width:380px; z-index:99999; animation:slideIn 0.3s ease;';
    
    const safeTitle = escapeHtml(title || 'វីដេអូ');
    const safePath = (folderPath || '').replace(/'/g, "\\'");

    toast.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:1.3rem;">🎉</span>
            <div style="font-weight:700; font-size:0.95rem;">ទាញយកចប់សព្វគ្រប់! (Download Finished)</div>
        </div>
        <div style="font-size:0.85rem; color:#e6fffa; line-height:1.4;">${safeTitle}</div>
        <div style="display:flex; gap:8px; margin-top:4px;">
            <button type="button" class="btn" style="background:#fff; color:#065f46; font-weight:700; font-size:0.8rem; padding:6px 12px; border-radius:8px; border:none; cursor:pointer;" onclick="openFolderInExplorer('${safePath}')">
                📂 បើកមើលក្នុង Folder
            </button>
            <button type="button" class="btn" style="background:rgba(255,255,255,0.2); color:#fff; font-size:0.8rem; padding:6px 10px; border-radius:8px; border:none; cursor:pointer;" onclick="this.closest('.toast').remove()">
                យល់ព្រម
            </button>
        </div>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.4s ease';
        setTimeout(() => toast.remove(), 400);
    }, 12000);
}
window.showDownloadCompleteToast = showDownloadCompleteToast;

let currentPlatform = 'hongguo'; // 'hongguo' | 'haosou' | 'mvffm' | 'dailymotion' | 'youtube' | 'tiktok' | 'starred'
let currentYtVideo = null;
let selectedYtQuality = 'best';
let ytTasksPollingTimer = null;

function openHongguoWebsite() {
    const url = 'https://hongguoduanju.com/';
    if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}
function onHongguoLogoClick(event) {
    if (event) event.stopPropagation();
    openHongguoWebsite();
}

function openHaoSouWebsite() {
    const url = 'https://v.djss.cc/';
    if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}

function onHaoSouLogoClick(event) {
    if (event) event.stopPropagation();
    openHaoSouWebsite();
}

function openMvffmWebsite() {
    const url = 'https://www.mvffm.net/drama/';
    if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}

function onMvffmLogoClick(event) {
    if (event) event.stopPropagation();
    openMvffmWebsite();
}

function openDailymotionWebsite() {
    const url = 'https://www.dailymotion.com/';
    if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}

function onDailymotionLogoClick(event) {
    if (event) event.stopPropagation();
    openDailymotionWebsite();
}

function onYouTubeLogoClick(event) {
    if (event) event.stopPropagation();
    switchPlatform('youtube');
}

function isMvffmUrl(str) {
    if (!str) return false;
    return /(?:mvffm\.net|movieffm\.net)/i.test(str);
}

function initPlatformSwitcher() {
    try {
        const saved = localStorage.getItem('hongguo_preferred_platform');
        if (['youtube', 'haosou', 'beeplaylet', 'anitaku', 'mvffm', 'dailymotion', 'tiktok', 'douyin', 'kuaishou', 'hongguo'].includes(saved)) {
            switchPlatform(saved, false);
            return;
        }
    } catch (e) {}
    switchPlatform('hongguo', false);
}

function switchPlatform(platformId, persist = true) {
    const validPlatforms = ['hongguo', 'haosou', 'beeplaylet', 'anitaku', 'animexin', 'mvffm', 'dailymotion', 'youtube', 'tiktok', 'douyin', 'kuaishou', 'starred'];
    if (!validPlatforms.includes(platformId)) {
        platformId = 'hongguo';
    }
    currentPlatform = platformId;

    if (persist && platformId !== 'starred') {
        try {
            localStorage.setItem('hongguo_preferred_platform', platformId);
        } catch (e) {}
    }

    // Auto-pause video players to prevent hidden background CPU & decoding load
    ['videoPlayer', 'hsVideoPlayer', 'aniVideoPlayer', 'axVideoPlayer', 'bpVideoPlayer', 'mvVideoPlayer', 'dmVideoPlayer', 'ttVideoPlayer'].forEach(id => {
        const vEl = document.getElementById(id);
        if (vEl && !vEl.paused) {
            try { vEl.pause(); } catch (_) {}
        }
    });

    const btnHg = document.getElementById('tabPlatformHongguo');
    const btnHs = document.getElementById('tabPlatformHaosou');
    const btnBp = document.getElementById('tabPlatformBeeplaylet');
    const btnAni = document.getElementById('tabPlatformAnitaku');
    const btnAx = document.getElementById('tabPlatformAnimexin');
    const btnMv = document.getElementById('tabPlatformMvffm');
    const btnDm = document.getElementById('tabPlatformDailymotion');
    const btnYt = document.getElementById('tabPlatformYoutube');
    const btnTt = document.getElementById('tabPlatformTiktok');
    const btnDy = document.getElementById('tabPlatformDouyin');
    const btnKs = document.getElementById('tabPlatformKuaishou');
    const btnStarred = document.getElementById('btnHeaderStarred');

    const viewHg = document.getElementById('hongguoView');
    const viewHs = document.getElementById('haosouView');
    const viewBp = document.getElementById('beeplayletView');
    const viewAni = document.getElementById('anitakuView');
    const viewAx = document.getElementById('animexinView');
    const viewMv = document.getElementById('mvffmView');
    const viewDm = document.getElementById('dailymotionView');
    const viewYt = document.getElementById('youtubeView');
    const viewTt = document.getElementById('tiktokView');
    const viewStarred = document.getElementById('starredView');

    if (btnHg) btnHg.classList.toggle('active', platformId === 'hongguo');
    if (btnHs) btnHs.classList.toggle('active', platformId === 'haosou');
    if (btnBp) btnBp.classList.toggle('active', platformId === 'beeplaylet');
    if (btnAni) btnAni.classList.toggle('active', platformId === 'anitaku');
    if (btnAx) btnAx.classList.toggle('active', platformId === 'animexin');
    if (btnMv) btnMv.classList.toggle('active', platformId === 'mvffm');
    if (btnDm) btnDm.classList.toggle('active', platformId === 'dailymotion');
    if (btnYt) btnYt.classList.toggle('active', platformId === 'youtube');
    if (btnTt) btnTt.classList.toggle('active', platformId === 'tiktok');
    if (btnDy) btnDy.classList.toggle('active', platformId === 'douyin');
    if (btnKs) btnKs.classList.toggle('active', platformId === 'kuaishou');
    if (btnStarred) btnStarred.classList.toggle('active', platformId === 'starred');

    const isTtDouyinKs = (platformId === 'tiktok' || platformId === 'douyin' || platformId === 'kuaishou');

    if (viewHg) viewHg.style.display = platformId === 'hongguo' ? 'block' : 'none';
    if (viewHs) viewHs.style.display = platformId === 'haosou' ? 'block' : 'none';
    if (viewBp) viewBp.style.display = platformId === 'beeplaylet' ? 'block' : 'none';
    if (viewAni) viewAni.style.display = platformId === 'anitaku' ? 'block' : 'none';
    if (viewAx) viewAx.style.display = platformId === 'animexin' ? 'block' : 'none';
    if (viewMv) viewMv.style.display = platformId === 'mvffm' ? 'block' : 'none';
    if (viewDm) viewDm.style.display = platformId === 'dailymotion' ? 'block' : 'none';
    if (viewYt) viewYt.style.display = platformId === 'youtube' ? 'block' : 'none';
    if (viewTt) viewTt.style.display = isTtDouyinKs ? 'block' : 'none';
    if (viewStarred) viewStarred.style.display = platformId === 'starred' ? 'block' : 'none';

    if (isTtDouyinKs) {
        if (typeof clearTtInput === 'function') clearTtInput();
        if (typeof setTtSubPlatform === 'function') setTtSubPlatform(platformId);
    }

    const bcIcon = document.getElementById('topbarPlatformIcon');
    const bcName = document.getElementById('topbarPlatformName');
    const curLang = window.currentLang || 'km';

    if (bcIcon && bcName) {
        if (platformId === 'haosou') {
            bcIcon.innerText = '⚡';
            bcName.innerText = 'HAOSOU (1DFX.com) SHORT DRAMA';
        } else if (platformId === 'beeplaylet') {
            bcIcon.innerText = '🐝';
            bcName.innerText = 'BEEPLAYLET (beeplaylet.com) SHORT DRAMA';
        } else if (platformId === 'anitaku') {
            bcIcon.innerText = '🍥';
            bcName.innerText = curLang === 'km' ? 'ANITAKU (Anime ជប៉ុន & សកល)' : 'ANITAKU (anitaku.com.ro) ANIME HUB';
        } else if (platformId === 'animexin') {
            bcIcon.innerText = '🐉';
            bcName.innerText = curLang === 'km' ? 'ANIMEXIN (Donghua 3D & Anime)' : 'ANIMEXIN (animexin.dev) DONGHUA HUB';
        } else if (platformId === 'mvffm') {
            bcIcon.innerText = '🎥';
            bcName.innerText = 'MVFFM (21K+ Short Dramas)';
        } else if (platformId === 'dailymotion') {
            bcIcon.innerText = '🎬';
            bcName.innerText = curLang === 'km' ? 'រឿងភាគល្បីៗ (DAILYMOTION)' : 'DAILYMOTION (POPULAR DRAMAS)';
        } else if (platformId === 'youtube') {
            bcIcon.innerText = '▶️';
            bcName.innerText = 'YOUTUBE DOWNLOADER';
        } else if (platformId === 'tiktok') {
            bcIcon.innerText = '🎵';
            bcName.innerText = 'TIKTOK DOWNLOADER';
        } else if (platformId === 'douyin') {
            bcIcon.innerText = '🔥';
            bcName.innerText = 'TIKTOK ចិន (DOUYIN) DOWNLOADER';
        } else if (platformId === 'kuaishou') {
            bcIcon.innerText = '⚡';
            bcName.innerText = 'KUAISHOU (ខៅស៊ូ) DOWNLOADER';
        } else if (platformId === 'starred') {
            bcIcon.innerText = '⭐';
            bcName.innerText = 'PINNED WATCHLIST (រឿងបានចំណាំ)';
        } else {
            bcIcon.innerHTML = '<img src="/hongguo_icon.svg" alt="Hongguo" style="width:20px; height:20px; object-fit:contain; border-radius:5px; vertical-align:middle;">';
            bcName.innerText = 'HONGGUO SHORT DRAMA';
        }
    }
    
    if (typeof applyLanguageUI === 'function') applyLanguageUI();

    if (platformId === 'youtube') {
        startYouTubeTasksPolling();
        fetchYouTubeTasks();
        const ytInp = document.getElementById('ytUrlInput');
        if (ytInp) ytInp.focus();
        stopHaoSouTasksPolling();
        if (typeof stopMvffmTasksPolling === 'function') stopMvffmTasksPolling();
        if (typeof stopDmTasksPolling === 'function') stopDmTasksPolling();
    } else if (platformId === 'haosou') {
        stopYouTubeTasksPolling();
        if (typeof stopMvffmTasksPolling === 'function') stopMvffmTasksPolling();
        if (typeof stopDmTasksPolling === 'function') stopDmTasksPolling();
        startHaoSouTasksPolling();
        fetchHaoSouTasks();
        // Keep feed as-is when switching platforms. Only load on first visit.
        const hsLoaded = (typeof window._hsRecsLoaded !== 'undefined' ? window._hsRecsLoaded : (typeof _hsRecsLoaded !== 'undefined' ? _hsRecsLoaded : false));
        if (!hsLoaded && typeof loadHaoSouRecommendations === 'function') {
            loadHaoSouRecommendations();
        }
        const hsInp = document.getElementById('hsDramaInput');
        if (hsInp) hsInp.focus();
    } else if (platformId === 'beeplaylet') {
        stopYouTubeTasksPolling();
        stopHaoSouTasksPolling();
        if (typeof stopMvffmTasksPolling === 'function') stopMvffmTasksPolling();
        if (typeof stopDmTasksPolling === 'function') stopDmTasksPolling();
        if (typeof fetchBeeplayletTasks === 'function') fetchBeeplayletTasks();
        const bpLoaded = (typeof window._bpRecsLoaded !== 'undefined' ? window._bpRecsLoaded : false);
        if (!bpLoaded && typeof loadBeeplayletRecommendations === 'function') {
            loadBeeplayletRecommendations();
        }
        const bpInp = document.getElementById('bpDramaInput');
        if (bpInp) bpInp.focus();
    } else if (platformId === 'anitaku') {
        stopYouTubeTasksPolling();
        stopHaoSouTasksPolling();
        if (typeof stopMvffmTasksPolling === 'function') stopMvffmTasksPolling();
        if (typeof stopDmTasksPolling === 'function') stopDmTasksPolling();
        if (typeof stopTtTasksPolling === 'function') stopTtTasksPolling();
        if (typeof startAnitakuTasksPolling === 'function') {
            startAnitakuTasksPolling();
            fetchAnitakuTasks();
        }
        if (typeof loadAnitakuRecommendations === 'function') {
            loadAnitakuRecommendations(typeof _aniCurrentCategory !== 'undefined' ? _aniCurrentCategory : 'all', true);
        }
        const aniInp = document.getElementById('aniInput');
        if (aniInp) aniInp.focus();
    } else if (platformId === 'animexin') {
        stopYouTubeTasksPolling();
        stopHaoSouTasksPolling();
        if (typeof stopMvffmTasksPolling === 'function') stopMvffmTasksPolling();
        if (typeof stopDmTasksPolling === 'function') stopDmTasksPolling();
        if (typeof stopTtTasksPolling === 'function') stopTtTasksPolling();
        if (typeof stopAnitakuTasksPolling === 'function') stopAnitakuTasksPolling();
        if (typeof startAnimexinTasksPolling === 'function') {
            startAnimexinTasksPolling();
            fetchAnimexinTasks();
        }
        if (typeof loadAnimexinRecommendations === 'function') {
            loadAnimexinRecommendations(typeof _axCurrentCategory !== 'undefined' ? _axCurrentCategory : 'all', true);
        }
        const axInp = document.getElementById('axInput');
        if (axInp) axInp.focus();
    } else if (platformId === 'mvffm') {
        stopYouTubeTasksPolling();
        stopHaoSouTasksPolling();
        if (typeof stopAnitakuTasksPolling === 'function') stopAnitakuTasksPolling();
        if (typeof stopDmTasksPolling === 'function') stopDmTasksPolling();
        if (typeof startMvffmTasksPolling === 'function') {
            startMvffmTasksPolling();
            fetchMvffmTasks();
        }
        // Keep feed as-is when switching platforms. Only load on first visit.
        const mvLoaded = (typeof window._mvRecsLoaded !== 'undefined' ? window._mvRecsLoaded : (typeof _mvRecsLoaded !== 'undefined' ? _mvRecsLoaded : false));
        if (!mvLoaded && typeof loadMvffmRecommendations === 'function') {
            loadMvffmRecommendations();
        }
        const mvInp = document.getElementById('mvDramaInput');
        if (mvInp) mvInp.focus();
    } else if (platformId === 'dailymotion') {
        stopYouTubeTasksPolling();
        stopHaoSouTasksPolling();
        if (typeof stopMvffmTasksPolling === 'function') stopMvffmTasksPolling();
        if (typeof stopAnitakuTasksPolling === 'function') stopAnitakuTasksPolling();
        if (typeof startDmTasksPolling === 'function') {
            startDmTasksPolling();
            fetchDmTasks();
        }
        const dmLoaded = (typeof window._dmLoadedOnce !== 'undefined' ? window._dmLoadedOnce : (typeof _dmLoadedOnce !== 'undefined' ? _dmLoadedOnce : false));
        if (!dmLoaded && typeof loadDailymotionFeed === 'function') {
            loadDailymotionFeed(1);
        }
        const dmInp = document.getElementById('dmDramaInput');
        if (dmInp) dmInp.focus();
    } else if (platformId === 'tiktok' || platformId === 'douyin' || platformId === 'kuaishou') {
        stopYouTubeTasksPolling();
        stopHaoSouTasksPolling();
        if (typeof stopMvffmTasksPolling === 'function') stopMvffmTasksPolling();
        if (typeof stopDmTasksPolling === 'function') stopDmTasksPolling();
        if (typeof stopAnitakuTasksPolling === 'function') stopAnitakuTasksPolling();
        if (typeof fetchTikTokTasks === 'function') fetchTikTokTasks();
        const ttInp = document.getElementById('ttUrlInput');
        if (ttInp) ttInp.focus();
    } else if (platformId === 'starred') {
        stopYouTubeTasksPolling();
        stopHaoSouTasksPolling();
        if (typeof stopMvffmTasksPolling === 'function') stopMvffmTasksPolling();
        if (typeof stopDmTasksPolling === 'function') stopDmTasksPolling();
        if (typeof stopTtTasksPolling === 'function') stopTtTasksPolling();
        if (typeof stopAnitakuTasksPolling === 'function') stopAnitakuTasksPolling();
        if (typeof renderGlobalStarredGrid === 'function') renderGlobalStarredGrid();
    } else {
        stopYouTubeTasksPolling();
        stopHaoSouTasksPolling();
        if (typeof stopMvffmTasksPolling === 'function') stopMvffmTasksPolling();
        if (typeof stopDmTasksPolling === 'function') stopDmTasksPolling();
        if (typeof stopAnitakuTasksPolling === 'function') stopAnitakuTasksPolling();
        // Keep Hongguo feed as-is when switching back. Only load if empty.
        const hasDramas = (typeof window.allDramas !== 'undefined' && window.allDramas && window.allDramas.length > 0)
            || (typeof allDramas !== 'undefined' && allDramas && allDramas.length > 0);
        if (!hasDramas && typeof loadCategory === 'function') {
            loadCategory(window.currentCategory || 'all', 1);
        }
    }
}

// Universal feed shuffler across ALL drama platforms (Hongguo, HaoSou, MVFFM, Dailymotion)
function shuffleCurrentPlatformFeed() {
    const p = currentPlatform || 'hongguo';
    if (p === 'haosou') {
        if (typeof shuffleHaoSouFeed === 'function') {
            shuffleHaoSouFeed();
        } else if (typeof _allHaoSouItems !== 'undefined' && Array.isArray(_allHaoSouItems) && _allHaoSouItems.length > 0) {
            const activeId = (window.currentHsDrama && window.currentHsDrama.id) ? String(window.currentHsDrama.id) : null;
            if (activeId) {
                const activeItem = _allHaoSouItems.find(x => String(x.id) === activeId) || _allHaoSouItems[0];
                const others = _allHaoSouItems.filter(x => String(x.id) !== String(activeItem.id));
                _allHaoSouItems = [activeItem, ...shuffleArray(others)];
            } else {
                _allHaoSouItems = shuffleArray(_allHaoSouItems);
            }
            _haosouRenderLimit = 60;
            if (typeof renderHaoSouCards === 'function') renderHaoSouCards(_allHaoSouItems.slice(0, _haosouRenderLimit));
        } else if (typeof loadHaoSouRecommendations === 'function') {
            const cat = (typeof _currentHaoSouCategory !== 'undefined') ? _currentHaoSouCategory : 'all';
            loadHaoSouRecommendations(cat);
        }
        if (typeof fetchHaoSouTasks === 'function') fetchHaoSouTasks();
    } else if (p === 'mvffm') {
        if (typeof shuffleMvffmFeed === 'function') {
            shuffleMvffmFeed();
        } else if (typeof _allMvItems !== 'undefined' && Array.isArray(_allMvItems) && _allMvItems.length > 0) {
            const activeId = (window.currentMvDrama && window.currentMvDrama.id) ? String(window.currentMvDrama.id) : null;
            if (activeId) {
                const activeItem = _allMvItems.find(x => String(x.id) === activeId) || _allMvItems[0];
                const others = _allMvItems.filter(x => String(x.id) !== String(activeItem.id));
                _allMvItems = [activeItem, ...shuffleArray(others)];
            } else {
                _allMvItems = shuffleArray(_allMvItems);
            }
            _mvRenderLimit = 60;
            if (typeof renderMvffmCards === 'function') renderMvffmCards(_allMvItems.slice(0, _mvRenderLimit));
        } else if (typeof loadMvffmRecommendations === 'function') {
            const cat = (typeof _currentMvCategory !== 'undefined') ? _currentMvCategory : 'hot';
            loadMvffmRecommendations(cat);
        }
        if (typeof fetchMvffmTasks === 'function') fetchMvffmTasks();
    } else if (p === 'dailymotion') {
        if (typeof shuffleDailymotionFeed === 'function') {
            shuffleDailymotionFeed();
        } else if (typeof _dmItems !== 'undefined' && Array.isArray(_dmItems) && _dmItems.length > 0) {
            if (window._dmActiveVideoId) {
                const activeItem = _dmItems.find(x => x.id === window._dmActiveVideoId) || _dmItems[0];
                const others = _dmItems.filter(x => x.id !== activeItem.id);
                _dmItems = [activeItem, ...shuffleArray(others)];
            } else {
                _dmItems = shuffleArray(_dmItems);
            }
            if (typeof renderDailymotionCards === 'function') renderDailymotionCards(_dmItems);
        } else if (typeof loadDailymotionFeed === 'function') {
            loadDailymotionFeed(1, false);
        }
    } else if (p === 'anitaku') {
        if (typeof refreshAnitakuFeed === 'function') {
            refreshAnitakuFeed();
        }
        if (typeof fetchAnitakuTasks === 'function') {
            fetchAnitakuTasks();
        }
    } else if (p === 'animexin') {
        if (typeof refreshAnimexinFeed === 'function') {
            refreshAnimexinFeed();
        }
        if (typeof fetchAnimexinTasks === 'function') {
            fetchAnimexinTasks();
        }
    } else if (p === 'youtube') {
        if (typeof fetchYouTubeTasks === 'function') fetchYouTubeTasks();
    } else if (p === 'starred') {
        if (typeof renderGlobalStarredGrid === 'function') renderGlobalStarredGrid();
    } else {
        // hongguo
        const cat = (typeof currentCategory !== 'undefined') ? currentCategory : (window.currentCategory || 'all');
        if (cat === 'starred') {
            if (typeof renderStarredDramasView === 'function') renderStarredDramasView();
        } else if (cat === 'library') {
            if (typeof renderLibraryView === 'function') renderLibraryView();
        } else {
            if (typeof shuffleHongguoFeed === 'function') {
                shuffleHongguoFeed();
            } else if (typeof allDramas !== 'undefined' && Array.isArray(allDramas) && allDramas.length > 0) {
                const activeSid = (window.currentSeries && window.currentSeries.series_id) ? String(window.currentSeries.series_id) : null;
                if (activeSid) {
                    const activeItem = allDramas.find(x => String(x.series_id) === activeSid) || allDramas[0];
                    const others = allDramas.filter(x => String(x.series_id) !== String(activeItem.series_id));
                    allDramas = [activeItem, ...shuffleArray(others)];
                } else {
                    allDramas = shuffleArray(allDramas);
                }
                if (typeof renderDramaGrid === 'function') renderDramaGrid(allDramas);
            } else if (typeof loadCategory === 'function') {
                loadCategory(cat, 1);
            }
        }
    }
}
window.shuffleCurrentPlatformFeed = shuffleCurrentPlatformFeed;

// Manual Refresh handler for topbar Refresh button (Instantly shuffles and reloads)
function refreshCurrentPlatform() {
    const refreshIcon = document.getElementById('topbarRefreshIcon');
    if (refreshIcon) {
        refreshIcon.classList.remove('spinning');
        void refreshIcon.offsetWidth; // force reflow
        refreshIcon.classList.add('spinning');
        setTimeout(() => {
            if (refreshIcon) refreshIcon.classList.remove('spinning');
        }, 750);
    }

    shuffleCurrentPlatformFeed();

    if (typeof showToast === 'function') {
        const lang = window.currentLang || (typeof currentLang !== 'undefined' ? currentLang : 'km');
        const msg = (lang === 'zh')
            ? '已刷新并随机排序 🔄'
            : ((lang === 'km')
                ? 'បាន Refresh & ច្របល់រឿងថ្មីៗរួចរាល់ 🔄'
                : 'Feed refreshed & shuffled 🔄');
        showToast(msg);
    }
}

// Auto-shuffle hook to guarantee all platforms (especially Dailymotion) are shuffled when opened/loaded
(function hookPlatformAutoShuffle() {
    function tryHook() {
        if (typeof window.renderDailymotionCards === 'function' && !window._dmShuffleHooked) {
            window._dmShuffleHooked = true;
            const originalRender = window.renderDailymotionCards;
            window.renderDailymotionCards = function(items) {
                if (Array.isArray(items) && items.length > 0 && !items._shuffledOnce) {
                    items._shuffledOnce = true;
                    items = shuffleArray(items);
                    if (typeof _dmItems !== 'undefined') _dmItems = items;
                }
                return originalRender.call(this, items);
            };
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryHook);
    } else {
        setTimeout(tryHook, 50);
        setTimeout(tryHook, 300);
        setTimeout(tryHook, 1000);
    }
})();

window.openHongguoWebsite = openHongguoWebsite;
window.onHongguoLogoClick = onHongguoLogoClick;
window.openHaoSouWebsite = openHaoSouWebsite;
window.openMvffmWebsite = openMvffmWebsite;
window.onMvffmLogoClick = onMvffmLogoClick;
window.openDailymotionWebsite = openDailymotionWebsite;
window.onDailymotionLogoClick = onDailymotionLogoClick;
window.openAnimexinWebsite = openAnimexinWebsite;
window.onAnimexinLogoClick = onAnimexinLogoClick;
window.switchPlatform = switchPlatform;
window.refreshCurrentPlatform = refreshCurrentPlatform;
window.showToast = showToast;