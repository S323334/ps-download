// =========================================================
// ANITAKU (anitaku.com.ro) Controller & Video Downloader UI
// =========================================================

let _aniCurrentCategory = 'all';
let _aniCards = [];
let _aniDisplayedLimit = 40;
let _aniActiveAnime = null;
let _aniPlayingEp = null;
let _aniCurrentStreamInfo = null;
let _aniHlsInstance = null;
let _aniDownloadMode = 'separate'; // 'separate' | 'merged' | 'both'
let _aniTasksPollingTimer = null;
let _aniSearchBackupCards = null;

function decodeHtmlEntities(str) {
    if (!str) return '';
    return str
        .replace(/&#039;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#8217;/g, "'")
        .replace(/&#8220;/g, '"')
        .replace(/&#8221;/g, '"')
        .replace(/&#8211;/g, '-')
        .replace(/&#8212;/g, '--');
}

function openAnitakuWebsite() {
    const url = 'https://anitaku.com.ro/';
    if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}
window.openAnitakuWebsite = openAnitakuWebsite;

function onAnitakuLogoClick(event) {
    if (event) event.stopPropagation();
    openAnitakuWebsite();
}
window.onAnitakuLogoClick = onAnitakuLogoClick;

// Initialize on page ready
document.addEventListener('DOMContentLoaded', () => {
    const inp = document.getElementById('aniInput');
    if (inp) {
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAnitakuSearch();
            }
        });
    }
});

// Category selection
function selectAnitakuCategory(cat) {
    _aniCurrentCategory = cat;
    document.querySelectorAll('.ani-cat-chip').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === cat);
    });
    loadAnitakuRecommendations(cat, true);
}
window.selectAnitakuCategory = selectAnitakuCategory;

// Fetch and render recommendations
async function loadAnitakuRecommendations(category = 'all', isRefresh = true) {
    const grid = document.getElementById('aniDramaGrid');
    if (!grid) return;

    if (!isRefresh && _aniCards.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#94a3b8;">
                <div style="font-size:2rem; margin-bottom:10px; animation: spin 1s linear infinite; display:inline-block;">🍥</div>
                <div>កំពុងទាញយករឿង Anime ពី ANITAKU...</div>
            </div>`;
    }

    try {
        const res = await fetch(`/api/anitaku/recommend?category=${encodeURIComponent(category)}`);
        const json = await res.json();
        if (json.ok && Array.isArray(json.data) && json.data.length > 0) {
            let items = json.data;

            // Rule 13: Active Anime Pinning on Refresh / Open
            // If user clicks refresh and there's an active anime, never shuffle it away!
            if (_aniActiveAnime) {
                const restItems = items.filter(it => it.id !== _aniActiveAnime.id);
                const shuffledRest = typeof shuffleArray === 'function' ? shuffleArray(restItems) : restItems;
                items = [{
                    id: _aniActiveAnime.id,
                    title: _aniActiveAnime.title,
                    url: _aniActiveAnime.url,
                    cover: _aniActiveAnime.cover,
                    ep: `Ep ${_aniActiveAnime.total_episodes || ''}`,
                    type: 'Anime',
                    sub: 'Sub',
                    is_active_pinned: true
                }, ...shuffledRest];
            } else if (typeof shuffleArray === 'function') {
                items = shuffleArray(items);
            }

            _aniCards = items;
            _aniSearchBackupCards = null;
            _aniDisplayedLimit = 40;
            renderAnitakuCards(_aniCards);
        } else {
            if (_aniCards.length === 0) {
                grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#94a3b8;">មិនមានទិន្នន័យ Anime ទេ (No anime found)</div>`;
            }
        }
    } catch (err) {
        console.error('[Anitaku UI] Load error:', err);
        if (_aniCards.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#ef4444;">បរាជ័យក្នុងការតភ្ជាប់ទៅ ANITAKU (${err.message})</div>`;
        }
    }
}
window.loadAnitakuRecommendations = loadAnitakuRecommendations;

// Refresh Feed
function refreshAnitakuFeed() {
    loadAnitakuRecommendations(_aniCurrentCategory, true);
    if (typeof showToast === 'function') {
        showToast('🔄 បានច្របល់រឿង Anime ថ្មីៗ!', '🍥');
    }
}
window.refreshAnitakuFeed = refreshAnitakuFeed;

// Load More Anime
function loadMoreAnitakuAnime() {
    _aniDisplayedLimit += 36;
    renderAnitakuCards(_aniCards);
}
window.loadMoreAnitakuAnime = loadMoreAnitakuAnime;

// Render Anime Cards
function renderAnitakuCards(cards) {
    const grid = document.getElementById('aniDramaGrid');
    if (!grid) return;

    if (!cards || cards.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#94a3b8;">រកមិនឃើញរឿង Anime ទេ</div>`;
        updateAnitakuLoadMoreVisibility(0, 0);
        return;
    }

    const visibleItems = cards.slice(0, _aniDisplayedLimit);
    const curLang = (typeof currentLang !== 'undefined') ? currentLang : (window.currentLang || 'km');

    grid.innerHTML = visibleItems.map(item => {
        const isPinned = Boolean(item.is_active_pinned || (_aniActiveAnime && _aniActiveAnime.id === item.id));
        const pinnedBadge = isPinned ? `<div class="ani-card-pinned-tag">▶ កំពុងចាក់</div>` : '';
        const cleanTitle = decodeHtmlEntities(item.title);
        const fallbackPoster = (typeof getPosterPlaceholder === 'function') ? getPosterPlaceholder(cleanTitle, 'Anime') : '';
        const coverSrc = item.cover ? (item.cover.startsWith('http') ? `/img?url=${encodeURIComponent(item.cover)}` : item.cover) : fallbackPoster;
        const epBadge = item.ep ? `<div class="ani-card-ep-badge">${escapeHtml(item.ep)}</div>` : '';
        const subBadge = item.sub ? `<div class="ani-card-sub-badge">${escapeHtml(item.sub)}</div>` : '';
        const displayTitle = (curLang === 'zh' || curLang === 'original') ? cleanTitle : (typeof getDisplayTitle === 'function' ? getDisplayTitle(cleanTitle) : cleanTitle);
        const isStarred = (typeof isDramaStarred === 'function') && isDramaStarred(item.id || item.url, 'anitaku');

        return `
            <div class="${cardClass}" onclick="onAnitakuCardClick('${escapeHtml(item.url || item.id)}')">
                <div class="ani-card-poster-wrap">
                    <img src="${escapeHtml(coverSrc)}" alt="${escapeHtml(cleanTitle)}" class="ani-card-poster" loading="lazy" onerror="this.onerror=null; this.src='${fallbackPoster}';">
                    <div class="ani-card-overlay">
                        ${epBadge}
                        ${subBadge}
                    </div>
                    ${pinnedBadge}
                    <button type="button" class="ani-card-star-btn ${isStarred ? 'starred' : ''}" data-ani-star="${escapeHtml(item.id || item.url)}" onclick="event.stopPropagation(); toggleAnitakuCardStar('${escapeHtml(item.id || item.url)}', '${escapeHtml(cleanTitle)}', '${escapeHtml(coverSrc)}', '${escapeHtml(item.ep || '')}')" title="ដាក់ផ្កាយ / Pin">
                        ${isStarred ? '★' : '☆'}
                    </button>
                </div>
                <div class="ani-card-info">
                    <h4 class="ani-card-title" data-original-title="${escapeHtml(cleanTitle)}" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</h4>
                    <div class="ani-card-meta">
                        <span>🍥 ${escapeHtml(item.type || 'Anime')}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (curLang !== 'zh' && curLang !== 'original' && typeof queueTitleTranslation === 'function') {
        visibleItems.forEach(it => {
            if (it.title) queueTitleTranslation(decodeHtmlEntities(it.title));
        });
    }

    updateAnitakuLoadMoreVisibility(visibleItems.length, cards.length);
}

function updateAnitakuLoadMoreVisibility(shown, total) {
    const container = document.getElementById('aniLoadMoreContainer');
    if (container) {
        container.style.display = (total > shown) ? 'block' : 'none';
    }
}

// Card click handler
function onAnitakuCardClick(urlOrId) {
    loadAnitakuDetail(urlOrId);
}
window.onAnitakuCardClick = onAnitakuCardClick;

// Search / Load Input handler
async function handleAnitakuSearch() {
    const inp = document.getElementById('aniInput');
    const val = (inp ? inp.value : '').trim();
    if (!val) {
        if (typeof showToast === 'function') showToast('សូមវាយឈ្មោះ ឬបិទភ្ជាប់តំណរឿង Anime!', '⚠️');
        return;
    }

    // Check if input is a direct URL or keyword
    if (/^https?:\/\//i.test(val)) {
        loadAnitakuDetail(val);
    } else {
        searchAnitaku(val);
    }
}
window.handleAnitakuSearch = handleAnitakuSearch;

// Paste from Clipboard
async function pasteAnitakuUrl() {
    try {
        let text = '';
        if (navigator.clipboard && navigator.clipboard.readText) {
            text = await navigator.clipboard.readText();
        } else if (window.electronAPI && window.electronAPI.clipboardReadText) {
            text = await window.electronAPI.clipboardReadText();
        }
        if (text) {
            const inp = document.getElementById('aniInput');
            if (inp) {
                inp.value = text.trim();
                handleAnitakuSearch();
            }
        }
    } catch (_) {}
}
window.pasteAnitakuUrl = pasteAnitakuUrl;

function clearAnitakuInput() {
    const inp = document.getElementById('aniInput');
    if (inp) {
        inp.value = '';
        inp.focus();
    }
}
window.clearAnitakuInput = clearAnitakuInput;

// Search anime by keyword
async function searchAnitaku(keyword) {
    const grid = document.getElementById('aniDramaGrid');
    if (grid) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#94a3b8;">
                <div style="font-size:2rem; margin-bottom:10px; animation: spin 1s linear infinite; display:inline-block;">🔍</div>
                <div>កំពុងស្វែងរក "${escapeHtml(keyword)}"...</div>
            </div>`;
    }

    try {
        const res = await fetch(`/api/anitaku/search?q=${encodeURIComponent(keyword)}`);
        const json = await res.json();
        if (json.ok && Array.isArray(json.data) && json.data.length > 0) {
            // Save backup of original cards for Back to All button
            if (!_aniSearchBackupCards && _aniCards.length > 0) {
                _aniSearchBackupCards = [..._aniCards];
            }
            _aniCards = json.data;
            renderAnitakuCards(_aniCards);
            showAnitakuBackToAllButton(true);
        } else {
            if (grid) {
                grid.innerHTML = `
                    <div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#94a3b8;">
                        <div>រកមិនឃើញរឿង "${escapeHtml(keyword)}" ទេ</div>
                        <button class="btn btn-secondary" onclick="restoreAnitakuAllCards()" style="margin-top:12px;">🔙 ត្រឡប់ទៅរឿងទាំងអស់</button>
                    </div>`;
            }
        }
    } catch (err) {
        console.error('[Anitaku UI] Search error:', err);
    }
}
window.searchAnitaku = searchAnitaku;

function showAnitakuBackToAllButton(show) {
    const btn = document.getElementById('aniBackToAllBtn');
    if (btn) {
        btn.style.display = show ? 'inline-flex' : 'none';
    }
}

function restoreAnitakuAllCards() {
    if (_aniSearchBackupCards && _aniSearchBackupCards.length > 0) {
        _aniCards = [..._aniSearchBackupCards];
        _aniSearchBackupCards = null;
        renderAnitakuCards(_aniCards);
    } else {
        loadAnitakuRecommendations(_aniCurrentCategory);
    }
    showAnitakuBackToAllButton(false);
}
window.restoreAnitakuAllCards = restoreAnitakuAllCards;

// Load Anime Detail
async function loadAnitakuDetail(queryOrUrl) {
    const card = document.getElementById('aniShowcaseCard');
    if (card) {
        card.style.display = 'grid';
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const titleEl = document.getElementById('aniShowcaseTitle');
    const descEl = document.getElementById('aniShowcaseSynopsis');
    const playerTitle = document.getElementById('aniPlayerEpTitle');
    if (titleEl) titleEl.innerText = 'កំពុងផ្ទុកទិន្នន័យ Anime...';
    if (descEl) descEl.innerText = 'សូមរង់ចាំបន្តិច ប្រព័ន្ធកំពុងទាញយកព័ត៌មាន និងតារាងភាគ...';
    if (playerTitle) playerTitle.innerText = '▶ កំពុងផ្ទុកវីដេអូ...';

    try {
        const res = await fetch('/api/anitaku/detail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: queryOrUrl })
        });
        const json = await res.json();
        if (json.ok && json.data) {
            _aniActiveAnime = json.data;
            renderAnitakuShowcase(_aniActiveAnime);

            // Rule 13: Pin active anime at index 0 of the grid without destroying other cards
            if (_aniCards && _aniCards.length > 0) {
                const restCards = _aniCards.filter(c => c.id !== _aniActiveAnime.id);
                _aniCards = [{
                    id: _aniActiveAnime.id,
                    title: _aniActiveAnime.title,
                    url: _aniActiveAnime.url,
                    cover: _aniActiveAnime.cover,
                    ep: `Ep ${_aniActiveAnime.total_episodes || ''}`,
                    type: 'Anime',
                    sub: 'Sub',
                    is_active_pinned: true
                }, ...restCards];
                renderAnitakuCards(_aniCards);
            }
        } else {
            if (typeof showToast === 'function') {
                showToast(json.error || 'មិនអាចផ្ទុកទិន្នន័យ Anime នេះបានទេ', '⚠️');
            }
        }
    } catch (err) {
        console.error('[Anitaku UI] Detail error:', err);
        if (typeof showToast === 'function') {
            showToast('បរាជ័យក្នុងការបើករឿង: ' + err.message, '❌');
        }
    }
}
window.loadAnitakuDetail = loadAnitakuDetail;

// Render Detail Card (2-Column Layout matching HaoSou)
function renderAnitakuShowcase(anime) {
    const card = document.getElementById('aniShowcaseCard');
    if (!card) return;
    card.style.display = 'grid';

    const titleEl = document.getElementById('aniShowcaseTitle');
    if (titleEl) {
        const cleanT = decodeHtmlEntities(anime.title || 'Anime Series');
        const curLang = (typeof currentLang !== 'undefined') ? currentLang : (window.currentLang || 'km');
        const dispT = (curLang === 'zh' || curLang === 'original') ? cleanT : (typeof getDisplayTitle === 'function' ? getDisplayTitle(cleanT) : cleanT);
        titleEl.innerText = dispT;
        titleEl.setAttribute('data-original-title', cleanT);
        if (curLang !== 'zh' && curLang !== 'original' && typeof queueTitleTranslation === 'function') {
            queueTitleTranslation(cleanT);
        }
    }

    const altEl = document.getElementById('aniShowcaseAltTitle');
    if (altEl) {
        altEl.innerText = decodeHtmlEntities(anime.alt_title || '');
        altEl.style.display = anime.alt_title ? 'block' : 'none';
    }

    const synEl = document.getElementById('aniShowcaseSynopsis');
    translateAnitakuSynopsis(anime.id, anime.synopsis);

    const epCountBadge = document.getElementById('aniShowcaseEpCount');
    if (epCountBadge) epCountBadge.innerText = `${anime.total_episodes || (anime.episodes ? anime.episodes.length : 0)} ភាគ`;

    const statusBadge = document.getElementById('aniShowcaseStatus');
    if (statusBadge) statusBadge.innerText = anime.status || 'Ongoing';

    const yearBadge = document.getElementById('aniShowcaseYear');
    if (yearBadge) yearBadge.innerText = anime.year || '2026';

    const studioBadge = document.getElementById('aniShowcaseStudio');
    if (studioBadge) {
        studioBadge.innerText = anime.studio ? `Studio: ${anime.studio}` : '';
        studioBadge.style.display = anime.studio ? 'inline-flex' : 'none';
    }

    // Genres
    const tagsBox = document.getElementById('aniShowcaseTags');
    if (tagsBox) {
        if (Array.isArray(anime.genres) && anime.genres.length > 0) {
            tagsBox.innerHTML = anime.genres.map(g => `<span class="ani-tag-pill">${escapeHtml(g)}</span>`).join('');
            tagsBox.style.display = 'flex';
        } else {
            tagsBox.style.display = 'none';
        }
    }

    // Render Episodes Grid
    renderAnitakuEpisodesGrid(anime.episodes || []);

    // Star / Bookmark button update
    updateAnitakuStarButton();

    // Auto-play Episode 1 directly in the left player column!
    if (anime.episodes && anime.episodes.length > 0) {
        playAnitakuEpisode(anime.episodes[0].episode);
    }
}

// Translate Anime Synopsis according to active language (KM, ZH, EN, Original)
async function translateAnitakuSynopsis(animeId, rawSynopsis) {
    const descEl = document.getElementById('aniShowcaseSynopsis');
    if (!descEl) return;
    const curLang = (typeof currentLang !== 'undefined') ? currentLang : (window.currentLang || 'km');
    if (!rawSynopsis) {
        descEl.textContent = (curLang === 'km') ? 'គ្មានការពិពណ៌នាសង្ខេបឡើយ' : (curLang === 'zh' ? '暂无剧情简介' : 'No synopsis available');
        return;
    }

    descEl.setAttribute('data-original-synopsis', rawSynopsis);

    if (curLang === 'original' || curLang === 'en') {
        descEl.textContent = decodeHtmlEntities(rawSynopsis);
        return;
    }

    const cleanRaw = decodeHtmlEntities(rawSynopsis);
    const cacheKey = `ani_desc_${curLang}_${animeId || cleanRaw.slice(0, 30)}`;
    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            descEl.textContent = cached;
            return;
        }
    } catch (e) {}

    // Show initial clean text while fetching translation
    descEl.textContent = cleanRaw;

    try {
        const res = await fetch(`/api/translate?text=${encodeURIComponent(cleanRaw)}&to=${encodeURIComponent(curLang)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.translated) {
            try { localStorage.setItem(cacheKey, data.translated); } catch (e) {}
            if (_aniActiveAnime && String(_aniActiveAnime.id) === String(animeId)) {
                const nowLang = (typeof currentLang !== 'undefined') ? currentLang : (window.currentLang || 'km');
                if (nowLang === curLang) {
                    descEl.textContent = data.translated;
                }
            }
        }
    } catch (err) {
        console.warn('[Anitaku] Synopsis translation error:', err.message);
    }
}
window.translateAnitakuSynopsis = translateAnitakuSynopsis;

// Language Change listener for Anitaku
function renderAnitakuLanguageChange() {
    if (_aniActiveAnime) {
        const descEl = document.getElementById('aniShowcaseSynopsis');
        const raw = (descEl ? descEl.getAttribute('data-original-synopsis') : null) || _aniActiveAnime.synopsis;
        translateAnitakuSynopsis(_aniActiveAnime.id, raw);
    }
}
window.renderAnitakuLanguageChange = renderAnitakuLanguageChange;

// Render Episodes Grid
function renderAnitakuEpisodesGrid(episodes) {
    const grid = document.getElementById('aniEpisodesGrid');
    if (!grid) return;

    if (!episodes || episodes.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 20px; color:#94a3b8;">គ្មានបញ្ជីភាគឡើយ</div>`;
        return;
    }

    grid.innerHTML = episodes.map(ep => {
        const isPlaying = _aniPlayingEp && _aniPlayingEp.episode === ep.episode;
        const playClass = isPlaying ? ' playing' : '';
        return `
            <div class="ani-ep-chip${playClass}" id="aniEpChip_${ep.episode}" onclick="playAnitakuEpisode(${ep.episode})">
                <input type="checkbox" class="ani-ep-chip-check" id="aniEpCheck_${ep.episode}" value="${ep.episode}" onclick="event.stopPropagation(); toggleAnitakuEpSelection(${ep.episode})">
                <span>Ep ${ep.episode}</span>
            </div>
        `;
    }).join('');

    updateAnitakuSelectedCount();
}

// Toggle individual episode selection checkbox
function toggleAnitakuEpSelection(epNum) {
    const chip = document.getElementById(`aniEpChip_${epNum}`);
    const check = document.getElementById(`aniEpCheck_${epNum}`);
    if (chip && check) {
        chip.classList.toggle('selected', check.checked);
    }
    updateAnitakuSelectedCount();
}
window.toggleAnitakuEpSelection = toggleAnitakuEpSelection;

// Update Selected Count label
function updateAnitakuSelectedCount() {
    const checks = document.querySelectorAll('.ani-ep-chip-check:checked');
    const lbl = document.getElementById('aniSelectedCountLabel');
    if (lbl) {
        lbl.innerText = `ជ្រើសបាន ${checks.length} ភាគ`;
    }
}

// Select All / Invert
function selectAllAnitakuEps(selectAll = true) {
    const chips = document.querySelectorAll('.ani-ep-chip');
    const checks = document.querySelectorAll('.ani-ep-chip-check');
    checks.forEach(c => c.checked = selectAll);
    chips.forEach(t => t.classList.toggle('selected', selectAll));
    updateAnitakuSelectedCount();
}
window.selectAllAnitakuEps = selectAllAnitakuEps;

function invertAnitakuEpSelection() {
    const chips = document.querySelectorAll('.ani-ep-chip');
    const checks = document.querySelectorAll('.ani-ep-chip-check');
    checks.forEach(c => c.checked = !c.checked);
    chips.forEach(t => {
        const c = t.querySelector('.ani-ep-chip-check');
        if (c) t.classList.toggle('selected', c.checked);
    });
    updateAnitakuSelectedCount();
}
window.invertAnitakuEpSelection = invertAnitakuEpSelection;

// Download Mode selection
function setAnitakuDownloadMode(mode) {
    _aniDownloadMode = mode;
    document.querySelectorAll('.ani-mode-chip').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
}
window.setAnitakuDownloadMode = setAnitakuDownloadMode;

// Play an episode in the embedded player
async function playAnitakuEpisode(epNum) {
    if (!_aniActiveAnime || !_aniActiveAnime.episodes) return;
    const ep = _aniActiveAnime.episodes.find(e => e.episode === epNum);
    if (!ep) return;

    _aniPlayingEp = ep;

    // Highlight playing chip
    document.querySelectorAll('.ani-ep-chip').forEach(t => t.classList.remove('playing'));
    const curChip = document.getElementById(`aniEpChip_${epNum}`);
    if (curChip) curChip.classList.add('playing');

    const playerTitle = document.getElementById('aniPlayerEpTitle');
    const video = document.getElementById('aniVideoPlayer');
    const iframe = document.getElementById('aniEmbedIframe');

    if (playerTitle) playerTitle.innerText = `▶ កំពុងចាក់: ភាគ ${ep.episode}`;

    // Reset current playback
    if (video) {
        video.pause();
        video.src = '';
    }
    if (_aniHlsInstance) {
        _aniHlsInstance.destroy();
        _aniHlsInstance = null;
    }
    if (iframe) {
        iframe.src = 'about:blank';
        iframe.style.display = 'none';
    }

    try {
        const res = await fetch('/api/anitaku/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ep_url: ep.url })
        });
        const json = await res.json();
        if (json.ok && json.data) {
            _aniCurrentStreamInfo = json.data;

            // Render Server Switcher buttons
            renderAnitakuServerButtons(json.data.servers || [], json.data.embedUrl);

            // 1. Direct HLS stream
            if (json.data.streamUrl && video) {
                video.style.display = 'block';
                if (iframe) iframe.style.display = 'none';

                const streamUrl = json.data.streamUrl;
                if (window.Hls && Hls.isSupported()) {
                    const hls = new Hls({ enableWorker: true });
                    _aniHlsInstance = hls;
                    hls.loadSource(streamUrl);
                    hls.attachMedia(video);
                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        video.play().catch(() => {});
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = streamUrl;
                    video.play().catch(() => {});
                } else {
                    video.src = streamUrl;
                }

                video.onended = () => {
                    const nextEp = _aniActiveAnime.episodes.find(e => e.episode === epNum + 1);
                    if (nextEp) {
                        playAnitakuEpisode(nextEp.episode);
                    }
                };
            } else if (json.data.embedUrl && iframe) {
                // 2. Sandboxed iframe fallback
                if (video) {
                    video.style.display = 'none';
                }
                iframe.style.display = 'block';
                iframe.src = json.data.embedUrl;
            }
        } else {
            if (typeof showToast === 'function') {
                showToast(json.error || 'មិនអាចបើក Video ភាគនេះបានទេ', '⚠️');
            }
        }
    } catch (err) {
        console.error('[Anitaku UI] Stream error:', err);
    }
}
window.playAnitakuEpisode = playAnitakuEpisode;

function playFirstAnitakuEpisode() {
    if (_aniActiveAnime && _aniActiveAnime.episodes && _aniActiveAnime.episodes.length > 0) {
        playAnitakuEpisode(_aniActiveAnime.episodes[0].episode);
    }
}
window.playFirstAnitakuEpisode = playFirstAnitakuEpisode;

// Render Server buttons for active player
function renderAnitakuServerButtons(servers, currentEmbedUrl) {
    const box = document.getElementById('aniPlayerServers');
    if (!box) return;

    if (!servers || servers.length <= 1) {
        box.innerHTML = '';
        return;
    }

    box.innerHTML = servers.map(s => {
        const isActive = s.embedUrl === currentEmbedUrl;
        return `
            <button class="ani-server-btn${isActive ? ' active' : ''}" onclick="switchAnitakuServer('${escapeHtml(s.embedUrl)}')">
                ${escapeHtml(s.name || 'Server')}
            </button>
        `;
    }).join('');
}

function switchAnitakuServer(embedUrl) {
    const video = document.getElementById('aniVideoPlayer');
    const iframe = document.getElementById('aniEmbedIframe');

    document.querySelectorAll('.ani-server-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(embedUrl));
    });

    if (embedUrl.includes('megaplays.se') && _aniCurrentStreamInfo && _aniCurrentStreamInfo.streamUrl && video) {
        if (iframe) iframe.style.display = 'none';
        video.style.display = 'block';
        if (_aniHlsInstance) {
            _aniHlsInstance.destroy();
            _aniHlsInstance = null;
        }
        if (window.Hls && Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true });
            _aniHlsInstance = hls;
            hls.loadSource(_aniCurrentStreamInfo.streamUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => {});
            });
        } else {
            video.src = _aniCurrentStreamInfo.streamUrl;
            video.play().catch(() => {});
        }
    } else if (iframe) {
        if (video) {
            video.pause();
            video.style.display = 'none';
        }
        if (_aniHlsInstance) {
            _aniHlsInstance.destroy();
            _aniHlsInstance = null;
        }
        iframe.style.display = 'block';
        iframe.src = embedUrl;
    }
}
window.switchAnitakuServer = switchAnitakuServer;

function closeAnitakuDetailCard() {
    const card = document.getElementById('aniShowcaseCard');
    if (card) card.style.display = 'none';
    closeAnitakuPlayer();
    _aniActiveAnime = null;
    document.querySelectorAll('.ani-card').forEach(c => c.classList.remove('active-pinned'));
}
window.closeAnitakuDetailCard = closeAnitakuDetailCard;

function closeAnitakuPlayer() {
    const video = document.getElementById('aniVideoPlayer');
    const iframe = document.getElementById('aniEmbedIframe');
    const playerTitle = document.getElementById('aniPlayerEpTitle');
    if (playerTitle) playerTitle.innerText = '▶ បានបិទ Player';
    if (video) {
        video.pause();
        video.src = '';
    }
    if (_aniHlsInstance) {
        _aniHlsInstance.destroy();
        _aniHlsInstance = null;
    }
    if (iframe) {
        iframe.src = 'about:blank';
        iframe.style.display = 'none';
    }
    _aniPlayingEp = null;
    document.querySelectorAll('.ani-ep-chip').forEach(t => t.classList.remove('playing'));
}
window.closeAnitakuPlayer = closeAnitakuPlayer;

// Download Selected Episodes
async function startAnitakuDownloadSelected() {
    if (!_aniActiveAnime || !_aniActiveAnime.episodes) {
        if (typeof showToast === 'function') showToast('សូមជ្រើសរើសរឿង Anime ជាមុនសិន!', '⚠️');
        return;
    }

    const checks = document.querySelectorAll('.ani-ep-chip-check:checked, .ani-ep-check:checked');
    if (checks.length === 0) {
        if (typeof showToast === 'function') showToast('សូមធីកជ្រើសរើសភាគដែលចង់ទាញយក!', '⚠️');
        return;
    }

    const selectedNums = new Set(Array.from(checks).map(c => parseInt(c.value, 10)));
    const selectedEpisodes = _aniActiveAnime.episodes.filter(e => selectedNums.has(e.episode));

    await submitAnitakuDownload(selectedEpisodes);
}
window.startAnitakuDownloadSelected = startAnitakuDownloadSelected;

// Download All Episodes
async function startAnitakuDownloadAll() {
    if (!_aniActiveAnime || !_aniActiveAnime.episodes || _aniActiveAnime.episodes.length === 0) {
        if (typeof showToast === 'function') showToast('គ្មានភាគសម្រាប់ទាញយកទេ!', '⚠️');
        return;
    }
    await submitAnitakuDownload(_aniActiveAnime.episodes);
}
window.startAnitakuDownloadAll = startAnitakuDownloadAll;

async function submitAnitakuDownload(episodes) {
    if (!episodes || episodes.length === 0) return;

    if (typeof showToast === 'function') {
        showToast(`⚡ កំពុងចាប់ផ្តើមទាញយក ${episodes.length} ភាគ...`, '🍥');
    }

    try {
        const res = await fetch('/api/anitaku/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                anime_id: _aniActiveAnime.id,
                title: _aniActiveAnime.title,
                cover: (_aniActiveAnime && _aniActiveAnime.cover) || '',
                episodes: episodes,
                download_mode: _aniDownloadMode,
                quality: 'original'
            })
        });
        const json = await res.json();
        if (json.ok && json.task) {
            if (typeof showToast === 'function') {
                showToast(`✓ បានបន្ថែម Task ទាញយកជោគជ័យ!`, '🚀');
            }
            startAnitakuTasksPolling();
            fetchAnitakuTasks();
            const tasksSection = document.getElementById('aniTasksSection');
            if (tasksSection) {
                tasksSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } else {
            if (typeof showToast === 'function') {
                showToast(json.error || 'បរាជ័យក្នុងការចាប់ផ្តើមទាញយក', '❌');
            }
        }
    } catch (err) {
        console.error('[Anitaku UI] Download start error:', err);
        if (typeof showToast === 'function') {
            showToast('បរាជ័យក្នុងការតភ្ជាប់: ' + err.message, '❌');
        }
    }
}

// Tasks Polling & Real-time Tracking
function startAnitakuTasksPolling() {
    if (_aniTasksPollingTimer) clearInterval(_aniTasksPollingTimer);
    _aniTasksPollingTimer = setInterval(fetchAnitakuTasks, 2500);
}
window.startAnitakuTasksPolling = startAnitakuTasksPolling;

function stopAnitakuTasksPolling() {
    if (_aniTasksPollingTimer) {
        clearInterval(_aniTasksPollingTimer);
        _aniTasksPollingTimer = null;
    }
}
window.stopAnitakuTasksPolling = stopAnitakuTasksPolling;

const _aniNotifiedCompletedTasks = new Set();
async function fetchAnitakuTasks() {
    try {
        const res = await fetch('/api/anitaku/tasks');
        const json = await res.json();
        if (json.ok && Array.isArray(json.tasks)) {
            json.tasks.forEach(task => {
                if (task.status === 'completed' && !_aniNotifiedCompletedTasks.has(task.task_id)) {
                    _aniNotifiedCompletedTasks.add(task.task_id);
                    if (typeof showDownloadCompleteToast === 'function') {
                        showDownloadCompleteToast(task.title, task.download_dir);
                    }
                }
            });
            renderAnitakuTasks(json.tasks);
        }
    } catch (_) {}
}
window.fetchAnitakuTasks = fetchAnitakuTasks;

function renderAnitakuTasks(tasks) {
    const list = document.getElementById('aniTasksList');
    if (!list) return;

    if (!tasks || tasks.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding: 20px; color:#64748b; font-size:0.85rem;">គ្មាន Task កំពុងទាញយកទេ (No active downloads)</div>`;
        return;
    }

    list.innerHTML = tasks.map(task => {
        const isDone = task.status === 'completed';
        const isErr = task.status === 'error';
        const isCancel = task.status === 'canceled';
        const isDownloading = task.status === 'downloading';

        let statusBadge = `<span class="badge" style="background:#f97316;">⚡ កំពុងទាញយក</span>`;
        if (isDone) statusBadge = `<span class="badge" style="background:#22c55e;">✓ បានបញ្ចប់</span>`;
        if (isErr) statusBadge = `<span class="badge" style="background:#ef4444;">❌ បរាជ័យ</span>`;
        if (isCancel) statusBadge = `<span class="badge" style="background:#64748b;">🚫 បានបោះបង់</span>`;

        const openBtn = `<button class="btn btn-secondary" onclick="openFolderInExplorer('${(task.download_dir || '').replace(/'/g, "\\'")}')" style="font-size:0.75rem; padding:3px 8px;">📁 បើក</button>`;

        return `
            <div class="ani-task-item">
                <div class="ani-task-header">
                    <span class="ani-task-title">${escapeHtml(task.title)}</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${statusBadge}
                        ${isDone ? openBtn : ''}
                        ${cancelBtn}
                    </div>
                </div>
                <div class="ani-task-progress-bar">
                    <div class="ani-task-progress-fill" style="width:${task.progress_pct || 0}%;"></div>
                </div>
                <div class="ani-task-footer">
                    <span>${task.current_episode_label || ('Ep ' + task.completed_episodes + '/' + task.total_episodes)} (${task.progress_pct}%)</span>
                    <span>${task.speed_str || ''}</span>
                </div>
            </div>
        `;
    }).join('');
}

async function cancelAnitakuTask(taskId) {
    try {
        await fetch('/api/anitaku/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: taskId })
        });
        fetchAnitakuTasks();
        if (typeof pollDownloadStatus === 'function') pollDownloadStatus();
    } catch (_) {}
}
window.cancelAnitakuTask = cancelAnitakuTask;

async function clearAnitakuFinishedTasks() {
    try {
        await fetch('/api/anitaku/clear', { method: 'POST' });
        fetchAnitakuTasks();
    } catch (_) {}
}
window.clearAnitakuFinishedTasks = clearAnitakuFinishedTasks;

async function openAnitakuFolder() {
    try {
        await fetch('/api/anitaku/open_folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } catch (_) {}
}
window.openAnitakuFolder = openAnitakuFolder;

// Star / Bookmark Watchlist integration
function toggleStarAnitaku() {
    if (!_aniActiveAnime) return;
    if (typeof window.toggleStarred === 'function') {
        window.toggleStarred({
            id: String(_aniActiveAnime.id || _aniActiveAnime.url),
            platform: 'anitaku',
            title: decodeHtmlEntities(_aniActiveAnime.title || 'Anime'),
            cover: _aniActiveAnime.cover || '',
            url: _aniActiveAnime.url || '',
            eps: (_aniActiveAnime.episodes || []).length,
            remarks: `${(_aniActiveAnime.episodes || []).length} ភាគ`
        });
        updateAnitakuStarButton();
    }
}
window.toggleStarAnitaku = toggleStarAnitaku;

function toggleAnitakuCardStar(id, title, cover, remarks) {
    if (typeof window.toggleStarred === 'function') {
        window.toggleStarred({
            id: String(id),
            title: title || 'Anime',
            cover: cover || '',
            platform: 'anitaku',
            remarks: remarks || ''
        });
        updateAnitakuStarButton();
    }
}
window.toggleAnitakuCardStar = toggleAnitakuCardStar;

function updateAnitakuStarButton() {
    const btn = document.getElementById('aniStarBtn');
    if (!btn || !_aniActiveAnime) return;
    const isStarred = (typeof window.isStarred === 'function') ? window.isStarred(_aniActiveAnime.id || _aniActiveAnime.url, 'anitaku') : false;
    btn.innerHTML = isStarred ? '⭐ បាន PIN' : '☆ PIN';
    btn.classList.toggle('btn-primary', isStarred);
    btn.classList.toggle('btn-secondary', !isStarred);
}
window.updateAnitakuStarButton = updateAnitakuStarButton;

function openAnitakuInBrowser() {
    if (_aniActiveAnime && _aniActiveAnime.url) {
        if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
            window.electronAPI.openExternal(_aniActiveAnime.url);
        } else {
            window.open(_aniActiveAnime.url, '_blank');
        }
    }
}
window.openAnitakuInBrowser = openAnitakuInBrowser;
