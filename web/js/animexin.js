// =========================================================
// ANIMEXIN (animexin.dev) Controller & Video Downloader UI
// =========================================================

let _axCurrentCategory = 'all';
let _axCards = [];
let _axDisplayedLimit = 40;
let _axActiveAnime = null;
let _axPlayingEp = null;
let _axCurrentStreamInfo = null;
let _axHlsInstance = null;
let _axDownloadMode = 'separate'; // 'separate' | 'merged' | 'both'
let _axTasksPollingTimer = null;
let _axSearchBackupCards = null;

function decodeAxHtmlEntities(str) {
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

function escapeAxHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function openAnimexinWebsite() {
    const url = 'https://animexin.dev/';
    if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}
window.openAnimexinWebsite = openAnimexinWebsite;

function onAnimexinLogoClick(event) {
    if (event) event.stopPropagation();
    openAnimexinWebsite();
}
window.onAnimexinLogoClick = onAnimexinLogoClick;

// Initialize on page ready
document.addEventListener('DOMContentLoaded', () => {
    const inp = document.getElementById('axInput');
    if (inp) {
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAnimexinSearch();
            }
        });
    }
});

// Category selection
function selectAnimexinCategory(cat) {
    _axCurrentCategory = cat;
    document.querySelectorAll('.ax-cat-chip').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === cat);
    });
    loadAnimexinRecommendations(cat, true);
}
window.selectAnimexinCategory = selectAnimexinCategory;

// Fetch and render recommendations
async function loadAnimexinRecommendations(category = 'all', isRefresh = true) {
    const grid = document.getElementById('axDramaGrid');
    if (!grid) return;

    if (!isRefresh && _axCards.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#94a3b8;">
                <div style="font-size:2rem; margin-bottom:10px; animation: spin 1s linear infinite; display:inline-block;">🐉</div>
                <div>កំពុងទាញយករឿង Donghua 3D ពី ANIMEXIN...</div>
            </div>`;
    }

    try {
        let items = null;
        try {
            const res = await fetch(`/api/animexin/recommend?category=${encodeURIComponent(category)}`);
            if (res.ok) {
                const json = await res.json();
                if (json.ok && Array.isArray(json.data) && json.data.length > 0) {
                    items = json.data;
                }
            }
        } catch (_) {}

        // Fallback: If server hasn't restarted or returned 404, load static catalog JSON directly
        if (!items || items.length === 0) {
            try {
                const catRes = await fetch('/data/animexin_catalog.json');
                if (catRes.ok) {
                    const catData = await catRes.json();
                    if (Array.isArray(catData) && catData.length > 0) {
                        const cat = String(category || 'all').toLowerCase();
                        if (cat === 'popular') {
                            items = catData.filter(x => x.is_popular);
                            if (items.length < 15) items = catData.slice(0, 40);
                        } else if (cat === 'completed') {
                            items = catData.filter(x => (x.status || '').toLowerCase() === 'completed');
                        } else if (cat === 'movie') {
                            items = catData.filter(x => (x.type || '').toLowerCase().includes('movie') || (x.title || '').toLowerCase().includes('movie'));
                        } else if (cat !== 'all' && cat !== 'latest') {
                            items = catData.filter(x => (x.title || '').toLowerCase().includes(cat) || (x.type || '').toLowerCase().includes(cat));
                            if (items.length < 10) items = catData;
                        } else {
                            items = catData;
                        }
                    }
                }
            } catch (fbErr) {
                console.warn('[Animexin UI] Catalog static fallback error:', fbErr.message);
            }
        }

        if (items && items.length > 0) {
            // Rule 13: Active Anime Pinning on Refresh / Open
            // If user clicks refresh and there's an active anime, never shuffle it away!
            if (_axActiveAnime) {
                const restItems = items.filter(it => it.id !== _axActiveAnime.id);
                const shuffledRest = typeof shuffleArray === 'function' ? shuffleArray(restItems) : restItems;
                items = [{
                    id: _axActiveAnime.id,
                    title: _axActiveAnime.title,
                    url: _axActiveAnime.url,
                    cover: _axActiveAnime.cover,
                    ep: `Ep ${_axActiveAnime.total_episodes || ''}`,
                    type: 'Donghua',
                    status: _axActiveAnime.status,
                    is_active_pinned: true
                }, ...shuffledRest];
            } else if (typeof shuffleArray === 'function') {
                items = shuffleArray(items);
            }

            _axCards = items;
            _axSearchBackupCards = null;
            _axDisplayedLimit = 40;
            renderAnimexinCards(_axCards);
        } else {
            if (_axCards.length === 0) {
                grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#94a3b8;">មិនមានទិន្នន័យ Donghua ទេ (No donghua found)</div>`;
            }
        }
    } catch (err) {
        console.error('[Animexin UI] Load error:', err);
        if (_axCards.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#ef4444;">បរាជ័យក្នុងការតភ្ជាប់ទៅ ANIMEXIN (${err.message})</div>`;
        }
    }
}
window.loadAnimexinRecommendations = loadAnimexinRecommendations;

// Refresh Feed
function refreshAnimexinFeed() {
    loadAnimexinRecommendations(_axCurrentCategory, true);
    if (typeof showToast === 'function') {
        showToast('🔄 បានច្របល់រឿង Donghua ថ្មីៗ!', '🐉');
    }
}
window.refreshAnimexinFeed = refreshAnimexinFeed;

// Load More
function loadMoreAnimexinAnime() {
    _axDisplayedLimit += 36;
    renderAnimexinCards(_axCards);
}
window.loadMoreAnimexinAnime = loadMoreAnimexinAnime;

// Render Cards
function renderAnimexinCards(cards) {
    const grid = document.getElementById('axDramaGrid');
    if (!grid) return;

    if (!cards || cards.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#94a3b8;">រកមិនឃើញរឿង Donghua ទេ</div>`;
        updateAnimexinLoadMoreVisibility(0, 0);
        return;
    }

    const visibleItems = cards.slice(0, _axDisplayedLimit);
    const curLang = (typeof currentLang !== 'undefined') ? currentLang : (window.currentLang || 'km');

    grid.innerHTML = visibleItems.map(item => {
        const isPinned = Boolean(item.is_active_pinned || (_axActiveAnime && _axActiveAnime.id === item.id));
        const pinnedBadge = isPinned ? `<div class="ax-card-pinned-tag">▶ កំពុងចាក់</div>` : '';
        const cleanTitle = decodeAxHtmlEntities(item.title);
        const fallbackPoster = (typeof getPosterPlaceholder === 'function') ? getPosterPlaceholder(cleanTitle, 'Donghua') : '';
        const coverSrc = item.cover ? (item.cover.startsWith('http') ? `/img?url=${encodeURIComponent(item.cover)}` : item.cover) : fallbackPoster;
        const epBadge = item.ep ? `<div class="ax-card-ep-badge">${escapeAxHtml(item.ep)}</div>` : '';
        const displayTitle = (curLang === 'zh' || curLang === 'original') ? cleanTitle : (typeof getDisplayTitle === 'function' ? getDisplayTitle(cleanTitle) : cleanTitle);
        const isStarred = (typeof isDramaStarred === 'function') && isDramaStarred(item.id || item.url, 'animexin');

        return `
            <div class="${cardClass}" onclick="onAnimexinCardClick('${escapeAxHtml(item.url || item.id)}')">
                <div class="ax-card-poster-wrap">
                    <img src="${escapeAxHtml(coverSrc)}" alt="${escapeAxHtml(cleanTitle)}" class="ax-card-poster" loading="lazy" onerror="this.onerror=null; this.src='${fallbackPoster}';">
                    <div class="ax-card-overlay">
                        ${epBadge}
                        <div class="ax-card-sub-badge">Sub</div>
                    </div>
                    ${pinnedBadge}
                    <button type="button" class="ax-card-star-btn ${isStarred ? 'starred' : ''}" data-ax-star="${escapeAxHtml(item.id || item.url)}" onclick="event.stopPropagation(); toggleAnimexinCardStar('${escapeAxHtml(item.id || item.url)}', '${escapeAxHtml(cleanTitle)}', '${escapeAxHtml(coverSrc)}', '${escapeAxHtml(item.ep || '')}')" title="ដាក់ផ្កាយ / Pin">
                        ${isStarred ? '★' : '☆'}
                    </button>
                </div>
                <div class="ax-card-info">
                    <h4 class="ax-card-title" data-original-title="${escapeAxHtml(cleanTitle)}" title="${escapeAxHtml(displayTitle)}">${escapeAxHtml(displayTitle)}</h4>
                    <div class="ax-card-meta">
                        <span>🐉 ${escapeAxHtml(item.type || 'Donghua')}</span>
                        <span>${escapeAxHtml(item.status || 'Ongoing')}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (curLang !== 'zh' && curLang !== 'original' && typeof queueTitleTranslation === 'function') {
        visibleItems.forEach(it => {
            if (it.title) queueTitleTranslation(decodeAxHtmlEntities(it.title));
        });
    }

    updateAnimexinLoadMoreVisibility(visibleItems.length, cards.length);
}

function updateAnimexinLoadMoreVisibility(shown, total) {
    const container = document.getElementById('axLoadMoreContainer');
    if (container) {
        container.style.display = (total > shown) ? 'block' : 'none';
    }
}

// Card click handler
function onAnimexinCardClick(urlOrId) {
    loadAnimexinDetail(urlOrId);
}
window.onAnimexinCardClick = onAnimexinCardClick;

// Search / Load Input handler
function handleAnimexinSearch() {
    const inp = document.getElementById('axInput');
    if (!inp) return;
    const val = inp.value.trim();
    if (!val) {
        if (typeof showToast === 'function') showToast('សូមបញ្ចូលឈ្មោះរឿង Donghua ឬបិទភ្ជាប់លីង!', '⚠️');
        return;
    }

    if (/^https?:\/\//i.test(val)) {
        loadAnimexinDetail(val);
    } else {
        searchAnimexin(val);
    }
}
window.handleAnimexinSearch = handleAnimexinSearch;

async function pasteAnimexinFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        const inp = document.getElementById('axInput');
        if (inp && text) {
            inp.value = text.trim();
            handleAnimexinSearch();
        }
    } catch (_) {
        if (typeof showToast === 'function') showToast('មិនអាចអាន Clipboard បានទេ!', '⚠️');
    }
}
window.pasteAnimexinFromClipboard = pasteAnimexinFromClipboard;

function clearAnimexinInput() {
    const inp = document.getElementById('axInput');
    if (inp) {
        inp.value = '';
        inp.focus();
    }
}
window.clearAnimexinInput = clearAnimexinInput;

async function searchAnimexin(keyword) {
    const grid = document.getElementById('axDramaGrid');
    if (grid) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#94a3b8;">
                <div style="font-size:2rem; margin-bottom:10px; animation: spin 1s linear infinite; display:inline-block;">🔍</div>
                <div>កំពុងស្វែងរក "${escapeAxHtml(keyword)}"...</div>
            </div>`;
    }

    let foundItems = [];
    try {
        const res = await fetch(`/api/animexin/search?q=${encodeURIComponent(keyword)}`);
        if (res.ok) {
            const json = await res.json();
            if (json.ok && Array.isArray(json.data) && json.data.length > 0) {
                foundItems = json.data;
            }
        }
    } catch (_) {}

    // Fallback: search in catalog
    if (foundItems.length === 0) {
        try {
            const kw = keyword.toLowerCase();
            const catRes = await fetch('/data/animexin_catalog.json');
            if (catRes.ok) {
                const catData = await catRes.json();
                if (Array.isArray(catData)) {
                    foundItems = catData.filter(x => (x.title || '').toLowerCase().includes(kw));
                }
            }
        } catch (_) {}
    }

    if (foundItems.length > 0) {
        if (!_axSearchBackupCards && _axCards.length > 0) {
            _axSearchBackupCards = [..._axCards];
        }
        _axCards = foundItems;
        renderAnimexinCards(_axCards);
        showAnimexinBackToAllButton(true);
    } else {
        if (grid) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#94a3b8;">
                    <div>រកមិនឃើញរឿង "${escapeAxHtml(keyword)}" ទេ</div>
                    <button class="btn btn-secondary" onclick="restoreAnimexinAllCards()" style="margin-top:12px;">🔙 ត្រឡប់ទៅរឿងទាំងអស់</button>
                </div>`;
        }
    }
}
window.searchAnimexin = searchAnimexin;

function showAnimexinBackToAllButton(show) {
    const btn = document.getElementById('axBackToAllBtn');
    if (btn) {
        btn.style.display = show ? 'inline-flex' : 'none';
    }
}

function restoreAnimexinAllCards() {
    if (_axSearchBackupCards && _axSearchBackupCards.length > 0) {
        _axCards = [..._axSearchBackupCards];
        _axSearchBackupCards = null;
        renderAnimexinCards(_axCards);
    } else {
        loadAnimexinRecommendations(_axCurrentCategory);
    }
    showAnimexinBackToAllButton(false);
}
window.restoreAnimexinAllCards = restoreAnimexinAllCards;

// Load Donghua Detail
async function loadAnimexinDetail(queryOrUrl) {
    const card = document.getElementById('axShowcaseCard');
    if (card) {
        card.style.display = 'grid';
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const titleEl = document.getElementById('axShowcaseTitle');
    const descEl = document.getElementById('axShowcaseSynopsis');
    const playerTitle = document.getElementById('axPlayerEpTitle');
    if (titleEl) titleEl.innerText = 'កំពុងផ្ទុកទិន្នន័យ Donghua...';
    if (descEl) descEl.innerText = 'សូមរង់ចាំបន្តិច ប្រព័ន្ធកំពុងទាញយកព័ត៌មាន និងតារាងភាគ...';
    if (playerTitle) playerTitle.innerText = '▶ កំពុងផ្ទុកវីដេអូ...';

    try {
        const res = await fetch('/api/animexin/detail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: queryOrUrl })
        });
        const json = await res.json();
        if (json.ok && json.data) {
            _axActiveAnime = json.data;
            renderAnimexinShowcase(_axActiveAnime);

            // Rule 13: Pin active donghua at index 0 of the grid without destroying other cards
            if (_axCards && _axCards.length > 0) {
                const restCards = _axCards.filter(c => c.id !== _axActiveAnime.id);
                _axCards = [{
                    id: _axActiveAnime.id,
                    title: _axActiveAnime.title,
                    url: _axActiveAnime.url,
                    cover: _axActiveAnime.cover,
                    ep: `Ep ${_axActiveAnime.total_episodes || ''}`,
                    type: 'Donghua',
                    status: _axActiveAnime.status,
                    is_active_pinned: true
                }, ...restCards];
                renderAnimexinCards(_axCards);
            }
        } else {
            if (typeof showToast === 'function') {
                showToast(json.error || 'មិនអាចផ្ទុកទិន្នន័យ Donghua នេះបានទេ', '⚠️');
            }
        }
    } catch (err) {
        console.error('[Animexin UI] Detail error:', err);
        if (typeof showToast === 'function') {
            showToast('បរាជ័យក្នុងការបើករឿង: ' + err.message, '❌');
        }
    }
}
window.loadAnimexinDetail = loadAnimexinDetail;

// Render Detail Card (2-Column Layout matching HaoSou and Anitaku)
function renderAnimexinShowcase(anime) {
    const card = document.getElementById('axShowcaseCard');
    if (!card) return;
    card.style.display = 'grid';

    const titleEl = document.getElementById('axShowcaseTitle');
    if (titleEl) {
        const cleanT = decodeAxHtmlEntities(anime.title || 'Donghua Series');
        const curLang = (typeof currentLang !== 'undefined') ? currentLang : (window.currentLang || 'km');
        const dispT = (curLang === 'zh' || curLang === 'original') ? cleanT : (typeof getDisplayTitle === 'function' ? getDisplayTitle(cleanT) : cleanT);
        titleEl.innerText = dispT;
        titleEl.setAttribute('data-original-title', cleanT);
        if (curLang !== 'zh' && curLang !== 'original' && typeof queueTitleTranslation === 'function') {
            queueTitleTranslation(cleanT);
        }
    }

    const altEl = document.getElementById('axShowcaseAltTitle');
    if (altEl) {
        altEl.innerText = decodeAxHtmlEntities(anime.alt_title || '');
        altEl.style.display = anime.alt_title ? 'block' : 'none';
    }

    const synEl = document.getElementById('axShowcaseSynopsis');
    translateAnimexinSynopsis(anime.id, anime.synopsis);

    const epCountBadge = document.getElementById('axShowcaseEpCount');
    if (epCountBadge) epCountBadge.innerText = `${anime.total_episodes || (anime.episodes ? anime.episodes.length : 0)} ភាគ`;

    const statusBadge = document.getElementById('axShowcaseStatus');
    if (statusBadge) statusBadge.innerText = anime.status || 'Ongoing';

    const yearBadge = document.getElementById('axShowcaseYear');
    if (yearBadge) yearBadge.innerText = anime.year || '2026';

    const studioBadge = document.getElementById('axShowcaseStudio');
    if (studioBadge) {
        studioBadge.innerText = anime.studio ? `Studio: ${anime.studio}` : '';
        studioBadge.style.display = anime.studio ? 'inline-flex' : 'none';
    }

    // Genres
    const tagsBox = document.getElementById('axShowcaseTags');
    if (tagsBox) {
        if (Array.isArray(anime.genres) && anime.genres.length > 0) {
            tagsBox.innerHTML = anime.genres.map(g => `<span class="ax-tag-pill">${escapeAxHtml(g)}</span>`).join('');
            tagsBox.style.display = 'flex';
        } else {
            tagsBox.style.display = 'none';
        }
    }

    // Render Episodes Grid
    renderAnimexinEpisodesGrid(anime.episodes || []);

    // Star / Bookmark button update
    updateAnimexinStarButton();

    // Auto-play targeted episode (e.g. Ep 161) or first episode directly in the left player column!
    if (anime.episodes && anime.episodes.length > 0) {
        const targetEp = (anime.target_episode && anime.episodes.some(e => e.episode === anime.target_episode))
            ? anime.target_episode
            : anime.episodes[0].episode;
        playAnimexinEpisode(targetEp);
        setTimeout(() => {
            const activeChip = document.getElementById(`axEpChip_${targetEp}`);
            if (activeChip) {
                activeChip.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 200);
    }
}

// Translate Donghua Synopsis according to active language (KM, ZH, EN, Original)
async function translateAnimexinSynopsis(animeId, rawSynopsis) {
    const descEl = document.getElementById('axShowcaseSynopsis');
    if (!descEl) return;
    const curLang = (typeof currentLang !== 'undefined') ? currentLang : (window.currentLang || 'km');
    if (!rawSynopsis) {
        descEl.textContent = (curLang === 'km') ? 'គ្មានការពិពណ៌នាសង្ខេបឡើយ' : (curLang === 'zh' ? '暂无剧情简介' : 'No synopsis available');
        return;
    }

    descEl.setAttribute('data-original-synopsis', rawSynopsis);

    if (curLang === 'original' || curLang === 'en') {
        descEl.textContent = decodeAxHtmlEntities(rawSynopsis);
        return;
    }

    const cleanRaw = decodeAxHtmlEntities(rawSynopsis);
    const cacheKey = `ax_desc_${curLang}_${animeId || cleanRaw.slice(0, 30)}`;
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
            if (_axActiveAnime && String(_axActiveAnime.id) === String(animeId)) {
                const nowLang = (typeof currentLang !== 'undefined') ? currentLang : (window.currentLang || 'km');
                if (nowLang === curLang) {
                    descEl.textContent = data.translated;
                }
            }
        }
    } catch (err) {
        console.warn('[Animexin] Synopsis translation error:', err.message);
    }
}
window.translateAnimexinSynopsis = translateAnimexinSynopsis;

// Language Change listener for Animexin
function renderAnimexinLanguageChange() {
    if (_axActiveAnime) {
        const descEl = document.getElementById('axShowcaseSynopsis');
        const raw = (descEl ? descEl.getAttribute('data-original-synopsis') : null) || _axActiveAnime.synopsis;
        translateAnimexinSynopsis(_axActiveAnime.id, raw);
    }
}
window.renderAnimexinLanguageChange = renderAnimexinLanguageChange;

// Render Episodes Grid
function renderAnimexinEpisodesGrid(episodes) {
    const grid = document.getElementById('axEpisodesGrid');
    if (!grid) return;

    if (!episodes || episodes.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 20px; color:#94a3b8;">គ្មានបញ្ជីភាគឡើយ</div>`;
        return;
    }

    grid.innerHTML = episodes.map(ep => {
        const isPlaying = _axPlayingEp === ep.episode;
        const activeClass = isPlaying ? ' playing' : '';
        const epLabel = ep.episode_label || ep.episode;

        return `
            <div class="ax-ep-chip${activeClass}" id="axEpChip_${ep.episode}" onclick="onAnimexinEpChipClick(event, ${ep.episode})">
                <input type="checkbox" class="ax-ep-chip-check" value="${ep.episode}" onchange="updateAnimexinSelectedCount(event)">
                <span>Ep ${escapeAxHtml(epLabel)}</span>
            </div>
        `;
    }).join('');

    updateAnimexinSelectedCount();
}

function onAnimexinEpChipClick(event, epNum) {
    if (event.target.classList.contains('ax-ep-chip-check')) {
        return; // Clicked on checkbox
    }
    playAnimexinEpisode(epNum);
}
window.onAnimexinEpChipClick = onAnimexinEpChipClick;

// Selection Toolbar
function selectAllAnimexinEps(check) {
    document.querySelectorAll('.ax-ep-chip-check').forEach(c => c.checked = check);
    updateAnimexinSelectedCount();
}
window.selectAllAnimexinEps = selectAllAnimexinEps;

function invertAnimexinEpSelection() {
    document.querySelectorAll('.ax-ep-chip-check').forEach(c => c.checked = !c.checked);
    updateAnimexinSelectedCount();
}
window.invertAnimexinEpSelection = invertAnimexinEpSelection;

function updateAnimexinSelectedCount(event) {
    if (event) event.stopPropagation();
    const checks = document.querySelectorAll('.ax-ep-chip-check:checked');
    const label = document.getElementById('axSelectedCountLabel');
    if (label) {
        label.innerText = `ជ្រើសបាន ${checks.length} ភាគ`;
    }
}
window.updateAnimexinSelectedCount = updateAnimexinSelectedCount;

let _axActiveServerIdx = 0;

// Play Episode & Auto Server Switcher
async function playAnimexinEpisode(epNum) {
    if (!_axActiveAnime || !_axActiveAnime.episodes) return;
    const epObj = _axActiveAnime.episodes.find(e => e.episode === epNum);
    if (!epObj) return;

    _axPlayingEp = epNum;

    // Highlight chip
    document.querySelectorAll('.ax-ep-chip').forEach(c => c.classList.remove('playing'));
    const activeChip = document.getElementById(`axEpChip_${epNum}`);
    if (activeChip) activeChip.classList.add('playing');

    const playerTitle = document.getElementById('axPlayerEpTitle');
    const epLabel = epObj.episode_label || epNum;
    if (playerTitle) {
        playerTitle.innerHTML = `▶ កំពុងចាក់: ភាគ ${escapeAxHtml(epLabel)} <span style="font-size:0.75rem; color:#34d399; margin-left:6px; font-weight:600;">⚡ ស្វ័យប្រវត្តិ</span>`;
    }

    const serversContainer = document.getElementById('axPlayerServers');
    if (serversContainer) {
        // Keep server buttons hidden per user instructions
        serversContainer.style.display = 'none';
        serversContainer.innerHTML = '';
    }

    try {
        const res = await fetch('/api/animexin/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ep_url: epObj.url })
        });
        const json = await res.json();
        if (json.ok && json.data) {
            _axCurrentStreamInfo = json.data;
            _axActiveServerIdx = 0;
            playAnimexinServerAuto(0);
        } else {
            if (playerTitle) {
                playerTitle.innerHTML = `▶ ភាគ ${escapeAxHtml(epLabel)} <span style="font-size:0.75rem; color:#ef4444; margin-left:6px;">⚠️ បរាជ័យក្នុងការទាញយក Server</span>`;
            }
        }
    } catch (err) {
        console.error('[Animexin UI] Stream load error:', err);
    }
}
window.playAnimexinEpisode = playAnimexinEpisode;

function renderAnimexinServers(servers) {
    // Hidden internal list - auto-plays top working server
    if (servers && servers.length > 0) {
        _axActiveServerIdx = 0;
        playAnimexinServerAuto(0);
    }
}

function playAnimexinServerAuto(serverIdx) {
    if (!_axCurrentStreamInfo || !_axCurrentStreamInfo.servers || _axCurrentStreamInfo.servers.length === 0) return;
    const servers = _axCurrentStreamInfo.servers;
    if (serverIdx >= servers.length) {
        serverIdx = 0;
    }
    _axActiveServerIdx = serverIdx;
    const s = servers[serverIdx];
    if (!s) return;

    const video = document.getElementById('axVideoPlayer');
    const iframe = document.getElementById('axEmbedIframe');
    const playerTitle = document.getElementById('axPlayerEpTitle');

    const epObj = _axActiveAnime && _axActiveAnime.episodes ? _axActiveAnime.episodes.find(e => e.episode === _axPlayingEp) : null;
    const epLabel = epObj ? (epObj.episode_label || epObj.episode) : (_axPlayingEp || '១');

    if (playerTitle) {
        playerTitle.innerHTML = `▶ កំពុងចាក់: ភាគ ${escapeAxHtml(epLabel)} <span style="font-size:0.75rem; color:#34d399; margin-left:6px; font-weight:600;">⚡ ស្វ័យប្រវត្តិ</span>` +
            (servers.length > 1 ? ` <button type="button" class="btn btn-secondary btn-sm" onclick="switchAnimexinNextServer(event)" title="ប្តូរទៅ Server មួយទៀត" style="font-size:0.7rem; padding:2px 8px; border-radius:6px; margin-left:8px; background:rgba(255,255,255,0.08); border:1px solid rgba(16,185,129,0.3); color:#6ee7b7; cursor:pointer;">🔄 ប្តូរ Server (${serverIdx + 1}/${servers.length})</button>` : '');
    }

    // Embed URL (Ok.ru, Rumble, etc. - unblocked & highly reliable)
    const embedUrl = s.embed_url;
    if (embedUrl && iframe) {
        if (video) {
            video.pause();
            video.src = '';
            video.style.display = 'none';
        }
        if (_axHlsInstance) {
            _axHlsInstance.destroy();
            _axHlsInstance = null;
        }
        iframe.style.display = 'block';
        iframe.src = embedUrl;
        return;
    }

    // Direct unencrypted stream URL (HLS native video)
    if (s.stream_url && video) {
        if (iframe) {
            iframe.src = 'about:blank';
            iframe.style.display = 'none';
        }
        video.style.display = 'block';

        if (_axHlsInstance) {
            _axHlsInstance.destroy();
            _axHlsInstance = null;
        }

        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            _axHlsInstance = new Hls({
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                enableWorker: true
            });
            _axHlsInstance.loadSource(s.stream_url);
            _axHlsInstance.attachMedia(video);
            _axHlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => {});
            });
            _axHlsInstance.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    console.warn('[Animexin HLS] Fatal error, auto-fallback to next server');
                    if (servers.length > 1 && _axActiveServerIdx + 1 < servers.length) {
                        playAnimexinServerAuto(_axActiveServerIdx + 1);
                    }
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = s.stream_url;
            video.play().catch(() => {});
        }
    }
}

function switchAnimexinNextServer(event) {
    if (event) event.stopPropagation();
    if (!_axCurrentStreamInfo || !_axCurrentStreamInfo.servers || _axCurrentStreamInfo.servers.length <= 1) return;
    const nextIdx = (_axActiveServerIdx + 1) % _axCurrentStreamInfo.servers.length;
    playAnimexinServerAuto(nextIdx);
    if (typeof showToast === 'function') {
        const nextServer = _axCurrentStreamInfo.servers[nextIdx];
        showToast(`⚡ បានប្តូរទៅ Server ${nextIdx + 1}: ${nextServer.display_label || 'Auto'}`, '🔄');
    }
}
window.switchAnimexinNextServer = switchAnimexinNextServer;
window.switchAnimexinServer = playAnimexinServerAuto;

function closeAnimexinDetailCard() {
    const card = document.getElementById('axShowcaseCard');
    if (card) card.style.display = 'none';
    closeAnimexinPlayer();
    _axActiveAnime = null;
    document.querySelectorAll('.ax-card').forEach(c => c.classList.remove('active-pinned'));
}
window.closeAnimexinDetailCard = closeAnimexinDetailCard;

function closeAnimexinPlayer() {
    const video = document.getElementById('axVideoPlayer');
    const iframe = document.getElementById('axEmbedIframe');
    const playerTitle = document.getElementById('axPlayerEpTitle');
    if (playerTitle) playerTitle.innerText = '▶ បានបិទ Player';
    if (video) {
        video.pause();
        video.src = '';
    }
    if (_axHlsInstance) {
        _axHlsInstance.destroy();
        _axHlsInstance = null;
    }
    if (iframe) {
        iframe.src = 'about:blank';
        iframe.style.display = 'none';
    }
    _axPlayingEp = null;
    document.querySelectorAll('.ax-ep-chip').forEach(t => t.classList.remove('playing'));
}
window.closeAnimexinPlayer = closeAnimexinPlayer;

// Download Mode
function setAnimexinDownloadMode(mode) {
    _axDownloadMode = mode;
    document.querySelectorAll('.ax-mode-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.mode === mode);
    });
}
window.setAnimexinDownloadMode = setAnimexinDownloadMode;

// Download Selected Episodes
async function startAnimexinDownloadSelected() {
    if (!_axActiveAnime || !_axActiveAnime.episodes) {
        if (typeof showToast === 'function') showToast('សូមជ្រើសរើសរឿង Donghua ជាមុនសិន!', '⚠️');
        return;
    }

    const checks = document.querySelectorAll('.ax-ep-chip-check:checked');
    if (checks.length === 0) {
        if (typeof showToast === 'function') showToast('សូមធីកជ្រើសរើសភាគដែលចង់ទាញយក!', '⚠️');
        return;
    }

    const selectedNums = new Set(Array.from(checks).map(c => parseInt(c.value, 10)));
    const selectedEpisodes = _axActiveAnime.episodes.filter(e => selectedNums.has(e.episode));

    await submitAnimexinDownload(selectedEpisodes);
}
window.startAnimexinDownloadSelected = startAnimexinDownloadSelected;

// Download All Episodes
async function startAnimexinDownloadAll() {
    if (!_axActiveAnime || !_axActiveAnime.episodes || _axActiveAnime.episodes.length === 0) {
        if (typeof showToast === 'function') showToast('គ្មានភាគសម្រាប់ទាញយកទេ!', '⚠️');
        return;
    }
    await submitAnimexinDownload(_axActiveAnime.episodes);
}
window.startAnimexinDownloadAll = startAnimexinDownloadAll;

async function submitAnimexinDownload(episodes) {
    if (!episodes || episodes.length === 0) return;

    if (typeof showToast === 'function') {
        showToast(`⚡ កំពុងចាប់ផ្តើមទាញយក ${episodes.length} ភាគ...`, '🐉');
    }

    try {
        const res = await fetch('/api/animexin/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                anime_id: _axActiveAnime.id,
                title: _axActiveAnime.title,
                cover: (_axActiveAnime && _axActiveAnime.cover) || '',
                episodes: episodes,
                download_mode: _axDownloadMode,
                quality: 'original'
            })
        });
        const json = await res.json();
        if (json.ok && json.task) {
            if (typeof showToast === 'function') {
                showToast(`✓ បានបន្ថែម Task ទាញយកជោគជ័យ!`, '🚀');
            }
            startAnimexinTasksPolling();
            fetchAnimexinTasks();
            const tasksSection = document.getElementById('axTasksSection');
            if (tasksSection) {
                tasksSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } else {
            if (typeof showToast === 'function') {
                showToast(json.error || 'បរាជ័យក្នុងការចាប់ផ្តើមទាញយក', '❌');
            }
        }
    } catch (err) {
        console.error('[Animexin UI] Download start error:', err);
        if (typeof showToast === 'function') {
            showToast('បរាជ័យក្នុងការតភ្ជាប់: ' + err.message, '❌');
        }
    }
}

// Tasks Polling
function startAnimexinTasksPolling() {
    if (_axTasksPollingTimer) clearInterval(_axTasksPollingTimer);
    _axTasksPollingTimer = setInterval(fetchAnimexinTasks, 2500);
}
window.startAnimexinTasksPolling = startAnimexinTasksPolling;

function stopAnimexinTasksPolling() {
    if (_axTasksPollingTimer) {
        clearInterval(_axTasksPollingTimer);
        _axTasksPollingTimer = null;
    }
}
window.stopAnimexinTasksPolling = stopAnimexinTasksPolling;

const _axNotifiedCompletedTasks = new Set();
async function fetchAnimexinTasks() {
    try {
        const res = await fetch('/api/animexin/tasks');
        const json = await res.json();
        if (json.ok && Array.isArray(json.tasks)) {
            json.tasks.forEach(task => {
                if (task.status === 'completed' && !_axNotifiedCompletedTasks.has(task.task_id)) {
                    _axNotifiedCompletedTasks.add(task.task_id);
                    if (typeof showDownloadCompleteToast === 'function') {
                        showDownloadCompleteToast(task.title, task.download_dir);
                    }
                }
            });
            renderAnimexinTasks(json.tasks);
        }
    } catch (_) {}
}
window.fetchAnimexinTasks = fetchAnimexinTasks;

function renderAnimexinTasks(tasks) {
    const list = document.getElementById('axTasksList');
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

        let statusBadge = `<span class="badge" style="background:#10b981;">⚡ កំពុងទាញយក</span>`;
        if (isDone) statusBadge = `<span class="badge" style="background:#22c55e;">✓ បានបញ្ចប់</span>`;
        if (isErr) statusBadge = `<span class="badge" style="background:#ef4444;">❌ បរាជ័យ</span>`;
        if (isCancel) statusBadge = `<span class="badge" style="background:#64748b;">🚫 បានបោះបង់</span>`;

        const openBtn = `<button class="btn btn-secondary" onclick="openFolderInExplorer('${(task.download_dir || '').replace(/'/g, "\\'")}')" style="font-size:0.75rem; padding:3px 8px;">📁 បើក</button>`;

        return `
            <div class="ax-task-item">
                <div class="ax-task-header">
                    <span class="ax-task-title">${escapeAxHtml(task.title)}</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${statusBadge}
                        ${isDone ? openBtn : ''}
                        ${cancelBtn}
                    </div>
                </div>
                <div class="ax-task-progress-bar">
                    <div class="ax-task-progress-fill" style="width:${task.progress_pct || 0}%;"></div>
                </div>
                <div class="ax-task-footer">
                    <span>${task.current_episode_label || ('Ep ' + task.completed_episodes + '/' + task.total_episodes)} (${task.progress_pct}%)</span>
                    <span>${task.speed_str || ''}</span>
                </div>
            </div>
        `;
    }).join('');
}

async function cancelAnimexinTask(taskId) {
    try {
        await fetch('/api/animexin/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: taskId })
        });
        fetchAnimexinTasks();
        if (typeof pollDownloadStatus === 'function') pollDownloadStatus();
    } catch (_) {}
}
window.cancelAnimexinTask = cancelAnimexinTask;

async function clearAnimexinFinishedTasks() {
    try {
        await fetch('/api/animexin/clear', { method: 'POST' });
        fetchAnimexinTasks();
    } catch (_) {}
}
window.clearAnimexinFinishedTasks = clearAnimexinFinishedTasks;

async function openAnimexinFolder() {
    try {
        await fetch('/api/animexin/open_folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } catch (_) {}
}
window.openAnimexinFolder = openAnimexinFolder;

// Star / Bookmark Watchlist integration
function toggleStarAnimexin() {
    if (!_axActiveAnime) return;
    if (typeof window.toggleStarred === 'function') {
        window.toggleStarred({
            id: String(_axActiveAnime.id || _axActiveAnime.url),
            platform: 'animexin',
            title: decodeAxHtmlEntities(_axActiveAnime.title || 'Donghua'),
            cover: _axActiveAnime.cover || '',
            url: _axActiveAnime.url || '',
            eps: (_axActiveAnime.episodes || []).length,
            remarks: `${(_axActiveAnime.episodes || []).length} ភាគ`
        });
        updateAnimexinStarButton();
    }
}
window.toggleStarAnimexin = toggleStarAnimexin;

function toggleAnimexinCardStar(id, title, cover, remarks) {
    if (typeof window.toggleStarred === 'function') {
        window.toggleStarred({
            id: String(id),
            title: title || 'Donghua',
            cover: cover || '',
            platform: 'animexin',
            remarks: remarks || ''
        });
        updateAnimexinStarButton();
    }
}
window.toggleAnimexinCardStar = toggleAnimexinCardStar;

function updateAnimexinStarButton() {
    const btn = document.getElementById('axStarBtn');
    if (!btn || !_axActiveAnime) return;
    const isStarred = (typeof window.isStarred === 'function') ? window.isStarred(_axActiveAnime.id || _axActiveAnime.url, 'animexin') : false;
    btn.innerHTML = isStarred ? '⭐ បាន PIN' : '☆ PIN';
    btn.classList.toggle('btn-primary', isStarred);
    btn.classList.toggle('btn-secondary', !isStarred);
}
window.updateAnimexinStarButton = updateAnimexinStarButton;

function openAnimexinInBrowser() {
    if (_axActiveAnime && _axActiveAnime.url) {
        if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
            window.electronAPI.openExternal(_axActiveAnime.url);
        } else {
            window.open(_axActiveAnime.url, '_blank');
        }
    }
}
window.openAnimexinInBrowser = openAnimexinInBrowser;
