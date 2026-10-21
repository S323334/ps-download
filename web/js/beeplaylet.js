// =========================================================
// BEEPLAYLET (beeplaylet.com) SHORT DRAMA FRONTEND CONTROLLER
// Supports Hot/Latest/Ranking/Free Catalogs, Real-Time Search,
// HLS Inline Preview Player, Batch Downloads, and Task Tracking
// =========================================================

(function() {
    let currentBpDrama = null;
    let currentBpPlayingIndex = 0;
    let selectedBpEpisodes = new Set();
    let bpHlsInstance = null;
    let bpTasksPollingTimer = null;
    let _bpRecsLoaded = false;
    let _currentBpCategory = 'hot';
    let _allBpItems = [];
    let _lastBpItems = [];
    let _bpRenderLimit = 60;

    function openBeeplayletWebsite() {
        const url = 'https://beeplaylet.com/';
        if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
            window.electronAPI.openExternal(url);
        } else {
            window.open(url, '_blank');
        }
    }
    window.openBeeplayletWebsite = openBeeplayletWebsite;

    function onBeeplayletLogoClick(event) {
        if (event) event.stopPropagation();
        openBeeplayletWebsite();
    }
    window.onBeeplayletLogoClick = onBeeplayletLogoClick;

    async function selectBeeplayletCategory(cat) {
        _currentBpCategory = cat || 'hot';
        document.querySelectorAll('.bp-cat-chip').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.cat === _currentBpCategory);
        });
        await loadBeeplayletRecommendations(_currentBpCategory);
    }
    window.selectBeeplayletCategory = selectBeeplayletCategory;

    async function loadBeeplayletRecommendations(category = 'hot') {
        _currentBpCategory = category;
        const grid = document.getElementById('bpRecsGrid');
        const icon = document.getElementById('bpSectionIcon');
        const title = document.getElementById('bpSectionTitle');
        const backBtn = document.getElementById('btnBpBackToRecs');
        const catBar = document.getElementById('bpCatBar');

        if (catBar) catBar.style.display = 'flex';
        document.querySelectorAll('.bp-cat-chip').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.cat === _currentBpCategory);
        });

        const curLang = window.currentLang || 'km';
        const catNames = {
            hot: { zh: '热门短剧推荐 (Hot Recommendations)', km: '🔥 រឿងភាគកំពុងល្បី (Hot Recommendations)', en: '🔥 Hot Recommendations' },
            latest: { zh: '最新短剧 (Latest Dramas)', km: '⚡ រឿងភាគចេញថ្មីៗ (Latest Dramas)', en: '⚡ Latest Dramas' },
            ranking: { zh: '排行榜 (Ranking List)', km: '🏆 តារាងចំណាត់ថ្នាក់កំពូល (Ranking List)', en: '🏆 Top Ranking' },
            free: { zh: '免费专区 (Free Dramas)', km: '🎁 រឿងភាគ Free (Free Dramas)', en: '🎁 Free Dramas' }
        };

        const catEntry = catNames[_currentBpCategory] || catNames.hot;
        if (title) title.textContent = catEntry[curLang] || catEntry.km || catEntry.en;
        if (icon) icon.textContent = _currentBpCategory === 'hot' ? '🔥' : (_currentBpCategory === 'ranking' ? '🏆' : '🎬');
        if (backBtn) backBtn.style.display = 'none';

        if (grid) grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8;"><span style="animation:spin 1s linear infinite; display:inline-block;">⏳</span> ' + (curLang === 'zh' ? '正在加载蜜蜂短剧...' : (curLang === 'km' ? 'កំពុងទាញយករឿងភាគ Beeplaylet...' : 'Loading Beeplaylet dramas...')) + '</div>';

        try {
            const res = await fetch(`/api/beeplaylet/recommend?category=${encodeURIComponent(_currentBpCategory)}`);
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.message || 'Failed to load recommendations');

            _allBpItems = data.data || [];
            // Reshuffle feed for fresh discovery on each entry/open
            if (typeof shuffleArray === 'function') {
                _allBpItems = shuffleArray(_allBpItems);
            }
            _bpRenderLimit = 60;
            _lastBpItems = _allBpItems.slice(0, _bpRenderLimit);
            renderBeeplayletCards(_lastBpItems);
            _bpRecsLoaded = true;
            window._bpRecsLoaded = true;
        } catch (err) {
            const safeErr = (typeof escapeHtml === 'function') ? escapeHtml(err.message) : err.message;
            if (grid) grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:30px; color:#ef4444;">⚠️ បរាជ័យក្នុងការទាញយក: ${safeErr}</div>`;
        }
    }
    window.loadBeeplayletRecommendations = loadBeeplayletRecommendations;

    // Rule 13: Active Drama Pinning on Shuffle (keep currently playing drama at #1 and shuffle rest)
    function shuffleBeeplayletFeed() {
        if (_allBpItems && _allBpItems.length > 0) {
            if (typeof shuffleArray === 'function') {
                if (currentBpDrama && currentBpDrama.id) {
                    const activeId = String(currentBpDrama.id);
                    const activeItem = _allBpItems.find(x => String(x.id) === activeId) || _allBpItems[0];
                    const others = _allBpItems.filter(x => String(x.id) !== String(activeItem.id));
                    _allBpItems = [activeItem, ...shuffleArray(others)];
                } else {
                    _allBpItems = shuffleArray(_allBpItems);
                }
            }
            _bpRenderLimit = 60;
            _lastBpItems = _allBpItems.slice(0, _bpRenderLimit);
            renderBeeplayletCards(_lastBpItems);
        } else {
            loadBeeplayletRecommendations(_currentBpCategory);
        }
    }
    window.shuffleBeeplayletFeed = shuffleBeeplayletFeed;

    function loadMoreBeeplayletDramas() {
        if (!_allBpItems || !_allBpItems.length) return;
        _bpRenderLimit += 60;
        _lastBpItems = _allBpItems.slice(0, _bpRenderLimit);
        renderBeeplayletCards(_lastBpItems);
    }
    window.loadMoreBeeplayletDramas = loadMoreBeeplayletDramas;

    function renderBeeplayletCards(items) {
        const grid = document.getElementById('bpRecsGrid');
        if (!grid) return;
        _lastBpItems = items || [];

        const curLang = window.currentLang || 'km';
        const loadMoreContainer = document.getElementById('bpLoadMoreContainer');
        if (loadMoreContainer) {
            if (_allBpItems && _bpRenderLimit < _allBpItems.length) {
                loadMoreContainer.style.display = 'flex';
            } else {
                loadMoreContainer.style.display = 'none';
            }
        }

        if (!items || items.length === 0) {
            grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8;">${curLang === 'zh' ? '暂无短剧数据' : (curLang === 'km' ? 'គ្មានទិន្នន័យរឿងទេ' : 'No dramas found')}</div>`;
            return;
        }

        const activeDramaId = (currentBpDrama && currentBpDrama.id) ? String(currentBpDrama.id) : null;

        grid.innerHTML = items.map((item, idx) => {
            const cover = item.cover || 'https://via.placeholder.com/200x280?text=Beeplaylet';
            const remarks = item.remarks ? `<span class="bp-card-badge">${escapeHtml(item.remarks)}</span>` : '';
            const displayTitle = typeof getDisplayTitle === 'function' ? getDisplayTitle(item.title) : item.title;
            const isPlaying = activeDramaId && (String(item.id) === activeDramaId);
            const nowPlayingBadge = isPlaying ? `<span class="bp-card-badge now-playing-badge">▶ កំពុងចាក់</span>` : '';
            const isStarred = (typeof isDramaStarred === 'function') && isDramaStarred(item.id, 'beeplaylet');

            return `
                <div class="bp-drama-card ${isPlaying ? 'active-playing' : ''}" onclick="analyzeBeeplayletDrama('${escapeHtml(item.id)}')">
                    <div class="bp-card-thumb-wrap">
                        <img src="${escapeHtml(cover)}" alt="${escapeHtml(item.title)}" loading="lazy" class="bp-card-thumb" onerror="this.src='/logo.svg'">
                        ${nowPlayingBadge || remarks}
                        <button class="bp-card-star-btn ${isStarred ? 'starred' : ''}" data-bp-star="${escapeHtml(item.id)}" onclick="event.stopPropagation(); toggleBeeplayletCardStar('${escapeHtml(item.id)}', '${escapeHtml(item.title)}', '${escapeHtml(cover)}', '${escapeHtml(item.remarks || '')}')" title="ដាក់ផ្កាយ / Pin">
                            ${isStarred ? '★' : '☆'}
                        </button>
                    </div>
                    <div class="bp-card-info">
                        <h3 class="bp-card-title" data-original-title="${escapeHtml(item.title)}" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</h3>
                        <div class="bp-card-meta">
                            <span>🐝 ${item.seriesCount ? item.seriesCount + ' ភាគ' : 'HD'}</span>
                            <span>▶️ ${item.playCount ? (item.playCount > 10000 ? Math.round(item.playCount/1000) + 'k' : item.playCount) : 'Hot'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Queue translations
        if (curLang !== 'zh' && curLang !== 'original' && typeof queueTitleTranslation === 'function') {
            items.forEach(it => {
                if (it.title) queueTitleTranslation(it.title);
            });
        }
    }
    window.renderBeeplayletCards = renderBeeplayletCards;

    async function submitBpSearch() {
        const input = document.getElementById('bpDramaInput');
        const query = (input ? input.value : '').trim();
        const curLang = window.currentLang || 'km';

        if (!query) {
            showToast(curLang === 'zh' ? '请输入短剧片名或链接！' : (curLang === 'km' ? 'សូមវាយបញ្ចូលឈ្មោះរឿង ឬលីង Beeplaylet!' : 'Please enter drama title or link!'), '⚠️');
            if (input) input.focus();
            return;
        }

        // Direct URL or ID check
        if (query.includes('beeplaylet.com') || /^\d+$/.test(query)) {
            analyzeBeeplayletDrama(query);
            return;
        }

        const btn = document.getElementById('btnBpSearch');
        const spinner = document.getElementById('bpSearchSpinner');
        const btnText = document.getElementById('bpSearchBtnText');

        if (btn) btn.disabled = true;
        if (spinner) spinner.style.display = 'inline-block';
        if (btnText) btnText.textContent = '...';

        const grid = document.getElementById('bpRecsGrid');
        const icon = document.getElementById('bpSectionIcon');
        const title = document.getElementById('bpSectionTitle');
        const backBtn = document.getElementById('btnBpBackToRecs');
        const catBar = document.getElementById('bpCatBar');

        if (catBar) catBar.style.display = 'none';
        if (icon) icon.textContent = '🔍';
        if (title) title.textContent = (curLang === 'zh' ? '搜索结果: ' : (curLang === 'km' ? 'លទ្ធផលស្វែងរក: ' : 'Search Results: ')) + query;
        if (backBtn) backBtn.style.display = 'inline-block';

        if (grid) grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8;"><span style="animation:spin 1s linear infinite; display:inline-block;">⏳</span> ' + (curLang === 'zh' ? '正在搜索...' : (curLang === 'km' ? 'កំពុងស្វែងរក...' : 'Searching...')) + '</div>';

        try {
            const res = await fetch(`/api/beeplaylet/search?query=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.message || 'Search failed');

            _allBpItems = data.data || [];
            _bpRenderLimit = _allBpItems.length;
            _lastBpItems = _allBpItems;
            renderBeeplayletCards(_lastBpItems);
            showToast(`រកឃើញ ${_allBpItems.length} រឿងលើ Beeplaylet!`, '🐝');
        } catch (err) {
            if (grid) grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:30px; color:#ef4444;">⚠️ បរាជ័យ: ${escapeHtml(err.message)}</div>`;
        } finally {
            if (btn) btn.disabled = false;
            if (spinner) spinner.style.display = 'none';
            const defBtnText = curLang === 'zh' ? '🔍 搜索 / 解析' : (curLang === 'km' ? '🔍 ស្វែងរក / វិភាគ' : '🔍 Search / Parse');
            if (btnText) btnText.textContent = defBtnText;
        }
    }
    window.submitBpSearch = submitBpSearch;

    async function analyzeBeeplayletDrama(idOrUrl) {
        if (typeof requireActiveLicense === 'function' && !requireActiveLicense('មើល ឬទាញយករឿង Beeplaylet')) {
            return;
        }
        const btn = document.getElementById('btnBpSearch');
        const spinner = document.getElementById('bpSearchSpinner');
        const btnText = document.getElementById('bpSearchBtnText');

        if (btn) btn.disabled = true;
        if (spinner) spinner.style.display = 'inline-block';
        if (btnText) btnText.textContent = '...';

        showToast('⚡ កំពុងទាញយកព័ត៌មានរឿង Beeplaylet...', '🐝');

        try {
            const res = await fetch('/api/beeplaylet/detail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: idOrUrl })
            });

            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.message || 'Beeplaylet drama not found');

            currentBpDrama = data.data;

            if (typeof recordDownloadMemory === 'function' && currentBpDrama && currentBpDrama.id) {
                recordDownloadMemory({
                    id: String(currentBpDrama.id),
                    platform: 'beeplaylet',
                    title: currentBpDrama.title,
                    khmer_title: (typeof getDisplayTitle === 'function' ? getDisplayTitle(currentBpDrama.title) : currentBpDrama.title),
                    cover: currentBpDrama.cover || '',
                    total_episodes: (currentBpDrama.episodes || []).length
                });
            }

            renderBeeplayletDetail(currentBpDrama);

            // Rule 13: Non-destructive Pinning: Put analyzed drama at Card #1 in recommendations
            if (currentBpDrama && currentBpDrama.id && _allBpItems) {
                const bpCardItem = {
                    id: currentBpDrama.id,
                    title: currentBpDrama.title,
                    cover: currentBpDrama.cover || '',
                    seriesCount: (currentBpDrama.episodes || []).length,
                    remarks: `${(currentBpDrama.episodes || []).length} ភាគ`
                };
                _allBpItems = [bpCardItem, ..._allBpItems.filter(x => String(x.id) !== String(currentBpDrama.id))];
                _lastBpItems = _allBpItems.slice(0, _bpRenderLimit);
                renderBeeplayletCards(_lastBpItems);
            }

            showToast(`បានបើក "${currentBpDrama.title}"!`, '✅');

            const card = document.getElementById('bpDramaCard');
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (err) {
            showToast(`Error: ${err.message}`, '❌');
        } finally {
            if (btn) btn.disabled = false;
            if (spinner) spinner.style.display = 'none';
            const curLang = window.currentLang || 'km';
            const defBtnText = curLang === 'zh' ? '🔍 搜索 / 解析' : (curLang === 'km' ? '🔍 ស្វែងរក / វិភាគ' : '🔍 Search / Parse');
            if (btnText) btnText.textContent = defBtnText;
        }
    }
    window.analyzeBeeplayletDrama = analyzeBeeplayletDrama;

    function renderBeeplayletDetail(drama) {
        if (!drama) return;
        const card = document.getElementById('bpDramaCard');
        const titleEl = document.getElementById('bpCardTitle');
        const descEl = document.getElementById('bpCardDesc');
        const tagsEl = document.getElementById('bpCardTags');
        const epCountEl = document.getElementById('bpEpisodeCount');
        const epGrid = document.getElementById('bpEpisodeGrid');
        const outDirEl = document.getElementById('bpOutputDirDisplay');

        if (card) card.style.display = 'block';

        const curLang = window.currentLang || 'km';
        if (titleEl) {
            const disp = curLang === 'original' ? drama.title : (typeof getDisplayTitle === 'function' ? getDisplayTitle(drama.title) : drama.title);
            titleEl.textContent = disp || 'Beeplaylet Short Drama';
            titleEl.setAttribute('data-original-title', drama.title);
            if (curLang !== 'zh' && curLang !== 'original' && typeof queueTitleTranslation === 'function') {
                queueTitleTranslation(drama.title);
            }
        }
        if (descEl) {
            translateBeeplayletDesc(drama.id, drama.desc);
        }

        if (tagsEl) {
            tagsEl.innerHTML = `
                <span class="tag-pill" style="background:rgba(245,158,11,0.2); color:#fbbf24; border:1px solid rgba(245,158,11,0.4); padding:3px 10px; border-radius:6px; font-size:0.75rem; font-weight:700;">🐝 BEEPLAYLET</span>
                <span class="tag-pill" style="background:rgba(16,185,129,0.2); color:#6ee7b7; border:1px solid rgba(16,185,129,0.4); padding:3px 10px; border-radius:6px; font-size:0.75rem; font-weight:700;">🌟 1080p FHD</span>
                <span class="tag-pill" style="background:rgba(255,255,255,0.08); color:#e2e8f0; padding:3px 10px; border-radius:6px; font-size:0.75rem;">FREE ឥតគិតថ្លៃ</span>
            `;
        }

        const episodes = drama.episodes || [];
        const epUnit = curLang === 'zh' ? '集' : (curLang === 'km' ? 'ភាគ' : 'Episodes');
        if (epCountEl) epCountEl.textContent = `${episodes.length} ${epUnit}`;

        // Initialize episode selection: start UNCHECKED by default
        selectedBpEpisodes.clear();
        updateBpSelectedBadge();
        updateBeeplayletStarButton();

        if (epGrid) {
            epGrid.innerHTML = episodes.map((ep, idx) => {
                const isSel = selectedBpEpisodes.has(ep.episode);
                return `
                <div class="bp-ep-chip ${idx === 0 ? 'active-ep' : ''} ${isSel ? 'selected' : ''}" id="bpEpChip_${idx}" onclick="handleBpEpTileClick(event, ${idx})" ondblclick="playBeeplayletEpisode(${idx})" title="ចុចមួយដង = គ្រីស | ចុចពីរដង = មើលវីដេអូ">
                    <input type="checkbox" class="bp-ep-checkbox" id="bpEpChk_${idx}" ${isSel ? 'checked' : ''} onclick="event.stopPropagation(); toggleBpEpCheck(${idx})" title="គ្រីសសម្រាប់ទាញយក" />
                    <span class="bp-ep-label">${escapeHtml(ep.label || `第${ep.episode}集`)}</span>
                </div>
            `;
            }).join('');
        }

        if (episodes.length > 0) {
            playBeeplayletEpisode(0);
        }

        if (typeof window.syncSeriesModeBar === 'function') {
            window.syncSeriesModeBar(episodes.length);
        }

        fetch('/api/beeplaylet/tasks').then(r => r.json()).then(d => {
            if (d && d.output_dir && outDirEl && (!outDirEl.title || outDirEl.title === '...')) {
                outDirEl.textContent = d.output_dir;
                outDirEl.title = d.output_dir;
            }
        }).catch(() => {});
    }
    window.renderBeeplayletDetail = renderBeeplayletDetail;

    function updateBpSelectedBadge() {
        const badge = document.getElementById('bpSelectedCountBadge');
        const dlBtnText = document.getElementById('bpDownloadBtnText');
        const total = (currentBpDrama && currentBpDrama.episodes) ? currentBpDrama.episodes.length : 0;
        const count = selectedBpEpisodes.size;

        if (badge) {
            badge.textContent = `ជ្រើសបាន ${count} ភាគ`;
        }
        if (dlBtnText) {
            if (count > 0 && count < total) {
                dlBtnText.textContent = `ទាញយកភាគដែលបានជ្រើស (${count} ភាគ)`;
            } else {
                dlBtnText.textContent = 'ទាញយកភាគទាំងអស់ (Download All)';
            }
        }
    }
    window.updateBpSelectedBadge = updateBpSelectedBadge;

    function toggleBpEpCheck(idx) {
        if (!currentBpDrama || !currentBpDrama.episodes || !currentBpDrama.episodes[idx]) return;
        const epNum = currentBpDrama.episodes[idx].episode || (idx + 1);
        if (selectedBpEpisodes.has(epNum)) {
            selectedBpEpisodes.delete(epNum);
        } else {
            selectedBpEpisodes.add(epNum);
        }

        const tile = document.getElementById(`bpEpChip_${idx}`);
        const chk = document.getElementById(`bpEpChk_${idx}`);
        if (tile) tile.classList.toggle('selected', selectedBpEpisodes.has(epNum));
        if (chk) chk.checked = selectedBpEpisodes.has(epNum);

        updateBpSelectedBadge();
    }
    window.toggleBpEpCheck = toggleBpEpCheck;

    function toggleBpSelectAll(selectAll) {
        if (!currentBpDrama || !currentBpDrama.episodes) return;
        if (selectAll) {
            currentBpDrama.episodes.forEach(ep => {
                selectedBpEpisodes.add(ep.episode);
            });
        } else {
            selectedBpEpisodes.clear();
        }

        currentBpDrama.episodes.forEach((ep, idx) => {
            const tile = document.getElementById(`bpEpChip_${idx}`);
            const chk = document.getElementById(`bpEpChk_${idx}`);
            const isSel = selectedBpEpisodes.has(ep.episode);
            if (tile) tile.classList.toggle('selected', isSel);
            if (chk) chk.checked = isSel;
        });

        updateBpSelectedBadge();
    }
    window.toggleBpSelectAll = toggleBpSelectAll;

    function handleBpEpTileClick(event, idx) {
        if (!currentBpDrama || !currentBpDrama.episodes || !currentBpDrama.episodes[idx]) return;
        currentBpPlayingIndex = idx;

        document.querySelectorAll('.bp-ep-chip').forEach((t, i) => {
            t.classList.toggle('active-ep', i === idx);
        });

        toggleBpEpCheck(idx);

        const ep = currentBpDrama.episodes[idx];
        const curLabel = document.getElementById('bpCurrentPlayingEp');
        if (curLabel) curLabel.textContent = `▶️ កំពុងចាក់: ${ep.label || `Episode ${ep.episode}`}`;
    }
    window.handleBpEpTileClick = handleBpEpTileClick;

    function playBeeplayletEpisode(index) {
        if (!currentBpDrama || !currentBpDrama.episodes || !currentBpDrama.episodes[index]) return;
        currentBpPlayingIndex = index;
        const ep = currentBpDrama.episodes[index];

        const chips = document.querySelectorAll('.bp-ep-chip');
        chips.forEach((c, idx) => {
            c.classList.toggle('active-ep', idx === index);
        });

        const curLabel = document.getElementById('bpCurrentPlayingEp');
        if (curLabel) curLabel.textContent = `▶️ កំពុងចាក់: ${ep.label || `Episode ${ep.episode}`}`;

        const video = document.getElementById('bpVideoPlayer');
        if (!video) return;

        let url = ep.url;
        if (!url) {
            showToast('មិនមាន link វីដេអូសម្រាប់ភាគនេះទេ', '⚠️');
            return;
        }

        // Beeplaylet CDN serves HLS (.m3u8) streams. Older database entries return .mp4 which gives 404.
        if (url && /\.mp4(\?.*)?$/i.test(url)) {
            url = url.replace(/\.mp4(\?.*)?$/i, '.m3u8$1');
        }

        if (bpHlsInstance) {
            bpHlsInstance.destroy();
            bpHlsInstance = null;
        }

        if (window.Hls && Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true });
            bpHlsInstance = hls;
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => {});
            });
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.warn('[Beeplaylet HLS] Network error, recovering...');
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.warn('[Beeplaylet HLS] Media error, recovering...');
                            hls.recoverMediaError();
                            break;
                        default:
                            console.error('[Beeplaylet HLS] Fatal error, destroying...');
                            hls.destroy();
                            break;
                    }
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
            video.play().catch(() => {});
        } else {
            video.src = url;
            video.play().catch(() => {});
        }

        video.onended = () => {
            if (currentBpDrama && currentBpPlayingIndex + 1 < currentBpDrama.episodes.length) {
                playBeeplayletEpisode(currentBpPlayingIndex + 1);
            }
        };
    }
    window.playBeeplayletEpisode = playBeeplayletEpisode;

    function closeBpDramaCard() {
        const card = document.getElementById('bpDramaCard');
        if (card) card.style.display = 'none';
        const video = document.getElementById('bpVideoPlayer');
        if (video) {
            video.pause();
            video.src = '';
        }
        if (bpHlsInstance) {
            bpHlsInstance.destroy();
            bpHlsInstance = null;
        }
    }
    window.closeBpDramaCard = closeBpDramaCard;

    async function startBpBatchDownload() {
        if (typeof requireActiveLicense === 'function' && !requireActiveLicense('ទាញយករឿង Beeplaylet')) {
            return;
        }
        if (!currentBpDrama || !currentBpDrama.episodes || currentBpDrama.episodes.length === 0) {
            showToast('គ្មានភាគសម្រាប់ទាញយកទេ!', '⚠️');
            return;
        }

        let targetEpisodes = currentBpDrama.episodes || [];
        if (selectedBpEpisodes.size > 0 && selectedBpEpisodes.size < targetEpisodes.length) {
            targetEpisodes = targetEpisodes.filter(ep => selectedBpEpisodes.has(ep.episode));
        }

        if (targetEpisodes.length === 0) {
            showToast('សូមគ្រីសជ្រើសរើសភាគយ៉ាងហោចណាស់ ១ ភាគ (Please select at least 1 episode)', 'warning');
            return;
        }

        const epCount = targetEpisodes.length;

        const doSubmit = async (selectedMode) => {
            const activeMode = (typeof window.getActiveDownloadMode === 'function') ? window.getActiveDownloadMode() : 'merged';
            const finalMode = selectedMode || activeMode || 'merged';
            const btn = document.getElementById('btnBpDownload');
            if (btn) btn.disabled = true;

            const customDir = (document.getElementById('bpOutputDirDisplay')?.title !== '...' && document.getElementById('bpOutputDirDisplay')?.title) ? document.getElementById('bpOutputDirDisplay')?.title : null;

            showToast(`🚀 ចាប់ផ្តើមទាញយក "${currentBpDrama.title}" (${epCount} ភាគ)...`, '⬇️');

            try {
                const res = await fetch('/api/beeplaylet/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        drama_id: currentBpDrama.id,
                        title: currentBpDrama.title,
                        cover: (currentBpDrama && currentBpDrama.cover) || '',
                        episodes: targetEpisodes,
                        custom_dir: customDir,
                        download_mode: finalMode
                    })
                });

                const data = await res.json();
                if (!res.ok || !data.ok) throw new Error(data.message || 'Download failed');

                showToast('បានបញ្ចូលទៅក្នុងបញ្ជីទាញយកដោយជោគជ័យ!', '✅');
                fetchBeeplayletTasks();
                if (typeof startDownloadPolling === 'function') startDownloadPolling(true);
            } catch (err) {
                showToast(`Error: ${err.message}`, '❌');
            } finally {
                if (btn) btn.disabled = false;
            }
        };

        const proceedWithMode = () => {
            const activeMode = (typeof window.getActiveDownloadMode === 'function') ? window.getActiveDownloadMode() : 'merged';
            if (typeof window.promptDownloadMode === 'function') {
                window.promptDownloadMode({
                    title: currentBpDrama.title,
                    episodeCount: epCount,
                    onConfirm: doSubmit
                });
            } else {
                doSubmit(activeMode);
            }
        };

        if (typeof window.checkAndPromptDuplicate === 'function') {
            window.checkAndPromptDuplicate(currentBpDrama.id, currentBpDrama.title, 'beeplaylet', epCount, () => {
                proceedWithMode();
            });
        } else {
            proceedWithMode();
        }
    }
    window.startBpBatchDownload = startBpBatchDownload;

    async function fetchBeeplayletTasks() {
        try {
            const res = await fetch('/api/beeplaylet/tasks');
            const data = await res.json();
            if (!res.ok || !data.ok) return;

            const tasks = data.tasks || [];
            const sec = document.getElementById('bpTasksSection');
            const list = document.getElementById('bpTasksList');

            if (tasks.length > 0) {
                if (sec) sec.style.display = 'block';
                if (list) {
                    list.innerHTML = tasks.map(t => {
                        const isDone = t.status === 'completed';
                        const isCanceled = t.status === 'canceled';
                        const isErr = t.status === 'error';
                        const isMerging = t.status === 'merging';
                        const statusColor = isDone ? '#10b981' : (isErr || isCanceled ? '#ef4444' : (isMerging ? '#c084fc' : '#fbbf24'));
                        const statusLabel = isDone ? '✅ រួចរាល់ (Completed)' : (isCanceled ? '🚫 បានបោះបង់' : (isErr ? '❌ បរាជ័យ' : (isMerging ? '🎞️ កំពុងភ្ជាប់វីដេអូពេញ (Merging)...' : `⏳ កំពុងទាញយក: ភាគ ${t.current_episode} / ${t.total_episodes}`)));

                        return `
                            <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:8px;">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <div style="font-weight:700; color:#fff; font-size:0.95rem;">${escapeHtml(t.title)}</div>
                                    <div style="font-size:0.82rem; font-weight:600; color:${statusColor};">${statusLabel}</div>
                                </div>
                                <div style="background:rgba(255,255,255,0.08); border-radius:6px; height:8px; overflow:hidden;">
                                    <div style="background:linear-gradient(90deg, #f59e0b, #fbbf24); height:100%; width:${t.progress_pct}%; transition:width 0.3s;"></div>
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; color:#94a3b8;">
                                    <div>បានបញ្ចប់ ${t.completed_episodes} / ${t.total_episodes} ភាគ (${t.progress_pct}%)</div>
                                    <div style="display:flex; gap:8px;">
                                        ${!isDone && !isCanceled && !isErr ? `<button type="button" class="btn btn-secondary" onclick="cancelBeeplayletTask('${t.task_id}')" style="padding:2px 8px; font-size:0.75rem;">បោះបង់</button>` : ''}
                                        <button type="button" class="btn btn-secondary" onclick="openBeeplayletFolder('${(t.drama_dir || '').replace(/\\/g, '/')}')" style="padding:2px 8px; font-size:0.75rem;">📁 បើក Folder</button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            } else {
                if (sec) sec.style.display = 'none';
            }
        } catch (e) {}
    }
    window.fetchBeeplayletTasks = fetchBeeplayletTasks;

    async function cancelBeeplayletTask(taskId) {
        try {
            await fetch('/api/beeplaylet/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task_id: taskId })
            });
            fetchBeeplayletTasks();
            showToast('បានបោះបង់ការទាញយក', 'ℹ️');
        } catch (e) {}
    }
    window.cancelBeeplayletTask = cancelBeeplayletTask;

    async function clearBeeplayletFinishedTasks() {
        try {
            await fetch('/api/beeplaylet/clear', { method: 'POST' });
            fetchBeeplayletTasks();
            showToast('បានសម្អាតបញ្ជីដែលចប់រួចរាល់', '🧹');
        } catch (e) {}
    }
    window.clearBeeplayletFinishedTasks = clearBeeplayletFinishedTasks;

    async function openBeeplayletFolder(customPath = '') {
        try {
            await fetch('/api/beeplaylet/open_folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: customPath })
            });
        } catch (e) {}
    }
    window.openBeeplayletFolder = openBeeplayletFolder;

    function toggleBeeplayletCardStar(id, title, cover, remarks) {
        if (typeof toggleStarred === 'function') {
            toggleStarred({
                id: String(id),
                platform: 'beeplaylet',
                title: title,
                cover: cover,
                remarks: remarks || ''
            });
            const isStarred = (typeof isDramaStarred === 'function') && isDramaStarred(id, 'beeplaylet');
            document.querySelectorAll(`[data-bp-star="${id}"]`).forEach(btn => {
                btn.classList.toggle('starred', isStarred);
                btn.textContent = isStarred ? '★' : '☆';
            });
        }
    }
    window.toggleBeeplayletCardStar = toggleBeeplayletCardStar;

    function onBpInputKeyDown(e) {
        if (e.key === 'Enter') {
            submitBpSearch();
        }
    }
    window.onBpInputKeyDown = onBpInputKeyDown;

    async function pickBpFolder() {
        if (window.electronAPI && typeof window.electronAPI.selectFolder === 'function') {
            const folder = await window.electronAPI.selectFolder();
            if (folder) {
                if (typeof updateDownloadFolderUI === 'function') updateDownloadFolderUI(folder);
                fetch('/dl/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ output_dir: folder })
                }).catch(() => {});
            }
        }
    }
    window.pickBpFolder = pickBpFolder;

    async function openBeeplayletFolder() {
        const outDirEl = document.getElementById('bpOutputDirDisplay');
        const folder = (outDirEl && outDirEl.title && outDirEl.title !== '...') ? outDirEl.title : null;
        if (window.electronAPI && typeof window.electronAPI.openPath === 'function') {
            if (folder) {
                window.electronAPI.openPath(folder);
            } else {
                fetch('/api/beeplaylet/tasks').then(r => r.json()).then(d => {
                    if (d && d.output_dir) window.electronAPI.openPath(d.output_dir);
                }).catch(() => {});
            }
        } else {
            fetch('/api/beeplaylet/open_folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: folder })
            }).catch(() => {});
        }
    }
    window.openBeeplayletFolder = openBeeplayletFolder;

    async function translateBeeplayletDesc(dramaId, rawDesc) {
        const descEl = document.getElementById('bpCardDesc');
        if (!descEl) return;
        const curLang = window.currentLang || 'km';
        if (!rawDesc) {
            descEl.textContent = (curLang === 'zh') ? '蜜蜂劇場精品短劇 (Beeplaylet Drama)' : 'រឿងភាគខ្លី Beeplaylet កំពុងពេញនិយម';
            return;
        }

        descEl.setAttribute('data-original-desc', rawDesc);

        if (curLang === 'original' || curLang === 'zh') {
            descEl.textContent = rawDesc;
            return;
        }

        const cacheKey = `bp_desc_${curLang}_${dramaId || rawDesc.slice(0, 30)}`;
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                descEl.textContent = cached;
                return;
            }
        } catch (e) {}

        // Temporary display until translation arrives
        descEl.textContent = rawDesc;

        try {
            const res = await fetch(`/api/translate?text=${encodeURIComponent(rawDesc)}&to=${encodeURIComponent(curLang)}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data && data.translated) {
                try { localStorage.setItem(cacheKey, data.translated); } catch (e) {}
                if (currentBpDrama && String(currentBpDrama.id) === String(dramaId) && (window.currentLang || 'km') === curLang) {
                    descEl.textContent = data.translated;
                }
            }
        } catch (err) {
            console.warn('[Beeplaylet] Failed to translate description:', err.message);
        }
    }
    window.translateBeeplayletDesc = translateBeeplayletDesc;

    async function pasteBpFromClipboard() {
        const inputEl = document.getElementById('bpDramaInput');
        try {
            let text = '';
            if (window.electronAPI && typeof window.electronAPI.readClipboard === 'function') {
                text = await window.electronAPI.readClipboard();
            }
            if (!text && navigator.clipboard && navigator.clipboard.readText) {
                text = await navigator.clipboard.readText();
            }
            if (text && text.trim()) {
                if (inputEl) {
                    inputEl.value = text.trim();
                    inputEl.focus();
                }
                showToast('បានបិទភ្ជាប់ (Paste) ដោយជោគជ័យ!', '📋');
            }
        } catch (e) {
            console.warn('[Beeplaylet] Clipboard read error:', e);
        }
    }
    window.pasteBpFromClipboard = pasteBpFromClipboard;

    // Beeplaylet Star / Pin integration
    function toggleBeeplayletCardStar(id, title, cover, remarks) {
        if (typeof toggleDramaStar === 'function') {
            toggleDramaStar({
                id: String(id),
                title: title || 'Beeplaylet Drama',
                cover: cover || '',
                platform: 'beeplaylet',
                remarks: remarks || ''
            });
            updateBeeplayletStarButton();
        }
    }
    window.toggleBeeplayletCardStar = toggleBeeplayletCardStar;

    function toggleBeeplayletDetailStar() {
        if (!currentBpDrama) return;
        if (typeof toggleDramaStar === 'function') {
            toggleDramaStar({
                id: String(currentBpDrama.id),
                title: currentBpDrama.title || 'Beeplaylet Drama',
                cover: currentBpDrama.cover || '',
                platform: 'beeplaylet',
                remarks: currentBpDrama.remarks || (currentBpDrama.episodes ? `${currentBpDrama.episodes.length} ភាគ` : '')
            });
            updateBeeplayletStarButton();
        }
    }
    window.toggleBeeplayletDetailStar = toggleBeeplayletDetailStar;

    function updateBeeplayletStarButton() {
        const btn = document.getElementById('bpStarBtn');
        if (!btn || !currentBpDrama) return;
        const isStarred = (typeof isDramaStarred === 'function') && isDramaStarred(currentBpDrama.id, 'beeplaylet');
        btn.innerHTML = isStarred ? '⭐ បាន PIN' : '☆ PIN';
        btn.classList.toggle('btn-primary', isStarred);
        btn.classList.toggle('btn-secondary', !isStarred);
    }
    window.updateBeeplayletStarButton = updateBeeplayletStarButton;

})();
