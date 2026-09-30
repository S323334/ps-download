
window.downloadedSeriesCache = window.downloadedSeriesCache || new Map();
var downloadedSeriesCache = window.downloadedSeriesCache;
window.currentDownloadedEps = window.currentDownloadedEps || new Set();
var currentDownloadedEps = window.currentDownloadedEps;
let pollTimer = null;

        // ==========================================
        // DOWNLOADED LIBRARY VIEW
        // ==========================================
        async function openSystemDownloadFolder() {
            try {
                await fetch('/dl/open_folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });
            } catch (e) {
                showToast('Error opening download folder', '❌');
            }
        }

        // ==========================================
        // DOWNLOAD FOLDER PICKER & PLAYER DOWNLOAD LOG
        // ==========================================
        async function changeDownloadFolderPrompt() {
            try {
                showToast(currentLang === 'zh' ? '正在打开文件夹选择器...' : (currentLang === 'en' ? 'Opening folder picker...' : 'កំពុងបើកផ្ទាំងជ្រើសរើស Folder...'), '📁');
                if (window.electronAPI && window.electronAPI.selectFolder) {
                    const selected = await window.electronAPI.selectFolder();
                    if (selected) {
                        updateDownloadFolderUI(selected);
                        showToast((currentLang === 'zh' ? '已成功修改下载目录为: ' : (currentLang === 'en' ? 'Download folder changed to: ' : 'បានប្តូរ Folder ទៅ: ')) + selected, '✅');
                        return;
                    }
                }
                const res = await fetch('/dl/browse_folder', { method: 'POST' });
                const data = await res.json();
                if (data.status === 'success' && data.path) {
                    updateDownloadFolderUI(data.path);
                    showToast((currentLang === 'zh' ? '已成功修改下载目录为: ' : (currentLang === 'en' ? 'Download folder changed to: ' : 'បានប្តូរ Folder ទៅ: ')) + data.path, '✅');
                }
            } catch (err) {
                showToast('Folder error: ' + err.message, '⚠️');
            }
        }

        function updateDownloadFolderUI(folderPath) {
            if (!folderPath) return;
            const streamFolderBtn = document.getElementById('streamFolderBtnText');
            const pdlFolderText = document.getElementById('pdlFolderText');
            const shortPath = folderPath.length > 25 ? '...' + folderPath.slice(-22) : folderPath;
            if (streamFolderBtn) {
                const prefix = currentLang === 'zh' ? '📁 目录: ' : (currentLang === 'en' ? '📁 Folder: ' : '📁 Folder: ');
                streamFolderBtn.innerText = prefix + shortPath;
                streamFolderBtn.title = folderPath;
                streamFolderBtn.dataset.hasCustomPath = 'true';
            }
            if (pdlFolderText) {
                pdlFolderText.innerText = `📁 ${shortPath}`;
                pdlFolderText.title = folderPath;
            }
        }

        function togglePlayerDownloadLog() {
            const p = document.getElementById('playerDownloadLogPanel');
            if (!p) return;
            if (p.style.display === 'none' || getComputedStyle(p).display === 'none') {
                p.style.display = 'block';
                p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                p.style.display = 'none';
            }
        }

        // ==========================================
        // SEARCH INPUT CONTEXT MENU
        // ==========================================
        async function ctxPasteLink() {
            hideSearchContextMenu();
            const inputEl = document.getElementById('searchInput');
            if (!inputEl) return;
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    inputEl.value = text.trim();
                    onSearchInputChanged(inputEl.value);
                    inputEl.focus();
                    showToast(currentLang === 'zh' ? '已成功粘贴链接/文本！' : (currentLang === 'en' ? 'Pasted successfully!' : 'បានបិទភ្ជាប់ (Paste) ដោយជោគជ័យ!'), '📋');
                }
            } catch (e) {
                inputEl.focus();
                document.execCommand('paste');
            }
        }

        function ctxCutInput() {
            hideSearchContextMenu();
            const inputEl = document.getElementById('searchInput');
            if (!inputEl) return;
            inputEl.select();
            document.execCommand('cut');
            onSearchInputChanged(inputEl.value);
        }

        function ctxCopyInput() {
            hideSearchContextMenu();
            const inputEl = document.getElementById('searchInput');
            if (!inputEl) return;
            inputEl.select();
            document.execCommand('copy');
            showToast(currentLang === 'zh' ? '已复制文本' : (currentLang === 'en' ? 'Copied' : 'បានចម្លង'), '📄');
        }

        function ctxClearInput() {
            hideSearchContextMenu();
            clearSearchInput();
        }

        function hideSearchContextMenu() {
            const m = document.getElementById('searchContextMenu');
            if (m) m.style.display = 'none';
        }

        async function deleteFromLibrary(sid, title) {
            if (!confirm(`តើអ្នកពិតជាចង់លុបរឿង "${title}" ចេញពីបណ្ណាល័យមែនទេ?`)) return;
            try {
                const res = await fetch('/dl/library/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ series_id: sid, delete_files: true })
                });
                const data = await res.json();
                if (data.ok) {
                    showToast(`បានលុប "${title}" ចេញពីបណ្ណាល័យ!`, '🗑️');
                    renderLibraryView();
                    syncDownloadedSeriesCache();
                }
            } catch (e) {
                showToast('បរាជ័យក្នុងការលុប: ' + e.message, '❌');
            }
        }


        async function renderLibraryView() {
            const grid = document.getElementById('dramaGrid');
            const secTitle = document.getElementById('sectionTitle');
            const pag = document.getElementById('pagination');
            const loadMoreContainer = document.getElementById('loadMoreContainer');
            const countText = document.getElementById('itemCountText');
            const dict = I18N_DICT[currentLang] || I18N_DICT['zh'];

            if (pag) pag.style.display = 'none';
            if (loadMoreContainer) loadMoreContainer.style.display = 'none';
            if (countText) countText.innerText = '';

            secTitle.innerText = dict.libraryTitle;

            const loadingText = currentLang === 'zh' ? '正在加载本地剧库...' : (currentLang === 'km' ? 'កំពុងផ្ទុកបញ្ជីបណ្ណាល័យ...' : 'Loading downloaded library...');
            grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:60px; color:var(--text-dim);"><div class="spinner" style="margin:0 auto 16px;"></div>${loadingText}</div>`;

            try {
                const res = await fetch('/dl/library');
                const items = await res.json();

                updateLibraryCountBadge(items ? items.length : 0);

                if (!items || items.length === 0) {
                    const emptyTitle = currentLang === 'zh' ? '暂无已下载短剧' : (currentLang === 'km' ? 'មិនទាន់មានរឿងដែលបានទាញយកនៅឡើយទេ' : 'No downloaded dramas yet');
                    const emptyDesc = currentLang === 'zh'
                        ? '点击短剧卡片上的“📥 下载”按钮，已下载的短剧将自动归档到本地剧库，随时随地离线观看！'
                        : (currentLang === 'km'
                            ? 'ពេលដែលអ្នកចុចប៊ូតុង "📥 ទាញយក" លើរឿងណាមួយ វានឹងលោតចូលដំណើរការក្នុងបណ្ណាល័យនេះដោយស្វ័យប្រវត្តិ ដើម្បីឱ្យអ្នកដឹងថារឿងណាខ្លះបានដោនរួច និងអាចមើលពេលគ្មានអ៊ីនធឺណិតបាន។'
                            : 'When you click "📥 Download" on any drama, it will automatically appear in this library for offline playback anytime.');
                    const browseBtnText = currentLang === 'zh' ? '🔥 浏览热门短剧' : (currentLang === 'km' ? '🔥 ទៅកាន់រឿងកំពុងពេញនិយម' : '🔥 Browse Trending Dramas');

                    grid.innerHTML = `
                        <div style="grid-column:1/-1; text-align:center; padding:80px 20px; color:var(--text-dim); background:rgba(255,255,255,0.02); border-radius:18px; border:1px dashed rgba(255,255,255,0.1);">
                            <div style="font-size:3.5rem; margin-bottom:14px; filter:drop-shadow(0 0 16px rgba(16,185,129,0.3));">📁</div>
                            <h3 style="color:#f8fafc; font-size:1.25rem; font-weight:700; margin-bottom:8px;">${emptyTitle}</h3>
                            <p style="font-size:0.88rem; max-width:480px; margin:0 auto 20px; line-height:1.6; color:#94a3b8;">
                                ${emptyDesc}
                            </p>
                            <button class="btn btn-primary" onclick="selectCategory(document.querySelector('.tab-btn[data-cat=\\'all\\']'), 'all')">
                                ${browseBtnText}
                            </button>
                        </div>
                    `;
                    return;
                }

                let totalCompletedEps = 0;
                let totalBytes = 0;
                for (const it of items) {
                    totalCompletedEps += (it.episode_count || 0);
                    totalBytes += (it.total_size || 0);
                }
                const totalGb = totalBytes / (1024 * 1024 * 1024);
                const totalMb = totalBytes / (1024 * 1024);
                const sizeStr = totalGb >= 1 ? `${totalGb.toFixed(2)} GB` : `${totalMb.toFixed(1)} MB`;

                const totalLabel = currentLang === 'zh' ? '📚 总计:' : (currentLang === 'km' ? '📚 សរុប:' : '📚 Total:');
                const dramasUnit = currentLang === 'zh' ? '部短剧' : (currentLang === 'km' ? 'រឿង' : 'Dramas');
                const epsLabel = currentLang === 'zh' ? '🎬 视频总数:' : (currentLang === 'km' ? '🎬 វីដេអូសរុប:' : '🎬 Total Episodes:');
                const diskLabel = currentLang === 'zh' ? '💾 占用空间:' : (currentLang === 'km' ? '💾 ទំហំផ្ទុក:' : '💾 Disk Space:');
                const reloadBtnText = currentLang === 'zh' ? '🔄 刷新' : (currentLang === 'km' ? '🔄 ផ្ទុកឡើងវិញ' : '🔄 Refresh');
                const openFolderBtnText = currentLang === 'zh' ? '📁 打开视频目录' : (currentLang === 'km' ? '📁 បើកថតផ្ទុកវីដេអូ (Open Folder)' : '📁 Open Downloads Folder');

                const headerToolbar = `
                    <div style="grid-column: 1/-1; background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(15, 23, 42, 0.95)); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 14px; padding: 14px 20px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 14px; margin-bottom: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
                        <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
                            <span style="font-weight:700; font-size:0.95rem; color:#f8fafc; display:flex; align-items:center; gap:6px;">
                                <span>${totalLabel}</span> <span style="color:#34d399; font-weight:800;">${items.length} ${dramasUnit}</span>
                            </span>
                            <span style="color:rgba(255,255,255,0.2);">|</span>
                            <span style="font-size:0.88rem; color:#94a3b8;">
                                ${epsLabel} <b style="color:#f8fafc;">${totalCompletedEps}</b> ${dict.cardEps}
                            </span>
                            <span style="color:rgba(255,255,255,0.2);">|</span>
                            <span style="font-size:0.88rem; color:#94a3b8;">
                                ${diskLabel} <b style="color:#f8fafc;">${sizeStr}</b>
                            </span>
                        </div>
                        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                            <button class="btn btn-secondary" onclick="renderLibraryView()" style="padding:7px 14px; font-size:0.82rem;">
                                ${reloadBtnText}
                            </button>
                            <button class="btn btn-primary" onclick="openSystemDownloadFolder()" style="padding:8px 18px; font-size:0.85rem; font-weight:700; background:linear-gradient(135deg, #10b981 0%, #059669 100%); border:none; box-shadow:0 4px 14px rgba(16,185,129,0.35);">
                                ${openFolderBtnText}
                            </button>
                        </div>
                    </div>
                `;

                const cardsHtml = items.map((item, idx) => {
                    const posterUrl = item.poster_url || (item.cover ? `/img?url=${encodeURIComponent(item.cover)}` : '');
                    const epsDone = item.episode_count || 0;
                    const totalEps = item.total_episodes || epsDone;
                    const isDone = item.status === 'completed' || (totalEps > 0 && epsDone >= totalEps);
                    const isDownloading = item.status === 'downloading' || item.status === 'running';

                    let statusBadgeHtml = '';
                    if (isDone) {
                        const doneLabel = currentLang === 'zh' ? '✓ 已完成' : (currentLang === 'km' ? '✓ បានបញ្ចប់' : '✓ Completed');
                        statusBadgeHtml = `<span style="background:rgba(16,185,129,0.92); color:#fff; font-size:0.7rem; font-weight:700; padding:2px 8px; border-radius:4px;">${doneLabel} (${epsDone} ${dict.cardEps})</span>`;
                    } else if (isDownloading) {
                        const dlLabel = currentLang === 'zh' ? '⚡ 下载中' : (currentLang === 'km' ? '⚡ កំពុងដោន' : '⚡ Downloading');
                        statusBadgeHtml = `<span style="background:rgba(245,158,11,0.95); color:#fff; font-size:0.7rem; font-weight:700; padding:2px 8px; border-radius:4px; animation:pulseGlow 1.8s infinite;">${dlLabel} (${epsDone}/${totalEps} • ${item.progress || 0}%)</span>`;
                    } else {
                        const savedLabel = currentLang === 'zh' ? '⏳ 已下载' : (currentLang === 'km' ? '⏳ បានដោន' : '⏳ Saved');
                        statusBadgeHtml = `<span style="background:rgba(99,102,241,0.85); color:#fff; font-size:0.7rem; font-weight:700; padding:2px 8px; border-radius:4px;">${savedLabel} ${epsDone}/${totalEps} ${dict.cardEps}</span>`;
                    }

                    const displayTitle = (currentLang === 'original' || currentLang === 'zh') ? item.title : ((currentLang === 'en' ? item.english_title : item.khmer_title) || getDisplayTitle(item.title));
                    const openLocalFolderLabel = currentLang === 'zh' ? '打开目录' : (currentLang === 'km' ? 'បើកថត' : 'Folder');

                    return `
                        <div class="drama-card" id="libCard_${item.series_id || idx}" style="animation: fadeIn 0.25s ease;" onclick="openStreamPage('${item.series_id || ''}')">
                            <div class="card-cover">
                                <img src="${posterUrl}" loading="lazy" alt="${escapeHtml(item.title)}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22280%22><rect width=%22100%%22 height=%22100%%22 fill=%22%23141c2c%22/><text x=%2250%%22 y=%2250%%22 fill=%22%2364748b%22 text-anchor=%22middle%22 font-family=%22sans-serif%22 font-size=%2214%22>Hongguo Drama</text></svg>'">
                                <span class="card-rank">#${idx + 1}</span>
                                <div style="position:absolute; bottom:6px; left:6px; z-index:3;">
                                    ${statusBadgeHtml}
                                </div>
                                <div class="card-overlay">
                                    <span class="card-eps">${epsDone}/${totalEps} ${dict.cardEps}</span>
                                    <span class="card-score">${item.total_size_str || '0 MB'}</span>
                                </div>
                            </div>
                            <div class="card-body">
                                <div>
                                    <h4 class="card-title" data-original-title="${escapeHtml(item.title)}" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</h4>
                                    <div class="card-meta">
                                        <span>${item.total_size_str || '0 MB'}</span>
                                        <span style="color:#34d399;">${isDone ? '✓ Offline Ready' : (isDownloading ? '⚡ Downloading' : '⏳ In Progress')}</span>
                                    </div>
                                </div>
                                <div class="card-actions" onclick="event.stopPropagation()">
                                    <button class="btn-card btn-card-play" onclick="openStreamPage('${item.series_id || ''}')" title="Play">
                                        <span>▶</span> ${dict.cardPlay.replace('▶ ', '')}
                                    </button>
                                    <button class="btn-card" onclick="openLocalFolder('${escapeHtml(item.folder || item.title)}')" title="Open Folder">
                                        <span>📁</span> ${openLocalFolderLabel}
                                    </button>
                                    <button class="btn-card" onclick="deleteFromLibrary('${item.series_id || ''}', '${escapeHtml(displayTitle)}')" title="Delete" style="color:#f87171; border-color:rgba(239,68,68,0.25);">
                                        <span>🗑️</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                grid.innerHTML = headerToolbar + cardsHtml;
            } catch (err) {
                grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--danger);">Error loading library: ${err.message}</div>`;
            }
        }


        // ==========================================
        // DOWNLOAD MEMORY CACHE
        // ==========================================
        async function syncDownloadedSeriesCache() {
            try {
                const res = await fetch('/dl/library');
                const items = await res.json();
                if (Array.isArray(items)) {
                    downloadedSeriesCache.clear();
                    for (const item of items) {
                        if (item.series_id) {
                            const isDone = item.status === 'completed' || (item.total_episodes > 0 && item.episode_count >= item.total_episodes && (!item.missing_count || item.missing_count === 0));
                            const missingCnt = item.missing_count || Math.max(0, (item.total_episodes || 0) - (item.episode_count || 0));
                            downloadedSeriesCache.set(String(item.series_id), {
                                count: item.episode_count || 0,
                                total: item.total_episodes || item.episode_count || 0,
                                missing_count: missingCnt,
                                missing_episodes: item.missing_episodes || [],
                                summary: `${item.episode_count || 0} ភាគ`,
                                title: item.title,
                                is_completed: isDone,
                                status: isDone ? 'completed' : (missingCnt > 0 && item.episode_count > 0 ? 'partial' : (item.status || 'downloading'))
                            });
                        }
                    }
                    updateLibraryCountBadge(items.length);
                    updateVisibleCardBadges();
                }
            } catch (e) {}
        }

        function getCardMemoryBadgeHtml(sid, title) {
            const cache = downloadedSeriesCache.get(String(sid));
            if (cache) {
                if (cache.status === 'downloading') {
                    const txt = currentLang === 'en'
                        ? `⚡ Downloading (${cache.count}/${cache.total || '...'})`
                        : `⚡ កំពុងដោន (${cache.count}/${cache.total || '...'})`;
                    return `<span class="card-memory-badge badge-downloading">${txt}</span>`;
                } else if (cache.is_completed || cache.status === 'completed') {
                    const txt = currentLang === 'en'
                        ? `✓ Completed (${cache.total || cache.count} EPs)`
                        : `✓ បានដោនចប់ (${cache.total || cache.count} ភាគ)`;
                    return `<span class="card-memory-badge badge-completed">${txt}</span>`;
                } else if (cache.count > 0 || cache.status === 'partial') {
                    const diff = cache.missing_count > 0 ? cache.missing_count : Math.max(0, cache.total - cache.count);
                    const txt = currentLang === 'en'
                        ? `⚠️ Missing ${diff} EPs (${cache.count}/${cache.total})`
                        : `⚠️ ខ្វះ ${diff} ភាគ (${cache.count}/${cache.total})`;
                    return `<span class="card-memory-badge badge-missing">${txt}</span>`;
                }
            }
            return '';
        }

        function updateVisibleCardBadges() {
            document.querySelectorAll('.drama-card').forEach(card => {
                const starBtn = card.querySelector('.star-btn');
                const sid = starBtn ? starBtn.getAttribute('data-sid') : null;
                if (!sid) return;
                const coverBox = card.querySelector('.card-cover');
                if (!coverBox) return;

                const existingBadge = coverBox.querySelector('.card-memory-badge');
                const newBadgeHtml = getCardMemoryBadgeHtml(sid);
                if (newBadgeHtml) {
                    if (existingBadge) {
                        existingBadge.outerHTML = newBadgeHtml;
                    } else {
                        coverBox.insertAdjacentHTML('beforeend', newBadgeHtml);
                    }
                } else if (existingBadge) {
                    existingBadge.remove();
                }
            });
        }

        async function loadSeriesDownloadedMemory(seriesId, title) {
            if (!seriesId) return;
            const badgeEl = document.getElementById('dramaHistoryMemoryBadge');
            try {
                const tParam = encodeURIComponent(title || (currentSeries && currentSeries.title) || '');
                const res = await fetch(`/api/series/${seriesId}/downloaded?title=${tParam}`);
                const data = await res.json();
                window.currentDownloadedEps = new Set(data.downloaded_episodes || []);
                currentDownloadedEps = window.currentDownloadedEps;

                if (data.count > 0) {
                    downloadedSeriesCache.set(String(seriesId), {
                        count: data.count,
                        summary: data.summary || `${data.count} ភាគ`,
                        downloaded_episodes: data.downloaded_episodes || []
                    });
                    if (badgeEl) {
                        badgeEl.style.display = 'flex';
                        badgeEl.innerHTML = `<span>📁 បានដោនរួច: <b>${data.summary || (data.count + ' ភាគ')}</b> (សរុប ${data.count} ភាគ)</span>`;
                    }
                } else {
                    if (badgeEl) badgeEl.style.display = 'none';
                }

                if (currentEpisodes && currentEpisodes.length) {
                    renderEpisodeGrid(currentEpisodes);
                }
                if (typeof updateStagePosterDisplay === 'function' && typeof currentSeries !== 'undefined' && currentSeries) {
                    updateStagePosterDisplay(currentSeries, currentEpIndex || 1);
                }
            } catch (e) {
                if (badgeEl) badgeEl.style.display = 'none';
            }
        }

        // Player state
        let playerSeriesId = null;
        let playerEpisodesList = [];
        let playerCurrentIndex = 0;

        // Init on load

        window.addEventListener('DOMContentLoaded', () => {
            initLanguage();
            initPlatformSwitcher();
            loadCategory('all');
            startDownloadPolling();
            setupVideoPlayer();
            updateStarredBadge();
            syncDownloadedSeriesCache();
            // Silent background update check on startup
            setTimeout(() => checkAppUpdate(true), 1500);

            // Right-click context menu for search & link input
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const menu = document.getElementById('searchContextMenu');
                    if (menu) {
                        menu.style.display = 'block';
                        menu.style.left = `${Math.min(e.clientX, window.innerWidth - 210)}px`;
                        menu.style.top = `${Math.min(e.clientY, window.innerHeight - 170)}px`;
                    }
                });
            }
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#searchContextMenu')) {
                    hideSearchContextMenu();
                }
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') hideSearchContextMenu();
            });
        });

        function showToast(msg, icon = '🍎') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, 3500);
        }

        // Category & Search handling

        // ==========================================
        // UNIFIED DOWNLOADS DRAWER & LIBRARY HUB
        // ==========================================
        let currentDrawerTab = 'library';
        let isPollingActive = false;

        function switchDrawerTab(tab) {
            currentDrawerTab = tab;
            const btnActive = document.getElementById('drawerTabActive');
            const btnLib = document.getElementById('drawerTabLibrary');
            const btnMem = document.getElementById('drawerTabMemory');

            const viewActive = document.getElementById('drawerActiveView');
            const viewLib = document.getElementById('drawerLibraryView');
            const viewMem = document.getElementById('drawerMemoryView');

            const drawerIcon = document.getElementById('dlDrawerIcon');
            const drawerTitle = document.getElementById('dlDrawerTitle');

            // Reset tab button states
            if (btnLib) btnLib.classList.toggle('active', tab === 'library');
            if (btnMem) btnMem.classList.toggle('active', tab === 'memory');
            if (btnActive) btnActive.classList.toggle('active', tab === 'active');

            // Reset view display
            if (viewLib) viewLib.style.display = (tab === 'library') ? 'flex' : 'none';
            if (viewMem) viewMem.style.display = (tab === 'memory') ? 'flex' : 'none';
            if (viewActive) viewActive.style.display = (tab === 'active') ? 'flex' : 'none';

            if (tab === 'library') {
                if (drawerIcon) drawerIcon.innerText = '📚';
                if (drawerTitle) drawerTitle.innerText = 'បណ្ណាល័យរឿងដែលបានទាញយក (Offline Library)';
                loadUnifiedLibrary();
            } else if (tab === 'memory') {
                if (drawerIcon) drawerIcon.innerText = '🕒';
                if (drawerTitle) drawerTitle.innerText = 'អង្គចងចាំការទាញយក (Download Memory)';
                loadDownloadMemory();
            } else {
                if (drawerIcon) drawerIcon.innerText = '⚡';
                if (drawerTitle) drawerTitle.innerText = 'កំពុងដំណើរការទាញយក & Log';
                pollDownloadStatus();
            }
        }
        window.switchDrawerTab = switchDrawerTab;

        function toggleDownloadsDrawer(forceOpen = false, targetTab = null) {
            const drawer = document.getElementById('downloadsDrawer');
            if (!drawer) return;
            if (targetTab) {
                switchDrawerTab(targetTab);
            }
            if (forceOpen) {
                drawer.classList.add('active');
            } else {
                drawer.classList.toggle('active');
            }
            if (drawer.classList.contains('active')) {
                if (currentDrawerTab === 'library') {
                    loadUnifiedLibrary();
                } else if (currentDrawerTab === 'memory') {
                    loadDownloadMemory();
                } else {
                    pollDownloadStatus();
                }
            }
        }
        window.toggleDownloadsDrawer = toggleDownloadsDrawer;

        function openOfflineLibraryDrawer() {
            toggleDownloadsDrawer(true, 'library');
        }
        window.openOfflineLibraryDrawer = openOfflineLibraryDrawer;

        function openDownloadsMemoryDrawer() {
            toggleDownloadsDrawer(true, 'memory');
        }
        window.openDownloadsMemoryDrawer = openDownloadsMemoryDrawer;

        function startDownloadPolling() {
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = setInterval(pollDownloadStatus, 1500);
        }

        async function pollDownloadStatus() {
            if (isPollingActive) return;
            isPollingActive = true;
            try {
                const [hgRes, ytRes] = await Promise.all([
                    fetch('/dl/status').catch(() => null),
                    fetch('/api/youtube/tasks').catch(() => null)
                ]);

                let hgData = null;
                let ytTasks = [];
                let ytOutputDir = '';

                if (hgRes && hgRes.ok) {
                    try { hgData = await hgRes.json(); } catch (e) {}
                }
                if (ytRes && ytRes.ok) {
                    try {
                        const ytd = await ytRes.json();
                        ytTasks = ytd.tasks || [];
                        ytOutputDir = ytd.output_dir || '';
                    } catch (e) {}
                }

                const hgRunning = Boolean(hgData && hgData.running);
                const activeYtTasks = ytTasks.filter(t => ['downloading', 'pending', 'merging'].includes(t.status));
                const totalActive = (hgRunning ? 1 : 0) + activeYtTasks.length;

                // 1. Header Active Download Badge
                const dlBadge = document.getElementById('activeDlCount');
                if (dlBadge) {
                    if (totalActive > 0) {
                        dlBadge.innerText = totalActive;
                        dlBadge.style.display = 'inline-block';
                    } else {
                        dlBadge.style.display = 'none';
                    }
                }

                // 2. Drawer Tab Active Badge
                const drawerActiveBadge = document.getElementById('drawerActiveBadge');
                if (drawerActiveBadge) {
                    if (totalActive > 0) {
                        drawerActiveBadge.innerText = totalActive;
                        drawerActiveBadge.style.display = 'inline-block';
                    } else {
                        drawerActiveBadge.style.display = 'none';
                    }
                }

                // 3. Update Drawer Meters
                if (hgData) {
                    const speedEl = document.getElementById('dlLiveSpeed');
                    if (speedEl) {
                        if (hgRunning) {
                            speedEl.innerText = hgData.speed || '0.0 MB/s';
                        } else if (activeYtTasks.length > 0) {
                            speedEl.innerText = activeYtTasks[0].speed || 'Downloading...';
                        } else {
                            speedEl.innerText = '0.0 MB/s';
                        }
                    }
                    const itemEl = document.getElementById('dlCurrentItem');
                    if (itemEl) {
                        if (hgRunning) {
                            itemEl.innerText = hgData.current_status || 'កំពុងទាញយករឿងភាគ...';
                        } else if (activeYtTasks.length > 0) {
                            itemEl.innerText = activeYtTasks[0].title || 'YouTube Video';
                        } else {
                            itemEl.innerText = 'Idle';
                        }
                    }
                    const pctEl = document.getElementById('dlPercentText');
                    if (pctEl) pctEl.innerText = `${hgData.progress || (activeYtTasks.length ? (activeYtTasks[0].percent || '0%') : '0%')}`;
                    const progFill = document.getElementById('dlProgressFill');
                    if (progFill) progFill.style.width = `${hgData.progress || (activeYtTasks.length ? (activeYtTasks[0].percentNum || 0) : 0)}%`;
                    const doneEl = document.getElementById('dlTotalDone');
                    if (doneEl) doneEl.innerText = hgData.total_done || 0;
                    const epsEl = document.getElementById('dlTotalEps');
                    if (epsEl) epsEl.innerText = hgData.total_eps || 0;
                    const runStat = document.getElementById('dlRunningStatus');
                    if (runStat) {
                        runStat.innerText = totalActive > 0 ? 'Downloading' : (hgData.completed ? 'Completed' : 'Ready');
                        runStat.style.color = totalActive > 0 ? '#38bdf8' : '#fb7185';
                    }
                }

                // 4. Render Active Content if Drawer is Open & on Active Tab
                const drawer = document.getElementById('downloadsDrawer');
                if (drawer && drawer.classList.contains('active') && currentDrawerTab === 'active') {
                    renderDrawerActiveContent(hgData, ytTasks, ytOutputDir);
                }

                // 5. Failed Episodes Box (Hongguo)
                const failedBox = document.getElementById('failedEpsBox');
                const failedList = document.getElementById('failedEpsList');
                if (failedBox && failedList && hgData) {
                    const failedTasks = (hgData.tasks || []).filter(t => t.status === 'failed');
                    if (failedTasks.length > 0) {
                        failedBox.style.display = 'block';
                        failedList.innerHTML = failedTasks.map(t => `
                            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.35); border:1px solid rgba(239,68,68,0.22); border-radius:5px; padding:4px 8px; font-size:0.74rem;">
                                <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:260px;" title="${escapeHtml(t.error_message || '')}">
                                    <b style="color:#f87171;">EP${t.episode_index || '?'}</b>: ${escapeHtml(t.series_title || '')}
                                    <span style="color:var(--text-dim); font-size:0.69rem;">(${escapeHtml(t.error_message || 'Failed')})</span>
                                </div>
                                <button class="btn-queue-retry" onclick="retrySingleEpisode('${t.series_id}', '${t.vid}', ${t.episode_index})">🔄 Retry</button>
                            </div>
                        `).join('');
                    } else {
                        failedBox.style.display = 'none';
                    }
                }

                // 6. Activity Logs (Hongguo)
                if (hgData && hgData.log && hgData.log.length > 0) {
                    const logBox = document.getElementById('dlLogBox');
                    if (logBox) {
                        logBox.innerHTML = hgData.log.map(l => `<div>${escapeHtml(l)}</div>`).join('');
                        logBox.scrollTop = logBox.scrollHeight;
                    }
                }

                // 7. Update Output Folder in UI
                if (hgData && hgData.output_dir) {
                    updateDownloadFolderUI(hgData.output_dir);
                }

                // 8. Player Download Log Panel (Stream View - Isolated per Drama)
                const pdl = document.getElementById('playerDownloadLogPanel');
                if (pdl && hgData) {
                    const liveBadge = document.getElementById('pdlLiveBadge');
                    const pdlSpeed = document.getElementById('pdlSpeedBadge');
                    const pdlSeries = document.getElementById('pdlCurrentSeriesTitle');
                    const pdlEps = document.getElementById('pdlEpisodeProgress');
                    const pdlStatus = document.getElementById('pdlStatusText');
                    const pdlProg = document.getElementById('pdlProgressBar');
                    const pdlConsole = document.getElementById('pdlConsoleLog');

                    if (pdlSpeed) pdlSpeed.innerText = `⚡ ${hgData.speed || '0.0 MB/s'}`;

                    // Detect if the user is currently viewing a drama in Stream View
                    const streamEl = document.getElementById('streamView');
                    const isViewingDrama = streamEl && !streamEl.hidden && streamEl.style.display !== 'none' && window.currentSeries;
                    const viewingSid = isViewingDrama ? String(window.currentSeries.series_id || window.currentSeries.id || '') : null;
                    const viewingTitle = isViewingDrama ? (window.currentSeries.title || 'Drama') : '';
                    const viewingTotal = isViewingDrama ? ((window.currentEpisodes && window.currentEpisodes.length) || window.currentSeries.episode_cnt || 0) : 0;

                    if (isViewingDrama && viewingSid) {
                        const isThisActiveDownloading = hgData.running && String(hgData.current_sid) === viewingSid;
                        const sState = hgData.series_states && hgData.series_states[viewingSid];
                        const localCache = window.downloadedSeriesCache && window.downloadedSeriesCache.get(viewingSid);

                        if (pdlSeries) pdlSeries.innerText = viewingTitle;

                        if (isThisActiveDownloading) {
                            if (pdlEps) pdlEps.innerText = `${hgData.current_series_done || 0} / ${hgData.current_series_total || viewingTotal}`;
                            if (pdlStatus) {
                                pdlStatus.innerText = hgData.current_status || (currentLang === 'zh' ? '正在下载' : (currentLang === 'en' ? 'Downloading' : 'កំពុងទាញយក'));
                                pdlStatus.style.color = '#38bdf8';
                            }
                            if (liveBadge) liveBadge.style.display = 'inline-block';
                            if (pdlProg) pdlProg.style.width = `${hgData.current_series_progress || 0}%`;
                            const activeLogs = (hgData.current_series_logs && hgData.current_series_logs.length > 0) ? hgData.current_series_logs : (hgData.log || []);
                            if (pdlConsole && activeLogs.length > 0) {
                                pdlConsole.innerHTML = activeLogs.slice(-25).map(line => {
                                    const isErr = line.includes('ERR') || line.includes('Fail');
                                    const isSuccess = line.includes('✓') || line.includes('Success');
                                    const color = isErr ? '#ef4444' : (isSuccess ? '#10b981' : '#cbd5e1');
                                    return `<div class="pdl-log-line" style="color:${color};">${escapeHtml(line)}</div>`;
                                }).join('');
                                pdlConsole.scrollTop = pdlConsole.scrollHeight;
                            }
                        } else if (sState) {
                            const isDone = sState.status === 'done' || (sState.total > 0 && sState.done >= sState.total);
                            if (pdlEps) pdlEps.innerText = `${sState.done || 0} / ${sState.total || viewingTotal}`;
                            if (pdlStatus) {
                                pdlStatus.innerText = isDone ? 'Completed' : (sState.status || 'Idle');
                                pdlStatus.style.color = isDone ? '#10b981' : '#38bdf8';
                            }
                            if (liveBadge) liveBadge.style.display = sState.status === 'downloading' ? 'inline-block' : 'none';
                            if (pdlProg) pdlProg.style.width = `${sState.progress || (isDone ? 100 : 0)}%`;
                            if (pdlConsole && Array.isArray(sState.logs) && sState.logs.length > 0) {
                                pdlConsole.innerHTML = sState.logs.slice(-25).map(line => {
                                    const isErr = line.includes('ERR') || line.includes('Fail');
                                    const isSuccess = line.includes('✓') || line.includes('Success');
                                    const color = isErr ? '#ef4444' : (isSuccess ? '#10b981' : '#cbd5e1');
                                    return `<div class="pdl-log-line" style="color:${color};">${escapeHtml(line)}</div>`;
                                }).join('');
                                pdlConsole.scrollTop = pdlConsole.scrollHeight;
                            }
                        } else if (localCache && (localCache.is_completed || localCache.status === 'completed')) {
                            if (pdlEps) pdlEps.innerText = `${localCache.total || viewingTotal} / ${localCache.total || viewingTotal}`;
                            if (pdlStatus) {
                                pdlStatus.innerText = 'Completed (បានដោនចប់)';
                                pdlStatus.style.color = '#10b981';
                            }
                            if (liveBadge) liveBadge.style.display = 'none';
                            if (pdlProg) pdlProg.style.width = '100%';
                        } else {
                            if (pdlEps) pdlEps.innerText = `0 / ${viewingTotal}`;
                            if (pdlStatus) {
                                pdlStatus.innerText = 'Idle (ត្រៀមរួចរាល់)';
                                pdlStatus.style.color = '#94a3b8';
                            }
                            if (liveBadge) liveBadge.style.display = 'none';
                            if (pdlProg) pdlProg.style.width = '0%';
                        }
                    } else {
                        // General fallback outside stream view
                        if (pdlSeries) {
                            const curTitle = hgData.current_title || (hgData.running ? 'Downloading...' : 'Idle');
                            pdlSeries.innerText = curTitle;
                        }
                        if (pdlEps) pdlEps.innerText = `${hgData.current_series_done || hgData.total_done || 0} / ${hgData.current_series_total || hgData.total_eps || 0}`;
                        if (pdlStatus) {
                            pdlStatus.innerText = hgData.running ? (currentLang === 'zh' ? '正在下载' : (currentLang === 'en' ? 'Downloading' : 'កំពុងទាញយក')) : (hgData.completed ? 'Completed' : 'Idle');
                            pdlStatus.style.color = hgData.running ? '#38bdf8' : (hgData.completed ? '#10b981' : '#94a3b8');
                        }
                        if (liveBadge) liveBadge.style.display = hgData.running ? 'inline-block' : 'none';
                        if (pdlProg) pdlProg.style.width = `${hgData.progress || 0}%`;
                        if (pdlConsole && Array.isArray(hgData.log) && hgData.log.length > 0) {
                            pdlConsole.innerHTML = hgData.log.slice(-25).map(line => {
                                const isErr = line.includes('ERR') || line.includes('Fail');
                                const isSuccess = line.includes('✓') || line.includes('Success');
                                const color = isErr ? '#ef4444' : (isSuccess ? '#10b981' : '#cbd5e1');
                                return `<div class="pdl-log-line" style="color:${color};">${escapeHtml(line)}</div>`;
                            }).join('');
                            pdlConsole.scrollTop = pdlConsole.scrollHeight;
                        }
                    }
                }

                // 9. Sync cache & library badge periodically
                if (hgData && (hgData.running || hgData.completed)) {
                    if (window._lastPollRunningState !== hgData.running || (Date.now() - (window._lastBadgeSyncTime || 0) > 4000)) {
                        window._lastBadgeSyncTime = Date.now();
                        window._lastPollRunningState = hgData.running;
                        syncDownloadedSeriesCache();
                    }
                }
            } catch (e) {
                // Silent background poll
            } finally {
                isPollingActive = false;
            }
        }

        function renderDrawerActiveContent(hgData, ytTasks, ytOutputDir) {
            const sContainer = document.getElementById('activeSeriesContainer');
            const ytContainer = document.getElementById('drawerYtTasksContainer');
            const hgSection = document.getElementById('drawerHgSectionWrap');
            const ytSection = document.getElementById('drawerYtSectionWrap');
            const emptyNotice = document.getElementById('drawerActiveEmpty');
            const hgCountBadge = document.getElementById('drawerHgCount');
            const ytCountBadge = document.getElementById('drawerYtCount');

            // 1. Hongguo series (both active and completed download history)
            const seriesList = (hgData && hgData.series) ? [...hgData.series] : [];

            // If active queue is empty or has few items, merge with downloaded library dramas so history persists
            if (window._cachedLibraryDramas && window._cachedLibraryDramas.length > 0) {
                const existingSids = new Set(seriesList.map(s => String(s.sid)));
                for (const libItem of window._cachedLibraryDramas) {
                    const sid = String(libItem.series_id || libItem.id || '');
                    if (sid && !existingSids.has(sid)) {
                        seriesList.push({
                            sid: sid,
                            title: libItem.title || libItem.name || 'Drama',
                            cover: libItem.cover || libItem.poster_url || '',
                            done: libItem.episode_count || libItem.total_episodes || 0,
                            total: libItem.total_episodes || libItem.episode_count || 0,
                            status: libItem.status || 'completed',
                            progress: libItem.progress || 100,
                            download_mode: 'separate'
                        });
                        existingSids.add(sid);
                    }
                }
            }

            if (hgCountBadge) hgCountBadge.innerText = seriesList.length;

            if (seriesList.length > 0) {
                if (hgSection) hgSection.style.display = 'block';
                if (sContainer) {
                    sContainer.innerHTML = seriesList.map(s => {
                        let posterUrl = '';
                        if (s.cover) {
                            posterUrl = /^https?:\/\//i.test(s.cover)
                                ? `/img?url=${encodeURIComponent(s.cover)}`
                                : s.cover;
                        }
                        const fallbackSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='44' height='58' viewBox='0 0 44 58'><rect width='100%25' height='100%25' fill='%23141c2c'/><text x='50%25' y='52%25' dominant-baseline='middle' text-anchor='middle' font-size='16' fill='%2364748b'>🎬</text></svg>";
                        const imgTag = posterUrl
                            ? `<img src="${posterUrl}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${fallbackSvg}';">`
                            : `<img src="${fallbackSvg}" alt="">`;

                        const isDone = s.status === 'done' || s.status === 'completed' || (s.total > 0 && s.done >= s.total);
                        let tagClass = 'downloading';
                        let tagText = currentLang === 'zh' ? `⚡ 下载中 (${s.done || 0}/${s.total || '?'} 集)` : (currentLang === 'en' ? `⚡ Downloading (${s.done || 0}/${s.total || '?'} Eps)` : `⚡ កំពុងទាញយក (${s.done || 0}/${s.total || '?'} ភាគ)`);
                        
                        if (s.status === 'merging') {
                            tagClass = 'merging';
                            tagText = currentLang === 'zh' ? '🎞️ 合并中...' : (currentLang === 'en' ? '🎞️ Merging...' : '🎞️ កំពុងភ្ជាប់វីដេអូ...');
                        } else if (isDone) {
                            tagClass = 'done';
                            tagText = currentLang === 'zh' ? `✓ 已完成 (${s.done || s.total} 集)` : (currentLang === 'en' ? `✓ Completed (${s.done || s.total} Eps)` : `✓ ទាញយកចប់ (${s.done || s.total} ភាគ)`);
                        }

                        let modeBadgeHtml = '';
                        if (s.download_mode === 'merged') {
                            modeBadgeHtml = `<span style="background:rgba(245,158,11,0.18); color:#fbbf24; border:1px solid rgba(245,158,11,0.4); font-size:0.65rem; padding:1px 6px; border-radius:4px; font-weight:700;">🎞️ វីដេអូពេញ</span>`;
                        } else if (s.download_mode === 'both') {
                            modeBadgeHtml = `<span style="background:rgba(168,85,247,0.18); color:#c084fc; border:1px solid rgba(168,85,247,0.4); font-size:0.65rem; padding:1px 6px; border-radius:4px; font-weight:700;">🎬 ភាគ + ពេញ</span>`;
                        }

                        const progPct = isDone ? 100 : Math.max(0, Math.min(100, Math.round(s.progress || 0)));
                        const epDone = s.done || 0;
                        const epTotal = s.total > 0 ? s.total : (epDone > 0 ? epDone : '...');
                        const folderName = String(s.title || '').replace(/[\\/*?:"<>|\r\n\t]/g, '_').trim();

                        return `
                        <div class="queue-series-card" style="border: 1px solid ${isDone ? 'rgba(16,185,129,0.25)' : 'var(--border-glass)'};">
                            <div class="queue-poster-box">
                                ${imgTag}
                            </div>
                            <div class="queue-content">
                                <div class="queue-title-row">
                                    <div class="queue-title" title="${escapeHtml(s.title || 'Drama')}">${escapeHtml(s.title || 'Drama')}</div>
                                    <div class="queue-pct" style="color:${isDone ? '#34d399' : '#fb7185'};">${progPct}%</div>
                                </div>
                                <div class="queue-meta-row">
                                    <div style="display:flex; align-items:center; gap:6px;">
                                        <span class="queue-tag ${tagClass}">${tagText}</span>
                                        ${modeBadgeHtml}
                                    </div>
                                    <span style="font-weight:700; color:${isDone ? '#34d399' : '#f8fafc'};">${epDone} / ${epTotal} ភាគ</span>
                                </div>
                                <div class="queue-mini-bar">
                                    <div class="queue-mini-fill" style="width: ${progPct}%; background:${isDone ? '#10b981' : ''};"></div>
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px; font-size:0.69rem; color:#94a3b8;">
                                    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px;">📁 ${escapeHtml(folderName)}</span>
                                    <div style="display:flex; gap:5px;">
                                        <button class="btn-queue-retry" style="padding:2px 8px; font-size:0.68rem; background:linear-gradient(135deg, #f97316, #ea580c); color:#fff; border:none; font-weight:700; border-radius:5px;" onclick="event.stopPropagation(); playDramaInVlc('${s.sid || ''}', '${escapeHtml(folderName)}')">▶ មើល (VLC)</button>
                                        <button class="btn-queue-retry" style="padding:2px 8px; font-size:0.68rem;" onclick="event.stopPropagation(); openDramaFolder('${escapeHtml(folderName)}')">📂 Open</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        `;
                    }).join('');
                }
            } else {
                if (hgSection) hgSection.style.display = 'none';
                if (sContainer) sContainer.innerHTML = '';
            }

            // 2. YouTube Active Tasks
            const activeYt = (ytTasks || []).filter(t => ['downloading', 'pending', 'merging'].includes(t.status));
            if (ytCountBadge) ytCountBadge.innerText = activeYt.length;

            if (activeYt.length > 0) {
                if (ytSection) ytSection.style.display = 'block';
                if (ytContainer) {
                    ytContainer.innerHTML = activeYt.map(t => {
                        const title = t.title || 'YouTube Video';
                        const pct = t.percentNum || Math.round(parseFloat(t.percent) || 0);
                        const speed = t.speed || '...';
                        const eta = t.eta ? `ETA: ${t.eta}` : '';
                        const quality = t.quality || 'Auto';
                        const thumb = t.thumbnail || '';
                        const fallbackThumb = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='68' height='38' viewBox='0 0 68 38'><rect width='100%25' height='100%25' fill='%23141c2c'/><text x='50%25' y='52%25' dominant-baseline='middle' text-anchor='middle' font-size='14' fill='%23ef4444'>▶</text></svg>";

                        return `
                        <div class="drawer-yt-card">
                            <div class="drawer-yt-header-row">
                                <div class="drawer-yt-thumb">
                                    <img src="${thumb || fallbackThumb}" onerror="this.onerror=null;this.src='${fallbackThumb}';" alt="">
                                </div>
                                <div class="drawer-yt-info">
                                    <div class="drawer-yt-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
                                    <div class="drawer-yt-meta">
                                        <span style="background:rgba(239,68,68,0.2); color:#fca5a5; font-size:0.66rem; font-weight:700; padding:1px 5px; border-radius:3px;">${escapeHtml(quality)}</span>
                                        <span>${speed}</span>
                                        ${eta ? `<span>${eta}</span>` : ''}
                                    </div>
                                </div>
                                <div style="font-size:0.85rem; font-weight:800; color:#f87171;">
                                    ${pct}%
                                </div>
                            </div>
                            <div class="drawer-yt-progress-bar">
                                <div class="drawer-yt-progress-fill" style="width:${pct}%;"></div>
                            </div>
                            <div class="drawer-yt-actions">
                                <div class="drawer-location-tag" title="${escapeHtml(t.outputDir || ytOutputDir || 'Downloads/YouTube')}">
                                    <span>📁</span> <span>YouTube</span>
                                </div>
                                <div style="display:flex; gap:6px; align-items:center;">
                                    <button class="btn-queue-retry" style="padding:2px 8px; font-size:0.68rem;" onclick="openYouTubeFolder()">📂 Folder</button>
                                    <button class="btn-queue-retry" style="padding:2px 8px; font-size:0.68rem; color:#fca5a5; border-color:rgba(239,68,68,0.3);" onclick="cancelYouTubeTask('${t.id}')">🛑 Cancel</button>
                                </div>
                            </div>
                        </div>
                        `;
                    }).join('');
                }
            } else {
                if (ytSection) ytSection.style.display = 'none';
                if (ytContainer) ytContainer.innerHTML = '';
            }

            // 3. Check if any active downloads:
            const activeHgTasks = (hgData && hgData.tasks) ? hgData.tasks.filter(t => ['downloading', 'pending'].includes(t.status)) : [];
            const hasAnyActive = seriesList.length > 0 || activeYt.length > 0 || activeHgTasks.length > 0;
            if (!hasAnyActive) {
                if (emptyNotice) emptyNotice.style.display = 'block';
            } else {
                if (emptyNotice) emptyNotice.style.display = 'none';
            }
        }


        // ==========================================
        // UNIFIED DOWNLOAD MEMORY & LIBRARY SYSTEM
        // ==========================================
        window._unifiedMemoryItems = [];
        window._currentMemoryFilter = 'all';
        window._memorySearchQuery = '';
        window._smartProceedCb = null;

        async function loadUnifiedLibrary() {
            const unifiedListEl = document.getElementById('drawerUnifiedMemoryList');
            const statTotalEl = document.getElementById('drawerStatTotalCount');
            const statDoneEl = document.getElementById('drawerStatDoneCount');
            const statMissingEl = document.getElementById('drawerStatMissingCount');
            const statSizeEl = document.getElementById('drawerStatTotalSize');
            const libBadge = document.getElementById('drawerLibBadge');
            const topLibBadge = document.getElementById('libraryCountBadge');

            if (unifiedListEl && (!window._unifiedMemoryItems || window._unifiedMemoryItems.length === 0)) {
                unifiedListEl.innerHTML = '<div style="text-align:center; padding:24px; color:var(--text-dim); font-size:0.82rem;">⚡ កំពុងផ្ទុកអង្គចងចាំការទាញយក...</div>';
            }

            try {
                const [hgRes, ytRes] = await Promise.all([
                    fetch('/dl/library').catch(() => null),
                    fetch('/api/youtube/library').catch(() => null)
                ]);

                let hgItems = [];
                let ytItems = [];

                if (hgRes && hgRes.ok) {
                    try { hgItems = await hgRes.json(); } catch (e) {}
                }
                if (ytRes && ytRes.ok) {
                    try {
                        const ytd = await ytRes.json();
                        ytItems = ytd.items || [];
                    } catch (e) {}
                }

                // Cache for quick lookups
                window._cachedLibraryDramas = hgItems;

                const unified = [];
                let totalBytes = 0;

                // 1. Process Dramas (Hongguo, HaoSou, MVFFM)
                if (Array.isArray(hgItems)) {
                    for (const it of hgItems) {
                        const totalEps = it.total_episodes || it.episode_count || 1;
                        const doneEps = it.episode_count || 0;
                        const missingCount = it.missing_count != null ? it.missing_count : Math.max(0, totalEps - doneEps);
                        const isDone = (it.status === 'completed') || (totalEps > 0 && doneEps >= totalEps && missingCount === 0);
                        const isMissing = !isDone && (missingCount > 0 || (doneEps < totalEps && doneEps > 0));

                        let statusKey = 'partial';
                        if (isDone) statusKey = 'completed';
                        else if (it.status === 'downloading') statusKey = 'downloading';
                        else if (isMissing) statusKey = 'partial';

                        totalBytes += (it.total_size || 0);

                        unified.push({
                            id: String(it.series_id || it.id || ''),
                            platform: it.platform || 'hongguo',
                            title: it.khmer_title || it.title || 'Drama',
                            original_title: it.title || '',
                            cover: it.poster_url || it.cover || '',
                            total_episodes: totalEps,
                            episode_count: doneEps,
                            missing_count: missingCount,
                            missing_episodes: it.missing_episodes || [],
                            downloaded_episodes: it.downloaded_episodes || [],
                            status: statusKey,
                            is_completed: isDone,
                            progress: isDone ? 100 : (it.progress || (totalEps > 0 ? Math.round((doneEps / totalEps) * 100) : 0)),
                            size_str: it.total_size_str || '0 MB',
                            folder: it.folder || it.title || '',
                            path: it.path || ''
                        });
                    }
                }

                // 2. Process YouTube Videos
                if (Array.isArray(ytItems)) {
                    for (const yt of ytItems) {
                        totalBytes += (yt.size || 0);
                        const sizeMb = ((yt.size || 0) / (1024 * 1024)).toFixed(1);
                        const sizeStr = (yt.size || 0) >= (1024 * 1024 * 1024) ? `${((yt.size || 0) / (1024 * 1024 * 1024)).toFixed(2)} GB` : `${sizeMb} MB`;
                        unified.push({
                            id: yt.id || yt.name || '',
                            platform: 'youtube',
                            title: yt.name || 'YouTube Video',
                            original_title: yt.name || '',
                            cover: yt.thumbnail || '',
                            total_episodes: 1,
                            episode_count: 1,
                            missing_count: 0,
                            missing_episodes: [],
                            downloaded_episodes: [1],
                            status: 'completed',
                            is_completed: true,
                            progress: 100,
                            size_str: sizeStr,
                            folder: yt.filePath || yt.name || '',
                            path: yt.filePath || '',
                            ext: yt.ext || 'MP4'
                        });
                    }
                }

                window._unifiedMemoryItems = unified;

                // 3. Compute stats
                const totalCount = unified.length;
                const doneCount = unified.filter(i => i.is_completed).length;
                const missingCount = unified.filter(i => i.status === 'partial' || (!i.is_completed && i.missing_count > 0)).length;
                const activeCount = unified.filter(i => i.status === 'downloading').length;

                // Update filter pill badges
                const mAll = document.getElementById('memCountAll');
                const mDone = document.getElementById('memCountDone');
                const mMissing = document.getElementById('memCountMissing');
                const mActive = document.getElementById('memCountActive');
                if (mAll) mAll.innerText = totalCount;
                if (mDone) mDone.innerText = doneCount;
                if (mMissing) mMissing.innerText = missingCount;
                if (mActive) mActive.innerText = activeCount;

                // Update summary stats
                if (statTotalEl) statTotalEl.innerText = totalCount;
                if (statDoneEl) statDoneEl.innerText = doneCount;
                if (statMissingEl) statMissingEl.innerText = missingCount;

                const totalGb = totalBytes / (1024 * 1024 * 1024);
                const totalMb = totalBytes / (1024 * 1024);
                if (statSizeEl) {
                    statSizeEl.innerText = totalGb >= 1 ? `${totalGb.toFixed(2)} GB` : `${totalMb.toFixed(1)} MB`;
                }

                if (libBadge) {
                    libBadge.innerText = totalCount;
                    libBadge.style.display = totalCount > 0 ? 'inline-block' : 'none';
                }
                if (topLibBadge) {
                    topLibBadge.innerText = totalCount;
                    topLibBadge.style.display = totalCount > 0 ? 'inline-block' : 'none';
                }

                // 4. Render Memory Cards
                renderUnifiedMemoryList();

            } catch (e) {
                console.error('Error loading unified library memory:', e);
            }
        }

        function filterDrawerMemory(filterType) {
            window._currentMemoryFilter = filterType || 'all';
            const pills = [
                { id: 'pillFilterAll', key: 'all' },
                { id: 'pillFilterDone', key: 'completed' },
                { id: 'pillFilterMissing', key: 'partial' },
                { id: 'pillFilterActive', key: 'downloading' }
            ];
            for (const p of pills) {
                const el = document.getElementById(p.id);
                if (el) {
                    if (p.key === window._currentMemoryFilter) el.classList.add('active');
                    else el.classList.remove('active');
                }
            }
            renderUnifiedMemoryList();
        }
        window.filterDrawerMemory = filterDrawerMemory;

        function onDrawerMemorySearch(query) {
            window._memorySearchQuery = (query || '').toLowerCase().trim();
            renderUnifiedMemoryList();
        }
        window.onDrawerMemorySearch = onDrawerMemorySearch;

        function renderUnifiedMemoryList() {
            const container = document.getElementById('drawerUnifiedMemoryList');
            if (!container) return;

            let items = [...(window._unifiedMemoryItems || [])];
            const filter = window._currentMemoryFilter || 'all';
            const query = window._memorySearchQuery || '';

            // Apply filter
            if (filter === 'completed') {
                items = items.filter(i => i.is_completed);
            } else if (filter === 'partial') {
                items = items.filter(i => i.status === 'partial' || (!i.is_completed && i.missing_count > 0));
            } else if (filter === 'downloading') {
                items = items.filter(i => i.status === 'downloading');
            }

            // Apply search
            if (query) {
                items = items.filter(i =>
                    (i.title && i.title.toLowerCase().includes(query)) ||
                    (i.original_title && i.original_title.toLowerCase().includes(query)) ||
                    (i.id && i.id.toLowerCase().includes(query)) ||
                    (i.folder && i.folder.toLowerCase().includes(query))
                );
            }

            if (items.length === 0) {
                let emptyMsg = 'មិនទាន់មានទិន្នន័យក្នុងអង្គចងចាំនៅឡើយទេ';
                if (filter === 'completed') emptyMsg = 'មិនទាន់មានរឿងដែលបានទាញយកចប់សព្វគ្រប់នៅឡើយទេ';
                else if (filter === 'partial') emptyMsg = 'អបអរសាទរ! មិនមានរឿងណាដែលខ្វះភាគទេ (គ្មាន Incomplete)';
                else if (filter === 'downloading') emptyMsg = 'មិនមានរឿងកំពុងទាញយកនៅពេលនេះទេ';
                else if (query) emptyMsg = `រកមិនឃើញលទ្ធផលសម្រាប់ "${query}" ទេ`;

                container.innerHTML = `
                    <div style="text-align:center; padding:32px 14px; color:var(--text-dim); background:rgba(255,255,255,0.02); border-radius:10px; border:1px dashed var(--border-glass); font-size:0.82rem;">
                        <div style="font-size:1.8rem; margin-bottom:6px;">🧠</div>
                        <div style="color:#cbd5e1; font-weight:600;">${emptyMsg}</div>
                        <div style="font-size:0.73rem; color:#64748b; margin-top:4px;">រឿងដែលអ្នកធ្លាប់ទាញយកនឹងត្រូវកត់ត្រាទុកនៅទីនេះជានិច្ច</div>
                    </div>`;
                return;
            }

            container.innerHTML = items.map(item => {
                const isYt = item.platform === 'youtube';
                const isDone = item.is_completed;
                const isDl = item.status === 'downloading';
                const isMissing = !isDone && !isDl && (item.missing_count > 0 || (item.episode_count < item.total_episodes && item.episode_count > 0));

                let cardClass = isDl ? 'card-is-downloading' : (isDone ? 'card-is-completed' : (isMissing ? 'card-is-missing' : ''));
                
                // Status badge HTML
                let statusBadgeHtml = '';
                if (isDl) {
                    statusBadgeHtml = `<span class="memory-status-badge downloading">⚡ កំពុងដោន (${item.episode_count}/${item.total_episodes} ភាគ • ${item.progress}%)</span>`;
                } else if (isDone) {
                    statusBadgeHtml = `<span class="memory-status-badge completed">✅ បានចប់ (${item.episode_count}/${item.total_episodes} ភាគ)</span>`;
                } else if (isMissing) {
                    statusBadgeHtml = `<span class="memory-status-badge partial">⚠️ ខ្វះ ${item.missing_count} ភាគ (${item.episode_count}/${item.total_episodes})</span>`;
                } else {
                    statusBadgeHtml = `<span class="memory-status-badge downloading">⚡ កំពុងដំណើរការ (${item.progress}%)</span>`;
                }

                // Poster
                let coverSrc = item.cover;
                if (coverSrc && !coverSrc.startsWith('/img') && !coverSrc.startsWith('/api') && /^https?:\/\//i.test(coverSrc)) {
                    coverSrc = `/img?url=${encodeURIComponent(coverSrc)}`;
                }
                const fallbackIcon = isYt ? '▶️' : '🎬';

                // Action buttons
                let resumeBtnHtml = '';
                if (isMissing && !isYt && !isDl) {
                    const missingJson = JSON.stringify(item.missing_episodes || []).replace(/"/g, '&quot;');
                    resumeBtnHtml = `
                        <button type="button" class="btn-resume-missing" onclick="event.stopPropagation(); resumeMissingEpisodes('${item.id}', '${item.platform}', '${escapeHtml(item.original_title || item.title)}', ${missingJson})" title="ទាញយកតែភាគដែលនៅខ្វះ ${item.missing_count} ភាគ">
                            📥 ដោនភាគខ្វះ (${item.missing_count})
                        </button>
                    `;
                }

                const escapedFolder = (item.folder || item.title || '').replace(/'/g, "\\'");
                const escapedTitle = (item.original_title || item.title || '').replace(/'/g, "\\'");
                const escapedPath = (item.path || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

                return `
                    <div class="memory-card ${cardClass}">
                        <div class="memory-poster-box">
                            ${coverSrc ? `<img src="${coverSrc}" alt="" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div style="display:none; align-items:center; justify-content:center; height:100%; color:#64748b; font-size:1.3rem;">${fallbackIcon}</div>` : `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#64748b; font-size:1.3rem;">${fallbackIcon}</div>`}
                        </div>
                        <div style="flex:1; min-width:0;">
                            <div style="display:flex; align-items:center; gap:6px; margin-bottom:3px;">
                                <span class="platform-tag-pill ${item.platform}">${item.platform}</span>
                                ${statusBadgeHtml}
                            </div>
                            <div style="font-size:0.86rem; font-weight:700; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(item.title)}">
                                ${escapeHtml(item.title)}
                            </div>
                            ${item.original_title && item.original_title !== item.title ? `<div style="font-size:0.72rem; color:var(--text-dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.original_title)}</div>` : ''}
                            
                            <div style="display:flex; align-items:center; gap:8px; margin-top:4px; font-size:0.72rem; color:#94a3b8;">
                                <span>📁 ${escapeHtml(item.folder || item.title)}</span>
                                <span>•</span>
                                <span>${escapeHtml(item.size_str)}</span>
                            </div>

                            <div style="margin-top:6px; height:4px; background:rgba(255,255,255,0.08); border-radius:2px; overflow:hidden;">
                                <div style="height:100%; width:${item.progress}%; background:${isDone ? '#10b981' : (isMissing ? '#f59e0b' : '#38bdf8')}; transition:width 0.3s ease;"></div>
                            </div>
                        </div>

                        <div style="display:flex; flex-direction:column; gap:5px; flex-shrink:0; align-items:flex-end;">
                            ${resumeBtnHtml}
                            <div style="display:flex; gap:4px;">
                                ${isYt ? `
                                    <button class="btn btn-primary yt-btn-sm" style="padding:4px 8px; font-size:0.72rem; background:linear-gradient(135deg, #ef4444, #dc2626);" onclick="playYouTubeFile('${escapedPath}')" title="បើកមើលវីដេអូ">▶ មើល</button>
                                    <button class="btn btn-secondary yt-btn-sm" style="padding:4px 8px; font-size:0.72rem;" onclick="openYouTubeFileFolder('${escapedPath}')" title="បើក Folder">📂</button>
                                    <button class="btn btn-secondary yt-btn-sm" style="padding:3px 6px; font-size:0.68rem; color:#fca5a5; background:rgba(239,68,68,0.12);" onclick="deleteYouTubeFile('${escapedPath}', '${escapedTitle}')" title="លុប">🗑️</button>
                                ` : `
                                    <button class="btn btn-primary yt-btn-sm" style="padding:4px 8px; font-size:0.72rem; background:linear-gradient(135deg, #f97316, #ea580c);" onclick="playDramaInVlc('${item.id}', '${escapedFolder}')" title="បើកមើលក្នុងកុំព្យូទ័រ (VLC)">▶ មើល</button>
                                    <button class="btn btn-secondary yt-btn-sm" style="padding:4px 8px; font-size:0.72rem;" onclick="openDramaFolder('${escapedFolder}')" title="បើក Folder">📂</button>
                                    <button class="btn btn-secondary yt-btn-sm" style="padding:3px 6px; font-size:0.68rem; color:#fca5a5; background:rgba(239,68,68,0.12);" onclick="deleteDramaFromLibrary('${item.id}', '${escapedTitle}')" title="លុប">🗑️</button>
                                `}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // ==========================================
        // CLEAN LIBRARY ACTION (សម្អាតរឿងដែលដោនរួច/ចាស់ៗ រក្សាទុករឿងកំពុងដោន)
        // ==========================================
        async function cleanLibraryAction() {
            if (!confirm('តើអ្នកពិតជាចង់សម្អាតបញ្ជីបណ្ណាល័យឬទេ?\n(រឿងដែលបានទាញយកចប់ ឬរឿងចាស់ៗពីមុននឹងត្រូវសម្អាតចេញពីបញ្ជី ចំណែករឿងដែលកំពុងដោនឡូតនឹងត្រូវបានរក្សាទុក)')) {
                return;
            }
            try {
                showToast('កំពុងសម្អាត...', '⏳');
                const res = await fetch('/dl/library/clean', { method: 'POST' });
                const data = await res.json();
                await loadUnifiedLibrary();
                const cleaned = (data && data.cleanedCount != null) ? data.cleanedCount : ((data && data.removedCount) || 0);
                const spared = (data && data.sparedCount) || 0;
                if (spared > 0) {
                    showToast(`✨ បានសម្អាត ${cleaned} រឿង! (រក្សាទុក ${spared} រឿងកំពុងដោនឡូត)`, '🧹');
                } else {
                    showToast(`✨ បានសម្អាត ${cleaned} រឿងរួចរាល់!`, '🧹');
                }
            } catch (e) {
                showToast('បរាជ័យក្នុងការសម្អាត: ' + e.message, '❌');
            }
        }
        window.cleanLibraryAction = cleanLibraryAction;

        // ==========================================
        // DOWNLOAD MEMORY HUB (ប្រភេទនាឡិកា 🕒 & POSTER GRID)
        // ==========================================
        window._downloadMemoryList = [];
        window._downloadMemorySearchQuery = '';

        function formatDaysAgoKhmer(dateInput) {
            if (!dateInput) return { relative: '🕒 ថ្មីៗនេះ', full: 'ថ្មីៗនេះ', days: 0 };
            const date = (typeof dateInput === 'number' || !isNaN(dateInput)) ? new Date(Number(dateInput)) : new Date(dateInput);
            if (isNaN(date.getTime())) return { relative: '🕒 ថ្មីៗនេះ', full: 'ថ្មីៗនេះ', days: 0 };

            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
            const diffDays = Math.round((startOfToday - startOfTarget) / (1000 * 60 * 60 * 24));

            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const mins = String(date.getMinutes()).padStart(2, '0');
            const dateStr = `${day}/${month}/${year}`;
            const timeStr = `${hours}:${mins}`;

            let relText = '';
            if (diffDays <= 0) {
                relText = '🕒 ថ្ងៃនេះ';
            } else if (diffDays === 1) {
                relText = '🕒 ម្សិលមិញ';
            } else {
                relText = `🕒 ${diffDays} ថ្ងៃមុន`;
            }
            return { relative: relText, full: `${dateStr} ${timeStr}`, dateStr, timeStr, days: diffDays };
        }
        window.formatDaysAgoKhmer = formatDaysAgoKhmer;

        async function loadDownloadMemory() {
            const grid = document.getElementById('drawerPosterMemoryGrid');
            const countBadge = document.getElementById('memGridCountBadge');
            const tabBadge = document.getElementById('drawerMemBadge');

            try {
                const res = await fetch('/api/download-memory');
                const data = await res.json();
                const items = (data && data.items) || [];
                window._downloadMemoryList = items;

                if (countBadge) countBadge.innerText = items.length;
                if (tabBadge) {
                    tabBadge.innerText = items.length;
                    tabBadge.style.display = items.length > 0 ? 'inline-block' : 'none';
                }

                renderDownloadMemoryGrid();
            } catch (e) {
                console.error('Error loading download memory:', e);
                if (grid) grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:30px; color:#ef4444;">⚠️ បរាជ័យក្នុងការផ្ទុកអង្គចងចាំ</div>`;
            }
        }
        window.loadDownloadMemory = loadDownloadMemory;

        function onDrawerDownloadMemorySearch(query) {
            window._downloadMemorySearchQuery = (query || '').toLowerCase().trim();
            renderDownloadMemoryGrid();
        }
        window.onDrawerDownloadMemorySearch = onDrawerDownloadMemorySearch;

        function renderDownloadMemoryGrid() {
            const grid = document.getElementById('drawerPosterMemoryGrid');
            if (!grid) return;

            let items = [...(window._downloadMemoryList || [])];
            const q = window._downloadMemorySearchQuery || '';

            if (q) {
                items = items.filter(it =>
                    (it.title && it.title.toLowerCase().includes(q)) ||
                    (it.khmer_title && it.khmer_title.toLowerCase().includes(q)) ||
                    (it.id && String(it.id).toLowerCase().includes(q)) ||
                    (it.platform && it.platform.toLowerCase().includes(q))
                );
            }

            if (items.length === 0) {
                grid.innerHTML = `
                    <div style="grid-column:1/-1; text-align:center; padding:40px 14px; background:rgba(255,255,255,0.02); border-radius:12px; border:1px dashed var(--border-glass); color:var(--text-dim);">
                        <div style="font-size:2.4rem; margin-bottom:8px;">🕒</div>
                        <div style="font-weight:700; color:#e2e8f0; font-size:0.92rem;">${q ? 'រកមិនឃើញក្នុងអង្គចងចាំទេ' : 'មិនទាន់មានទិន្នន័យក្នុងអង្គចងចាំការទាញយកនៅឡើយទេ'}</div>
                        <div style="font-size:0.75rem; color:#64748b; margin-top:4px;">រាល់ poster រឿង ឬវីដេអូ YouTube ដែលអ្នកបានចុច ឬទាញយក នឹងត្រូវកត់ត្រាទុកនៅទីនេះជាមួយកាលបរិច្ឆេទ</div>
                    </div>
                `;
                return;
            }

            grid.innerHTML = items.map(it => {
                const timeInfo = formatDaysAgoKhmer(it.timestamp || it.saved_at);
                const isYt = it.platform === 'youtube';
                let cover = it.cover || '';
                if (cover && !cover.startsWith('/img') && !cover.startsWith('/api') && /^https?:\/\//i.test(cover)) {
                    cover = `/img?url=${encodeURIComponent(cover)}`;
                }
                const displayTitle = it.khmer_title || it.title || 'Untitled';
                const platTag = (it.platform || 'hongguo').toUpperCase();

                let platBg = 'rgba(225, 29, 72, 0.25); color:#fda4af; border:1px solid rgba(225,29,72,0.45);';
                if (it.platform === 'haosou') platBg = 'rgba(79, 70, 229, 0.25); color:#a5b4fc; border:1px solid rgba(79,70,229,0.45);';
                if (it.platform === 'mvffm') platBg = 'rgba(190, 18, 60, 0.25); color:#fecdd3; border:1px solid rgba(190,18,60,0.45);';
                if (it.platform === 'youtube') platBg = 'rgba(239, 68, 68, 0.25); color:#fca5a5; border:1px solid rgba(239,68,68,0.45);';

                const safeId = String(it.id).replace(/'/g, "\\'");
                const safePlat = String(it.platform || 'hongguo').replace(/'/g, "\\'");
                const safeTitle = (it.title || '').replace(/'/g, "\\'");
                const safeUrl = (it.url || '').replace(/'/g, "\\'");

                return `
                    <div class="memory-poster-card" onclick="onMemoryCardClick('${safeId}', '${safePlat}', '${safeTitle}', '${safeUrl}')">
                        <div class="memory-poster-media">
                            <div class="memory-clock-badge" title="${escapeHtml(timeInfo.full)}">
                                ${escapeHtml(timeInfo.relative)}
                            </div>

                            <div class="memory-platform-badge" style="background:${platBg}">
                                ${platTag}
                            </div>

                            <button type="button" class="memory-item-delete-btn" onclick="deleteSingleMemoryItem('${safeId}', '${safePlat}', event)" title="លុបចេញពីអង្គចងចាំ">✕</button>

                            ${cover ? `
                                <img src="${cover}" alt="${escapeHtml(displayTitle)}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                <div style="display:none; align-items:center; justify-content:center; height:100%; color:#64748b; font-size:2rem;">${isYt ? '▶️' : '🎬'}</div>
                            ` : `
                                <div style="display:flex; align-items:center; justify-content:center; height:100%; color:#64748b; font-size:2rem;">${isYt ? '▶️' : '🎬'}</div>
                            `}
                        </div>
                        <div class="memory-poster-info">
                            <div class="memory-poster-title" title="${escapeHtml(displayTitle)}">
                                ${escapeHtml(displayTitle)}
                            </div>
                            ${it.title && it.title !== displayTitle ? `<div style="font-size:0.68rem; color:#94a3b8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(it.title)}">${escapeHtml(it.title)}</div>` : ''}
                            <div class="memory-poster-date" title="${escapeHtml(timeInfo.full)}">
                                <span>📅 ${escapeHtml(timeInfo.full)}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        window.renderDownloadMemoryGrid = renderDownloadMemoryGrid;

        function onMemoryCardClick(id, platform, title, url) {
            if (platform === 'hongguo') {
                if (typeof openDramaDetail === 'function') {
                    openDramaDetail(id);
                    toggleDownloadsDrawer(false);
                }
            } else if (platform === 'haosou') {
                if (typeof switchPlatform === 'function') switchPlatform('haosou');
                if (typeof analyzeHaoSouDrama === 'function') analyzeHaoSouDrama(id);
                toggleDownloadsDrawer(false);
            } else if (platform === 'mvffm') {
                if (typeof switchPlatform === 'function') switchPlatform('mvffm');
                if (typeof analyzeMvffmDrama === 'function') analyzeMvffmDrama(id);
                toggleDownloadsDrawer(false);
            } else if (platform === 'youtube') {
                if (typeof switchPlatform === 'function') switchPlatform('youtube');
                if (url) {
                    const ytInput = document.getElementById('ytUrlInput');
                    if (ytInput) ytInput.value = url;
                    if (typeof analyzeYouTubeVideo === 'function') analyzeYouTubeVideo();
                }
                toggleDownloadsDrawer(false);
            }
        }
        window.onMemoryCardClick = onMemoryCardClick;

        async function deleteSingleMemoryItem(id, platform, e) {
            if (e && e.stopPropagation) e.stopPropagation();
            try {
                await fetch('/api/download-memory/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, platform })
                });
                window._downloadMemoryList = (window._downloadMemoryList || []).filter(m => m.id !== id);
                const countBadge = document.getElementById('memGridCountBadge');
                const tabBadge = document.getElementById('drawerMemBadge');
                if (countBadge) countBadge.innerText = window._downloadMemoryList.length;
                if (tabBadge) {
                    tabBadge.innerText = window._downloadMemoryList.length;
                    tabBadge.style.display = window._downloadMemoryList.length > 0 ? 'inline-block' : 'none';
                }
                renderDownloadMemoryGrid();
                showToast('បានដកចេញពីអង្គចងចាំ', '🗑️');
            } catch (err) {
                console.error(err);
            }
        }
        window.deleteSingleMemoryItem = deleteSingleMemoryItem;

        async function clearDownloadMemoryAction() {
            if (!confirm('តើអ្នកពិតជាចង់សម្អាតប្រវត្តិអង្គចងចាំការទាញយកទាំងអស់មែនទេ?')) {
                return;
            }
            try {
                await fetch('/api/download-memory/clear', { method: 'POST' });
                window._downloadMemoryList = [];
                const countBadge = document.getElementById('memGridCountBadge');
                const tabBadge = document.getElementById('drawerMemBadge');
                if (countBadge) countBadge.innerText = '0';
                if (tabBadge) tabBadge.style.display = 'none';
                renderDownloadMemoryGrid();
                showToast('🧹 បានសម្អាតប្រវត្តិអង្គចងចាំការទាញយករួចរាល់!', '✨');
            } catch (err) {
                showToast('កំហុសពេលសម្អាត: ' + err.message, '❌');
            }
        }
        window.clearDownloadMemoryAction = clearDownloadMemoryAction;

        async function recordDownloadMemory(item) {
            if (!item || !item.id) return;
            try {
                const res = await fetch('/api/download-memory/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(item)
                });
                const data = await res.json();
                if (data && data.item) {
                    if (window._downloadMemoryList) {
                        window._downloadMemoryList = window._downloadMemoryList.filter(m => m.id !== data.item.id);
                        window._downloadMemoryList.unshift(data.item);
                        const countBadge = document.getElementById('memGridCountBadge');
                        const tabBadge = document.getElementById('drawerMemBadge');
                        if (countBadge) countBadge.innerText = window._downloadMemoryList.length;
                        if (tabBadge) {
                            tabBadge.innerText = window._downloadMemoryList.length;
                            tabBadge.style.display = window._downloadMemoryList.length > 0 ? 'inline-block' : 'none';
                        }
                        if (currentDrawerTab === 'memory') {
                            renderDownloadMemoryGrid();
                        }
                    }
                }
            } catch (e) {
                console.warn('recordDownloadMemory failed:', e);
            }
        }
        window.recordDownloadMemory = recordDownloadMemory;

        async function resumeMissingEpisodes(seriesId, platform, title, missingEps) {
            if (typeof requireActiveLicense === 'function' && !requireActiveLicense('ទាញយកភាគខ្វះ')) {
                return;
            }
            try {
                showToast(`🚀 កំពុងរៀបចំទាញយកភាគខ្វះសម្រាប់ "${title}"...`, '📥');
                const res = await fetch('/api/drama/download-missing', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        series_id: seriesId,
                        platform: platform || 'hongguo',
                        title: title,
                        missing_episodes: Array.isArray(missingEps) ? missingEps : []
                    })
                });
                const data = await res.json();
                if (!res.ok || !data.ok) throw new Error(data.message || 'Failed to resume missing episodes');

                showToast(`✅ ${data.message || 'បានបញ្ជូនភាគខ្វះទៅកាន់ការទាញយក!'}`, '🚀');
                switchDrawerTab('active');
                pollDownloadStatus();
            } catch (err) {
                showToast(`❌ បរាជ័យ: ${err.message}`, '❌');
            }
        }
        window.resumeMissingEpisodes = resumeMissingEpisodes;

        // ==========================================
        // SMART DUPLICATE PREVENTION CHECKER
        // ==========================================
        async function checkAndPromptDuplicate(seriesId, title, platform = 'hongguo', totalEpisodes = 0, onProceed) {
            try {
                const res = await fetch(`/api/drama/check-memory?id=${encodeURIComponent(seriesId)}&title=${encodeURIComponent(title || '')}&platform=${platform}&total=${totalEpisodes}`);
                const check = await res.json();

                // If never downloaded before, proceed immediately
                if (!check || !check.exists || check.downloaded_count === 0) {
                    if (typeof onProceed === 'function') onProceed({ mode: 'all' });
                    return;
                }

                const modal = document.getElementById('smartDownloadConfirmModal');
                if (!modal) {
                    if (typeof onProceed === 'function') onProceed({ mode: 'all' });
                    return;
                }

                const titleEl = document.getElementById('smartDlDramaTitle');
                const metaEl = document.getElementById('smartDlDramaMeta');
                const alertEl = document.getElementById('smartDlStatusAlert');
                const iconBox = document.getElementById('smartDlIconBox');
                const coverImg = document.getElementById('smartDlCoverImg');
                const actionBox = document.getElementById('smartDlActionButtons');

                if (titleEl) titleEl.innerText = title || check.title || 'Drama';
                if (coverImg) {
                    const drama = (window.allDramas || []).find(d => String(d.series_id) === String(seriesId));
                    if (drama && drama.cover) {
                        coverImg.src = `/img?url=${encodeURIComponent(drama.cover)}`;
                    } else {
                        coverImg.src = '';
                    }
                }
                if (metaEl) {
                    metaEl.innerHTML = `<span class="platform-tag-pill ${platform}">${platform.toUpperCase()}</span> • សរុប ${check.total_episodes || totalEpisodes} ភាគ • បានដោនរួច ${check.downloaded_count} ភាគ`;
                }

                // Case A: Fully Completed (បានចប់សព្វគ្រប់)
                if (check.is_completed || check.status === 'completed') {
                    if (iconBox) {
                        iconBox.style.background = 'rgba(16, 185, 129, 0.15)';
                        iconBox.style.borderColor = 'rgba(16, 185, 129, 0.35)';
                        iconBox.innerText = '✅';
                    }
                    if (alertEl) {
                        alertEl.innerHTML = `<span style="color:#34d399; font-weight:700;">✅ រឿងនេះបានទាញយកចប់សព្វគ្រប់រួចរាល់ហើយ!</span><br><span style="color:#94a3b8;">មានគ្រប់ចំនួន <b>${check.total_episodes}/${check.total_episodes} ភាគ</b> នៅក្នុង Folder <b>${escapeHtml(check.folder || '')}</b>។</span>`;
                    }
                    if (actionBox) {
                        actionBox.innerHTML = `
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                                <button type="button" class="btn btn-primary" style="justify-content:center; background:linear-gradient(135deg, #f97316, #ea580c);" onclick="closeSmartDownloadModal(); playDramaInVlc('${seriesId}', '${escapeHtml(check.folder || title)}');">
                                    ▶️ បើកមើលវីដេអូ
                                </button>
                                <button type="button" class="btn btn-secondary" style="justify-content:center;" onclick="closeSmartDownloadModal(); openDramaFolder('${escapeHtml(check.folder || title)}');">
                                    📂 បើក Folder
                                </button>
                            </div>
                            <button type="button" class="btn btn-secondary" style="justify-content:center; color:#fbbf24; border-color:rgba(245,158,11,0.3); margin-top:2px;" onclick="closeSmartDownloadModal(); if (typeof window._smartProceedCb === 'function') window._smartProceedCb({ mode: 'all' });">
                                🔄 ទាញយកម្ដងទៀត (Re-download)
                            </button>
                            <button type="button" class="btn btn-secondary" style="justify-content:center; color:#94a3b8;" onclick="closeSmartDownloadModal()">
                                ❌ បោះបង់ (កុំឲ្យដោនជាន់គ្នា)
                            </button>
                        `;
                    }
                } else {
                    // Case B: Partial / Missing Episodes (ខ្វះភាគ)
                    if (iconBox) {
                        iconBox.style.background = 'rgba(245, 158, 11, 0.15)';
                        iconBox.style.borderColor = 'rgba(245, 158, 11, 0.35)';
                        iconBox.innerText = '⚠️';
                    }
                    const missingList = check.missing_episodes || [];
                    const missingStr = missingList.slice(0, 10).join(', ') + (missingList.length > 10 ? '...' : '');

                    if (alertEl) {
                        alertEl.innerHTML = `<span style="color:#fbbf24; font-weight:700;">⚠️ រឿងនេះធ្លាប់បានទាញយកខ្លះហើយ (ខ្វះ ${check.missing_count} ភាគ)!</span><br><span style="color:#cbd5e1;">បានទាញយក: <b>${check.downloaded_count}/${check.total_episodes} ភាគ</b></span><br><span style="color:#f87171; font-size:0.73rem;">ភាគដែលនៅខ្វះ: [${missingStr}]</span>`;
                    }

                    if (actionBox) {
                        actionBox.innerHTML = `
                            <button type="button" class="btn btn-primary" style="justify-content:center; background:linear-gradient(135deg, #f59e0b, #d97706); color:#000; font-weight:800; font-size:0.86rem; padding:10px;" onclick="closeSmartDownloadModal(); resumeMissingEpisodes('${seriesId}', '${platform}', '${escapeHtml(title)}', ${JSON.stringify(missingList)});">
                                📥 ទាញយកតែភាគខ្វះ (${check.missing_count} ភាគ) - មិនដោនជាន់ភាគចាស់
                            </button>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                                <button type="button" class="btn btn-secondary" style="justify-content:center;" onclick="closeSmartDownloadModal(); openDramaFolder('${escapeHtml(check.folder || title)}');">
                                    📂 បើក Folder
                                </button>
                                <button type="button" class="btn btn-secondary" style="justify-content:center; color:#fbbf24;" onclick="closeSmartDownloadModal(); if (typeof window._smartProceedCb === 'function') window._smartProceedCb({ mode: 'all' });">
                                    ⬇️ ទាញយកទាំងអស់ឡើងវិញ
                                </button>
                            </div>
                            <button type="button" class="btn btn-secondary" style="justify-content:center; color:#94a3b8;" onclick="closeSmartDownloadModal()">
                                ❌ បោះបង់
                            </button>
                        `;
                    }
                }

                window._smartProceedCb = onProceed;
                modal.style.display = 'flex';
            } catch (e) {
                if (typeof onProceed === 'function') onProceed({ mode: 'all' });
            }
        }
        window.checkAndPromptDuplicate = checkAndPromptDuplicate;

        function closeSmartDownloadModal() {
            const modal = document.getElementById('smartDownloadConfirmModal');
            if (modal) modal.style.display = 'none';
            window._smartProceedCb = null;
        }
        window.closeSmartDownloadModal = closeSmartDownloadModal;

        async function openDramaFolder(folderName) {
            try {
                await fetch('/dl/open_folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folder: folderName, title: folderName })
                });
            } catch (e) {
                showToast('Error opening folder', '❌');
            }
        }

        async function playDramaInVlc(sid, folderName = '', episode = 0) {
            if (!sid && !folderName) return;
            try {
                showToast(currentLang === 'zh' ? '正在打开电脑播放器 (VLC)...' : (currentLang === 'km' ? 'កំពុងបើកក្នុងកុំព្យូទ័រ (VLC)...' : 'Opening in Media Player (VLC)...'), '🎬');
                const res = await fetch('/dl/library/play', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ series_id: sid, folder: folderName, title: folderName, episode: episode })
                });
                const data = await res.json();
                if (data.ok) {
                    showToast(currentLang === 'zh' ? `已在播放器中打开: ${data.filename}` : (currentLang === 'km' ? `បានបើកវីដេអូ: ${data.filename}` : `Opened: ${data.filename}`), '🎬');
                } else {
                    showToast(currentLang === 'zh' ? '未找到已下载的视频文件，请先下载！' : (currentLang === 'km' ? 'មិនទាន់មានវីដេអូបានដោនឡូតទេ សូមទាញយកជាមុនសិន!' : 'No downloaded video found. Please download first!'), '⚠️');
                }
            } catch (e) {
                showToast('Error playing video: ' + e.message, '❌');
            }
        }
        window.playDramaInVlc = playDramaInVlc;

        function playDramaDirectly(sid, folder = '') {
            playDramaInVlc(sid, folder);
        }
        window.playDramaDirectly = playDramaDirectly;

        function openCurrentDramaFolder(e) {
            if (e) e.stopPropagation();
            if (typeof currentSeries !== 'undefined' && currentSeries) {
                openDramaFolder(currentSeries.title || currentSeries.series_id);
            }
        }
        window.openCurrentDramaFolder = openCurrentDramaFolder;

        async function deleteDramaFromLibrary(sid, title) {
            if (!confirm(currentLang === 'zh' ? `确定要从本地库删除 "${title}" 吗？` : (currentLang === 'km' ? `តើអ្នកពិតជាចង់លុបរឿង "${title}" មែនទេ?` : `Are you sure you want to delete "${title}"?`))) {
                return;
            }
            try {
                const res = await fetch('/dl/library/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ series_id: sid, delete_files: true })
                });
                const data = await res.json();
                if (data.ok) {
                    showToast(currentLang === 'zh' ? '已删除短剧！' : (currentLang === 'km' ? 'បានលុបរឿងចេញពីបណ្ណាល័យ!' : 'Deleted drama from library!'), '🗑️');
                    loadUnifiedLibrary();
                    syncDownloadedSeriesCache();
                }
            } catch (e) {
                showToast('Error: ' + e.message, '❌');
            }
        }

        async function playYouTubeFile(filePath) {
            try {
                await fetch('/api/youtube/play', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: filePath })
                });
            } catch (e) {
                showToast('Error playing file: ' + e.message, '❌');
            }
        }

        async function openYouTubeFileFolder(filePath) {
            try {
                await fetch('/api/youtube/open_folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: filePath })
                });
            } catch (e) {
                showToast('Error opening folder: ' + e.message, '❌');
            }
        }

        async function deleteYouTubeFile(filePath, fileName) {
            if (!confirm(currentLang === 'zh' ? `确定要删除文件 "${fileName}" 吗？` : (currentLang === 'km' ? `តើអ្នកពិតជាចង់លុបឯកសារ "${fileName}" មែនទេ?` : `Are you sure you want to delete "${fileName}"?`))) {
                return;
            }
            try {
                const res = await fetch('/api/youtube/delete_file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: filePath })
                });
                const data = await res.json();
                if (data.ok) {
                    showToast(currentLang === 'zh' ? '已删除文件！' : (currentLang === 'km' ? 'បានលុបឯកសារ!' : 'Deleted file!'), '🗑️');
                    loadUnifiedLibrary();
                } else {
                    showToast('Failed to delete: ' + (data.error || 'Unknown'), '❌');
                }
            } catch (e) {
                showToast('Error: ' + e.message, '❌');
            }
        }

        async function openUnifiedFolder() {
            if (currentDrawerTab === 'library') {
                openDownloadFolder();
            } else {
                openDownloadFolder();
            }
        }

        async function cancelAllUnifiedDownloads() {
            try {
                await Promise.all([
                    fetch('/dl/cancel', { method: 'POST' }).catch(() => {}),
                    fetch('/api/youtube/cancel', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({})
                    }).catch(() => {})
                ]);
                showToast(currentLang === 'zh' ? '已取消全部下载！' : (currentLang === 'km' ? 'បានបោះបង់ការទាញយកទាំងអស់!' : 'Cancelled all downloads!'), '⚠️');
                pollDownloadStatus();
            } catch (e) {
                showToast('Cancel error: ' + e.message, '❌');
            }
        }

        async function cancelDownloads() {
            try {
                await fetch('/dl/cancel', { method: 'POST' });
                showToast('បានបោះបង់ការទាញយកទាំងអស់!', '⚠️');
                pollDownloadStatus();
            } catch (err) {
                showToast(`Error: ${err.message}`, '❌');
            }
        }

        async function retryAllFailedDownloads() {
            try {
                showToast('កំពុងចាប់ផ្តើម Retry ភាគដែលមិនទាន់រួច...', '🔄');
                const drawerItem = document.querySelector('.dl-series-item[data-sid]');
                const sid = drawerItem ? drawerItem.getAttribute('data-sid') : null;
                const payload = sid ? { series_id: sid } : {};
                const res = await fetch('/dl/retry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                showToast(data.message || 'បានចាប់ផ្តើម Retry!', '📥');
                pollDownloadStatus();
            } catch (err) {
                showToast(`Retry error: ${err.message}`, '❌');
            }
        }

        async function retrySeries(seriesId, title) {
            try {
                showToast(`កំពុង Retry "${title || 'Drama'}"...`, '🔄');
                const res = await fetch('/dl/retry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ series_id: seriesId })
                });
                const data = await res.json();
                showToast(`បានដាក់ "${title}" ទៅក្នុងជួរឡើងវិញ!`, '📥');
                pollDownloadStatus();
            } catch (err) {
                showToast(`Retry error: ${err.message}`, '❌');
            }
        }

        async function retrySingleEpisode(seriesId, vid, epIndex) {
            try {
                showToast(`កំពុង Retry EP${epIndex}...`, '🔄');
                await submitSingleEpisodeDownload(seriesId, vid, epIndex);
            } catch (err) {
                showToast(`Retry error: ${err.message}`, '❌');
            }
        }

        async function openDownloadFolder() {
            try {
                if (window.electronAPI && window.electronAPI.openFolder) {
                    await window.electronAPI.openFolder();
                    return;
                }
                await fetch('/dl/open_folder', { method: 'POST' });
            } catch (err) {
                showToast(`មិនអាចបើក Folder: ${err.message}`, '❌');
            }
        }

        // Library Modal
        async function openLibraryModal() {
            const modal = document.getElementById('libraryModal');
            modal.classList.add('active');
            const body = document.getElementById('libraryBody');
            body.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-dim);">កំពុងស្វែងរកឯកសារ...</div>';

            try {
                const res = await fetch('/dl/library');
                const items = await res.json();

                if (!items || items.length === 0) {
                    body.innerHTML = '<div style="text-align:center; padding:50px; color:var(--text-dim);">មិនទាន់មានរឿងដែលបានទាញយករួចនៅឡើយទេ។</div>';
                    return;
                }

                body.innerHTML = `
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:14px;">
                        ${items.map(item => `
                            <div class="lib-card">
                                <img class="lib-poster" src="${item.poster_url || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2264%22 height=%2285%22 fill=%22%23222%22><text x=%2250%%22 y=%2250%%22 fill=%22%23777%22 text-anchor=%22middle%22 font-size=%2210%22>No Poster</text></svg>'}">
                                <div class="lib-info">
                                    <div class="lib-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
                                    <div class="lib-meta">${item.episode_count} ភាគ • ${item.total_size_mb} MB</div>
                                    <div style="margin-top:8px; display:flex; gap:6px;">
                                        <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.75rem;" onclick="openLocalFolder('${escapeHtml(item.title)}')">📁 បើក</button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            } catch (err) {
                body.innerHTML = `<div style="color:var(--danger); text-align:center; padding:30px;">Error: ${err.message}</div>`;
            }
        }

        function closeLibraryModal() {
            document.getElementById('libraryModal').classList.remove('active');
        }

        async function openLocalFolder(title) {
            try {
                await fetch('/dl/open_folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: title })
                });
            } catch (e) {
                showToast('Error opening folder', '❌');
            }
        }

        let _latestUpdateData = null;

        // Settings Modal
        async function openSettingsModal() {
            const modal = document.getElementById('settingsModal');
            modal.classList.add('active');

            try {
                const res = await fetch('/dl/config');
                const cfg = await res.json();
                document.getElementById('settingsOutDir').value = cfg.output_dir || '';
                document.getElementById('settingsThreads').value = cfg.threads || 4;
                const repoInput = document.getElementById('settingsGithubRepo');
                if (repoInput) repoInput.value = cfg.github_repo || '';
                const verBadge = document.getElementById('settingsCurrentVersionBadge');
                if (verBadge && cfg.version) verBadge.innerText = `v${cfg.version}`;
                const statusText = document.getElementById('updateStatusText');
                if (statusText && cfg.version) {
                    statusText.innerText = `កម្មវិធីរបស់អ្នកជាកំណែចុងក្រោយបំផុតហើយ (v${cfg.version})`;
                }
                // Check in background silently
                checkAppUpdate(true);
                if (typeof checkAppLicenseStatus === 'function') {
                    checkAppLicenseStatus();
                }
            } catch (e) {
                // Ignore
            }
        }

        function closeSettingsModal() {
            document.getElementById('settingsModal').classList.remove('active');
        }

        async function browseDownloadFolder() {
            try {
                if (window.electronAPI && window.electronAPI.selectFolder) {
                    const selected = await window.electronAPI.selectFolder();
                    if (selected) {
                        document.getElementById('settingsOutDir').value = selected;
                        showToast('បានជ្រើសរើស Folder ថ្មី!', '📁');
                        return;
                    }
                }
                const res = await fetch('/dl/browse_folder', { method: 'POST' });
                const data = await res.json();
                if (data.status === 'success' && data.path) {
                    document.getElementById('settingsOutDir').value = data.path;
                    showToast('បានជ្រើសរើស Folder ថ្មី!', '📁');
                }
            } catch (e) {
                showToast('Error browsing folder', '❌');
            }
        }

        async function saveSystemSettings() {
            const threads = parseInt(document.getElementById('settingsThreads').value) || 4;
            const payload = { threads: threads };
            const repoInput = document.getElementById('settingsGithubRepo');
            if (repoInput && repoInput.value.trim()) {
                payload.github_repo = repoInput.value.trim();
            }
            try {
                await fetch('/dl/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                showToast('បានរក្សាទុកការកំណត់!', '✅');
                closeSettingsModal();
            } catch (e) {
                showToast('Error saving settings', '❌');
            }
        }

        // ==========================================
        // 1-Click Seamless Software Auto-Updater
        // ==========================================
        async function checkAppUpdate(silent = true) {
            const cardBox = document.getElementById('updateCardBox');
            const statusIcon = document.getElementById('updateStatusIcon');
            const statusText = document.getElementById('updateStatusText');
            const statusSub = document.getElementById('updateStatusSubtext');
            const btnAction = document.getElementById('btnAppUpdateAction');
            const btnIcon = document.getElementById('btnUpdateActionIcon');
            const btnText = document.getElementById('btnUpdateActionText');
            const changelogBox = document.getElementById('updateChangelogBox');
            const updateDot = document.getElementById('settingsUpdateDot');

            try {
                const res = await fetch('/api/update/check');
                const data = await res.json();
                _latestUpdateData = data;

                if (data && data.has_update) {
                    // 🌟 Update Available! Transform button to glowing emerald & clickable
                    if (cardBox) cardBox.className = 'card-update-active';
                    if (statusIcon) statusIcon.innerText = '✨';
                    if (statusText) {
                        statusText.innerHTML = `រកឃើញកំណែថ្មី <b style="color:#34d399;">v${escapeHtml(data.latest_version)}</b> ជាមួយមុខងារថ្មីៗ!`;
                    }
                    if (statusSub) {
                        statusSub.style.display = 'block';
                        statusSub.innerText = `កំណែបច្ចុប្បន្ន: v${data.current_version || '3.1.0'}`;
                    }
                    if (changelogBox && data.release_notes) {
                        changelogBox.innerText = data.release_notes;
                        changelogBox.style.display = 'block';
                    }
                    if (btnAction) {
                        btnAction.disabled = false;
                        btnAction.className = 'btn-update-action btn-update-active';
                    }
                    if (btnIcon) btnIcon.innerText = '⚡';
                    if (btnText) btnText.innerText = 'Update ឥឡូវនេះ';
                    if (updateDot) updateDot.style.display = 'block';

                    if (!silent) {
                        showToast(`រកឃើញកំណែថ្មី v${data.latest_version}! 🎉`, '✨');
                    }
                } else {
                    // ✅ Already up-to-date: Button is Disabled and Dimmed (cannot be clicked)
                    if (cardBox) cardBox.className = '';
                    if (statusIcon) statusIcon.innerText = '✅';
                    if (statusText) {
                        statusText.innerText = `កម្មវិធីរបស់អ្នកជាកំណែចុងក្រោយបំផុតហើយ (v${data.current_version || '3.1.0'})`;
                    }
                    if (statusSub) statusSub.style.display = 'none';
                    if (changelogBox) changelogBox.style.display = 'none';
                    if (btnAction) {
                        btnAction.disabled = true;
                        btnAction.className = 'btn-update-action btn-update-disabled';
                    }
                    if (btnIcon) btnIcon.innerText = '🔄';
                    if (btnText) btnText.innerText = 'Update';
                    if (updateDot) updateDot.style.display = 'none';

                    if (!silent) {
                        showToast('កម្មវិធីរបស់អ្នកជាកំណែចុងក្រោយបំផុតហើយ!', '✅');
                    }
                }
            } catch (err) {
                if (btnAction) {
                    btnAction.disabled = true;
                    btnAction.className = 'btn-update-action btn-update-disabled';
                }
            }
        }

        async function handleAppUpdateActionClick() {
            if (!_latestUpdateData || !_latestUpdateData.has_update) {
                return; // Disabled / cannot click
            }
            await applyAppUpdate();
        }

        async function applyAppUpdate() {
            if (!_latestUpdateData || !_latestUpdateData.download_url) {
                showToast('មិនមាន URL សម្រាប់ Update ឡើយ', '⚠️');
                return;
            }

            const btnAction = document.getElementById('btnAppUpdateAction');
            const btnIcon = document.getElementById('btnUpdateActionIcon');
            const btnText = document.getElementById('btnUpdateActionText');
            const cardBox = document.getElementById('updateCardBox');

            if (btnAction) {
                btnAction.disabled = true;
                btnAction.style.pointerEvents = 'none';
            }
            if (btnIcon) btnIcon.innerText = '⏳';
            if (btnText) btnText.innerText = 'កំពុងទាញយក...';

            try {
                const res = await fetch('/api/update/apply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        download_url: _latestUpdateData.download_url,
                        repo: _latestUpdateData.repo
                    })
                });

                const result = await res.json();
                if (result.status === 'success') {
                    showToast('បានធ្វើបច្ចុប្បន្នភាពកូដជោគជ័យ!', '🎉');
                    if (cardBox) {
                        cardBox.innerHTML = `
                            <div style="text-align:center; padding:12px 6px;">
                                <div style="font-size:1.05rem; font-weight:800; color:#34d399; margin-bottom:6px;">
                                    ✅ ធ្វើបច្ចុប្បន្នភាពកូដជោគជ័យ!
                                </div>
                                <div style="font-size:0.82rem; color:#cbd5e1; margin-bottom:12px;">
                                    បានដំឡើងកំណែ <b>v${escapeHtml(result.updated_version)}</b> រួចរាល់។ សូម Restart កម្មវិធីឥឡូវនេះ!
                                </div>
                                <button type="button" class="btn btn-primary" onclick="restartAppAfterUpdate()" style="height:38px; padding:0 20px; font-size:0.85rem; font-weight:800; background:linear-gradient(135deg, #2563eb, #1d4ed8); border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:8px;">
                                    <span>🔄</span> <span>Restart / Reload កម្មវិធីឥឡូវនេះ</span>
                                </button>
                            </div>
                        `;
                    }
                    const verBadge = document.getElementById('settingsCurrentVersionBadge');
                    if (verBadge && result.updated_version) {
                        verBadge.innerText = `v${result.updated_version}`;
                    }
                    const updateDot = document.getElementById('settingsUpdateDot');
                    if (updateDot) updateDot.style.display = 'none';
                } else {
                    throw new Error(result.error || 'បរាជ័យក្នុងការ Update');
                }
            } catch (err) {
                showToast(`បរាជ័យ: ${err.message}`, '❌');
                if (btnAction) {
                    btnAction.disabled = false;
                    btnAction.style.pointerEvents = 'auto';
                }
                if (btnIcon) btnIcon.innerText = '⚡';
                if (btnText) btnText.innerText = 'Update ម្តងទៀត';
            }
        }

        function toggleRepoConfig() {
            const panel = document.getElementById('repoConfigPanel');
            const link = document.getElementById('btnToggleRepoConfig');
            if (panel) {
                const isOpen = panel.style.display === 'block';
                panel.style.display = isOpen ? 'none' : 'block';
                if (link) link.innerHTML = isOpen ? '⚙️ កំណត់ GitHub Repo (Developer) ▾' : '⚙️ បិទការកំណត់ Repo ▴';
            }
        }

        async function saveDevRepo() {
            const repoInput = document.getElementById('settingsGithubRepo');
            const repo = repoInput ? repoInput.value.trim() : '';
            try {
                await fetch('/dl/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ github_repo: repo })
                });
                showToast('បានរក្សាទុក Repo ជោគជ័យ!', '✅');
                checkAppUpdate(false);
            } catch (e) {
                showToast('Error saving repo', '❌');
            }
        }

        function restartAppAfterUpdate() {
            if (window.electronAPI && window.electronAPI.relaunch) {
                window.electronAPI.relaunch();
            } else if (window.electronAPI && window.electronAPI.reload) {
                window.electronAPI.reload();
            } else {
                location.reload();
            }
        }

        function escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        // Silent background check for updates shortly after app launch
        setTimeout(() => {
            if (typeof checkAppUpdate === 'function') {
                checkAppUpdate(true);
            }
        }, 2500);

