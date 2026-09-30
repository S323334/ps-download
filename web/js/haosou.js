        // HaoSou State Variables
        let currentHsDrama = null;
        let currentHsPlayingIndex = 0;
        let hsHlsInstance = null;
        let hsTasksPollingTimer = null;
        let _hsRecsLoaded = false;
        let _currentHaoSouCategory = 'all';
        let _allHaoSouItems = [];
        let _lastHaoSouItems = [];
        let _haosouRenderLimit = 24;


        async function selectHaoSouCategory(cat) {
            _currentHaoSouCategory = cat || 'all';
            document.querySelectorAll('.hs-cat-chip').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.cat === _currentHaoSouCategory);
            });
            await loadHaoSouRecommendations(_currentHaoSouCategory);
        }

        async function loadHaoSouRecommendations(category = 'all') {
            _currentHaoSouCategory = category;
            const grid = document.getElementById('hsRecsGrid');
            const icon = document.getElementById('hsSectionIcon');
            const title = document.getElementById('hsSectionTitle');
            const backBtn = document.getElementById('btnHsBackToRecs');
            const catBar = document.getElementById('hsCatBar');

            if (catBar) catBar.style.display = 'flex';
            document.querySelectorAll('.hs-cat-chip').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.cat === _currentHaoSouCategory);
            });

            if (icon) icon.textContent = _currentHaoSouCategory === 'all' ? '🔥' : '🎬';
            const catNames = {
                all: { zh: '热门短剧推荐 (Hot Recommendations)', km: 'រឿងភាគពេញនិយម (Hot Recommendations)', en: 'Hot Recommendations' },
                modern: { zh: '都市短剧 (Modern)', km: 'រឿងទីក្រុង (Modern)', en: 'Modern Dramas' },
                ceo: { zh: '总裁短剧 (CEO & Billionaire)', km: 'រឿងអភិជន (CEO & Billionaire)', en: 'CEO Dramas' },
                action: { zh: '战神短剧 (Action & War)', km: 'រឿងវាយបក (Action & War)', en: 'Action Dramas' },
                rebirth: { zh: '重生短剧 (Rebirth & Time Travel)', km: 'រឿងកើតជាថ្មី (Rebirth & Time Travel)', en: 'Rebirth Dramas' },
                romance: { zh: '甜宠虐恋 (Romance)', km: 'រឿងស្នេហា (Romance)', en: 'Romance Dramas' },
                historical: { zh: '古装短剧 (Historical)', km: 'រឿងបុរាណ (Historical)', en: 'Historical Dramas' }
            };
            const catEntry = catNames[_currentHaoSouCategory] || catNames.all;
            if (title) title.textContent = catEntry[currentLang] || catEntry.km || catEntry.en;
            if (backBtn) backBtn.style.display = 'none';

            if (grid) grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8;"><span style="animation:spin 1s linear infinite; display:inline-block;">⏳</span> ' + (currentLang === 'zh' ? '正在加载短剧...' : (currentLang === 'km' ? 'កំពុងទាញយករឿងភាគ...' : 'Loading dramas...')) + '</div>';

            try {
                const res = await fetch(`/api/haosou/recommend?category=${encodeURIComponent(_currentHaoSouCategory)}`);
                const data = await res.json();
                if (!res.ok || !data.ok) throw new Error(data.message || 'Failed to load recommendations');

                _allHaoSouItems = data.data || [];
                _haosouRenderLimit = 24;
                _lastHaoSouItems = _allHaoSouItems.slice(0, _haosouRenderLimit);
                renderHaoSouCards(_lastHaoSouItems);
                _hsRecsLoaded = true;
            } catch (err) {
                const safeErr = (typeof escapeHtml === 'function') ? escapeHtml(err.message) : err.message;
                if (grid) grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:30px; color:#ef4444;">⚠️ បរាជ័យក្នុងការទាញយក: ${safeErr}</div>`;
            }
        }

        function loadMoreHaoSouDramas() {
            if (!_allHaoSouItems || !_allHaoSouItems.length) return;
            _haosouRenderLimit += 24;
            _lastHaoSouItems = _allHaoSouItems.slice(0, _haosouRenderLimit);
            renderHaoSouCards(_lastHaoSouItems);
        }

        function renderHaoSouCards(items) {
            const grid = document.getElementById('hsRecsGrid');
            if (!grid) return;
            _lastHaoSouItems = items || [];

            // update load more container visibility
            const loadMoreContainer = document.getElementById('hsLoadMoreContainer');
            if (loadMoreContainer) {
                if (_allHaoSouItems && _haosouRenderLimit < _allHaoSouItems.length) {
                    loadMoreContainer.style.display = 'flex';
                } else {
                    loadMoreContainer.style.display = 'none';
                }
            }

            if (!items || items.length === 0) {
                grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8;">${currentLang === 'zh' ? '暂无短剧数据' : (currentLang === 'km' ? 'គ្មានទិន្នន័យរឿងទេ' : 'No dramas found')}</div>`;
                return;
            }

            grid.innerHTML = items.map((item, idx) => {
                const cover = item.cover || '/uploads/image/20250311/5754a9f551b45a5f36800c0212460d0a.png';
                const remarks = item.remarks ? `<span class="hs-card-badge">${escapeHtml(item.remarks)}</span>` : '';
                const displayTitle = getDisplayTitle(item.title);
                const showSubOrig = (currentLang !== 'zh' && currentLang !== 'original');
                const subOrigHtml = showSubOrig ? `<div class="hs-card-sub-orig" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>` : '';
                const playBtnText = currentLang === 'zh' ? '▶️ 播放 / 下载' : (currentLang === 'km' ? '▶️ មើល & ទាញយក' : '▶️ Play / Download');

                const isStarred = (typeof isDramaStarred === 'function') && isDramaStarred(item.id, 'haosou');

                return `
                    <div class="hs-card" onclick="analyzeHaoSouDrama('${escapeHtml(item.id)}')">
                        <div class="hs-card-thumb-wrap">
                            <img src="${escapeHtml(cover)}" alt="${escapeHtml(item.title)}" loading="lazy" class="hs-card-thumb" onerror="this.src='/logo.svg'">
                            ${remarks}
                            <button class="hs-star-btn ${isStarred ? 'starred' : ''}" data-hs-star="${escapeHtml(item.id)}" onclick="event.stopPropagation(); toggleHaoSouCardStar('${escapeHtml(item.id)}', '${escapeHtml(item.title)}', '${escapeHtml(cover)}', '${escapeHtml(item.remarks || '')}')" title="ដាក់ផ្កាយ / Pin">
                                ${isStarred ? '★' : '☆'}
                            </button>
                        </div>
                        <div class="hs-card-body">
                            <h3 class="card-title hs-card-title" data-original-title="${escapeHtml(item.title)}" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</h3>
                            ${subOrigHtml}
                            <div class="hs-card-btn-play">
                                <span>${playBtnText}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Queue translations for any titles not yet translated
            if (currentLang !== 'zh' && currentLang !== 'original') {
                items.forEach(it => {
                    if (it.title) queueTitleTranslation(it.title);
                });
            }
        }

        async function submitHsSearch() {
            const input = document.getElementById('hsDramaInput');
            const query = (input ? input.value : '').trim();
            if (!query) {
                showToast(currentLang === 'zh' ? '请输入短剧片名或链接！' : (currentLang === 'km' ? 'សូមវាយបញ្ចូលឈ្មោះរឿង ឬលីង!' : 'Please enter drama title or link!'), '⚠️');
                if (input) input.focus();
                return;
            }

            if (typeof isMvffmUrl === 'function' && isMvffmUrl(query)) {
                if (input) input.value = '';
                switchPlatform('mvffm');
                const mvInp = document.getElementById('mvDramaInput');
                if (mvInp) mvInp.value = query;
                if (typeof analyzeMvffmDrama === 'function') analyzeMvffmDrama(query);
                showToast('MVFFM Link Recognized! 🎬', '📋');
                return;
            }

            if (query.includes('newlist.php') || /^\d+$/.test(query)) {
                analyzeHaoSouDrama(query);
                return;
            }

            const btn = document.getElementById('btnHsSearch');
            const spinner = document.getElementById('hsSearchSpinner');
            const btnText = document.getElementById('hsSearchBtnText');

            if (btn) btn.disabled = true;
            if (spinner) spinner.style.display = 'inline-block';
            if (btnText) btnText.textContent = '...';

            const grid = document.getElementById('hsRecsGrid');
            const icon = document.getElementById('hsSectionIcon');
            const title = document.getElementById('hsSectionTitle');
            const backBtn = document.getElementById('btnHsBackToRecs');
            const catBar = document.getElementById('hsCatBar');

            if (catBar) catBar.style.display = 'none';
            if (icon) icon.textContent = '🔍';
            if (title) title.textContent = (currentLang === 'zh' ? '搜索结果: ' : (currentLang === 'km' ? 'លទ្ធផលស្វែងរក: ' : 'Search Results: ')) + query;
            if (backBtn) backBtn.style.display = 'inline-block';

            if (grid) grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#94a3b8;"><span style="animation:spin 1s linear infinite; display:inline-block;">⏳</span> ' + (currentLang === 'zh' ? '正在搜索...' : (currentLang === 'km' ? 'កំពុងស្វែងរក...' : 'Searching...')) + '</div>';

            try {
                const res = await fetch(`/api/haosou/search?wd=${encodeURIComponent(query)}`);
                const data = await res.json();
                if (!res.ok || !data.ok) throw new Error(data.message || 'Search failed');

                _allHaoSouItems = data.data || [];
                _haosouRenderLimit = _allHaoSouItems.length;
                _lastHaoSouItems = _allHaoSouItems;
                renderHaoSouCards(_lastHaoSouItems);
                showToast(`រកឃើញ ${_allHaoSouItems.length} រឿង!`, '🎬');
            } catch (err) {
                if (grid) grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:30px; color:#ef4444;">⚠️ បរាជ័យ: ${escapeHtml(err.message)}</div>`;
            } finally {
                if (btn) btn.disabled = false;
                if (spinner) spinner.style.display = 'none';
                const defBtnText = currentLang === 'zh' ? '🔍 搜索 / 解析' : (currentLang === 'km' ? '🔍 ស្វែងរក / វិភាគ' : '🔍 Search / Parse');
                if (btnText) btnText.textContent = defBtnText;
            }
        }

        async function analyzeHaoSouDrama(idOrUrl) {
            if (typeof requireActiveLicense === 'function' && !requireActiveLicense('មើល ឬទាញយករឿង HaoSou')) {
                return;
            }
            const btn = document.getElementById('btnHsSearch');
            const spinner = document.getElementById('hsSearchSpinner');
            const btnText = document.getElementById('hsSearchBtnText');

            if (btn) btn.disabled = true;
            if (spinner) spinner.style.display = 'inline-block';
            if (btnText) btnText.textContent = '...';

            showToast('⚡ កំពុងទាញយកព័ត៌មានរឿង...', '🚀');

            try {
                const res = await fetch('/api/haosou/detail', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: idOrUrl })
                });

                const data = await res.json();
                if (!res.ok || !data.ok) throw new Error(data.message || 'Drama not found');

                currentHsDrama = data.data;
                if (typeof recordDownloadMemory === 'function' && currentHsDrama && currentHsDrama.id) {
                    recordDownloadMemory({
                        id: String(currentHsDrama.id),
                        platform: 'haosou',
                        title: currentHsDrama.title,
                        khmer_title: (typeof getDisplayTitle === 'function' ? getDisplayTitle(currentHsDrama.title) : currentHsDrama.title),
                        cover: currentHsDrama.cover || '',
                        total_episodes: (currentHsDrama.episodes || []).length
                    });
                }
                renderHaoSouDetail(currentHsDrama);
                showToast(`បានបើក "${currentHsDrama.title}"!`, '✅');

                const card = document.getElementById('hsDramaCard');
                if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch (err) {
                showToast(`Error: ${err.message}`, '❌');
            } finally {
                if (btn) btn.disabled = false;
                if (spinner) spinner.style.display = 'none';
                const defBtnText = currentLang === 'zh' ? '🔍 搜索 / 解析' : (currentLang === 'km' ? '🔍 ស្វែងរក / វិភាគ' : '🔍 Search / Parse');
                if (btnText) btnText.textContent = defBtnText;
            }
        }

        function renderHaoSouDetail(drama) {
            if (!drama) return;
            const card = document.getElementById('hsDramaCard');
            const titleEl = document.getElementById('hsCardTitle');
            const descEl = document.getElementById('hsCardDesc');
            const tagsEl = document.getElementById('hsCardTags');
            const epCountEl = document.getElementById('hsEpisodeCount');
            const epGrid = document.getElementById('hsEpisodeGrid');
            const outDirEl = document.getElementById('hsOutputDirDisplay');

            if (card) card.style.display = 'grid';
            if (titleEl) {
                const disp = currentLang === 'original' ? drama.title : getDisplayTitle(drama.title);
                titleEl.textContent = disp || 'Short Drama';
                titleEl.setAttribute('data-original-title', drama.title);
                if (currentLang !== 'zh' && currentLang !== 'original') {
                    queueTitleTranslation(drama.title);
                }
            }
            if (descEl) descEl.textContent = drama.desc || '好搜短劇屋精品短劇';

            if (tagsEl) {
                const isStarred = (typeof isDramaStarred === 'function') && isDramaStarred(drama.id, 'haosou');
                const tags = drama.tags || [];
                tagsEl.innerHTML = `
                    <button type="button" class="btn btn-secondary btn-sm" onclick="toggleHaoSouCardStar('${drama.id}', '${escapeHtml(drama.title)}', '${escapeHtml(drama.cover)}', '')" style="color:#fbbf24; border-color:rgba(251,191,36,0.4); padding:2px 10px; font-size:0.75rem; border-radius:6px; cursor:pointer;">
                        ${isStarred ? '★ បានដាក់ផ្កាយ' : '☆ ដាក់ផ្កាយ'}
                    </button>
                    <span class="tag-pill" style="background:rgba(99,102,241,0.25); color:#c7d2fe; border:1px solid rgba(99,102,241,0.5); padding:2px 8px; border-radius:6px; font-size:0.75rem;">🌟 1080p FHD</span>
                    <span class="tag-pill" style="background:rgba(16,185,129,0.2); color:#6ee7b7; border:1px solid rgba(16,185,129,0.4); padding:2px 8px; border-radius:6px; font-size:0.75rem;">FREE ឥតគិតថ្លៃ</span>
                    ${tags.map(t => `<span class="tag-pill" style="background:rgba(255,255,255,0.08); color:#e2e8f0; padding:2px 8px; border-radius:6px; font-size:0.75rem;">${escapeHtml(t)}</span>`).join('')}
                `;
            }

            const episodes = drama.episodes || [];
            const epUnit = currentLang === 'zh' ? '集' : (currentLang === 'km' ? 'ភាគ' : 'Episodes');
            if (epCountEl) epCountEl.textContent = `${episodes.length} ${epUnit}`;

            if (epGrid) {
                epGrid.innerHTML = episodes.map((ep, idx) => `
                    <div class="hs-ep-chip ${idx === 0 ? 'active' : ''}" id="hsEpChip_${idx}" onclick="playHaoSouEpisode(${idx})">
                        ${escapeHtml(ep.label || `第${ep.episode}集`)}
                    </div>
                `).join('');
            }

            if (episodes.length > 0) {
                playHaoSouEpisode(0);
            }

            if (typeof window.syncSeriesModeBar === 'function') {
                window.syncSeriesModeBar(episodes.length);
            }

            // Check download memory (អង្គចងចាំការទាញយក) to show downloaded vs missing episodes
            fetch(`/api/drama/check-memory?id=${encodeURIComponent(drama.id)}&title=${encodeURIComponent(drama.title)}&platform=haosou&total=${episodes.length}`)
                .then(r => r.json())
                .then(mem => {
                    if (mem && mem.downloaded_episodes && mem.downloaded_episodes.length > 0) {
                        const downloadedSet = new Set(mem.downloaded_episodes);
                        episodes.forEach((ep, idx) => {
                            const epNum = ep.episode || (idx + 1);
                            if (downloadedSet.has(epNum)) {
                                const chip = document.getElementById(`hsEpChip_${idx}`);
                                if (chip) {
                                    chip.classList.add('is-downloaded');
                                    chip.title = '✓ បានទាញយករួចរាល់';
                                }
                            }
                        });
                        const statusBadge = document.getElementById('hsMemoryStatusBadge');
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
                        const statusBadge = document.getElementById('hsMemoryStatusBadge');
                        if (statusBadge) statusBadge.style.display = 'none';
                    }
                }).catch(() => {});

            fetch('/api/haosou/tasks').then(r => r.json()).then(d => {
                if (d && d.output_dir && outDirEl) {
                    outDirEl.textContent = d.output_dir;
                    outDirEl.title = d.output_dir;
                }
            }).catch(() => {});
        }

        function playHaoSouEpisode(index) {
            if (!currentHsDrama || !currentHsDrama.episodes || !currentHsDrama.episodes[index]) return;
            currentHsPlayingIndex = index;
            const ep = currentHsDrama.episodes[index];

            const chips = document.querySelectorAll('.hs-ep-chip');
            chips.forEach((c, idx) => c.classList.toggle('active', idx === index));

            const curLabel = document.getElementById('hsCurrentPlayingEp');
            if (curLabel) curLabel.textContent = `▶️ កំពុងចាក់: ${ep.label || `Episode ${ep.episode}`}`;

            const video = document.getElementById('hsVideoPlayer');
            if (!video) return;

            const url = ep.url;
            if (!url) {
                showToast('មិនមាន link វីដេអូសម្រាប់ភាគនេះទេ', '⚠️');
                return;
            }

            if (hsHlsInstance) {
                hsHlsInstance.destroy();
                hsHlsInstance = null;
            }

            if (window.Hls && Hls.isSupported()) {
                const hls = new Hls({ enableWorker: true });
                hsHlsInstance = hls;
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

            video.onended = () => {
                if (currentHsDrama && currentHsPlayingIndex + 1 < currentHsDrama.episodes.length) {
                    playHaoSouEpisode(currentHsPlayingIndex + 1);
                }
            };
        }

        function closeHsDramaCard() {
            const card = document.getElementById('hsDramaCard');
            if (card) card.style.display = 'none';
            const video = document.getElementById('hsVideoPlayer');
            if (video) {
                video.pause();
                video.src = '';
            }
            if (hsHlsInstance) {
                hsHlsInstance.destroy();
                hsHlsInstance = null;
            }
        }

        async function startHsBatchDownload() {
            if (typeof requireActiveLicense === 'function' && !requireActiveLicense('ទាញយករឿង HaoSou')) {
                return;
            }
            if (!currentHsDrama || !currentHsDrama.episodes || currentHsDrama.episodes.length === 0) {
                showToast('គ្មានភាគសម្រាប់ទាញយកទេ!', '⚠️');
                return;
            }

            const epCount = currentHsDrama.episodes.length;

            const doSubmit = async (selectedMode = 'separate') => {
                const btn = document.getElementById('btnHsDownload');
                if (btn) btn.disabled = true;

                showToast(`🚀 ចាប់ផ្តើមទាញយក "${currentHsDrama.title}" (${epCount} ភាគ)...`, '⬇️');

                try {
                    const res = await fetch('/api/haosou/download', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            book_id: currentHsDrama.id,
                            title: currentHsDrama.title,
                            episodes: currentHsDrama.episodes,
                            download_mode: selectedMode
                        })
                    });

                    const data = await res.json();
                    if (!res.ok || !data.ok) throw new Error(data.message || 'Download failed');

                    showToast('បានបញ្ចូលទៅក្នុងបញ្ជីទាញយកដោយជោគជ័យ!', '✅');
                    fetchHaoSouTasks();
                } catch (err) {
                    showToast(`Error: ${err.message}`, '❌');
                } finally {
                    if (btn) btn.disabled = false;
                }
            };

            const proceedWithMode = () => {
                if (typeof window.promptDownloadMode === 'function') {
                    window.promptDownloadMode({
                        title: currentHsDrama.title,
                        episodeCount: epCount,
                        onConfirm: doSubmit
                    });
                } else {
                    doSubmit('separate');
                }
            };

            if (typeof window.checkAndPromptDuplicate === 'function') {
                window.checkAndPromptDuplicate(currentHsDrama.id, currentHsDrama.title, 'haosou', epCount, () => {
                    proceedWithMode();
                });
            } else {
                proceedWithMode();
            }
        }

        async function fetchHaoSouTasks() {
            try {
                const res = await fetch('/api/haosou/tasks');
                const data = await res.json();
                if (!res.ok || !data.ok) return;

                const tasks = data.tasks || [];
                const sec = document.getElementById('hsTasksSection');
                const list = document.getElementById('hsTasksList');

                if (tasks.length > 0) {
                    if (sec) sec.style.display = 'block';
                    if (list) {
                        list.innerHTML = tasks.map(t => {
                            const isDone = t.status === 'completed';
                            const isCanceled = t.status === 'canceled';
                            const isErr = t.status === 'error';
                            const isMerging = t.status === 'merging';
                            const statusColor = isDone ? '#10b981' : (isErr || isCanceled ? '#ef4444' : (isMerging ? '#c084fc' : '#38bdf8'));
                            const statusLabel = isDone ? '✅ រួចរាល់ (Completed)' : (isCanceled ? '🚫 បានបោះបង់' : (isErr ? '❌ បរាជ័យ' : (isMerging ? '🎞️ កំពុងភ្ជាប់វីដេអូពេញ (Merging)...' : `⏳ កំពុងទាញយក: ភាគ ${t.current_episode} / ${t.total_episodes}`)));

                            return `
                                <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:8px;">
                                    <div style="display:flex; justify-content:space-between; align-items:center;">
                                        <div style="font-weight:700; color:#fff; font-size:0.95rem;">${escapeHtml(t.title)}</div>
                                        <div style="font-size:0.82rem; font-weight:600; color:${statusColor};">${statusLabel}</div>
                                    </div>
                                    <div style="background:rgba(255,255,255,0.08); border-radius:6px; height:8px; overflow:hidden;">
                                        <div style="background:linear-gradient(90deg, #4F46E5, #38bdf8); height:100%; width:${t.progress_pct}%; transition:width 0.3s;"></div>
                                    </div>
                                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; color:#94a3b8;">
                                        <div>បានបញ្ចប់ ${t.completed_episodes} / ${t.total_episodes} ភាគ (${t.progress_pct}%)</div>
                                        <div style="display:flex; gap:8px;">
                                            ${!isDone && !isCanceled && !isErr ? `<button type="button" class="btn btn-secondary" onclick="cancelHaoSouTask('${t.task_id}')" style="padding:2px 8px; font-size:0.75rem;">បោះបង់</button>` : ''}
                                            <button type="button" class="btn btn-secondary" onclick="openHaoSouFolder('${(t.drama_dir || '').replace(/\\/g, '/')}')" style="padding:2px 8px; font-size:0.75rem;">📁 បើក Folder</button>
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

        function startHaoSouTasksPolling() {
            stopHaoSouTasksPolling();
            fetchHaoSouTasks();
            hsTasksPollingTimer = setInterval(fetchHaoSouTasks, 2500);
        }

        function stopHaoSouTasksPolling() {
            if (hsTasksPollingTimer) {
                clearInterval(hsTasksPollingTimer);
                hsTasksPollingTimer = null;
            }
        }

        async function cancelHaoSouTask(taskId) {
            try {
                await fetch('/api/haosou/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ task_id: taskId })
                });
                fetchHaoSouTasks();
            } catch (e) {}
        }

        async function clearHaoSouFinishedTasks() {
            try {
                await fetch('/api/haosou/clear', { method: 'POST' });
                fetchHaoSouTasks();
            } catch (e) {}
        }

        async function openHaoSouFolder(pathStr) {
            try {
                await fetch('/api/haosou/open_folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: pathStr })
                });
            } catch (e) {}
        }

        async function pickHsFolder() {
            if (window.electronAPI && typeof window.electronAPI.selectFolder === 'function') {
                const folder = await window.electronAPI.selectFolder();
                if (folder) {
                    const outDirEl = document.getElementById('hsOutputDirDisplay');
                    if (outDirEl) {
                        outDirEl.textContent = folder;
                        outDirEl.title = folder;
                    }
                }
            }
        }

        function onHsInputKeyDown(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                submitHsSearch();
            }
        }

        async function pasteHsFromClipboard() {
            const inputEl = document.getElementById('hsDramaInput');
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
                    showToast('បានបិទភ្ជាប់!', '📋');
                    if (typeof isMvffmUrl === 'function' && isMvffmUrl(text.trim())) {
                        submitHsSearch();
                    }
                }
            } catch (e) {}
        }

        let _ytInputDebounceTimer = null;
        let _lastAnalyzedYtUrl = '';
