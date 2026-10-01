// =========================================================
// MVFFM (mvffm.net) Short Drama Platform Frontend Logic
// =========================================================

let currentMvDrama = null;
let currentMvSourceIndex = 0;
let currentMvEpisodeIndex = 0;
let mvHlsInstance = null;
let mvTasksPollingTimer = null;
let _mvRecsLoaded = false;
let _currentMvCategory = 'hot';
let _allMvItems = [];
let _mvRenderLimit = 60;

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

async function selectMvffmCategory(cat) {
    _currentMvCategory = cat || 'hot';
    document.querySelectorAll('.mv-cat-chip').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === _currentMvCategory);
    });
    await loadMvffmRecommendations(_currentMvCategory);
}

let _isMvFallback = false;

async function loadMvffmRecommendations(type = 'hot') {
    _currentMvCategory = type;
    const grid = document.getElementById('mvRecsGrid');
    const title = document.getElementById('mvSectionTitle');
    const catBar = document.getElementById('mvCatBar');

    if (catBar) catBar.style.display = 'flex';
    document.querySelectorAll('.mv-cat-chip').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === _currentMvCategory);
    });

    const catNames = {
        hot: { zh: '🔥 热门推荐 (Top Views)', km: '🔥 រឿងពេញនិយមបំផុត (Top Views)', en: '🔥 Top Views' },
        latest: { zh: '⚡ 最新发布 (Latest Releases)', km: '⚡ ទើបតែចេញថ្មីៗ (Latest Releases)', en: '⚡ Latest Releases' },
        monthly: { zh: '📅 本月热门 (Monthly Hot)', km: '📅 ពេញនិយមប្រចាំខែ (Monthly Hot)', en: '📅 Monthly Hot' }
    };
    const catEntry = catNames[_currentMvCategory] || catNames.hot;
    if (title) title.textContent = catEntry[currentLang] || catEntry.km || catEntry.en;

    if (grid) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8;"><span style="animation:spin 1s linear infinite; display:inline-block;">⏳</span> ' + 
            (currentLang === 'zh' ? '正在加载 MVFFM 短剧...' : (currentLang === 'km' ? 'កំពុងទាញយករឿង MVFFM...' : 'Loading MVFFM dramas...')) + '</div>';
    }

    try {
        const res = await fetch(`/api/mvffm/recommend?type=${encodeURIComponent(_currentMvCategory)}`);
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.message || 'Failed to load MVFFM recommendations');

        _allMvItems = data.data || [];
        // Reshuffle feed for fresh discovery on each entry/open
        if (typeof shuffleArray === 'function') {
            _allMvItems = shuffleArray(_allMvItems);
        }
        _isMvFallback = Boolean(data.is_fallback || (_allMvItems.length > 0 && _allMvItems[0].is_fallback));
        _mvRenderLimit = 60;
        renderMvffmCards(_allMvItems.slice(0, _mvRenderLimit));
        _mvRecsLoaded = true;
    } catch (err) {
        const safeErr = (typeof escapeHtml === 'function') ? escapeHtml(err.message) : err.message;
        if (grid) grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:30px; color:#ef4444;">⚠️ បរាជ័យក្នុងការទាញយក: ${safeErr}</div>`;
    }
}

function shuffleMvffmFeed() {
    if (_allMvItems && _allMvItems.length > 0) {
        if (typeof shuffleArray === 'function') {
            _allMvItems = shuffleArray(_allMvItems);
        }
        _mvRenderLimit = 60;
        renderMvffmCards(_allMvItems.slice(0, _mvRenderLimit));
    } else {
        loadMvffmRecommendations(_currentMvCategory);
    }
}
window.shuffleMvffmFeed = shuffleMvffmFeed;

function loadMoreMvffmDramas() {
    if (!_allMvItems || !_allMvItems.length) return;
    _mvRenderLimit += 60;
    renderMvffmCards(_allMvItems.slice(0, _mvRenderLimit));
}

function renderMvffmCards(items) {
    const grid = document.getElementById('mvRecsGrid');
    if (!grid) return;

    const loadMoreContainer = document.getElementById('mvLoadMoreContainer');
    if (loadMoreContainer) {
        loadMoreContainer.style.display = (_allMvItems && _mvRenderLimit < _allMvItems.length) ? 'flex' : 'none';
    }

    if (!items || items.length === 0) {
        const emptyZh = `
            <div style="grid-column:1/-1; text-align:center; padding:40px 20px; color:#94a3b8;">
                <div style="font-size:2rem; margin-bottom:10px;">⚠️</div>
                <div style="font-size:1.05rem; font-weight:600; color:#f8fafc; margin-bottom:6px;">暂无短剧数据</div>
                <div style="font-size:0.85rem; color:#94a3b8; max-width:460px; margin:0 auto 16px auto; line-height:1.5;">您可以尝试刷新，或切换到【红果短剧】与【好搜短剧】畅享数万部剧集。</div>
                <div style="display:flex; justify-content:center; gap:10px;">
                    <button onclick="loadMvffmRecommendations(_currentMvCategory)" class="btn btn-primary btn-sm">🔄 刷新重试</button>
                    <button onclick="selectPlatform && selectPlatform('hongguo')" class="btn btn-secondary btn-sm">🔥 红果短剧</button>
                    <button onclick="selectPlatform && selectPlatform('haosou')" class="btn btn-secondary btn-sm">⚡ 好搜短剧</button>
                </div>
            </div>`;
        const emptyKm = `
            <div style="grid-column:1/-1; text-align:center; padding:40px 20px; color:#94a3b8;">
                <div style="font-size:2rem; margin-bottom:10px;">⚠️</div>
                <div style="font-size:1.05rem; font-weight:600; color:#f8fafc; margin-bottom:6px;">មិនទាន់មានទិន្នន័យរឿងទេ</div>
                <div style="font-size:0.85rem; color:#94a3b8; max-width:460px; margin:0 auto 16px auto; line-height:1.5;">លោកអ្នកអាចចុច Refresh ឬជ្រើសរើសទស្សនានៅលើផ្ទាំង HONGGUO ឬ HAOSOU បានភ្លាមៗ!</div>
                <div style="display:flex; justify-content:center; gap:10px;">
                    <button onclick="loadMvffmRecommendations(_currentMvCategory)" class="btn btn-primary btn-sm">🔄 ផ្ទុកឡើងវិញ</button>
                    <button onclick="selectPlatform && selectPlatform('hongguo')" class="btn btn-secondary btn-sm">🔥 ទៅផ្ទាំង HONGGUO</button>
                    <button onclick="selectPlatform && selectPlatform('haosou')" class="btn btn-secondary btn-sm">⚡ ទៅផ្ទាំង HAOSOU</button>
                </div>
            </div>`;
        const emptyEn = `
            <div style="grid-column:1/-1; text-align:center; padding:40px 20px; color:#94a3b8;">
                <div style="font-size:2rem; margin-bottom:10px;">⚠️</div>
                <div style="font-size:1.05rem; font-weight:600; color:#f8fafc; margin-bottom:6px;">No Dramas Found</div>
                <div style="font-size:0.85rem; color:#94a3b8; max-width:460px; margin:0 auto 16px auto; line-height:1.5;">You can retry or switch to HONGGUO / HAOSOU platforms.</div>
                <div style="display:flex; justify-content:center; gap:10px;">
                    <button onclick="loadMvffmRecommendations(_currentMvCategory)" class="btn btn-primary btn-sm">🔄 Retry</button>
                    <button onclick="selectPlatform && selectPlatform('hongguo')" class="btn btn-secondary btn-sm">🔥 HONGGUO</button>
                    <button onclick="selectPlatform && selectPlatform('haosou')" class="btn btn-secondary btn-sm">⚡ HAOSOU</button>
                </div>
            </div>`;
        grid.innerHTML = currentLang === 'zh' ? emptyZh : (currentLang === 'km' ? emptyKm : emptyEn);
        return;
    }

    // Queue translations for titles in non-Chinese mode
    if (currentLang !== 'zh' && currentLang !== 'original') {
        items.forEach(it => {
            if (it.title && typeof queueTitleTranslation === 'function') {
                queueTitleTranslation(it.title);
            }
        });
    }

    const cardsHtml = items.map((item) => {
        const cover = item.cover || '/uploads/image/20250311/5754a9f551b45a5f36800c0212460d0a.png';
        const cleanRemarks = (item.remarks || '短劇').replace(/\b\d{4}\s*/g, '').trim() || '短劇';
        const remarks = cleanRemarks ? `<span class="mv-card-badge">${escapeHtml(cleanRemarks)}</span>` : '';
        const displayTitle = (currentLang === 'zh' || currentLang === 'original') ? item.title : (typeof getDisplayTitle === 'function' ? getDisplayTitle(item.title) : item.title);
        const showSubOrig = (currentLang !== 'zh' && currentLang !== 'original');
        const subOrigHtml = showSubOrig ? `<div class="hs-card-sub-orig" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>` : '';
        const playBtnText = currentLang === 'zh' ? '▶️ 播放 / 下载' : (currentLang === 'km' ? '▶️ មើល & ទាញយក' : '▶️ Play / Download');
        const isStarred = (typeof isDramaStarred === 'function') && isDramaStarred(item.id, 'mvffm');

        return `
            <div class="mv-card" onclick="analyzeMvffmDrama('${escapeHtml(item.id)}')">
                <div class="mv-card-poster-wrapper">
                    <img class="mv-card-poster" src="${escapeHtml(cover)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.src='/favicon.ico';">
                    ${remarks}
                    <button class="mv-star-btn ${isStarred ? 'starred' : ''}" data-mv-star="${escapeHtml(item.id)}" onclick="event.stopPropagation(); toggleMvffmCardStar('${escapeHtml(item.id)}', '${escapeHtml(item.title)}', '${escapeHtml(cover)}', '${escapeHtml(cleanRemarks)}')" title="ដាក់ផ្កាយ / Pin">
                        ${isStarred ? '★' : '☆'}
                    </button>
                </div>
                <div class="mv-card-body">
                    <div class="mv-card-title" data-original-title="${escapeHtml(item.title)}" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</div>
                    ${subOrigHtml}
                    <div class="mv-card-footer">
                        <button class="mv-card-btn-play" onclick="event.stopPropagation(); analyzeMvffmDrama('${escapeHtml(item.id)}')">${playBtnText}</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    grid.innerHTML = cardsHtml;
}

async function pasteMvFromClipboard() {
    try {
        let text = '';
        if (window.electronAPI && typeof window.electronAPI.readClipboard === 'function') {
            text = await window.electronAPI.readClipboard();
        } else if (navigator.clipboard && navigator.clipboard.readText) {
            text = await navigator.clipboard.readText();
        }
        if (!text) {
            showToast('ក្តារតម្កល់ទទេ (Clipboard is empty)', '📋');
            return;
        }
        const input = document.getElementById('mvDramaInput');
        if (input) {
            input.value = text.trim();
            showToast('បានបិទភ្ជាប់ Link (URL Pasted)', '📋');
            analyzeMvffmDrama(input.value);
        }
    } catch (e) {
        showToast('សូមចុច Ctrl+V ដើម្បី Paste', 'ℹ️');
    }
}

function onMvInputKeyDown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const input = document.getElementById('mvDramaInput');
        if (input && input.value.trim()) {
            analyzeMvffmDrama(input.value.trim());
        }
    }
}

async function analyzeMvffmDrama(idOrUrl) {
    if (typeof requireActiveLicense === 'function' && !requireActiveLicense('មើល ឬទាញយករឿង MVFFM')) {
        return;
    }
    const input = document.getElementById('mvDramaInput');
    const targetQuery = (idOrUrl || (input ? input.value : '')).trim();
    if (!targetQuery) {
        showToast('សូមបញ្ចូលលីង ឬឈ្មោះរឿង MVFFM', '⚠️');
        return;
    }

    const btn = document.getElementById('btnMvSearch');
    if (btn) btn.disabled = true;
    showToast('⚡ កំពុងទាញយកព័ត៌មានរឿងពី MVFFM...', '🚀');

    try {
        const res = await fetch('/api/mvffm/detail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: targetQuery })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.message || 'Drama not found');

        currentMvDrama = data.data;
        if (typeof recordDownloadMemory === 'function' && currentMvDrama && currentMvDrama.id) {
            recordDownloadMemory({
                id: String(currentMvDrama.id),
                platform: 'mvffm',
                title: currentMvDrama.title,
                khmer_title: (typeof getDisplayTitle === 'function' ? getDisplayTitle(currentMvDrama.title) : currentMvDrama.title),
                cover: currentMvDrama.cover || '',
                total_episodes: (currentMvDrama.episodes || []).length
            });
        }
        currentMvSourceIndex = 0;
        currentMvEpisodeIndex = 0;
        renderMvffmDetail(currentMvDrama);
        showToast(`បានបើក "${currentMvDrama.title}"!`, '✅');

        const card = document.getElementById('mvDramaCard');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
        showToast(`Error: ${err.message}`, '❌');
    } finally {
        if (btn) btn.disabled = false;
    }
}

function renderMvffmDetail(drama) {
    if (!drama) return;
    const card = document.getElementById('mvDramaCard');
    const titleEl = document.getElementById('mvCardTitle');
    const descEl = document.getElementById('mvCardDesc');
    const tagsEl = document.getElementById('mvCardTags');
    const sourcesBar = document.getElementById('mvSourcesBar');
    const epCountEl = document.getElementById('mvEpisodeCount');
    const epGrid = document.getElementById('mvEpisodeGrid');
    const outDirEl = document.getElementById('mvOutputDirDisplay');

    if (card) card.style.display = 'block';

    if (titleEl) {
        const disp = currentLang === 'original' ? drama.title : getDisplayTitle(drama.title);
        titleEl.textContent = disp || 'MVFFM Short Drama';
        titleEl.setAttribute('data-original-title', drama.title);
        if (currentLang !== 'zh' && currentLang !== 'original') {
            queueTitleTranslation(drama.title);
        }
    }

    if (descEl) descEl.textContent = drama.desc || 'MVFFM 精品短劇';

    if (tagsEl) {
        const isStarred = (typeof isDramaStarred === 'function') && isDramaStarred(drama.id, 'mvffm');
        const tags = drama.tags || [];
        tagsEl.innerHTML = `
            <button type="button" class="btn btn-secondary btn-sm" onclick="toggleMvffmCardStar('${drama.id}', '${escapeHtml(drama.title)}', '${escapeHtml(drama.cover)}', '')" style="color:#fbbf24; border-color:rgba(251,191,36,0.4); padding:2px 10px; font-size:0.75rem; border-radius:6px; cursor:pointer;">
                ${isStarred ? '★ បានដាក់ផ្កាយ' : '☆ ដាក់ផ្កាយ'}
            </button>
            <span class="mv-tag-pill">🌟 1080p FHD</span>
            <span class="mv-tag-pill" style="background:rgba(16,185,129,0.2); color:#6ee7b7; border-color:rgba(16,185,129,0.4);">FREE ឥតគិតថ្លៃ</span>
            ${tags.map(t => `<span class="mv-tag-pill" style="background:rgba(255,255,255,0.08); color:#e2e8f0; border-color:rgba(255,255,255,0.15);">${escapeHtml(t)}</span>`).join('')}
        `;
    }

    // Render Sources
    const sources = drama.sources || [];
    if (sourcesBar) {
        if (sources.length > 1) {
            sourcesBar.style.display = 'flex';
            sourcesBar.innerHTML = sources.map((s, idx) => `
                <button class="mv-source-btn ${idx === currentMvSourceIndex ? 'active' : ''}" onclick="switchMvSource(${idx})">
                    ${escapeHtml(s.name)} (${s.count} ភាគ)
                </button>
            `).join('');
        } else {
            sourcesBar.style.display = 'none';
        }
    }

    renderCurrentMvEpisodes();

    fetch('/api/mvffm/tasks').then(r => r.json()).then(d => {
        if (d && d.output_dir && outDirEl) {
            outDirEl.textContent = d.output_dir;
            outDirEl.title = d.output_dir;
        }
    }).catch(() => {});
}

function switchMvSource(srcIdx) {
    if (!currentMvDrama || !currentMvDrama.sources || !currentMvDrama.sources[srcIdx]) return;
    currentMvSourceIndex = srcIdx;

    document.querySelectorAll('.mv-source-btn').forEach((btn, idx) => {
        btn.classList.toggle('active', idx === srcIdx);
    });

    renderCurrentMvEpisodes();
}

function renderCurrentMvEpisodes() {
    if (!currentMvDrama) return;
    const sources = currentMvDrama.sources || [];
    const curSource = sources[currentMvSourceIndex] || { episodes: currentMvDrama.episodes || [] };
    const episodes = curSource.episodes || [];

    const epCountEl = document.getElementById('mvEpisodeCount');
    const epGrid = document.getElementById('mvEpisodeGrid');
    const epUnit = currentLang === 'zh' ? '集' : (currentLang === 'km' ? 'ភាគ' : 'Episodes');

    if (epCountEl) epCountEl.textContent = `${episodes.length} ${epUnit}`;

    if (epGrid) {
        epGrid.innerHTML = episodes.map((ep, idx) => `
            <div class="mv-ep-chip ${idx === 0 ? 'active' : ''}" id="mvEpChip_${idx}" onclick="playMvEpisode(${idx})">
                ${escapeHtml(ep.label)}
            </div>
        `).join('');
    }

    const rangeTo = document.getElementById('mvRangeTo');
    if (rangeTo) rangeTo.value = episodes.length;

    if (episodes.length > 0) {
        playMvEpisode(0);
    }

    if (typeof window.syncSeriesModeBar === 'function') {
        window.syncSeriesModeBar(episodes.length);
    }

    // Check download memory (អង្គចងចាំការទាញយក) to show downloaded vs missing episodes
    fetch(`/api/drama/check-memory?id=${encodeURIComponent(currentMvDrama.id)}&title=${encodeURIComponent(currentMvDrama.title)}&platform=mvffm&total=${episodes.length}`)
        .then(r => r.json())
        .then(mem => {
            if (mem && mem.downloaded_episodes && mem.downloaded_episodes.length > 0) {
                const downloadedSet = new Set(mem.downloaded_episodes);
                episodes.forEach((ep, idx) => {
                    const epNum = ep.episode || (idx + 1);
                    if (downloadedSet.has(epNum)) {
                        const chip = document.getElementById(`mvEpChip_${idx}`);
                        if (chip) {
                            chip.classList.add('is-downloaded');
                            chip.title = '✓ បានទាញយករួចរាល់';
                        }
                    }
                });
                const statusBadge = document.getElementById('mvMemoryStatusBadge');
                if (statusBadge) {
                    statusBadge.style.display = 'inline-flex';
                    if (mem.is_completed) {
                        statusBadge.className = 'memory-status-badge completed';
                        statusBadge.innerHTML = `✓ បានដោនចប់សព្វគ្រប់ (${mem.downloaded_count}/${mem.total_episodes} ភាគ)`;
                    } else {
                        statusBadge.className = 'memory-status-badge partial';
                        statusBadge.innerHTML = `⚠️ បានដោន ${mem.downloaded_count}/${mem.total_episodes} ភាគ (ខ្វះ ${mem.missing_count} ភាគ)`;
                    }
                }
            } else {
                const statusBadge = document.getElementById('mvMemoryStatusBadge');
                if (statusBadge) statusBadge.style.display = 'none';
            }
        }).catch(() => {});
}

function playMvEpisode(index) {
    if (!currentMvDrama) return;
    const sources = currentMvDrama.sources || [];
    const curSource = sources[currentMvSourceIndex] || { episodes: currentMvDrama.episodes || [] };
    const episodes = curSource.episodes || [];
    if (!episodes[index]) return;

    currentMvEpisodeIndex = index;
    const ep = episodes[index];

    document.querySelectorAll('.mv-ep-chip').forEach((c, idx) => c.classList.toggle('active', idx === index));

    const curLabel = document.getElementById('mvCurrentPlayingEp');
    if (curLabel) curLabel.textContent = `▶️ កំពុងចាក់: ${ep.label || `Episode ${ep.episode}`}`;

    const video = document.getElementById('mvVideoPlayer');
    if (!video) return;

    const url = ep.url;
    if (!url) {
        showToast('មិនមាន link វីដេអូសម្រាប់ភាគនេះទេ', '⚠️');
        return;
    }

    if (mvHlsInstance) {
        mvHlsInstance.destroy();
        mvHlsInstance = null;
    }

    if (window.Hls && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        mvHlsInstance = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {});
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.play().catch(() => {});
    } else {
        video.src = url;
    }
}

async function downloadMvffmEpisodes(mode = 'all') {
    if (typeof requireActiveLicense === 'function' && !requireActiveLicense('ទាញយករឿង MVFFM')) {
        return;
    }
    if (!currentMvDrama) return;
    const sources = currentMvDrama.sources || [];
    const curSource = sources[currentMvSourceIndex] || { episodes: currentMvDrama.episodes || [] };
    const allEps = curSource.episodes || [];
    if (!allEps || allEps.length === 0) {
        showToast('គ្មានភាគសម្រាប់ទាញយកទេ', '⚠️');
        return;
    }

    let targetEps = [];
    if (mode === 'current') {
        if (allEps[currentMvEpisodeIndex]) targetEps = [allEps[currentMvEpisodeIndex]];
    } else if (mode === 'range') {
        const fromVal = parseInt(document.getElementById('mvRangeFrom').value, 10) || 1;
        const toVal = parseInt(document.getElementById('mvRangeTo').value, 10) || allEps.length;
        const start = Math.max(1, Math.min(fromVal, toVal));
        const end = Math.min(allEps.length, Math.max(fromVal, toVal));
        targetEps = allEps.slice(start - 1, end);
    } else {
        targetEps = allEps;
    }

    if (targetEps.length === 0) {
        showToast('សូមជ្រើសរើសភាគដែលត្រូវទាញយក', '⚠️');
        return;
    }

    const doSubmit = async (selectedMode = 'separate') => {
        showToast(`កំពុងចាប់ផ្តើមទាញយក ${targetEps.length} ភាគ...`, '📥');

        try {
            const res = await fetch('/api/mvffm/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    drama_id: currentMvDrama.id,
                    title: currentMvDrama.title,
                    episodes: targetEps,
                    download_mode: selectedMode
                })
            });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.message || 'Failed to start download');

            showToast(`បានបញ្ចូលកិច្ចការទាញយក "${currentMvDrama.title}"!`, '🚀');
            startMvffmTasksPolling();
            fetchMvffmTasks();
        } catch (err) {
            showToast(`Download error: ${err.message}`, '❌');
        }
    };

    const proceedWithMode = () => {
        if (typeof window.promptDownloadMode === 'function') {
            window.promptDownloadMode({
                title: currentMvDrama.title,
                episodeCount: targetEps.length,
                onConfirm: doSubmit
            });
        } else {
            doSubmit('separate');
        }
    };

    if (typeof window.checkAndPromptDuplicate === 'function') {
        window.checkAndPromptDuplicate(currentMvDrama.id, currentMvDrama.title, 'mvffm', targetEps.length, () => {
            proceedWithMode();
        });
    } else {
        proceedWithMode();
    }
}

function startMvffmTasksPolling() {
    if (mvTasksPollingTimer) clearInterval(mvTasksPollingTimer);
    mvTasksPollingTimer = setInterval(fetchMvffmTasks, 1500);
}

function stopMvffmTasksPolling() {
    if (mvTasksPollingTimer) {
        clearInterval(mvTasksPollingTimer);
        mvTasksPollingTimer = null;
    }
}

async function fetchMvffmTasks() {
    try {
        const res = await fetch('/api/mvffm/tasks');
        const data = await res.json();
        if (res.ok && data.ok) {
            renderMvffmTasks(data.tasks || []);
        }
    } catch (e) {}
}

function renderMvffmTasks(tasks) {
    const container = document.getElementById('mvTasksContainer');
    const list = document.getElementById('mvTasksList');
    if (!container || !list) return;

    if (!tasks || tasks.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    list.innerHTML = tasks.map(task => {
        const isDone = task.status === 'completed';
        const isErr = task.status === 'error';
        const isCanceled = task.status === 'canceled';
        const isMerging = task.status === 'merging';
        const statusText = isDone ? '✅ រួចរាល់' : (isErr ? '❌ បរាជ័យ' : (isCanceled ? '⏹️ បានផ្អាក' : (isMerging ? '🎞️ កំពុងភ្ជាប់វីដេអូ...' : `⚡ កំពុងទាញយក (${task.speed_str || '1x'})`)));

        return `
            <div class="mv-task-item">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; color:#ffffff; font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${escapeHtml(task.title)}
                    </div>
                    <div style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">
                        ${escapeHtml(task.current_episode_label)} - ភាគ ${task.completed_episodes}/${task.total_episodes}
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:12px;">
                    <div class="mv-progress-bar-bg">
                        <div class="mv-progress-bar-fill" style="width: ${task.progress_pct}%;"></div>
                    </div>
                    <span style="font-size:0.8rem; font-weight:700; color:#e2e8f0; width:45px;">${task.progress_pct}%</span>
                    <span style="font-size:0.78rem; color:#cbd5e1;">${statusText}</span>
                    ${!isDone && !isCanceled && !isErr ? `
                        <button class="btn btn-secondary btn-sm" onclick="cancelMvffmTask('${task.task_id}')" style="padding:2px 8px; font-size:0.75rem;">⏹️</button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

async function cancelMvffmTask(taskId) {
    try {
        await fetch('/api/mvffm/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: taskId })
        });
        fetchMvffmTasks();
    } catch (e) {}
}

async function clearFinishedMvffmTasks() {
    try {
        await fetch('/api/mvffm/clear', { method: 'POST' });
        fetchMvffmTasks();
    } catch (e) {}
}

async function openMvffmFolder() {
    try {
        await fetch('/api/mvffm/open_folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    } catch (e) {}
}
