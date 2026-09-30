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

let currentPlatform = 'hongguo'; // 'hongguo' | 'haosou' | 'mvffm' | 'youtube' | 'starred'
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
        if (saved === 'youtube' || saved === 'haosou' || saved === 'mvffm' || saved === 'hongguo') {
            switchPlatform(saved, false);
            return;
        }
    } catch (e) {}
    switchPlatform('hongguo', false);
}

function switchPlatform(platformId, persist = true) {
    if (platformId !== 'hongguo' && platformId !== 'haosou' && platformId !== 'mvffm' && platformId !== 'youtube' && platformId !== 'starred') {
        platformId = 'hongguo';
    }
    currentPlatform = platformId;

    if (persist && platformId !== 'starred') {
        try {
            localStorage.setItem('hongguo_preferred_platform', platformId);
        } catch (e) {}
    }

    const btnHg = document.getElementById('tabPlatformHongguo');
    const btnHs = document.getElementById('tabPlatformHaosou');
    const btnMv = document.getElementById('tabPlatformMvffm');
    const btnYt = document.getElementById('tabPlatformYoutube');
    const btnStarred = document.getElementById('btnHeaderStarred');

    const viewHg = document.getElementById('hongguoView');
    const viewHs = document.getElementById('haosouView');
    const viewMv = document.getElementById('mvffmView');
    const viewYt = document.getElementById('youtubeView');
    const viewStarred = document.getElementById('starredView');

    if (btnHg) btnHg.classList.toggle('active', platformId === 'hongguo');
    if (btnHs) btnHs.classList.toggle('active', platformId === 'haosou');
    if (btnMv) btnMv.classList.toggle('active', platformId === 'mvffm');
    if (btnYt) btnYt.classList.toggle('active', platformId === 'youtube');
    if (btnStarred) btnStarred.classList.toggle('active', platformId === 'starred');

    if (viewHg) viewHg.style.display = platformId === 'hongguo' ? 'block' : 'none';
    if (viewHs) viewHs.style.display = platformId === 'haosou' ? 'block' : 'none';
    if (viewMv) viewMv.style.display = platformId === 'mvffm' ? 'block' : 'none';
    if (viewYt) viewYt.style.display = platformId === 'youtube' ? 'block' : 'none';
    if (viewStarred) viewStarred.style.display = platformId === 'starred' ? 'block' : 'none';

    const bcIcon = document.getElementById('topbarPlatformIcon');
    const bcName = document.getElementById('topbarPlatformName');
    if (bcIcon && bcName) {
        if (platformId === 'haosou') {
            bcIcon.innerText = '⚡';
            bcName.innerText = 'HAOSOU (1DFX.com) SHORT DRAMA';
        } else if (platformId === 'mvffm') {
            bcIcon.innerText = '🎥';
            bcName.innerText = 'MVFFM (21K+ Short Dramas)';
        } else if (platformId === 'youtube') {
            bcIcon.innerText = '▶️';
            bcName.innerText = 'YOUTUBE DOWNLOADER';
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
    } else if (platformId === 'haosou') {
        stopYouTubeTasksPolling();
        if (typeof stopMvffmTasksPolling === 'function') stopMvffmTasksPolling();
        startHaoSouTasksPolling();
        fetchHaoSouTasks();
        if (!_hsRecsLoaded && typeof loadHaoSouRecommendations === 'function') {
            loadHaoSouRecommendations();
        }
        const hsInp = document.getElementById('hsDramaInput');
        if (hsInp) hsInp.focus();
    } else if (platformId === 'mvffm') {
        stopYouTubeTasksPolling();
        stopHaoSouTasksPolling();
        if (typeof startMvffmTasksPolling === 'function') {
            startMvffmTasksPolling();
            fetchMvffmTasks();
        }
        if (!_mvRecsLoaded && typeof loadMvffmRecommendations === 'function') {
            loadMvffmRecommendations();
        }
        const mvInp = document.getElementById('mvDramaInput');
        if (mvInp) mvInp.focus();
    } else if (platformId === 'starred') {
        stopYouTubeTasksPolling();
        stopHaoSouTasksPolling();
        if (typeof stopMvffmTasksPolling === 'function') stopMvffmTasksPolling();
        if (typeof renderGlobalStarredGrid === 'function') renderGlobalStarredGrid();
    } else {
        stopYouTubeTasksPolling();
        stopHaoSouTasksPolling();
        if (typeof stopMvffmTasksPolling === 'function') stopMvffmTasksPolling();
    }
}

window.openHongguoWebsite = openHongguoWebsite;
window.onHongguoLogoClick = onHongguoLogoClick;
window.openHaoSouWebsite = openHaoSouWebsite;
window.switchPlatform = switchPlatform;
window.showToast = showToast;