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
    const url = 'https://dj.1dfx.com/v/';
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
        if (['youtube', 'haosou', 'mvffm', 'dailymotion', 'tiktok', 'douyin', 'kuaishou', 'hongguo'].includes(saved)) {
            switchPlatform(saved, false);
            return;
        }
    } catch (e) {}
    switchPlatform('hongguo', false);
}

function switchPlatform(platformId, persist = true) {
    const validPlatforms = ['hongguo', 'haosou', 'mvffm', 'dailymotion', 'youtube', 'tiktok', 'douyin', 'kuaishou', 'starred'];
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
    ['videoPlayer', 'hsVideoPlayer', 'mvVideoPlayer', 'dmVideoPlayer', 'ttVideoPlayer'].forEach(id => {
        const vEl = document.getElementById(id);
        if (vEl && !vEl.paused) {
            try { vEl.pause(); } catch (_) {}
        }
    });

    const btnHg = document.getElementById('tabPlatformHongguo');
    const btnHs = document.getElementById('tabPlatformHaosou');
    const btnMv = document.getElementById('tabPlatformMvffm');
    const btnDm = document.getElementById('tabPlatformDailymotion');
    const btnYt = document.getElementById('tabPlatformYoutube');
    const btnTt = document.getElementById('tabPlatformTiktok');
    const btnDy = document.getElementById('tabPlatformDouyin');
    const btnKs = document.getElementById('tabPlatformKuaishou');
    const btnStarred = document.getElementById('btnHeaderStarred');

    const viewHg = document.getElementById('hongguoView');
    const viewHs = document.getElementById('haosouView');
    const viewMv = document.getElementById('mvffmView');
    const viewDm = document.getElementById('dailymotionView');
    const viewYt = document.getElementById('youtubeView');
    const viewTt = document.getElementById('tiktokView');
    const viewStarred = document.getElementById('starredView');

    if (btnHg) btnHg.classList.toggle('active', platformId === 'hongguo');
    if (btnHs) btnHs.classList.toggle('active', platformId === 'haosou');
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
            bcIcon.innerText = '🎬';
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
    } else if (platformId === 'mvffm') {
        stopYouTubeTasksPolling();
        stopHaoSouTasksPolling();
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
        if (typeof fetchTikTokTasks === 'function') fetchTikTokTasks();
        const ttInp = document.getElementById('ttUrlInput');
        if (ttInp) ttInp.focus();
    } else if (platformId === 'starred') {
        stopYouTubeTasksPolling();
        stopHaoSouTasksPolling();
        if (typeof stopMvffmTasksPolling === 'function') stopMvffmTasksPolling();
        if (typeof stopDmTasksPolling === 'function') stopDmTasksPolling();
        if (typeof stopTtTasksPolling === 'function') stopTtTasksPolling();
        if (typeof renderGlobalStarredGrid === 'function') renderGlobalStarredGrid();
    } else {
        stopYouTubeTasksPolling();
        stopHaoSouTasksPolling();
        if (typeof stopMvffmTasksPolling === 'function') stopMvffmTasksPolling();
        if (typeof stopDmTasksPolling === 'function') stopDmTasksPolling();
        // Keep Hongguo feed as-is when switching back. Only load if empty.
        const hasDramas = (typeof window.allDramas !== 'undefined' && window.allDramas && window.allDramas.length > 0)
            || (typeof allDramas !== 'undefined' && allDramas && allDramas.length > 0);
        if (!hasDramas && typeof loadCategory === 'function') {
            loadCategory(window.currentCategory || 'all', 1);
        }
    }
}

// Manual Refresh handler for topbar Refresh button
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

    const p = currentPlatform || 'hongguo';
    if (p === 'haosou') {
        const cat = (typeof _currentHaoSouCategory !== 'undefined') ? _currentHaoSouCategory : 'all';
        if (typeof loadHaoSouRecommendations === 'function') {
            loadHaoSouRecommendations(cat);
        }
        if (typeof fetchHaoSouTasks === 'function') fetchHaoSouTasks();
    } else if (p === 'mvffm') {
        const cat = (typeof _currentMvCategory !== 'undefined') ? _currentMvCategory : 'hot';
        if (typeof loadMvffmRecommendations === 'function') {
            loadMvffmRecommendations(cat);
        }
        if (typeof fetchMvffmTasks === 'function') fetchMvffmTasks();
    } else if (p === 'dailymotion') {
        if (typeof loadDailymotionFeed === 'function') {
            loadDailymotionFeed(1);
        }
        if (typeof fetchDmTasks === 'function') fetchDmTasks();
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
        } else if (typeof loadCategory === 'function') {
            loadCategory(cat, 1);
        }
    }

    if (typeof showToast === 'function') {
        const lang = window.currentLang || (typeof currentLang !== 'undefined' ? currentLang : 'km');
        const msg = (lang === 'zh')
            ? '已刷新短剧 🔄'
            : ((lang === 'km')
                ? 'បាន Refresh រឿងរួចរាល់ 🔄'
                : 'Feed refreshed 🔄');
        showToast(msg);
    }
}

window.openHongguoWebsite = openHongguoWebsite;
window.onHongguoLogoClick = onHongguoLogoClick;
window.openHaoSouWebsite = openHaoSouWebsite;
window.openMvffmWebsite = openMvffmWebsite;
window.onMvffmLogoClick = onMvffmLogoClick;
window.openDailymotionWebsite = openDailymotionWebsite;
window.onDailymotionLogoClick = onDailymotionLogoClick;
window.switchPlatform = switchPlatform;
window.refreshCurrentPlatform = refreshCurrentPlatform;
window.showToast = showToast;