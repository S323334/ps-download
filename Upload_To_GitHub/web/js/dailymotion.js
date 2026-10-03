// =========================================================
// DAILYMOTION Chinese Short Drama & Short Film Frontend Logic
// Full Compilation & Short Films (Duration >= 30 mins, No Duplicates)
// =========================================================

let _dmPage = 1;
let _dmCategory = 'trending';
let _dmItems = [];
let _dmLoadedIds = new Set();
let _activeDmPlayerVideo = null;
let _activeDmEpisodes = [];
let _dmTasksPollingTimer = null;
let _dmLoadedOnce = false;
let _isLoadingDmMore = false;
let _dmHlsInstance = null;

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

/**
 * Switch category tab (trending, ceo, historical, fantasy, romance, apps)
 */
function switchDmCategory(category) {
    if (_dmCategory === category) return;
    _dmCategory = category;
    _dmPage = 1;
    document.querySelectorAll('.dm-cat-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === category);
    });
    const title = document.getElementById('dmSectionTitle');
    const catTitles = {
        trending: '🎬 រឿងភាគខ្លីចិនល្បីៗពេញនិយម (Trending Full Movie)',
        ceo: '👑 រឿងភាគចិន CEO & មហាសេដ្ឋី (Billionaire Full Movie)',
        historical: '🏛️ រឿងភាគចិនបុរាណ & រាជវាំង (Historical Romance)',
        fantasy: '⚡ រឿងភាគចិនក្បាច់គុន & វេទមន្ត (Action & Martial Arts)',
        romance: '💖 រឿងភាគចិនស្នេហា & សងសឹក (Romance & Revenge)',
        apps: '🌟 រឿងភាគល្បីៗពី DramaBox & ReelShort'
    };
    if (title && catTitles[category]) {
        title.innerHTML = `<span>🎬</span> <span>${catTitles[category]}</span>`;
    }
    loadDailymotionFeed(1, false);
}

/**
 * Load Dailymotion Chinese Drama Feed (Duration >= 30 mins, Deduplicated)
 */
async function loadDailymotionFeed(page = 1, append = false) {
    _dmPage = page;
    const grid = document.getElementById('dmRecsGrid');
    const loadMoreContainer = document.getElementById('dmLoadMoreContainer');
    const curLang = window.currentLang || 'km';

    if (!append) {
        _dmLoadedIds.clear();
        _dmItems = [];
        if (grid) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 48px; color: #94a3b8;">
                    <span style="animation: spin 1s linear infinite; display: inline-block; font-size: 1.6rem;">⏳</span>
                    <div style="margin-top: 10px; font-weight: 600; font-size: 0.95rem;">
                        ${curLang === 'zh' ? '正在加载 30 分钟以上高清华语短剧与微电影...' : (curLang === 'km' ? 'កំពុងទាញយករឿងភាគខ្លីចិន (30+ នាទីឡើង) ពី Dailymotion...' : 'Loading 30+ min Chinese short dramas from Dailymotion...')}
                    </div>
                </div>`;
        }
        if (loadMoreContainer) loadMoreContainer.style.display = 'none';
    }

    try {
        const res = await fetch(`/api/dailymotion/feed?category=${encodeURIComponent(_dmCategory)}&page=${page}`);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.message || 'Failed to fetch');

        const rawList = json.data && json.data.list ? json.data.list : [];
        const newItems = [];

        for (const item of rawList) {
            if (!item || !item.id) continue;
            // Strict client-side verification: duration >= 1800 (>= 30 mins)
            if (Number(item.duration) < 1800) continue;
            // Deduplication: Never add duplicate video ID
            if (_dmLoadedIds.has(item.id)) continue;

            _dmLoadedIds.add(item.id);
            newItems.push(item);
        }

        if (append) {
            _dmItems.push(...newItems);
            appendDailymotionCards(newItems);
        } else {
            _dmItems = newItems;
            renderDailymotionCards(_dmItems);
        }

        _dmLoadedOnce = true;
        if (loadMoreContainer) {
            loadMoreContainer.style.display = 'flex';
        }

    } catch (err) {
        if (!append && grid) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 30px; color: #ef4444;">
                    <div style="font-size: 1.6rem; margin-bottom: 6px;">⚠️</div>
                    <div>${err.message || 'បរាជ័យក្នុងការទាញយក'}</div>
                    <button class="btn btn-secondary btn-sm" onclick="loadDailymotionFeed(1)" style="margin-top: 10px;">🔄 ព្យាយាមឡើងវិញ</button>
                </div>`;
        }
    }
}

/**
 * Load More button handler (Appends 50+ more 30+ min Chinese dramas)
 */
async function loadMoreDailymotionDramas() {
    if (_isLoadingDmMore) return;
    _isLoadingDmMore = true;
    const btn = document.getElementById('btnDmLoadMore');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = `<span>⏳</span> <span>កំពុងទាញយករឿងបន្ថែមទៀត (Loading 50+ More)...</span>`;
        btn.style.opacity = '0.75';
    }

    _dmPage++;
    await loadDailymotionFeed(_dmPage, true);

    if (btn) {
        btn.innerHTML = originalText;
        btn.style.opacity = '1';
    }
    _isLoadingDmMore = false;
}

/**
 * Render Video Cards (Initial / Replace)
 */
function renderDailymotionCards(items) {
    const grid = document.getElementById('dmRecsGrid');
    if (!grid) return;

    if (!items || items.length === 0) {
        const curLang = window.currentLang || 'km';
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #94a3b8;">
                <div style="font-size: 2.2rem; margin-bottom: 8px;">🎬</div>
                <div style="font-weight: 600; color: #f1f5f9;">${curLang === 'zh' ? '暂未找到 30 分钟以上华语短剧' : (curLang === 'km' ? 'មិនមានរឿងភាគចិន 30 នាទីឡើងទេ' : 'No 30+ min dramas found')}</div>
            </div>`;
        return;
    }

    const cardsHtml = items.map(buildDramaCardHtml).join('');
    grid.innerHTML = cardsHtml;

    // Queue title translations when Khmer or Chinese is active
    if (typeof queueTitleTranslation === 'function') {
        items.forEach(it => {
            if (it && it.title) queueTitleTranslation(it.title);
        });
    }
}

/**
 * Append Video Cards smoothly without redrawing entire grid
 */
function appendDailymotionCards(items) {
    const grid = document.getElementById('dmRecsGrid');
    if (!grid || !items || items.length === 0) return;

    const cardsHtml = items.map(buildDramaCardHtml).join('');
    grid.insertAdjacentHTML('beforeend', cardsHtml);

    // Queue title translations when Khmer or Chinese is active
    if (typeof queueTitleTranslation === 'function') {
        items.forEach(it => {
            if (it && it.title) queueTitleTranslation(it.title);
        });
    }
}

function buildDramaCardHtml(item) {
    const thumb = item.thumbnail || '/ps_logo.jpg';
    const rawTitle = item.title || 'Chinese Short Drama';
    const displayTitle = (typeof getDisplayTitle === 'function') ? getDisplayTitle(rawTitle) : rawTitle;
    const titleSafe = escapeHtml(displayTitle);
    const rawTitleSafe = escapeHtml(rawTitle);
    const curLang = window.currentLang || 'km';
    const channelName = curLang === 'km' ? 'ប៉ុស្តិ៍ Dailymotion' : (item.channel || item.owner || 'Dailymotion');
    const channelSafe = escapeHtml(channelName);
    const viewsLabel = curLang === 'km' ? 'ទស្សនា' : (curLang === 'zh' ? '次观看' : 'views');
    const viewsStr = item.views_str ? `${item.views_str} ${viewsLabel}` : '';
    const durationStr = item.duration_str || '';
    const showSubOrig = (curLang === 'en' || curLang === 'original');
    const subOrigHtml = showSubOrig ? `<div class="dm-card-sub-orig" title="${rawTitleSafe}">${rawTitleSafe}</div>` : '';
    const badgeText = curLang === 'km' ? '30+ នាទី' : (curLang === 'zh' ? '30+ 分钟' : '30M+');
    const playBtnText = curLang === 'zh' ? '▶️ 播放' : (curLang === 'km' ? '▶️ មើល & លេង' : '▶️ Play');
    const jsonItem = escapeHtml(JSON.stringify(item));

    return `
        <div class="dm-card" onclick="playDailymotionDrama('${escapeHtml(item.id)}')" data-drama="${jsonItem}">
            <div class="dm-card-poster-wrapper">
                <img class="dm-card-poster" src="${escapeHtml(thumb)}" alt="${rawTitleSafe}" loading="lazy" onerror="this.src='/ps_logo.jpg';">
                <span class="dm-card-badge" style="display:flex; align-items:center; gap:4px;">
                    <img src="/dailymotion_icon.svg" style="width:12px; height:12px; vertical-align:middle;">
                    <span>${badgeText}</span>
                </span>
                ${durationStr ? `<span class="dm-card-duration">⏱️ ${escapeHtml(durationStr)}</span>` : ''}
            </div>
            <div class="dm-card-body">
                <h3 class="card-title dm-card-title" data-original-title="${rawTitleSafe}" title="${titleSafe}">${titleSafe}</h3>
                ${subOrigHtml}
                <div class="dm-card-channel">
                    <span>👤</span> <span>${channelSafe}</span>
                </div>
                <div class="dm-card-footer">
                    <div class="dm-card-meta">
                        <span>👁️ ${escapeHtml(viewsStr)}</span>
                    </div>
                    <button type="button" class="dm-btn-card-play" onclick="event.stopPropagation(); playDailymotionDrama('${escapeHtml(item.id)}')">
                        ${playBtnText}
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Handle Search Input & Enter Key
 */
function onDmInputKeyDown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        searchDailymotionDramas();
    }
}

/**
 * Search Dailymotion Chinese Dramas or Parse Direct URL (>= 30 mins)
 */
async function searchDailymotionDramas() {
    const input = document.getElementById('dmDramaInput');
    if (!input) return;
    const query = input.value.trim();
    if (!query) {
        return loadDailymotionFeed(1);
    }

    // Validate if query is a URL from another platform
    if (/^https?:\/\//i.test(query)) {
        if (!/(?:dailymotion\.com|dai\.ly)/i.test(query)) {
            if (typeof showToast === 'function') {
                showToast('⚠️ លីងនេះមិនមែនជាលីង Dailymotion ឡើយ! សូមបិទភ្ជាប់លីង Dailymotion ឬវាយឈ្មោះរឿង', 'warning');
            } else {
                alert('⚠️ លីងនេះមិនមែនជាលីង Dailymotion ឡើយ!');
            }
            return;
        }
    }

    const grid = document.getElementById('dmRecsGrid');
    const title = document.getElementById('dmSectionTitle');
    const loadMoreContainer = document.getElementById('dmLoadMoreContainer');
    const curLang = window.currentLang || 'km';

    if (title) {
        title.innerHTML = `<span>🔍</span> <span>លទ្ធផលស្វែងរក: "${escapeHtml(query)}"</span>`;
    }
    if (loadMoreContainer) loadMoreContainer.style.display = 'none';

    if (grid) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #94a3b8;">
                <span style="animation: spin 1s linear infinite; display: inline-block; font-size: 1.4rem;">⏳</span>
                <div style="margin-top: 8px;">${curLang === 'zh' ? '正在搜索 30 分钟以上 Dailymotion 短剧...' : 'កំពុងស្វែងរករឿងចិន (30+ នាទី) ក្នុង Dailymotion...'}</div>
            </div>`;
    }

    try {
        const res = await fetch(`/api/dailymotion/search?q=${encodeURIComponent(query)}&page=1`);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.message || 'Search failed');

        const rawList = json.data && json.data.list ? json.data.list : [];
        _dmLoadedIds.clear();
        _dmItems = [];

        for (const item of rawList) {
            if (!item || !item.id) continue;
            if (_dmLoadedIds.has(item.id)) continue;
            _dmLoadedIds.add(item.id);
            _dmItems.push(item);
        }

        renderDailymotionCards(_dmItems);

        // If direct single URL was entered, open it immediately!
        if (json.data && json.data.is_direct && _dmItems.length === 1) {
            playDailymotionDrama(_dmItems[0].id);
        }
    } catch (err) {
        if (grid) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 30px; color: #ef4444;">⚠️ ស្វែងរកមិនឃើញ: ${escapeHtml(err.message)}</div>`;
        }
    }
}

/**
 * Paste from Clipboard into Search Bar
 */
async function pasteDmFromClipboard() {
    try {
        let text = '';
        if (window.electronAPI && typeof window.electronAPI.readClipboard === 'function') {
            text = await window.electronAPI.readClipboard();
        } else if (navigator.clipboard && navigator.clipboard.readText) {
            text = await navigator.clipboard.readText();
        }
        if (!text) {
            if (typeof showToast === 'function') showToast('ក្តារខៀនទទេ (Clipboard is empty)');
            return;
        }
        const input = document.getElementById('dmDramaInput');
        if (input) {
            input.value = text.trim();
            input.focus();
            if (typeof showToast === 'function') showToast('បានបិទភ្ជាប់ (Paste) ដោយជោគជ័យ!', '📋');
            // Silent paste: user must press Enter or click Search
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast('មិនអាច paste បានទេ', '⚠️');
    }
}

/**
 * Play Dailymotion Drama in Inline Detail Player (just like HaoSou #hsDramaCard)
 */
async function playDailymotionDrama(videoIdOrItem) {
    if (!videoIdOrItem) return;

    let item = null;
    let videoId = '';

    if (typeof videoIdOrItem === 'object' && videoIdOrItem !== null) {
        item = videoIdOrItem;
        videoId = item.id;
    } else {
        videoId = String(videoIdOrItem).trim();
        item = _dmItems.find(x => x.id === videoId);
    }

    const card = document.getElementById('dmDramaCard');
    const iframe = document.getElementById('dmVideoPlayer');
    const titleEl = document.getElementById('dmCardTitle');
    const subOrigEl = document.getElementById('dmCardSubOrig');
    const channelTag = document.getElementById('dmCardChannelTag');
    const descEl = document.getElementById('dmCardDesc');
    const epCountEl = document.getElementById('dmEpisodeCount');
    const epGrid = document.getElementById('dmEpisodeGrid');
    const curPlayingEp = document.getElementById('dmCurrentPlayingEp');
    const outDirEl = document.getElementById('dmOutputDirDisplay');

    if (card) card.style.display = 'grid';

    const rawTitle = (item && item.title) ? item.title : 'Chinese Short Drama';
    const curLang = window.currentLang || 'km';
    const dispTitle = (typeof getDisplayTitle === 'function') ? getDisplayTitle(rawTitle) : rawTitle;

    if (titleEl) {
        titleEl.textContent = dispTitle;
        titleEl.setAttribute('data-original-title', rawTitle);
        if (typeof queueTitleTranslation === 'function') {
            queueTitleTranslation(rawTitle);
        }
    }

    if (subOrigEl) {
        subOrigEl.textContent = (curLang === 'en' || curLang === 'original') ? rawTitle : '';
        subOrigEl.style.display = (curLang === 'en' || curLang === 'original') ? 'block' : 'none';
    }

    if (channelTag) {
        channelTag.textContent = curLang === 'km' ? '👤 ប៉ុស្តិ៍ Dailymotion' : `👤 ${(item && (item.channel || item.owner)) || 'Dailymotion'}`;
    }

    if (descEl) {
        descEl.textContent = curLang === 'km'
            ? 'ខ្សែភាពយន្តភាគខ្លីពេញមួយរឿង កម្រិតច្បាស់ HD រយៈពេលចាប់ពី 30 នាទីឡើងទៅ'
            : ((item && (item.description || item.title)) || 'Dailymotion Chinese Short Drama Full Movie');
    }

    const tagDur = document.getElementById('dmTagDuration');
    if (tagDur) tagDur.textContent = curLang === 'km' ? '⏱️ ពេញមួយរឿង (30+ នាទី)' : '⏱️ 30M+ Full Movie';
    const tagQual = document.getElementById('dmTagQuality');
    if (tagQual) tagQual.textContent = curLang === 'km' ? '⭐ កម្រិតច្បាស់ HD 1080p' : '⭐ HD 1080p';

    if (curPlayingEp) {
        curPlayingEp.textContent = curLang === 'km' ? '⏳ កំពុងផ្ទុកវីដេអូ...' : '⏳ Loading video...';
    }

    const videoEl = document.getElementById('dmVideoPlayer');
    if (videoEl) {
        videoEl.pause();
        if (_dmHlsInstance) {
            try { _dmHlsInstance.destroy(); } catch (_) {}
            _dmHlsInstance = null;
        }
        videoEl.removeAttribute('src');
        videoEl.load();
    }

    _activeDmPlayerVideo = {
        id: videoId,
        title: rawTitle,
        url: (item && item.url) ? item.url : `https://www.dailymotion.com/video/${videoId}`
    };

    // Smoothly scroll to the detail player card
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Update Output Dir Display
    fetch('/api/dailymotion/tasks')
        .then(r => r.json())
        .then(d => {
            if (d && d.output_dir && outDirEl) {
                outDirEl.textContent = d.output_dir;
                outDirEl.title = d.output_dir;
            }
        })
        .catch(() => {});

    // Fetch detail & stream in parallel
    try {
        const [detailRes, streamRes] = await Promise.all([
            fetch(`/api/dailymotion/detail?id=${encodeURIComponent(videoId)}`).then(r => r.json()).catch(() => null),
            fetch(`/api/dailymotion/stream?id=${encodeURIComponent(videoId)}`).then(r => r.json()).catch(() => null)
        ]);

        const playUrl = (streamRes && streamRes.ok && streamRes.proxy_url)
            || (streamRes && streamRes.ok && streamRes.stream_url)
            || (detailRes && detailRes.data && detailRes.data.stream_url);

        if (playUrl && videoEl) {
            if (window.Hls && Hls.isSupported()) {
                const hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: false,
                    backBufferLength: 90
                });
                _dmHlsInstance = hls;
                hls.loadSource(playUrl);
                hls.attachMedia(videoEl);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    videoEl.play().catch(() => {});
                    if (curPlayingEp) curPlayingEp.textContent = '▶️ កំពុងចាក់ (Playing)';
                });
                hls.on(Hls.Events.ERROR, (_, errData) => {
                    if (errData && errData.fatal) {
                        console.warn('[Dailymotion HLS Fatal]', errData.type);
                        if (errData.type === Hls.ErrorTypes.NETWORK_ERROR) {
                            hls.startLoad();
                        } else if (errData.type === Hls.ErrorTypes.MEDIA_ERROR) {
                            hls.recoverMediaError();
                        }
                    }
                });
            } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
                videoEl.src = playUrl;
                videoEl.play().catch(() => {});
                if (curPlayingEp) curPlayingEp.textContent = '▶️ កំពុងចាក់ (Playing)';
            } else {
                videoEl.src = playUrl;
                videoEl.play().catch(() => {});
                if (curPlayingEp) curPlayingEp.textContent = '▶️ កំពុងចាក់ (Playing)';
            }
        } else {
            if (curPlayingEp) {
                curPlayingEp.textContent = '⚠️ មិនអាចចាក់ផ្ទាល់បានទេ - សូមចុច "បើកលើ Browser"';
            }
        }

        if (detailRes && detailRes.data) {
            const data = detailRes.data;
            if (titleEl) {
                const dt = (typeof getDisplayTitle === 'function') ? getDisplayTitle(data.title) : data.title;
                titleEl.textContent = dt;
                titleEl.setAttribute('data-original-title', data.title);
            }
            if (descEl && curLang !== 'km' && data.description) {
                descEl.textContent = data.description;
            }

            _activeDmPlayerVideo = {
                id: data.id,
                title: data.title || rawTitle,
                url: data.url
            };
        }
    } catch (_) {}
}

/**
 * Play specific Dailymotion episode/part in detail player
 */
function playDailymotionEpisode(epId, epTitle) {
    if (!epId) return;
    playDailymotionDrama({ id: epId, title: epTitle });
}

/**
 * Open currently active Dailymotion video in external browser
 */
function openActiveDmExternal() {
    if (_activeDmPlayerVideo && _activeDmPlayerVideo.url) {
        if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
            window.electronAPI.openExternal(_activeDmPlayerVideo.url);
        } else {
            window.open(_activeDmPlayerVideo.url, '_blank');
        }
    }
}

/**
 * Close Inline Dailymotion Drama Player Card
 */
function closeDmDramaCard() {
    const card = document.getElementById('dmDramaCard');
    if (card) card.style.display = 'none';

    const videoEl = document.getElementById('dmVideoPlayer');
    if (videoEl) {
        videoEl.pause();
        if (_dmHlsInstance) {
            try { _dmHlsInstance.destroy(); } catch (_) {}
            _dmHlsInstance = null;
        }
        videoEl.removeAttribute('src');
        videoEl.load();
    }

    _activeDmPlayerVideo = null;
}

/**
 * Pick Output Folder for Dailymotion
 */
async function pickDmFolder() {
    if (window.electronAPI && typeof window.electronAPI.selectFolder === 'function') {
        const folder = await window.electronAPI.selectFolder();
        if (folder) {
            const outDirEl = document.getElementById('dmOutputDirDisplay');
            if (outDirEl) {
                outDirEl.textContent = folder;
                outDirEl.title = folder;
            }
        }
    }
}

/**
 * Legacy alias for compatibility
 */
function openDailymotionPlayer(videoId, el = null) {
    playDailymotionDrama(videoId);
}
function closeDailymotionPlayer() {
    closeDmDramaCard();
}

/**
 * Download currently active video in player
 */
function downloadCurrentDailymotionVideo() {
    if (!_activeDmPlayerVideo || !_activeDmPlayerVideo.id) {
        if (typeof showToast === 'function') showToast('សូមជ្រើសរើសវីដេអូជាមុន');
        return;
    }
    downloadDailymotionVideo(_activeDmPlayerVideo.id, _activeDmPlayerVideo.title, _activeDmPlayerVideo.url);
}

/**
 * Trigger Dailymotion Video Download via yt-dlp
 */
async function downloadDailymotionVideo(id, title, url = null) {
    const curLang = window.currentLang || 'km';
    if (typeof showToast === 'function') {
        const msg = curLang === 'zh' ? '已加入 Dailymotion 下载队列 ⚡' : 'បានបញ្ជូនទៅកាន់បញ្ជីទាញយក Dailymotion ⚡';
        showToast(msg);
    }

    try {
        const res = await fetch('/api/dailymotion/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_id: id,
                title: title || 'Dailymotion_Drama',
                url: url || `https://www.dailymotion.com/video/${id}`
            })
        });

        const json = await res.json();
        if (!res.ok || !json.ok) {
            throw new Error(json.error || json.message || 'Download error');
        }

        // Make tasks section visible and start polling
        const tasksContainer = document.getElementById('dmTasksContainer');
        if (tasksContainer) tasksContainer.style.display = 'block';
        startDmTasksPolling();
        fetchDmTasks();

    } catch (err) {
        if (typeof showToast === 'function') {
            showToast(`⚠️ បរាជ័យក្នុងការទាញយក: ${err.message}`);
        }
    }
}

/**
 * Polling and Active Tasks
 */
function startDmTasksPolling() {
    if (_dmTasksPollingTimer) return;
    _dmTasksPollingTimer = setInterval(fetchDmTasks, 2000);
}

function stopDmTasksPolling() {
    if (_dmTasksPollingTimer) {
        clearInterval(_dmTasksPollingTimer);
        _dmTasksPollingTimer = null;
    }
}

async function fetchDmTasks() {
    try {
        const res = await fetch('/api/dailymotion/tasks');
        const json = await res.json();
        if (!res.ok || !json.ok) return;

        const tasks = json.tasks || [];
        renderDmTasks(tasks);

        const anyActive = tasks.some(t => t.status === 'downloading');
        if (!anyActive && tasks.length === 0) {
            stopDmTasksPolling();
        }
    } catch (_) {}
}

function renderDmTasks(tasks) {
    const list = document.getElementById('dmTasksList');
    const container = document.getElementById('dmTasksContainer');
    if (!list || !container) return;

    if (!tasks || tasks.length === 0) {
        container.style.display = 'none';
        list.innerHTML = '';
        return;
    }

    container.style.display = 'block';
    const html = tasks.map(t => {
        const pct = Math.min(100, Math.max(0, t.progress_pct || 0)).toFixed(1);
        const isDone = t.status === 'completed';
        const isErr = t.status === 'error';
        const isCanceled = t.status === 'canceled';

        let statusBadge = '<span style="color: #38bdf8;">⚡ កំពុងទាញយក</span>';
        if (isDone) statusBadge = '<span style="color: #10b981; font-weight: 700;">✅ រួចរាល់ (100%)</span>';
        if (isErr) statusBadge = `<span style="color: #ef4444;">⚠️ បរាជ័យ: ${escapeHtml(t.error_message || '')}</span>`;
        if (isCanceled) statusBadge = '<span style="color: #94a3b8;">⛔ បានបោះបង់</span>';

        return `
            <div class="dm-task-item">
                <div class="dm-task-header">
                    <span class="dm-task-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${statusBadge}
                        ${(!isDone && !isErr && !isCanceled) ? `
                            <button type="button" class="btn btn-secondary btn-sm" onclick="cancelDmTask('${escapeHtml(t.task_id)}')" style="padding: 2px 8px; font-size: 0.72rem;">បោះបង់</button>
                        ` : ''}
                    </div>
                </div>
                <div class="dm-task-progress-bar">
                    <div class="dm-task-progress-fill" style="width: ${pct}%;"></div>
                </div>
                <div class="dm-task-meta">
                    <span>${pct}% ${t.size_str ? `(${escapeHtml(t.size_str)})` : ''}</span>
                    <span>${t.speed_str ? `⚡ ${escapeHtml(t.speed_str)}` : ''} ${t.eta_str ? `ETA: ${escapeHtml(t.eta_str)}` : ''}</span>
                </div>
            </div>
        `;
    }).join('');

    list.innerHTML = html;
}

async function cancelDmTask(taskId) {
    try {
        await fetch('/api/dailymotion/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: taskId })
        });
        fetchDmTasks();
    } catch (_) {}
}

async function openDmFolder() {
    try {
        await fetch('/api/dailymotion/open_folder', { method: 'POST' });
    } catch (_) {}
}

// Window Exports
window.openDailymotionWebsite = openDailymotionWebsite;
window.onDailymotionLogoClick = onDailymotionLogoClick;
window.loadDailymotionFeed = loadDailymotionFeed;
window.switchDmCategory = switchDmCategory;
window.loadMoreDailymotionDramas = loadMoreDailymotionDramas;
window.searchDailymotionDramas = searchDailymotionDramas;
window.onDmInputKeyDown = onDmInputKeyDown;
window.pasteDmFromClipboard = pasteDmFromClipboard;
window.openDailymotionPlayer = openDailymotionPlayer;
window.playDailymotionDrama = playDailymotionDrama;
window.playDailymotionEpisode = playDailymotionEpisode;
window.openActiveDmExternal = openActiveDmExternal;
window.closeDmDramaCard = closeDmDramaCard;
window.closeDailymotionPlayer = closeDailymotionPlayer;
window.pickDmFolder = pickDmFolder;
window.downloadCurrentDailymotionVideo = downloadCurrentDailymotionVideo;
window.downloadDailymotionVideo = downloadDailymotionVideo;
window.startDmTasksPolling = startDmTasksPolling;
window.stopDmTasksPolling = stopDmTasksPolling;
window.fetchDmTasks = fetchDmTasks;
window.cancelDmTask = cancelDmTask;
window.openDmFolder = openDmFolder;
