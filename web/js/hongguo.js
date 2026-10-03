
        async function pasteHgFromClipboard() {
            const input = document.getElementById('searchInput');
            let text = '';
            // 1. Electron Native Desktop Clipboard (bypasses browser focus and security limits)
            if (window.electronAPI && typeof window.electronAPI.readClipboard === 'function') {
                try {
                    text = await window.electronAPI.readClipboard();
                } catch (err) {
                    console.warn('[Hongguo] Native clipboard read error:', err);
                }
            }
            // 2. Web Clipboard API Fallback
            if (!text && navigator.clipboard && navigator.clipboard.readText) {
                try {
                    text = await navigator.clipboard.readText();
                } catch (err) {
                    console.warn('[Hongguo] Web clipboard read error:', err);
                }
            }
            text = (text || '').trim();
            if (!text) {
                const emptyMsg = currentLang === 'zh' ? '剪贴板为空' : (currentLang === 'en' ? 'Clipboard is empty' : 'ក្តារតម្កល់ទទេ (Clipboard is empty)');
                showToast(emptyMsg, '📋');
                return;
            }
            if (input) {
                input.value = text;
                if (typeof onSearchInputChanged === 'function') {
                    onSearchInputChanged(text);
                }
                input.focus();
                const pastedMsg = currentLang === 'zh' ? '已成功粘贴！' : (currentLang === 'en' ? 'Pasted successfully!' : 'បានបិទភ្ជាប់ (Paste) ដោយជោគជ័យ!');
                showToast(pastedMsg, '📋');
                // នៅស្ងៀមមិនដំណើរការ auto ឡើយ (ដូច Ctrl+V) ទុកឱ្យអ្នកប្រើចុច Fetch ឬ ស្វែងរកតាមឈ្មោះ
            }
        }

        // State variables
        window.currentCategory = window.currentCategory || 'all';
        var currentCategory = window.currentCategory;
        let currentPage = 1;
        window.currentQuery = window.currentQuery || '';
        var currentQuery = window.currentQuery;
        let currentDetailSeries = null;
        let activeHeroDrama = null;
        window.allDramas = window.allDramas || [];
        var allDramas = window.allDramas;
        window.currentSeries = window.currentSeries || null;
        var currentSeries = window.currentSeries;
        window.currentEpisodes = window.currentEpisodes || [];
        var currentEpisodes = window.currentEpisodes;
        window.currentEpIndex = window.currentEpIndex || 1;
        var currentEpIndex = window.currentEpIndex;
        window.selectedEpisodes = window.selectedEpisodes || new Set();
        var selectedEpisodes = window.selectedEpisodes;
        window.currentDownloadedEps = window.currentDownloadedEps || new Set();
        var currentDownloadedEps = window.currentDownloadedEps;
        window.downloadedSeriesCache = window.downloadedSeriesCache || new Map();
        var downloadedSeriesCache = window.downloadedSeriesCache;

        function handleLogoClick(event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            const targetUrl = 'https://hongguoduanju.com/';
            if (window.electronAPI && window.electronAPI.openExternal) {
                window.electronAPI.openExternal(targetUrl);
            } else {
                window.open(targetUrl, '_blank');
            }
        }

        // ==========================================
        // STARRED / PINNED DRAMAS SYSTEM (⭐ ផ្កាយ)
        // ==========================================
        function getStarredDramas() {
            if (typeof getGlobalStarredDramas === 'function') {
                return getGlobalStarredDramas();
            }
            try {
                return JSON.parse(localStorage.getItem('hongguo_starred_dramas') || '[]');
            } catch (e) {
                return [];
            }
        }

        function saveStarredDramas(arr) {
            if (typeof saveGlobalStarredDramas === 'function') {
                saveGlobalStarredDramas(arr);
            } else {
                try {
                    localStorage.setItem('hongguo_starred_dramas', JSON.stringify(arr));
                } catch (e) {}
            }
            updateStarredBadge();
        }

        function updateStarredBadge() {
            if (typeof updateGlobalStarredBadge === 'function') {
                updateGlobalStarredBadge();
            }
        }


        function selectCategory(btn, cat) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            if (btn) btn.classList.add('active');
            currentCategory = cat;
            currentPage = 1;
            currentQuery = '';
            document.getElementById('searchInput').value = '';

            if (cat === 'starred') {
                if (typeof openGlobalStarredView === 'function') openGlobalStarredView();
                return;
            } else if (cat === 'library') {
                renderLibraryView();
                return;
            }
            loadCategory(cat);
        }

        async function loadCategory(cat, page = 1) {
            if (cat === 'starred') {
                if (typeof openGlobalStarredView === 'function') openGlobalStarredView();
                return;
            }
            if (cat === 'library') {
                renderLibraryView();
                return;
            }

            currentPage = page;
            const grid = document.getElementById('dramaGrid');
            const secTitle = document.getElementById('sectionTitle');
            const countText = document.getElementById('itemCountText');
            const loadMoreBtn = document.getElementById('btnLoadMore');
            const loadMoreContainer = document.getElementById('loadMoreContainer');

            if (loadMoreContainer) loadMoreContainer.style.display = 'flex';
            if (loadMoreBtn) loadMoreBtn.style.display = 'inline-flex';

            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:60px; color:var(--text-dim);"><div class="spinner" style="margin:0 auto 16px;"></div>កំពុងទាញយកទិន្នន័យពី hongguoduanju.com...</div>';

            secTitle.innerText = getSectionTitle(cat);

            try {
                let url = `/api/rank?category=${cat}&page=${page}&page_size=48`;
                const res = await fetch(url);
                const data = await res.json();
                let items = data.items || [];
                if (typeof shuffleArray === 'function' && page === 1) {
                    items = shuffleArray(items);
                }

                const countLabel = currentLang === 'zh' ? `显示 ${items.length} / 共 ${data.total || 360}+ 部短剧`
                    : (currentLang === 'en' ? `Showing ${items.length} of ${data.total || 360}+ dramas`
                    : `បង្ហាញ ${items.length} នៃ ${data.total || 360}+ រឿង`);
                if (countText) countText.innerText = countLabel;

                allDramas = items;
                window.allDramas = items;
                renderDramaGrid(items);
                setupPagination(data);
            } catch (err) {
                const errMsg = currentLang === 'zh' ? `数据加载失败: ${err.message}`
                    : (currentLang === 'en' ? `Failed to load data: ${err.message}`
                    : `បរាជ័យក្នុងការទាញយកទិន្នន័យ: ${err.message}`);
                grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--danger);">${errMsg}</div>`;
            }
        }

        function shuffleHongguoFeed() {
            if (currentCategory === 'starred' || currentCategory === 'library') {
                return; // NEVER touch Starred / PIN or downloaded library
            }
            if (allDramas && allDramas.length > 0) {
                if (typeof shuffleArray === 'function') {
                    allDramas = shuffleArray(allDramas);
                }
                renderDramaGrid(allDramas);
            } else {
                loadCategory(currentCategory || 'all', 1);
            }
        }
        window.shuffleHongguoFeed = shuffleHongguoFeed;


        // ==========================================
        // STARRED DRAMAS VIEW & SEQUENTIAL DOWNLOAD
        // ==========================================
        function renderStarredDramasView() {
            const grid = document.getElementById('dramaGrid');
            const secTitle = document.getElementById('sectionTitle');
            const pag = document.getElementById('pagination');
            const loadMoreContainer = document.getElementById('loadMoreContainer');
            const countText = document.getElementById('itemCountText');
            const dict = I18N_DICT[currentLang] || I18N_DICT['zh'];

            if (pag) pag.style.display = 'none';
            if (loadMoreContainer) loadMoreContainer.style.display = 'none';
            if (countText) countText.innerText = '';

            secTitle.innerText = dict.starredTitle;

            const starredList = getStarredDramas();
            if (!starredList || starredList.length === 0) {
                const emptyTitle = currentLang === 'zh' ? '暂无收藏短剧' : (currentLang === 'km' ? 'មិនទាន់មានរឿងបានដាក់ផ្កាយនៅឡើយទេ' : 'No starred dramas yet');
                const emptyDesc = currentLang === 'zh' ? '点击短剧海报右上角 ⭐ 即可收藏并批量下载或稍后观看！' : (currentLang === 'km' ? 'សូមចុចលើប៊ូតុង ⭐ ផ្កាយ នៅលើរូប Poster នៃរឿងណាមួយ ដើម្បី Pin ទុកទាញយកជាក្រុម ឬមើលនៅពេលក្រោយ!' : 'Click the ⭐ Star on any drama poster to pin and download later!');
                grid.innerHTML = `
                    <div style="grid-column:1/-1; text-align:center; padding:80px 20px; color:var(--text-dim);">
                        <div style="font-size:3.5rem; margin-bottom:14px; filter:drop-shadow(0 0 16px rgba(251,191,36,0.3));">⭐</div>
                        <h3 style="color:#f8fafc; font-size:1.25rem; font-weight:700; margin-bottom:8px;">${emptyTitle}</h3>
                        <p style="font-size:0.88rem; max-width:440px; margin:0 auto; line-height:1.6; color:#94a3b8;">
                            ${emptyDesc}
                        </p>
                    </div>
                `;
                return;
            }

            const checkAllLabel = currentLang === 'zh' ? '全选' : (currentLang === 'km' ? 'គ្រីសទាំងអស់' : 'Select All');
            const clearLabel = currentLang === 'zh' ? '🗑️ 清除所有收藏' : (currentLang === 'km' ? '🗑️ លុបផ្កាយទាំងអស់' : '🗑️ Clear All Starred');
            const dlSeqLabel = currentLang === 'zh' ? '🚀 顺序下载全部 (Sequential Download)' : (currentLang === 'km' ? '🚀 ទាញយកទាំងអស់តាមលំដាប់' : '🚀 Download All Sequentially');

            const headerToolbar = `
                <div style="grid-column: 1/-1; background: linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95)); border: 1px solid rgba(251, 191, 36, 0.35); border-radius: 14px; padding: 14px 20px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 14px; margin-bottom: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:700; font-size:0.9rem; color:#f8fafc; user-select:none;">
                            <input type="checkbox" id="hgStarredSelectAllCb" checked onchange="toggleSelectAllHongguoStarred(this.checked)" style="width:18px; height:18px; accent-color:#f59e0b; cursor:pointer;">
                            <span>${checkAllLabel} (<b id="selectedStarredCount" style="color:#fbbf24;">${starredList.length}</b>/${starredList.length})</span>
                        </label>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                        <button class="btn btn-secondary" onclick="clearAllHongguoStarredDramas()" style="padding:7px 14px; font-size:0.82rem; color:#f87171; border-color:rgba(239,68,68,0.35);">
                            ${clearLabel}
                        </button>
                        <button class="btn btn-primary" onclick="downloadAllSelectedStarredSequential()" style="padding:9px 20px; font-size:0.88rem; font-weight:800; background:linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #e11d48 100%); border:none; box-shadow:0 4px 18px rgba(245,158,11,0.45); cursor:pointer;">
                            ${dlSeqLabel}
                        </button>
                    </div>
                </div>
            `;

            const cardsHtml = starredList.map((item, idx) => {
                const posterUrl = item.cover ? `/img?url=${encodeURIComponent(item.cover)}` : '';
                const eps = item.eps || item.episode_cnt || 0;
                const memoryBadge = (typeof getCardMemoryBadgeHtml === 'function') ? getCardMemoryBadgeHtml(item.series_id, item.title) : '';

                return `
                    <div class="drama-card" id="starredCard_${item.series_id}" style="animation: fadeIn 0.25s ease;" onclick="openStreamPage('${item.series_id}')">
                        <div class="card-cover">
                            <img src="${posterUrl}" loading="lazy" alt="${escapeHtml(item.title)}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22280%22><rect width=%22100%%22 height=%22100%%22 fill=%22%23141c2c%22/><text x=%2250%%22 y=%2250%%22 fill=%22%2364748b%22 text-anchor=%22middle%22 font-family=%22sans-serif%22 font-size=%2214%22>Hongguo Drama</text></svg>'">
                            <span class="card-rank">#${idx + 1}</span>
                            <button class="star-btn starred" data-sid="${item.series_id}" onclick="event.stopPropagation(); toggleDramaStar('${item.series_id}', '${escapeHtml(item.title)}', '${item.cover||''}', ${eps}, '${escapeHtml(item.category||'')}')" title="★">★</button>
                            ${memoryBadge}
                            <div class="card-overlay">
                                <span class="card-eps">${eps} ${dict.cardEps}</span>
                                <span class="card-score">⭐ Pin</span>
                            </div>
                        </div>
                        <div class="card-body">
                            <div style="display:flex; align-items:flex-start; gap:8px;">
                                <input type="checkbox" class="starred-drama-checkbox" value="${item.series_id}" checked onclick="event.stopPropagation()" onchange="updateSelectedStarredCount()" style="width:17px; height:17px; accent-color:#f59e0b; cursor:pointer; margin-top:2px;">
                                <div style="min-width:0; flex:1;">
                                    <h4 class="card-title" data-original-title="${escapeHtml(item.title)}" title="${escapeHtml(getDisplayTitle(item.title))}">${escapeHtml(getDisplayTitle(item.title))}</h4>
                                    <div class="card-meta">
                                        <span>${escapeHtml(getDisplayCategory(item.category))}</span>
                                        <span style="color:#fbbf24;">⭐ ${currentLang === 'zh' ? '已收藏' : (currentLang === 'km' ? 'បាន Pin' : 'Pinned')}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="card-actions" onclick="event.stopPropagation()">
                                <button class="btn-card btn-card-play" onclick="openStreamPage('${item.series_id}')">
                                    <span>▶</span> ${dict.cardPlay.replace('▶ ', '')}
                                </button>
                                <button class="btn-card" onclick="downloadSingleStarredSeries('${item.series_id}', '${escapeHtml(item.title)}', '${item.cover||''}')">
                                    <span>📥</span> ${dict.cardDownload.replace('📥 ', '')}
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            grid.innerHTML = headerToolbar + cardsHtml;
            updateSelectedStarredCount();
            applyDramaTitlesTranslation();
        }

        function toggleSelectAllHongguoStarred(isChecked) {
            document.querySelectorAll('.starred-drama-checkbox').forEach(cb => {
                cb.checked = isChecked;
            });
            updateSelectedStarredCount();
        }

        function updateSelectedStarredCount() {
            const checked = document.querySelectorAll('.starred-drama-checkbox:checked').length;
            const badge = document.getElementById('selectedStarredCount');
            if (badge) badge.innerText = checked;
            const masterCb = document.getElementById('hgStarredSelectAllCb');
            const total = document.querySelectorAll('.starred-drama-checkbox').length;
            if (masterCb && total > 0) {
                masterCb.checked = (checked === total);
            }
        }

        function clearAllHongguoStarredDramas() {
            if (!confirm('តើអ្នកពិតជាចង់លុបរឿងចេញពីបញ្ជីផ្កាយទាំងអស់មែនទេ?')) return;
            saveStarredDramas([]);
            renderStarredDramasView();
            showToast('បានលុបបញ្ជីផ្កាយទាំងអស់!', '🗑️');
        }

        async function downloadSingleStarredSeries(sid, title, cover) {
            try {
                const activeMode = (typeof window.getActiveDownloadMode === 'function') ? window.getActiveDownloadMode() : 'merged';
                showToast(`កំពុងដាក់ "${title}" ទៅក្នុងជួរទាញយក...`, '📥');
                const res = await fetch('/dl/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        series_id: sid,
                        title: title || 'Drama',
                        cover_url: cover || '',
                        range: 'all',
                        download_mode: activeMode
                    })
                });
                const data = await res.json();
                showToast(`✓ បានដាក់ "${title}" ទៅក្នុងជួរទាញយក!`, '📥');
                toggleDownloadsDrawer(true, 'active');
                if (typeof pollDownloadStatus === 'function') pollDownloadStatus();
                if (typeof startDownloadPolling === 'function') startDownloadPolling();
            } catch (err) {
                showToast(`បញ្ហាទាញយក: ${err.message}`, '❌');
            }
        }

        async function downloadAllSelectedStarredSequential() {
            const checkedCbs = Array.from(document.querySelectorAll('.starred-drama-checkbox:checked'));
            if (!checkedCbs || checkedCbs.length === 0) {
                showToast('សូមគ្រីសរើសរឿងដែលចង់ទាញយកជាមុន!', '⚠️');
                return;
            }

            const activeMode = (typeof window.getActiveDownloadMode === 'function') ? window.getActiveDownloadMode() : 'merged';
            const sids = checkedCbs.map(cb => cb.value);
            try {
                showToast(`កំពុងដាក់ ${sids.length} រឿងទៅក្នុងជួរទាញយកតាមលំដាប់...`, '📥');
                const res = await fetch('/dl/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ series_ids: sids, download_mode: activeMode })
                });
                const data = await res.json();
                showToast(`✓ បានដាក់ ${sids.length} រឿងទៅក្នុងជួរ! ពេលចប់មួយរឿង នឹងលោតចូលមួយរឿងបន្ទាប់ដោយស្វ័យប្រវត្តិ។`, '🚀');
                toggleDownloadsDrawer(true, 'active');
                if (typeof pollDownloadStatus === 'function') pollDownloadStatus();
                if (typeof startDownloadPolling === 'function') startDownloadPolling();
            } catch (err) {
                showToast(`បញ្ហាទាញយក: ${err.message}`, '❌');
            }
        }

        let isLoadingMore = false;
        async function loadMoreDramas() {
            if (isLoadingMore) return;
            const btn = document.getElementById('btnLoadMore');
            isLoadingMore = true;
            if (btn) btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;margin-right:6px;"></div> កំពុងផ្ទុកបន្ថែម...';

            currentPage++;
            try {
                const url = `/api/rank?category=${currentCategory}&page=${currentPage}&page_size=48`;
                const res = await fetch(url);
                const data = await res.json();
                const newItems = data.items || [];
                if (newItems.length > 0) {
                    allDramas = allDramas.concat(newItems);
                    appendDramaCards(newItems);
                    const countText = document.getElementById('itemCountText');
                    if (countText) countText.innerText = `បង្ហាញ ${allDramas.length} នៃ ${data.total || 360}+ រឿង`;
                    setupPagination(data);
                    showToast(`✓ បានផ្ទុកបន្ថែម ${newItems.length} រឿងថ្មី!`);
                } else {
                    showToast('អស់រឿងក្នុងបញ្ជីនេះហើយ!');
                    if (btn) btn.style.display = 'none';
                }
            } catch (err) {
                showToast('⚠️ បរាជ័យក្នុងការផ្ទុកបន្ថែម: ' + err.message);
            } finally {
                isLoadingMore = false;
                if (btn) btn.innerHTML = '<span>📥</span> <span>ផ្ទុកបន្ថែម ៤៨ រឿងទៀត (Load More Dramas)</span>';
            }
        }

        function appendDramaCards(items) {
            const grid = document.getElementById('dramaGrid');
            if (!grid || !items || !items.length) return;
            const offset = allDramas.length - items.length;
            const html = items.map((item, idx) => {
                const posterUrl = item.cover ? `/img?url=${encodeURIComponent(item.cover)}` : '';
                const eps = item.episode_cnt || 0;
                const score = item.score || '9.8';
                const rank = offset + idx + 1;
                const isStarred = (typeof isDramaStarred === 'function') ? isDramaStarred(item.series_id) : false;
                const memoryBadge = (typeof getCardMemoryBadgeHtml === 'function') ? getCardMemoryBadgeHtml(item.series_id, item.title) : '';

                return `
                    <div class="drama-card" onclick="openStreamPage('${item.series_id}')" style="animation: fadeIn 0.3s ease;">
                        <div class="card-cover">
                            <img src="${posterUrl}" loading="lazy" alt="${escapeHtml(item.title)}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22280%22><rect width=%22100%%22 height=%22100%%22 fill=%22%23141c2c%22/><text x=%2250%%22 y=%2250%%22 fill=%22%2364748b%22 text-anchor=%22middle%22 font-family=%22sans-serif%22 font-size=%2214%22>Hongguo Drama</text></svg>'">
                            <span class="card-rank">#${rank}</span>
                            <button class="star-btn ${isStarred ? 'starred' : ''}" data-sid="${item.series_id}" onclick="event.stopPropagation(); toggleDramaStar('${item.series_id}', '${escapeHtml(item.title)}', '${item.cover||''}', ${eps}, '${escapeHtml(getDisplayCategory(item.category))}')" title="ចុចផ្កាយ/Pin រឿងនេះ">${isStarred ? '★' : '☆'}</button>
                            ${memoryBadge}
                            <div class="card-overlay">
                                <span class="card-eps">${eps} ភាគ</span>
                                <span class="card-score">⭐ ${score}</span>
                            </div>
                        </div>
                        <div class="card-body">
                            <div>
                                <h4 class="card-title" data-original-title="${escapeHtml(item.title)}" title="${escapeHtml(getDisplayTitle(item.title))}">${escapeHtml(getDisplayTitle(item.title))}</h4>
                                <div class="card-meta">
                                    <span>${escapeHtml(getDisplayCategory(item.category))}</span>
                                    <span style="color:#fb7185;">${item.status === 'completed' ? 'ចប់' : 'កំពុងផ្សាយ'}</span>
                                </div>
                            </div>
                            <div class="card-actions">
                                <button class="card-btn-play" onclick="event.stopPropagation(); openStreamPage('${item.series_id}')">▶ មើល</button>
                                <button class="card-btn-dl" onclick="event.stopPropagation(); openDramaDetail('${item.series_id}')">📥 ទាញយក</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            grid.insertAdjacentHTML('beforeend', html);
            applyDramaTitlesTranslation();
        }

        function extractClientSeriesId(text) {
            if (!text) return null;
            const cleaned = String(text).trim().replace(/^['"]+|['"]+$/g, '');
            // 1. Direct series ID (pure numbers of 8 to 22 digits)
            if (/^\d{8,22}$/.test(cleaned)) return cleaned;
            // 2. URL path like /drama/7377540209210035251 or /detail/7377540209210035251
            const mPath = cleaned.match(/(?:drama|series|detail|play|video|book)[\/=](\d{8,22})/i);
            if (mPath) return mPath[1];
            // 3. Query params like ?series_id=... or &id=...
            const mParam = cleaned.match(/[?&](?:series_id|book_id|drama_id|id)=(\d{8,22})/i);
            if (mParam) return mParam[1];
            // 4. Typical 19-digit Hongguo ID starting with 7
            const mHongguo = cleaned.match(/\b(7\d{17,19})\b/);
            if (mHongguo) return mHongguo[1];
            // 5. Any 15-22 digit sequence
            const mLong = cleaned.match(/\b(\d{15,22})\b/);
            if (mLong) return mLong[1];
            return null;
        }

        function isDramaLinkOrId(str) {
            if (!str) return false;
            const s = str.trim();
            // 1. Direct series ID
            if (/^\d{8,22}$/.test(s)) return true;
            // 2. Extracted series ID
            if (extractClientSeriesId(s)) return true;
            // 3. Web URLs (http:// or https:// or www.)
            if (/^(?:https?:\/\/|www\.)/i.test(s)) return true;
            // 4. Known drama website domains
            if (/(?:hongguoduanju\.com|fanqienovel\.com|snssdk\.com|haosou\.cc|mvffm\.com|youtube\.com|youtu\.be)/i.test(s)) return true;
            return false;
        }

        function checkAndRouteOtherPlatforms(rawVal) {
            if (!rawVal) return false;
            const val = rawVal.trim();
            // 1. YouTube
            if (/(?:youtube\.com|youtu\.be)/i.test(val)) {
                switchPlatform('youtube');
                const ytInp = document.getElementById('ytUrlInput');
                if (ytInp) ytInp.value = val;
                if (typeof analyzeCurrentYtUrl === 'function') analyzeCurrentYtUrl(val);
                return true;
            }
            // 2. MVFFM
            if (typeof isMvffmUrl === 'function' && isMvffmUrl(val)) {
                const inputEl = document.getElementById('searchInput');
                if (inputEl) inputEl.value = '';
                switchPlatform('mvffm');
                const mvInp = document.getElementById('mvDramaInput');
                if (mvInp) mvInp.value = val;
                if (typeof analyzeMvffmDrama === 'function') analyzeMvffmDrama(val);
                return true;
            }
            // 3. HaoSou
            if (/(?:haosou\.cc|haosou)/i.test(val)) {
                const inputEl = document.getElementById('searchInput');
                if (inputEl) inputEl.value = '';
                switchPlatform('haosou');
                const hsInp = document.getElementById('haosouInput');
                if (hsInp) hsInp.value = val;
                if (typeof analyzeHaoSouDrama === 'function') analyzeHaoSouDrama(val);
                return true;
            }
            return false;
        }

        function handleSearchInputPaste(event) {
            // Stay silent: do not jump to other platforms or auto-analyze.
            // User must explicitly click Fetch / Search or press Enter.
        }

        function onSearchInputChanged(val) {
            const trimmed = (val || '').trim();
            const btnClear = document.getElementById('btnClearSearch');
            if (btnClear) {
                btnClear.style.display = trimmed.length > 0 ? 'block' : 'none';
            }
            const isLink = isDramaLinkOrId(trimmed);
            const btnFetch = document.getElementById('btnFetchLink');
            const btnSearch = document.getElementById('btnSearchTitle');
            if (!btnFetch || !btnSearch) return;

            if (isLink) {
                btnFetch.classList.add('highlighted');
                btnSearch.classList.remove('highlighted');
            } else if (trimmed.length > 0) {
                btnFetch.classList.remove('highlighted');
                btnSearch.classList.add('highlighted');
            } else {
                btnFetch.classList.remove('highlighted');
                btnSearch.classList.remove('highlighted');
            }
        }

        function clearSearchInput() {
            const inputEl = document.getElementById('searchInput');
            if (inputEl) {
                inputEl.value = '';
                inputEl.focus();
                onSearchInputChanged('');
            }
        }

        function onSearchKeyDown(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = (document.getElementById('searchInput').value || '').trim();
                if (isDramaLinkOrId(val)) {
                    executeFetchLink();
                } else {
                    executeSearchTitle();
                }
            }
        }

        // Feature 1: Fetch via Direct Link or Series ID
        async function executeFetchLink() {
            const inputEl = document.getElementById('searchInput');
            const rawVal = (inputEl ? inputEl.value : '').trim();
            if (!rawVal) {
                const msg = currentLang === 'zh' ? '⚠️ 请输入短剧片名或粘贴链接！'
                    : (currentLang === 'en' ? '⚠️ Please enter title or paste link!'
                    : '⚠️ សូមវាយបញ្ចូលឈ្មោះរឿង ឬ Paste Link ជាមុនសិន!');
                showToast(msg, '⚠️');
                if (inputEl) inputEl.focus();
                return;
            }

            // Auto-detect other platforms (YouTube, MVFFM, HaoSou)
            if (checkAndRouteOtherPlatforms(rawVal)) return;

            // If user entered drama title and clicked Fetch -> warn user to click Search Title!
            if (!isDramaLinkOrId(rawVal)) {
                const dict = (typeof I18N_DICT !== 'undefined' && I18N_DICT[currentLang]) ? I18N_DICT[currentLang] : {};
                const warnMsg = dict.alertTitleInFetch || '⚠️ នេះជាឈ្មោះរឿង! សូមចុចប៊ូតុង【🔍 ស្វែងរកតាមឈ្មោះ】!';
                showToast(warnMsg, '⚠️');
                const btnSearch = document.getElementById('btnSearchTitle');
                if (btnSearch) {
                    btnSearch.classList.add('highlighted');
                    btnSearch.focus();
                }
                return;
            }

            const sid = extractClientSeriesId(rawVal) || (rawVal.match(/\d{8,}/) ? rawVal.match(/\d{8,}/)[0] : null);
            if (sid) {
                // Ensure we are on browse view to show the poster first!
                showHomeView();
                const grid = document.getElementById('dramaGrid');
                const secTitle = document.getElementById('sectionTitle');
                const countText = document.getElementById('itemCountText');

                const loadMsg = currentLang === 'zh' ? '⚡ 正在从服务器提取短剧海报与信息...'
                    : (currentLang === 'en' ? '⚡ Fetching drama poster & details from server...'
                    : '⚡ កំពុងទាញយក Poster និងព័ត៌មានរឿង...');
                showToast(loadMsg, '⚡');

                if (secTitle) {
                    secTitle.innerText = currentLang === 'zh' ? '⚡ 正在提取短剧...'
                        : (currentLang === 'en' ? '⚡ Fetching Drama...'
                        : '⚡ កំពុងទាញយកព័ត៌មានរឿង...');
                }
                if (grid) {
                    grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:60px; color:var(--text-dim);"><div class="spinner" style="margin:0 auto 16px;"></div>${loadMsg}</div>`;
                }

                try {
                    const res = await fetch(`/api/series/${sid}`);
                    if (res.status === 403) {
                        if (typeof requireActiveLicense === 'function') {
                            requireActiveLicense('ទាញយកព័ត៌មានរឿង HongGuo');
                        }
                        if (grid) grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--danger);">${currentLang === 'zh' ? '需要激活 License 才能访问' : (currentLang === 'en' ? 'Active license required' : 'ត្រូវការ License ដើម្បីដំណើរការ')}</div>`;
                        return;
                    }
                    const data = await res.json();
                    if (!data || !data.series_id) {
                        // If direct ID fetch failed, try title search fallback
                        console.log('[Hongguo] 💡 Fetch by ID failed, falling back to title search for:', rawVal);
                        return executeSearchTitle();
                    }

                    const dramaItem = {
                        series_id: String(data.series_id || sid),
                        title: data.title || `Drama ${sid}`,
                        cover: data.cover || '',
                        episode_cnt: data.episode_cnt || (data.episodes ? data.episodes.length : 0),
                        score: data.score || '9.8',
                        rank: 1,
                        category: data.category || '短剧',
                        intro: data.intro || ''
                    };
                    allDramas = [dramaItem];
                    currentQuery = dramaItem.title;

                    if (secTitle) {
                        secTitle.innerText = currentLang === 'zh' ? `⚡ 提取结果: "${dramaItem.title}"`
                            : (currentLang === 'en' ? `⚡ Fetched: "${dramaItem.title}"`
                            : `⚡ លទ្ធផល Fetch: "${getDisplayTitle(dramaItem.title)}"`);
                    }
                    if (countText) {
                        countText.innerText = currentLang === 'zh' ? '1 部短剧（点击封面海报即可播放）'
                            : (currentLang === 'en' ? '1 Drama (Click poster to play)'
                            : '១ រឿង (ចុចលើរូប Poster ដើម្បីចាក់មើល)');
                    }
                    renderDramaGrid([dramaItem]);
                    const pag = document.getElementById('pagination');
                    if (pag) pag.style.display = 'none';
                    const lmc = document.getElementById('loadMoreContainer');
                    if (lmc) lmc.style.display = 'none';

                    const targetSec = document.getElementById('dramaSection') || document.getElementById('sectionTitle');
                    if (targetSec) targetSec.scrollIntoView({ behavior: 'smooth', block: 'start' });

                    showToast(currentLang === 'zh' ? '✓ 提取成功！请点击封面海报观看' : (currentLang === 'en' ? '✓ Fetched! Click poster to play' : '✓ ទាញយកបានជោគជ័យ! សូមចុចលើរូប Poster ដើម្បីមើល'), '🎬');
                    return;
                } catch (err) {
                    showToast('⚠️ Error: ' + err.message, '⚠️');
                    if (grid) grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--danger);">Error: ${err.message}</div>`;
                    return;
                }
            }

            // Fallback: If no series ID could be extracted from link, search the text
            return executeSearchTitle();
        }

        // Feature 2: Search via Drama Title
        async function executeSearchTitle() {
            const inputEl = document.getElementById('searchInput');
            const kw = (inputEl ? inputEl.value : '').trim();
            if (!kw) {
                const msg = currentLang === 'zh' ? '⚠️ 请输入短剧片名或粘贴链接！'
                    : (currentLang === 'en' ? '⚠️ Please enter drama title or paste link!'
                    : '⚠️ សូមវាយចំណងជើងរឿង ឬ Paste Link ដើម្បីស្វែងរក!');
                showToast(msg, '⚠️');
                if (inputEl) inputEl.focus();
                return;
            }

            // Auto-detect other platforms (YouTube, MVFFM, HaoSou)
            if (checkAndRouteOtherPlatforms(kw)) return;

            // If user entered Link/ID and clicked Search Title -> warn user to click Fetch!
            if (isDramaLinkOrId(kw)) {
                const dict = (typeof I18N_DICT !== 'undefined' && I18N_DICT[currentLang]) ? I18N_DICT[currentLang] : {};
                const warnMsg = dict.alertLinkInSearch || '⚠️ នេះជា Link/ID! មិនអាចស្វែងរកបានទេ។ សូមចុចប៊ូតុង【⚡ Fetch】!';
                showToast(warnMsg, '⚠️');
                const btnFetch = document.getElementById('btnFetchLink');
                if (btnFetch) {
                    btnFetch.classList.add('highlighted');
                    btnFetch.focus();
                }
                return;
            }

            currentQuery = kw;
            currentPage = 1;
            const grid = document.getElementById('dramaGrid');
            const secTitle = document.getElementById('sectionTitle');
            const countText = document.getElementById('itemCountText');

            const sTitle = currentLang === 'zh' ? `🔍 搜索结果: "${kw}"`
                : (currentLang === 'en' ? `🔍 Search Results: "${kw}"`
                : `🔍 លទ្ធផលស្វែងរក: "${kw}"`);
            if (secTitle) secTitle.innerText = sTitle;

            const waitMsg = currentLang === 'zh' ? '正在从服务器搜索短剧...'
                : (currentLang === 'en' ? 'Searching dramas from server...'
                : 'កំពុងស្វែងរករឿងពី server...');
            if (grid) grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:60px; color:var(--text-dim);"><div class="spinner" style="margin:0 auto 16px;"></div>${waitMsg}</div>`;

            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(kw)}&page=1&page_size=48`);
                const data = await res.json();
                const items = data.items || [];
                
                const foundMsg = currentLang === 'zh' ? `找到 ${items.length} 部相关短剧`
                    : (currentLang === 'en' ? `Found ${items.length} dramas`
                    : `${items.length} រឿងត្រូវបានរកឃើញ`);
                if (countText) countText.innerText = foundMsg;

                allDramas = items;
                renderDramaGrid(items);
                const pag = document.getElementById('pagination');
                if (pag) pag.style.display = 'none';
                const lmc = document.getElementById('loadMoreContainer');
                if (lmc) lmc.style.display = 'none';
            } catch (err) {
                if (grid) grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--danger);">Search Error: ${err.message}</div>`;
            }
        }

        async function executeSearch() {
            return executeSearchTitle();
        }

        function setupHeroBanner(drama) {
            activeHeroDrama = drama;
            const heroTitleEl = document.getElementById('heroTitle');
            if (heroTitleEl) {
                heroTitleEl.innerText = (currentLang === 'zh' ? drama.title : getDisplayTitle(drama.title)) || 'Hongguo Drama';
                heroTitleEl.setAttribute('data-original-title', drama.title || '');
            }
            if (currentLang !== 'zh' && drama.title) {
                queueTitleTranslation(drama.title);
            }
            document.getElementById('heroDesc').innerText = drama.intro || 'ទាញយក និងចាក់មើលរឿងពេញនិយមពី hongguoduanju.com ក្នុងកម្រិតច្បាស់ 1080p។';
        }

        
        function openHeroStream() {
            if (activeHeroDrama) {
                openStreamPage(activeHeroDrama.series_id, false, 1);
            }
        }
        function openHeroDetail() {
            if (activeHeroDrama) {
                openDramaDetail(activeHeroDrama.series_id);
            }
        }

        function renderDramaGrid(items) {
            const grid = document.getElementById('dramaGrid');
            const dict = I18N_DICT[currentLang] || I18N_DICT['zh'];
            if (!items || items.length === 0) {
                grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:60px; color:var(--text-dim);">${currentLang === 'zh' ? '暂无短剧' : (currentLang === 'km' ? 'មិនមានរឿងក្នុងបញ្ជីនេះទេ' : 'No dramas found')}</div>`;
                return;
            }

            grid.innerHTML = items.map((item, idx) => {
                const posterUrl = item.cover ? `/img?url=${encodeURIComponent(item.cover)}` : '';
                const eps = item.episode_cnt || 0;
                const score = item.score || '9.8';
                const rank = item.rank || (idx + 1);
                const isStarred = (typeof isDramaStarred === 'function') ? isDramaStarred(item.series_id) : false;
                const memoryBadge = (typeof getCardMemoryBadgeHtml === 'function') ? getCardMemoryBadgeHtml(item.series_id, item.title) : '';

                return `
                    <div class="drama-card" onclick="openStreamPage('${item.series_id}')">
                        <div class="card-cover">
                            <img src="${posterUrl}" loading="lazy" alt="${escapeHtml(item.title)}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22280%22><rect width=%22100%%22 height=%22100%%22 fill=%22%23141c2c%22/><text x=%2250%%22 y=%2250%%22 fill=%22%2364748b%22 text-anchor=%22middle%22 font-family=%22sans-serif%22 font-size=%2214%22>Hongguo Drama</text></svg>'">
                            <span class="card-rank">#${rank}</span>
                            <button class="star-btn ${isStarred ? 'starred' : ''}" data-sid="${item.series_id}" onclick="event.stopPropagation(); toggleDramaStar('${item.series_id}', '${escapeHtml(item.title)}', '${item.cover||''}', ${eps}, '${escapeHtml(getDisplayCategory(item.category))}')" title="${isStarred ? '★' : '☆'}">${isStarred ? '★' : '☆'}</button>
                            ${memoryBadge}
                            <div class="card-overlay">
                                <span class="card-eps">${eps} ${dict.cardEps}</span>
                                <span class="card-score">⭐ ${score}</span>
                            </div>
                        </div>
                        <div class="card-body">
                            <div>
                                <h4 class="card-title" data-original-title="${escapeHtml(item.title)}" title="${escapeHtml(getDisplayTitle(item.title))}">${escapeHtml(getDisplayTitle(item.title))}</h4>
                                <div class="card-meta">
                                    <span>${escapeHtml(getDisplayCategory(item.category))}</span>
                                    <span style="color:#fb7185;">${item.status === 'completed' ? dict.cardCompleted : dict.cardOngoing}</span>
                                </div>
                            </div>
                            <div class="card-actions" onclick="event.stopPropagation()">
                                <button class="btn-card btn-card-play" onclick="quickPlay('${item.series_id}')">
                                    <span>▶</span> ${dict.cardPlay.replace('▶ ', '')}
                                </button>
                                <button class="btn-card" onclick="quickDownload('${item.series_id}', '${escapeHtml(item.title)}', '${item.cover||''}')">
                                    <span>📥</span> ${dict.cardDownload.replace('📥 ', '')}
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            applyDramaTitlesTranslation();
        }

        let totalPagesCount = 10;

        function goToPage(pageNum) {
            pageNum = Math.max(1, Math.min(pageNum, totalPagesCount));
            if (pageNum !== currentPage) {
                loadCategory(currentCategory, pageNum);
                const target = document.getElementById('sectionTitle') || document.getElementById('dramaGrid');
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    window.scrollTo({ top: 380, behavior: 'smooth' });
                }
            }
        }

        function goToLastPage() {
            goToPage(totalPagesCount);
        }

        function changePage(delta) {
            goToPage(currentPage + delta);
        }

        function setupPagination(data) {
            const pag = document.getElementById('pagination');
            if (!data || !data.total_pages || data.total_pages <= 1) {
                if (pag) pag.style.display = 'none';
                return;
            }
            if (pag) pag.style.display = 'flex';

            const cur = data.page || 1;
            const total = data.total_pages || 10;
            totalPagesCount = total;

            const badgeCur = document.getElementById('currentPageBadge');
            const badgeTotal = document.getElementById('totalPagesBadge');
            if (badgeCur) badgeCur.innerText = cur;
            if (badgeTotal) badgeTotal.innerText = total;

            const btnFirst = document.getElementById('firstPageBtn');
            const btnPrev = document.getElementById('prevPageBtn');
            const btnNext = document.getElementById('nextPageBtn');
            const btnLast = document.getElementById('lastPageBtn');

            if (btnFirst) btnFirst.disabled = (cur <= 1);
            if (btnPrev) btnPrev.disabled = (cur <= 1);
            if (btnNext) btnNext.disabled = (cur >= total);
            if (btnLast) btnLast.disabled = (cur >= total);

            // Generate numbered page buttons with smart windowing
            const numbersContainer = document.getElementById('paginationNumbers');
            if (numbersContainer) {
                let html = '';
                const delta = 2; // radius around current page
                const range = [];
                for (let i = Math.max(2, cur - delta); i <= Math.min(total - 1, cur + delta); i++) {
                    range.push(i);
                }

                // Page 1
                html += `<button class="page-num-btn ${cur === 1 ? 'active' : ''}" onclick="goToPage(1)" title="ទំព័រ 1">1</button>`;

                // Ellipsis before
                if (range.length > 0 && range[0] > 2) {
                    html += `<span class="page-dots">…</span>`;
                }

                // Middle numbers
                for (const p of range) {
                    html += `<button class="page-num-btn ${cur === p ? 'active' : ''}" onclick="goToPage(${p})" title="ទំព័រ ${p}">${p}</button>`;
                }

                // Ellipsis after
                if (range.length > 0 && range[range.length - 1] < total - 1) {
                    html += `<span class="page-dots">…</span>`;
                }

                // Last Page (if total > 1)
                if (total > 1) {
                    html += `<button class="page-num-btn ${cur === total ? 'active' : ''}" onclick="goToPage(${total})" title="ទំព័រ ${total}">${total}</button>`;
                }

                numbersContainer.innerHTML = html;
            }
        }

        // Drama Detail Modal
        async function openDramaDetail(seriesId) {
            const modal = document.getElementById('detailModal');
            modal.classList.add('active');

            document.getElementById('modalTitleText').innerText = 'កំពុងផ្ទុក...';
            document.getElementById('modalIntroText').innerText = '';
            document.getElementById('modalEpGrid').innerHTML = '<div style="padding:20px; color:var(--text-dim);">កំពុងស្រង់ភាគទាំងអស់...</div>';

            try {
                const res = await fetch(`/api/series/${seriesId}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const detail = await res.json();
                currentDetailSeries = detail;

                if (typeof recordDownloadMemory === 'function' && detail && detail.series_id) {
                    recordDownloadMemory({
                        id: String(detail.series_id),
                        platform: 'hongguo',
                        title: detail.title,
                        khmer_title: (typeof getDisplayTitle === 'function' ? getDisplayTitle(detail.title) : detail.title),
                        cover: detail.cover || '',
                        total_episodes: detail.episode_cnt || 0
                    });
                }

                const modalDramaTitleEl = document.getElementById('modalDramaTitle');
                if (modalDramaTitleEl) {
                    modalDramaTitleEl.innerText = getDisplayTitle(detail.title);
                    modalDramaTitleEl.setAttribute('data-original-title', detail.title);
                }
                const modalTitleTextEl = document.getElementById('modalTitleText');
                if (modalTitleTextEl) {
                    modalTitleTextEl.innerText = getDisplayTitle(detail.title);
                    modalTitleTextEl.setAttribute('data-original-title', detail.title);
                }
                if (currentLang !== 'zh') {
                    queueTitleTranslation(detail.title);
                }
                document.getElementById('modalIntroText').innerText = detail.intro || 'មិនមានការពិពណ៌នាទេ។';

                const posterUrl = detail.cover ? `/img?url=${encodeURIComponent(detail.cover)}` : '';
                document.getElementById('modalCoverImg').src = posterUrl;
                document.getElementById('modalCoverDownloadLink').href = detail.cover || '#';

                // Tags
                const tagsRow = document.getElementById('modalTagsRow');
                const isStarred = (typeof isDramaStarred === 'function') && isDramaStarred(detail.series_id, 'hongguo');
                tagsRow.innerHTML = `
                    <button type="button" class="btn btn-secondary btn-sm" onclick="toggleDramaStar('${detail.series_id}', '${escapeHtml(detail.title)}', '${escapeHtml(detail.cover||'')}', ${detail.episode_cnt}, '')" style="color:#fbbf24; border-color:rgba(251,191,36,0.4); padding:2px 10px; font-size:0.75rem; border-radius:6px; cursor:pointer;">
                        ${isStarred ? '★ បានដាក់ផ្កាយ' : '☆ ដាក់ផ្កាយ'}
                    </button>
                    <span class="pill pill-crimson">⭐ ${detail.score || '9.8'}</span>
                    <span class="pill pill-gold">${detail.episode_cnt} ភាគ</span>
                    ${(detail.category || []).map(t => `<span class="pill">${escapeHtml(getDisplayCategory(t))}</span>`).join('')}
                `;

                // Episodes
                renderModalEpisodeGrid(detail.episodes || []);
                setRangeQuick('all');
            } catch (err) {
                document.getElementById('modalTitleText').innerText = 'បរាជ័យក្នុងការផ្ទុកព័ត៌មាន';
                document.getElementById('modalIntroText').innerText = err.message;
            }
        }

        function closeDetailModal() {
            document.getElementById('detailModal').classList.remove('active');
        }

        function renderModalEpisodeGrid(episodes) {
            const epGrid = document.getElementById('modalEpGrid');
            if (!episodes || episodes.length === 0) {
                epGrid.innerHTML = '<div style="color:var(--text-dim); padding:10px;">មិនមានភាគទេ</div>';
                return;
            }

            epGrid.innerHTML = episodes.map(ep => {
                return `
                    <div class="ep-tile" id="epTile_${ep.index}" onclick="toggleEpisodeSelect(${ep.index})">
                        <span style="font-size:0.7rem; color:var(--text-dim);">EP</span>
                        <b>${ep.index}</b>
                    </div>
                `;
            }).join('');
        }

        function toggleEpisodeSelect(epIndex) {
            const tile = document.getElementById(`epTile_${epIndex}`);
            if (selectedEpisodes.has(epIndex)) {
                selectedEpisodes.delete(epIndex);
                if (tile) tile.classList.remove('selected');
            } else {
                selectedEpisodes.add(epIndex);
                if (tile) tile.classList.add('selected');
            }
            updateSelectedCounter();
        }

        function selectAllEpisodes() {
            if (!currentDetailSeries) return;
            selectedEpisodes.clear();
            (currentDetailSeries.episodes || []).forEach(ep => {
                selectedEpisodes.add(ep.index);
                const tile = document.getElementById(`epTile_${ep.index}`);
                if (tile) tile.classList.add('selected');
            });
            document.getElementById('customRangeInput').value = 'all';
            updateSelectedCounter();
        }

        function deselectAllEpisodes() {
            selectedEpisodes.clear();
            document.querySelectorAll('.ep-tile').forEach(t => t.classList.remove('selected'));
            document.getElementById('customRangeInput').value = '';
            updateSelectedCounter();
        }

        function setRangeQuick(rangeType, btn) {
            if (btn) {
                document.querySelectorAll('.range-quick-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            }
            document.getElementById('customRangeInput').value = rangeType;
            updateRangeSelection();
        }

        function updateRangeSelection() {
            if (!currentDetailSeries) return;
            const val = document.getElementById('customRangeInput').value.trim().toLowerCase();
            const total = currentDetailSeries.episodes.length;

            selectedEpisodes.clear();
            document.querySelectorAll('.ep-tile').forEach(t => t.classList.remove('selected'));

            if (val === 'all' || val === '' || val === '*') {
                selectAllEpisodes();
                return;
            }

            if (val === 'free') {
                for (let i = 1; i <= Math.min(10, total); i++) selectedEpisodes.add(i);
            } else {
                const parts = val.split(',');
                parts.forEach(p => {
                    const trimmed = p.trim();
                    if (trimmed.includes('-')) {
                        const [s, e] = trimmed.split('-');
                        const start = parseInt(s) || 1;
                        const end = parseInt(e) || total;
                        for (let i = Math.max(1, start); i <= Math.min(total, end); i++) selectedEpisodes.add(i);
                    } else if (!isNaN(parseInt(trimmed))) {
                        const ep = parseInt(trimmed);
                        if (ep >= 1 && ep <= total) selectedEpisodes.add(ep);
                    }
                });
            }

            selectedEpisodes.forEach(epIdx => {
                const tile = document.getElementById(`epTile_${epIdx}`);
                if (tile) tile.classList.add('selected');
            });

            updateSelectedCounter();
        }

        function updateSelectedCounter() {
            const count = selectedEpisodes.size;
            document.getElementById('selectedCountText').innerText = count;
            document.getElementById('submitBtnEpCount').innerText = count > 0 ? count : 'All';
        }

        

        // ========================================================
        // REFERENCE ULTIMATE STREAM VIEW & PLAYER CONTROLLER
        // ========================================================
        allDramas = window.allDramas || [];
        currentSeries = window.currentSeries || null;
        currentEpisodes = window.currentEpisodes || [];
        currentEpIndex = window.currentEpIndex || 1;
        let currentPlaybackQuality = localStorage.getItem('hg_player_quality') || '720p';
        const playbackSpeeds = [1, 1.25, 1.5, 2];
        let speedIdx = 0;
        const seriesDataCache = new Map();
        const activeMiniPlayers = new Map();
        function isMultiMiniMode() { return false; }

        function showHomeView(scrollToTop = false) {
            if (!video) video = document.getElementById('videoPlayer');
            if (video) {
                try { video.pause(); } catch (_) {}
            }
            const streamEl = document.getElementById('streamView');
            const wasOpen = streamEl && !streamEl.hidden;
            if (streamEl) {
                streamEl.setAttribute('hidden', '');
                streamEl.style.display = 'none';
                streamEl.classList.remove('is-mini-mode');
            }
            document.body.classList.remove('stream-modal-open');
            if (scrollToTop && !wasOpen) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }

        function handleStreamBackdropClick(e) {
            const streamEl = document.getElementById('streamView');
            if (!streamEl || streamEl.classList.contains('is-mini-mode')) return;
            if (e.target && e.target.id === 'streamView') {
                showHomeView();
            }
        }

        function toggleMiniPlayer(forceState, event) {
            if (event) event.stopPropagation();
            const streamEl = document.getElementById('streamView');
            if (!streamEl) return;

            if (streamEl.hidden) {
                streamEl.hidden = false;
            }

            const shouldMini = (forceState !== undefined) ? forceState : !streamEl.classList.contains('is-mini-mode');

            if (shouldMini) {
                streamEl.classList.add('is-mini-mode');
                document.body.classList.remove('stream-modal-open');
                updateMiniPlayerMeta();
            } else {
                expandFromMiniPlayer(event);
            }
        }

        function expandFromMiniPlayer(event) {
            if (event) event.stopPropagation();
            const streamEl = document.getElementById('streamView');
            if (!streamEl) return;
            streamEl.classList.remove('is-mini-mode');
            streamEl.hidden = false;
            document.body.classList.add('stream-modal-open');
            streamEl.scrollTop = 0;
        }

        function updateMiniPlayerMeta() {
            const titleText = (currentSeries && currentSeries.title) || 'Drama';
            const epNum = (typeof currentEpIndex !== 'undefined') ? currentEpIndex : 1;
            const miniTitle = document.getElementById('miniTitleText');
            const miniEp = document.getElementById('miniEpText');
            if (miniTitle) miniTitle.textContent = titleText;
            if (miniEp) miniEp.textContent = `EP ${epNum}`;
        }

        function dockCurrentStreamToMini() {
            showToast('📺 Mini-player active');
            toggleMiniPlayer(true);
        }

        // Compatibility bridges
        async function quickPlay(seriesId) {
            openStreamPage(seriesId, false, 1);
        }

        async function playFirstEpisode() {
            if (currentDetailSeries) {
                closeDetailModal();
                openStreamPage(currentDetailSeries.series_id, false, 1);
            }
        }

        async function openPlayerForSeries(seriesId, episodeIndex = 1) {
            openStreamPage(seriesId, false, episodeIndex);
        }

        function closePlayerModal() {
            showHomeView();
        }

        
        function updateQueueBadges() {
            // Queue badge safe update
            const badge = document.getElementById('activeDlCount');
            if (badge && typeof activeDownloadsCount !== 'undefined') {
                badge.textContent = activeDownloadsCount;
                badge.style.display = activeDownloadsCount > 0 ? 'inline-block' : 'none';
            }
        }

        function spawnMiniPlayer(seriesId, targetEp) {
            toggleMiniPlayer(true);
        }

        function pickPlayableTrack(tracks, quality = '720p') {
            if (!tracks || !tracks.length) return null;
            const playable = tracks.filter(t => {
                const c = (t.codec_type || '').toLowerCase();
                const u = (t.main_url || t.backup_url || '');
                return c !== 'bytevc2' && !(/[?&]cs=5(&|$)/.test(u));
            });
            const pool = playable.length ? playable : tracks;
            const target = (quality || '1080p').toLowerCase();
            return pool.find(t => (t.definition || '').toLowerCase() === target)
                || pool.find(t => (t.definition || '').toLowerCase().includes('1080'))
                || pool[0];
        }

        async function openStreamPage(seriesId, forceSameWindow = false, targetEp = 1, initialSeekTime = 0, preloadedData = null, preloadedSrc = null, startMuted = null) {
      if (typeof requireActiveLicense === 'function' && !requireActiveLicense('មើលរឿង HongGuo')) {
        return;
      }
      if (!forceSameWindow && isMultiMiniMode()) {
        spawnMiniPlayer(seriesId, targetEp);
        return;
      }
      if (!video) setupVideoPlayer();
      const sId = String(seriesId);
      const streamEl = document.getElementById('streamView');
      if (streamEl) {
        streamEl.classList.remove('is-mini-mode');
        streamEl.removeAttribute('hidden');
        streamEl.style.display = 'flex';
        streamEl.scrollTop = 0;
        document.body.classList.add('stream-modal-open');
      }
      const thumbImg = document.getElementById('detailThumbImg');
      if (thumbImg) {
        thumbImg.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160' viewBox='0 0 120 160'><rect width='100%25' height='100%25' fill='%231a2233'/><circle cx='60' cy='80' r='22' fill='%23243048'/><path d='M55 70 L72 80 L55 90 Z' fill='%2364748b'/></svg>";
        thumbImg.alt = "";
      }

      const drawerTitle = document.getElementById('drawerTotalTitle');
      const tabAll = document.getElementById('tabEpAll');

      // Check if we have cached or preloaded series data!
      const cachedData = preloadedData || seriesDataCache.get(sId) || (currentSeries && String(currentSeries.series_id) === sId ? currentSeries : null);

      if (cachedData && cachedData.episodes && cachedData.episodes.length) {
        currentSeries = cachedData;
        currentEpisodes = cachedData.episodes || [];
        seriesDataCache.set(sId, cachedData);
        populateStreamDetails(currentSeries);
        currentEpIndex = targetEp || 1;
        if (video) { try { video.pause(); video.removeAttribute('src'); } catch(e){} }
        updateStagePosterDisplay(currentSeries, currentEpIndex);
        return;
      }

      // Show loading state in Episodes Drawer while fetching all episode data
      if (drawerTitle) drawerTitle.textContent = 'Episodes (Loading...)';
      if (tabAll) tabAll.textContent = 'Loading...';
      if (epGrid) {
        let skeletonHtml = `
        <div style="grid-column: 1/-1; padding: 22px 14px; text-align: center; background: rgba(245, 158, 11, 0.06); border: 1px dashed rgba(245, 158, 11, 0.3); border-radius: 12px; margin-bottom: 8px;">
          <div class="spinner" style="width: 28px; height: 28px; border-width: 3px; border-color: rgba(255,255,255,0.15); border-top-color: var(--orange); margin: 0 auto 10px auto;"></div>
          <div style="font-size: 13px; font-weight: 700; color: #ffffff; margin-bottom: 4px;">Fetching Episode Data...</div>
          <div style="font-size: 11px; color: #94a3b8;">Loading all episodes, vids & stream tracks</div>
        </div>
      `;
        for (let i = 1; i <= 24; i++) {
          skeletonHtml += `
          <div class="ep-box" style="pointer-events: none; opacity: 0.35; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);">
            <span class="ep-num">${i}</span>
            <span class="ep-subtag" style="opacity: 0.4;">...</span>
          </div>
        `;
        }
        epGrid.innerHTML = skeletonHtml;
      }

      // Fetch Full Episode List
      try {
        const res = await fetch(`/api/series/${sId}/full`);
        currentSeries = await res.json();
        currentEpisodes = currentSeries.episodes || [];
        seriesDataCache.set(sId, currentSeries);
        populateStreamDetails(currentSeries);
        currentEpIndex = targetEp || 1;
        if (video) { try { video.pause(); video.removeAttribute('src'); } catch(e){} }
        updateStagePosterDisplay(currentSeries, currentEpIndex);
      } catch (err) {
        if (drawerTitle) drawerTitle.textContent = 'Episodes (Error)';
        if (epGrid) {
          epGrid.innerHTML = `<div style="grid-column: 1/-1; padding: 20px; text-align: center; color: #f87171; font-size: 13px;">Failed to load episode data: ${err.message}</div>`;
        }
        showToast("Failed to load series: " + err.message, "❌");
      }
    }

    const _synopsisCache = {};

    async function applyStreamSynopsisTranslation(seriesId, rawIntro) {
      const detailIntroEl = document.getElementById('detailIntro');
      if (!detailIntroEl) return;

      const fallbackMsg = (currentLang === 'km')
        ? 'ទស្សនារឿងភាគខ្លីពេញលេញគ្រប់ភាគដោយឥតគិតថ្លៃ។'
        : (currentLang === 'zh' ? '观看完整短剧集数。' : 'Watch complete short drama episodes.');

      if (!rawIntro) {
        detailIntroEl.textContent = fallbackMsg;
        return;
      }

      if (currentLang === 'zh') {
        detailIntroEl.textContent = rawIntro;
        return;
      }

      const cacheKey = `${currentLang}:${seriesId || rawIntro}`;
      if (_synopsisCache[cacheKey]) {
        detailIntroEl.textContent = _synopsisCache[cacheKey];
        return;
      }

      try {
        const localCached = localStorage.getItem('intro_trans_' + cacheKey);
        if (localCached) {
          _synopsisCache[cacheKey] = localCached;
          detailIntroEl.textContent = localCached;
          return;
        }
      } catch (e) {}

      // Temporary display original text while fetching translation
      detailIntroEl.textContent = rawIntro;

      try {
        const res = await fetch(`/api/translate?text=${encodeURIComponent(rawIntro)}&to=${encodeURIComponent(currentLang)}`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data && data.translated) {
          _synopsisCache[cacheKey] = data.translated;
          try {
            localStorage.setItem('intro_trans_' + cacheKey, data.translated);
          } catch (e) {}
          if (currentSeries && (String(currentSeries.series_id) === String(seriesId) || !seriesId)) {
            detailIntroEl.textContent = data.translated;
          }
        }
      } catch (err) {
        console.warn('[Translator] Failed to translate synopsis:', err.message);
      }
    }

    function populateStreamDetails(series) {
      updateWatchlistBtnState();
      const dramaTitle = series.title || 'Drama';
      const displayTitle = getDisplayTitle(dramaTitle);
      const detailTitleEl = document.getElementById('detailTitle');
      if (detailTitleEl) {
        detailTitleEl.textContent = displayTitle;
        detailTitleEl.setAttribute('data-original-title', dramaTitle);
      }
      const modalTopTitle = document.getElementById('modalTopTitle');
      if (modalTopTitle) {
        modalTopTitle.textContent = displayTitle;
        modalTopTitle.setAttribute('data-original-title', dramaTitle);
      }
      if (currentLang !== 'zh') {
        queueTitleTranslation(dramaTitle);
      }

      // 1. Status Chip (Completed / Ongoing)
      const statusChip = document.getElementById('detailStatusChip');
      if (statusChip) {
        const isCompleted = series.is_completed === 1 || series.status === 2 || String(series.status).toLowerCase().includes('complete') || series.is_completed === true || series.is_completed === '1';
        if (currentLang === 'km') {
          statusChip.textContent = isCompleted ? 'រឿងពេញ' : 'កំពុងចាក់ផ្សាយ';
        } else if (currentLang === 'zh') {
          statusChip.textContent = isCompleted ? '已完结' : '连载中';
        } else {
          statusChip.textContent = isCompleted ? 'Completed Series' : 'Ongoing Series';
        }
      }

      // 2. Synopsis Translation
      applyStreamSynopsisTranslation(series.series_id, series.intro);

      // 3. Populate Real Categories from response below detail description
      const hashtagsContainer = document.getElementById('detailHashtags');
      if (hashtagsContainer) {
        let cats = series.category || [];
        if (typeof cats === 'string') {
          try { cats = JSON.parse(cats); } catch { cats = cats.split(/[,，\s]+/); }
        }
        if (!Array.isArray(cats)) cats = [cats];

        if ((!cats || cats.length === 0) && allDramas && allDramas.length) {
          const found = allDramas.find(d => String(d.series_id) === String(series.series_id));
          if (found && found.category) {
            cats = Array.isArray(found.category) ? found.category : [found.category];
          }
        }

        cats = (cats || []).filter(c => c && String(c).trim().length > 0);
        if (cats.length > 0) {
          hashtagsContainer.innerHTML = cats.map(c => {
            const clean = String(c).trim().replace(/^#/, '');
            const label = (currentLang === 'zh') ? clean : getDisplayCategory(clean);
            return `<span class="hashtag">#${esc(label)}</span>`;
          }).join('');
        } else {
          hashtagsContainer.innerHTML = '';
        }
      }

      // 4. Total Episodes & View Count
      const epCount = series.episode_cnt || currentEpisodes.length || 0;
      const totalEpsEl = document.getElementById('detailTotalEps');
      if (totalEpsEl) {
        if (currentLang === 'km') {
          totalEpsEl.textContent = `🎬 ${epCount} ភាគ`;
        } else if (currentLang === 'zh') {
          totalEpsEl.textContent = `🎬 ${epCount} 集`;
        } else {
          totalEpsEl.textContent = `🎬 ${epCount} Episodes`;
        }
      }

      const viewCountEl = document.getElementById('detailViewCount');
      if (viewCountEl) {
        const rawViews = series.play_cnt || series.views || '266';
        if (currentLang === 'km') {
          viewCountEl.textContent = `👁 ${rawViews} ទស្សនា`;
        } else if (currentLang === 'zh') {
          viewCountEl.textContent = `👁 ${rawViews} 次观看`;
        } else {
          viewCountEl.textContent = `👁 ${rawViews} Views`;
        }
      }

      // 5. Drawer Header Localization
      const drawerTotalTitleEl = document.getElementById('drawerTotalTitle');
      if (drawerTotalTitleEl) {
        if (currentLang === 'km') {
          drawerTotalTitleEl.textContent = `បញ្ជីភាគ (សរុប ${currentEpisodes.length})`;
        } else if (currentLang === 'zh') {
          drawerTotalTitleEl.textContent = `剧集列表 (共 ${currentEpisodes.length} 集)`;
        } else {
          drawerTotalTitleEl.textContent = `Episodes (${currentEpisodes.length} total)`;
        }
      }

      const drawerSubTitle = document.getElementById('drawerSubTitle');
      if (drawerSubTitle) {
        if (currentLang === 'km') drawerSubTitle.textContent = 'បញ្ជីភាគទាំងអស់';
        else if (currentLang === 'zh') drawerSubTitle.textContent = '完整剧集列表';
        else drawerSubTitle.textContent = 'Complete Episode List';
      }

      const tabEpAllEl = document.getElementById('tabEpAll');
      if (tabEpAllEl) {
        if (currentLang === 'km') {
          tabEpAllEl.textContent = `ទាំងអស់ (${currentEpisodes.length})`;
        } else if (currentLang === 'zh') {
          tabEpAllEl.textContent = `全部 (${currentEpisodes.length})`;
        } else {
          tabEpAllEl.textContent = `All (${currentEpisodes.length})`;
        }
      }

      let coverSrc = series.cover || '';
      if (!coverSrc && currentEpisodes && currentEpisodes.length) {
        const epWithCover = currentEpisodes.find(e => e.cover);
        if (epWithCover) coverSrc = epWithCover.cover;
      }
      if (!coverSrc && allDramas && allDramas.length) {
        const d = allDramas.find(item => String(item.series_id) === String(series.series_id));
        if (d && d.cover) coverSrc = d.cover;
      }
      const thumbImg = document.getElementById('detailThumbImg');
      if (thumbImg) {
        if (coverSrc) {
          thumbImg.src = `/img?url=${encodeURIComponent(coverSrc)}`;
          thumbImg.alt = series.title || 'Cover';
        } else {
          thumbImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="145" viewBox="0 0 100 145"><rect width="100%" height="100%" fill="%231a2233"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2364748b" font-size="28">🎬</text></svg>';
        }
      }

      // Populate Episode Dropdown in Controls (if exists)
      const dd = document.getElementById('epDropdown');
      if (dd) {
        dd.innerHTML = currentEpisodes.map(ep => `<option value="${ep.index}">≡ EP ${ep.index}</option>`).join('');
      }

      selectedEpisodes.clear();
      const rFrom = document.getElementById('epRangeFrom');
      const rTo = document.getElementById('epRangeTo');
      if (rFrom) rFrom.value = 1;
      if (rTo) rTo.value = Math.min(20, (currentEpisodes && currentEpisodes.length) || 20);

      renderEpisodeGrid(currentEpisodes);
      updateQueueBadges();
      if (typeof loadSeriesDownloadedMemory === 'function') {
        loadSeriesDownloadedMemory(series.series_id, series.title);
      }
      if (typeof window.syncSeriesModeBar === 'function') {
        window.syncSeriesModeBar(currentEpisodes ? currentEpisodes.length : 1);
      }

      // Initialize Player Download Log Panel for this specific drama (Isolate from previous dramas)
      try {
        const pdlSeries = document.getElementById('pdlCurrentSeriesTitle');
        if (pdlSeries) pdlSeries.innerText = displayTitle || series.title || 'Drama';
        const localCache = window.downloadedSeriesCache && window.downloadedSeriesCache.get(String(series.series_id));
        const pdlEps = document.getElementById('pdlEpisodeProgress');
        const pdlStatus = document.getElementById('pdlStatusText');
        const pdlProg = document.getElementById('pdlProgressBar');
        const pdlConsole = document.getElementById('pdlConsoleLog');
        const totalEpNum = (currentEpisodes && currentEpisodes.length) || series.episode_cnt || 0;

        if (localCache && (localCache.is_completed || localCache.status === 'completed')) {
          if (pdlEps) pdlEps.innerText = `${localCache.total || totalEpNum} / ${localCache.total || totalEpNum}`;
          if (pdlStatus) { pdlStatus.innerText = 'Completed (បានដោនចប់)'; pdlStatus.style.color = '#10b981'; }
          if (pdlProg) pdlProg.style.width = '100%';
          if (pdlConsole) pdlConsole.innerHTML = `<div class="pdl-log-line" style="color:#10b981;">[System] ✓ រឿង «${escapeHtml(displayTitle || series.title || 'Drama')}» បានទាញយករួចរាល់ក្នុងកុំព្យូទ័រ</div>`;
        } else {
          if (pdlEps) pdlEps.innerText = `0 / ${totalEpNum}`;
          if (pdlStatus) { pdlStatus.innerText = 'Idle (ត្រៀមរួចរាល់)'; pdlStatus.style.color = '#94a3b8'; }
          if (pdlProg) pdlProg.style.width = '0%';
          if (pdlConsole) pdlConsole.innerHTML = `<div class="pdl-log-line pdl-log-dim">[System] ត្រៀមរួចរាល់។ សូមជ្រើសរើសភាគខាងស្ដាំ ហើយចុច "ទាញយកភាគដែលបានគ្រីស" ដើម្បីចាប់ផ្ដើម។</div>`;
        }
      } catch (e) {}
    }

    function updateStagePosterDisplay(series, targetEp = 1) {
      if (!series) return;
      const stageWrapper = document.getElementById('stagePosterWrapper');
      if (stageWrapper) stageWrapper.style.display = 'flex';
      
      const posterImg = document.getElementById('stagePosterImg');
      let coverSrc = series.cover || '';
      if (!coverSrc && currentEpisodes && currentEpisodes.length) {
        const epWithCover = currentEpisodes.find(e => e.cover);
        if (epWithCover) coverSrc = epWithCover.cover;
      }
      if (posterImg && coverSrc) {
        posterImg.src = `/img?url=${encodeURIComponent(coverSrc)}`;
      }
      const thumbImg = document.getElementById('detailThumbImg');
      if (thumbImg && coverSrc) {
        thumbImg.src = `/img?url=${encodeURIComponent(coverSrc)}`;
      }

      const dramaTitleEl = document.getElementById('stageDramaTitle');
      if (dramaTitleEl) {
        const dispTitle = typeof getDisplayTitle === 'function' ? getDisplayTitle(series.title) : series.title;
        dramaTitleEl.textContent = dispTitle || series.title || 'Drama';
        dramaTitleEl.title = dispTitle || series.title || '';
      }

      const epsBadge = document.getElementById('stageEpsBadge');
      if (epsBadge) {
        const total = series.episode_cnt || (currentEpisodes && currentEpisodes.length) || 0;
        epsBadge.textContent = currentLang === 'zh' ? `🎬 共 ${total} 集` : `🎬 សរុប ${total} ភាគ`;
      }

      const downloadedSet = window.currentDownloadedEps || currentDownloadedEps;
      const count = (downloadedSet && typeof downloadedSet.size === 'number') ? downloadedSet.size : 0;
      const dlBadge = document.getElementById('stageDownloadBadge');
      if (dlBadge) {
        if (count > 0) {
          dlBadge.className = 'stage-status-badge downloaded';
          dlBadge.textContent = currentLang === 'zh' ? `✓ 已下载 ${count} 集可在电脑播放` : `✓ បានដោនឡូត ${count} ភាគក្នុងកុំព្យូទ័រ`;
        } else {
          dlBadge.className = 'stage-status-badge';
          dlBadge.textContent = currentLang === 'zh' ? '⚠️ 电脑中尚未下载此剧集' : '⚠️ មិនទាន់មានវីដេអូទាញយកក្នុងកុំព្យូទ័រ';
        }
      }

      const indicator = document.getElementById('showcaseDownloadedIndicator');
      if (indicator) {
        indicator.style.display = count > 0 ? 'block' : 'none';
      }

      const playOverlay = document.getElementById('centerPlayOverlay');
      if (playOverlay) {
        playOverlay.classList.remove('hidden');
        playOverlay.style.display = 'flex';
      }
    }
    window.updateStagePosterDisplay = updateStagePosterDisplay;

    function onCenterPlayClicked(e) {
      if (e) e.stopPropagation();
      const downloadedSet = window.currentDownloadedEps || currentDownloadedEps;
      const hasDownloaded = downloadedSet && downloadedSet.size > 0;
      if (hasDownloaded && currentSeries) {
        if (typeof playDramaInVlc === 'function') {
          playDramaInVlc(currentSeries.series_id, currentSeries.title, currentEpIndex || 1);
        }
      } else {
        showToast(currentLang === 'zh' ? '该剧集尚未下载到电脑中，请从右侧列表勾选并下载！' : (currentLang === 'km' ? 'រឿងនេះមិនទាន់មានវីដេអូដោនឡូតក្នុងកុំព្យូទ័រទេ! សូមជ្រើសរើសភាគខាងស្ដាំដើម្បីទាញយក' : 'This drama has not been downloaded yet. Please select episodes to download!'), '⚠️');
      }
    }
    window.onCenterPlayClicked = onCenterPlayClicked;

    function handleEpisodeBoxClick(epIndex) {
      currentEpIndex = epIndex;
      const downloadedSet = window.currentDownloadedEps || currentDownloadedEps;
      const isDownloaded = (downloadedSet && typeof downloadedSet.has === 'function') ? downloadedSet.has(epIndex) : false;

      // Update Active UI
      document.querySelectorAll('.ep-box').forEach(b => b.classList.remove('active'));
      const activeBox = document.getElementById(`epBox_${epIndex}`);
      if (activeBox) {
        activeBox.classList.add('active');
        activeBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }

      // Update Header Text
      if (currentLang === 'km') {
        const resumeEl = document.getElementById('resumeBadge');
        if (resumeEl) resumeEl.textContent = `🕒 ភាគទី ${epIndex} ក្នុងចំណោម ${currentEpisodes.length}`;
        const tagEl = document.getElementById('nowPlayingEpTag');
        if (tagEl) tagEl.textContent = isDownloaded ? `✓ បានដោនឡូត • ភាគទី ${epIndex}` : `មិនទាន់ដោនឡូត • ភាគទី ${epIndex}`;
        const titleEl = document.getElementById('nowEpTitle');
        if (titleEl) titleEl.textContent = `ភាគទី ${epIndex}`;
      } else if (currentLang === 'zh') {
        const resumeEl = document.getElementById('resumeBadge');
        if (resumeEl) resumeEl.textContent = `🕒 第 ${epIndex}/${currentEpisodes.length} 集`;
        const tagEl = document.getElementById('nowPlayingEpTag');
        if (tagEl) tagEl.textContent = isDownloaded ? `✓ 已下载 • 第 ${epIndex} 集` : `未下载 • 第 ${epIndex} 集`;
        const titleEl = document.getElementById('nowEpTitle');
        if (titleEl) titleEl.textContent = `第 ${epIndex} 集`;
      }

      if (isDownloaded) {
        // Launch directly in default PC player (VLC)!
        if (typeof playDramaInVlc === 'function' && currentSeries) {
          playDramaInVlc(currentSeries.series_id, currentSeries.title, epIndex);
        }
      } else {
        // Not downloaded yet! Prompt user to download
        showToast(currentLang === 'zh' ? `第 ${epIndex} 集尚未下载，请勾选后点击下载！` : (currentLang === 'km' ? `ភាគទី ${epIndex} មិនទាន់បានទាញយកទេ! សូមជ្រើសរើសទាញយកសិន` : `Episode ${epIndex} not downloaded yet. Please download first!`), 'ℹ️');
        if (!selectedEpisodes.has(epIndex)) {
          toggleEpisodeCheck(epIndex);
        }
      }
    }
    window.handleEpisodeBoxClick = handleEpisodeBoxClick;

    // 4-Column Episode Tiles Grid (Screenshot 2)
    function renderEpisodeGrid(eps) {
      if (!epGrid) epGrid = document.getElementById('epGrid');
      if (!epGrid || !eps) return;

      epGrid.innerHTML = eps.map(ep => {
        const isSelected = selectedEpisodes.has(ep.index);
        const downloadedSet = window.currentDownloadedEps || currentDownloadedEps;
        const isDownloaded = (downloadedSet && typeof downloadedSet.has === 'function') ? downloadedSet.has(ep.index) : false;
        const activeClass = ep.index === currentEpIndex ? 'active' : '';
        const selectedClass = isSelected ? 'selected' : '';
        const downloadedClass = isDownloaded ? 'is-downloaded' : '';
        const subtagText = isDownloaded ? '✓ បានដោន' : 'FREE';
        const subtagClass = isDownloaded ? 'tag-downloaded' : '';

        return `
        <div class="ep-box ${activeClass} ${selectedClass} ${downloadedClass}" id="epBox_${ep.index}" onclick="handleEpisodeBoxClick(${ep.index})">
          <input type="checkbox" class="ep-checkbox" data-ep="${ep.index}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleEpisodeCheck(${ep.index})">
          <span class="ep-num">${ep.index}</span>
          <span class="ep-subtag ${subtagClass}">${subtagText}</span>
        </div>
      `;
      }).join('');
      updateSelectedCountBadge();
    }

    function toggleEpisodeCheck(epIndex) {
      if (selectedEpisodes.has(epIndex)) {
        selectedEpisodes.delete(epIndex);
      } else {
        selectedEpisodes.add(epIndex);
      }
      const box = document.getElementById(`epBox_${epIndex}`);
      if (box) {
        box.classList.toggle('selected', selectedEpisodes.has(epIndex));
        const chk = box.querySelector('.ep-checkbox');
        if (chk) chk.checked = selectedEpisodes.has(epIndex);
      }
      updateSelectedCountBadge();
    }

    function toggleSelectAllEpisodes() {
      if (!currentEpisodes || !currentEpisodes.length) return;
      const allSelected = currentEpisodes.every(e => selectedEpisodes.has(e.index));
      if (allSelected) {
        selectedEpisodes.clear();
        showToast('បានដោះគ្រីសទាំងអស់ (Clear All)', '☑️');
      } else {
        currentEpisodes.forEach(e => selectedEpisodes.add(e.index));
        showToast(`បានគ្រីសទាំងអស់ ${currentEpisodes.length} ភាគ!`, '☑️');
      }
      renderEpisodeGrid(currentEpisodes);
    }

    function applyEpisodeRangeSelection() {
      if (!currentEpisodes || !currentEpisodes.length) return;
      const fromVal = parseInt(document.getElementById('epRangeFrom').value, 10);
      const toVal = parseInt(document.getElementById('epRangeTo').value, 10);
      if (isNaN(fromVal) || isNaN(toVal)) {
        showToast('សូមបញ្ចូលលេខភាគឲ្យបានត្រឹមត្រូវ!', '⚠️');
        return;
      }
      const start = Math.max(1, Math.min(fromVal, toVal));
      const end = Math.min(currentEpisodes.length, Math.max(fromVal, toVal));

      selectedEpisodes.clear();
      for (let i = start; i <= end; i++) {
        selectedEpisodes.add(i);
      }
      renderEpisodeGrid(currentEpisodes);
      showToast(`បានគ្រីសភាគ ${start} ដល់ ${end} (សរុប ${selectedEpisodes.size} ភាគ)!`, '🎯');
    }

    function updateSelectedCountBadge() {
      const badge = document.getElementById('selectedEpisodesBadge');
      if (badge) badge.innerText = selectedEpisodes.size;
      const checkAllText = document.getElementById('checkAllText');
      const checkAllIcon = document.getElementById('checkAllIcon');
      if (checkAllText && currentEpisodes && currentEpisodes.length) {
        const allSelected = currentEpisodes.every(e => selectedEpisodes.has(e.index));
        if (allSelected) {
          checkAllText.innerText = 'ដោះគ្រីសទាំងអស់ (Deselect All)';
          if (checkAllIcon) checkAllIcon.innerText = '☒';
        } else {
          checkAllText.innerText = 'គ្រីសទាំងអស់ (Select All)';
          if (checkAllIcon) checkAllIcon.innerText = '☑️';
        }
      }
    }

    async function downloadSelectedEpisodesBatch() {
      if (typeof requireActiveLicense === 'function' && !requireActiveLicense('ទាញយករឿង HongGuo')) {
        return;
      }
      if (!selectedEpisodes || selectedEpisodes.size === 0) {
        showToast('សូមគ្រីសជ្រើសរើសភាគដែលចង់ទាញយកជាមុន (ចុច Select All ឬ រើសភាគ)!', '⚠️');
        return;
      }
      if (!currentSeries || !currentSeries.series_id) {
        showToast('មិនមានព័ត៌មានរឿង!', '❌');
        return;
      }

      const sorted = Array.from(selectedEpisodes).sort((a, b) => a - b);
      const ranges = [];
      let rangeStart = sorted[0];
      let prev = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === prev + 1) {
          prev = sorted[i];
        } else {
          ranges.push(rangeStart === prev ? `${rangeStart}` : `${rangeStart}-${prev}`);
          rangeStart = sorted[i];
          prev = sorted[i];
        }
      }
      ranges.push(rangeStart === prev ? `${rangeStart}` : `${rangeStart}-${prev}`);
      const rangeStr = ranges.join(', ');

      const activeMode = (typeof window.getActiveDownloadMode === 'function') ? window.getActiveDownloadMode() : 'merged';

      const doSubmit = async (selectedMode = activeMode) => {
        const chosenMode = selectedMode || activeMode || 'merged';
        const payload = {
          series_id: currentSeries.series_id,
          title: currentSeries.title || 'Drama',
          cover_url: currentSeries.cover || '',
          episodes: rangeStr,
          range: rangeStr,
          quality: currentPlaybackQuality || '1080p',
          download_mode: chosenMode
        };

        // Immediately reset and initialize Player Download Log Panel for this drama
        try {
          const pdlSeries = document.getElementById('pdlCurrentSeriesTitle');
          if (pdlSeries) pdlSeries.innerText = currentSeries.title || 'Drama';
          const pdlEps = document.getElementById('pdlEpisodeProgress');
          if (pdlEps) pdlEps.innerText = `0 / ${sorted.length}`;
          const pdlProg = document.getElementById('pdlProgressBar');
          if (pdlProg) pdlProg.style.width = '0%';
          const pdlStatus = document.getElementById('pdlStatusText');
          if (pdlStatus) { pdlStatus.innerText = 'Starting...'; pdlStatus.style.color = '#38bdf8'; }
          const pdlConsole = document.getElementById('pdlConsoleLog');
          if (pdlConsole) {
            const modeLabel = chosenMode === 'merged' ? 'បញ្ចូលរឿង' : (chosenMode === 'both' ? 'ទាំងពីរ' : 'រាយភាគ');
            pdlConsole.innerHTML = `<div class="pdl-log-line" style="color:#38bdf8;">[System] ចាប់ផ្ដើមទាញយក «${escapeHtml(currentSeries.title || 'Drama')}» (${sorted.length} ភាគ, ទម្រង់: ${modeLabel})...</div>`;
          }
        } catch (e) {}

        try {
          showToast(`កំពុងដាក់ភាគ [${rangeStr}] ទៅក្នុងជួរទាញយក...`, '📥');
          const res = await fetch('/dl/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          showToast(`✓ បានដាក់ភាគ [${rangeStr}] ទៅក្នុងជួរទាញយក (${sorted.length} ភាគ)!`, '📥');
          toggleDownloadsDrawer(true, 'active');
          if (typeof pollDownloadStatus === 'function') pollDownloadStatus();
          if (typeof startDownloadPolling === 'function') startDownloadPolling();
        } catch (err) {
          showToast(`បញ្ហាទាញយក: ${err.message}`, '❌');
        }
      };

      if (typeof window.promptDownloadMode === 'function') {
        window.promptDownloadMode({
          title: currentSeries.title || 'Drama',
          episodeCount: sorted.length,
          onConfirm: doSubmit
        });
      } else {
        doSubmit(activeMode);
      }
    }

    function filterDrawerEps(type) {
      document.querySelectorAll('.drawer-tabs .ep-tab').forEach(t => t.classList.remove('active'));
      event.target.classList.add('active');

      if (type === 'all') renderEpisodeGrid(currentEpisodes);
      else if (type === 'free') renderEpisodeGrid(currentEpisodes.filter(e => e.index <= 10));
      else if (type === 'vip') renderEpisodeGrid(currentEpisodes.filter(e => e.index > 10));
    }

    // Play Episode
    // Download current episode as converted decrypted MP4
    function downloadCurrentEpisode() {
      if (!currentEpisodes || !currentEpisodes.length) return;
      const ep = currentEpisodes.find(e => e.index === currentEpIndex) || currentEpisodes[0];
      const seriesTitle = (currentSeries && currentSeries.title) ? currentSeries.title.trim() : 'Drama';
      const epNum = String(ep.index).padStart(3, '0');
      const safeTitle = seriesTitle.replace(/[\\/:*?"<>|]/g, '_');
      const filename = `${safeTitle}_EP${epNum}.mp4`;
      const downloadUrl = `/api/video/${ep.vid}/play?quality=1080p&download=1&filename=${encodeURIComponent(filename)}`;

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast(`Starting download: ${filename}`);
    }

    function playEpisode(index, initialSeekTime = 0, preloadedSrc = null, startMuted = null) {
      if (!video) setupVideoPlayer();
      if (!epGrid) epGrid = document.getElementById('epGrid');
      if (!currentEpisodes.length) return;
      const ep = currentEpisodes.find(e => e.index === index) || currentEpisodes[0];
      currentEpIndex = ep.index;
      updateMiniPlayerMeta();

      // Update Highlights
      document.querySelectorAll('.ep-box').forEach(b => b.classList.remove('active'));
      const activeBox = document.getElementById(`epBox_${ep.index}`);
      if (activeBox) {
        activeBox.classList.add('active');
        activeBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }

      // Update Header
      if (currentLang === 'km') {
        document.getElementById('resumeBadge').textContent = `🕒 បន្តទស្សនាភាគទី ${ep.index} ក្នុងចំណោម ${currentEpisodes.length}`;
        document.getElementById('nowPlayingEpTag').textContent = `កំពុងចាក់ • ភាគទី ${ep.index}`;
        document.getElementById('nowEpTitle').textContent = `ភាគទី ${ep.index}`;
      } else if (currentLang === 'zh') {
        document.getElementById('resumeBadge').textContent = `🕒 从第 ${ep.index}/${currentEpisodes.length} 集继续播放`;
        document.getElementById('nowPlayingEpTag').textContent = `正在播放 • 第 ${ep.index} 集`;
        document.getElementById('nowEpTitle').textContent = ep.title ? `第 ${ep.index} 集: ${ep.title}` : `第 ${ep.index} 集`;
      } else {
        document.getElementById('resumeBadge').textContent = `🕒 Resumed at Episode ${ep.index} of ${currentEpisodes.length}`;
        document.getElementById('nowPlayingEpTag').textContent = `NOW PLAYING • EPISODE ${ep.index}`;
        document.getElementById('nowEpTitle').textContent = ep.title ? `Episode ${ep.index}: ${ep.title}` : `Episode ${ep.index}`;
      }
      const dd = document.getElementById('epDropdown');
      if (dd) dd.value = ep.index;

      updatePlayerEpBadge();
      updateQualityUI();
      updateEpisodeNavButtons();
      // Show fast loading indicator
      showPlayerBuffering(true);
      if (centerPlayOverlay) centerPlayOverlay.classList.add('hidden');

      // Stream directly via Decrypted Video Endpoint (Pass stream_url and spade_a if already in ep.tracks to avoid calling VPS)
      let playSrc = preloadedSrc;
      if (!playSrc) {
        const sTitle = (currentSeries && currentSeries.title) ? currentSeries.title : '';
        let tr = null;
        if (ep.tracks && ep.tracks.length) {
          tr = pickPlayableTrack(ep.tracks, currentPlaybackQuality);
        }
        const sId = (currentSeries && currentSeries.series_id) ? currentSeries.series_id : '';
        playSrc = `/api/video/${sId}/${ep.vid}/play?quality=${currentPlaybackQuality}&ep=${ep.index}&title=${encodeURIComponent(sTitle)}`;
        if (tr && (tr.main_url || tr.backup_url)) {
          playSrc += `&stream_url=${encodeURIComponent(tr.main_url || tr.backup_url)}`;
          if (tr.spade_a) {
            playSrc += `&spade_a=${encodeURIComponent(tr.spade_a)}`;
          }
          if (tr.codec_type) {
            playSrc += `&codec=${encodeURIComponent(tr.codec_type)}`;
          }
        }
      }

      const curSrc = video.currentSrc || video.src || '';
      const isSameSrc = curSrc === playSrc || (playSrc && curSrc.endsWith(playSrc));
      if (!isSameSrc) {
        video.src = playSrc;
      }

      if (startMuted !== null) {
        video.muted = startMuted;
      } else {
        video.muted = false;
        if (video.volume === 0) video.volume = 1.0;
      }
      updateMuteUI();

      if (initialSeekTime > 0) {
        if (video.readyState >= 1) {
          try { video.currentTime = initialSeekTime; } catch (_) { }
        } else {
          const onLoaded = () => {
            try { video.currentTime = initialSeekTime; } catch (_) { }
          };
          video.addEventListener('loadedmetadata', onLoaded, { once: true });
        }
      }

      video.play().then(() => {
        showPlayerBuffering(false);
        if (centerPlayOverlay) centerPlayOverlay.classList.add('hidden');
        updatePlayBtnIcon(true);
      }).catch(() => {
        showPlayerBuffering(false);
        if (centerPlayOverlay) centerPlayOverlay.classList.remove('hidden');
        updatePlayBtnIcon(false);
      });

      // Auto Pre-cache next episode in background ONLY AFTER current video starts playing smoothly
      const onStartPlaying = () => {
        precacheNextEpisodes(ep.index);
      };
      video.addEventListener('playing', onStartPlaying, { once: true });
    }

    function precacheNextEpisodes(currentIndex) {
      if (!currentEpisodes || !currentEpisodes.length) return;
      const next1 = currentEpisodes.find(e => e.index === currentIndex + 1);
      const next2 = currentEpisodes.find(e => e.index === currentIndex + 2);
      if (next1 && next1.vid) {
        const sTitle = (currentSeries && currentSeries.title) ? currentSeries.title : '';
        fetch(`/api/video/${next1.vid}/prefetch?quality=${currentPlaybackQuality}&ep=${next1.index}&title=${encodeURIComponent(sTitle)}`).catch(() => { });
      }
      if (next2 && next2.vid) {
        setTimeout(() => {
          fetch(`/api/video/${next2.vid}/prefetch?quality=${currentPlaybackQuality}&ep=${next2.index}&title=${encodeURIComponent(sTitle)}`).catch(() => { });
        }, 2500);
      }
    }

    let bufferingSafetyTimeout = null;
    function showPlayerBuffering(show) {
      const buf = document.getElementById('playerBufferingOverlay');
      if (!buf) return;
      if (show) {
        buf.style.display = 'flex';
        if (bufferingSafetyTimeout) clearTimeout(bufferingSafetyTimeout);
        bufferingSafetyTimeout = setTimeout(() => {
          if (buf) buf.style.display = 'none';
          if (video.paused && centerPlayOverlay) {
            centerPlayOverlay.classList.remove('hidden');
          }
        }, 4000);
      } else {
        if (bufferingSafetyTimeout) clearTimeout(bufferingSafetyTimeout);
        buf.style.display = 'none';
      }
    }

    function updateEpisodeNavButtons() {
      const btnPrev = document.getElementById('btnPrevEp');
      const btnNext = document.getElementById('btnNextEp');
      if (btnPrev) {
        const canPrev = currentEpIndex > 1;
        btnPrev.disabled = !canPrev;
        btnPrev.style.opacity = canPrev ? '1' : '0.35';
        btnPrev.style.cursor = canPrev ? 'pointer' : 'not-allowed';
      }
      if (btnNext) {
        const canNext = Boolean(currentEpisodes && currentEpisodes.length && currentEpIndex < currentEpisodes.length);
        btnNext.disabled = !canNext;
        btnNext.style.opacity = canNext ? '1' : '0.35';
        btnNext.style.cursor = canNext ? 'pointer' : 'not-allowed';
      }
    }

    function nextEpisode(e) {
      if (e) e.stopPropagation();
      if (!currentEpisodes || !currentEpisodes.length) return;
      if (currentEpIndex < currentEpisodes.length) {
        playEpisode(currentEpIndex + 1);
      } else {
        showToast('🎬 Final Episode reached');
      }
    }

    function prevEpisode(e) {
      if (e) e.stopPropagation();
      if (currentEpIndex > 1) {
        playEpisode(currentEpIndex - 1);
      } else {
        showToast('🎬 Already at Episode 1');
      }
    }

    function jumpEpisode(idx) {
      playEpisode(parseInt(idx));
    }

    // ========================================================
    // VIDEO PLAYER CONTROLLER (Matching VideoPlayer.tsx)
    // ========================================================
    let video = null;
    let centerPlayBtn = null;
    let ctrlPlayBtn = null;
    let timeDisplay = null;
    let epGrid = null;
    let playerContainer = null;
    let centerPlayOverlay = null;
    let playerControlsBar = null;
    let timelineRange = null;
    let playerEpBadgeText = null;
    let playerEpDrawer = null;
    let playerDrawerGrid = null;
    let drawerSeriesTitle = null;
    let drawerSubtitle = null;

    let isScrubbing = false;
    let controlsTimeout = null;
    let seekFeedbackTimeout = null;
    let accumulatedSeek = 0;
    let singleTapTimer = null;
    let lastTapTime = 0;
    let lastTapSide = 'center';

    function updateTimelineTrack(curr, dur) {
      const tr = timelineRange || document.getElementById('timelineRange');
      if (!tr) return;
      if (!dur || isNaN(dur) || dur <= 0) {
        tr.style.background = 'rgba(255, 255, 255, 0.2)';
        return;
      }
      const pct = Math.max(0, Math.min(100, (curr / dur) * 100));
      tr.style.background = `linear-gradient(to right, #f59e0b 0%, #f59e0b ${pct}%, rgba(255, 255, 255, 0.2) ${pct}%, rgba(255, 255, 255, 0.2) 100%)`;
    }

    async function toggleNativePip(event) {
      if (event) event.stopPropagation();
      try {
        const v = video || document.getElementById('videoPlayer');
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (v && v.requestPictureInPicture) {
          await v.requestPictureInPicture();
        } else {
          toggleMiniPlayer(true);
        }
      } catch (err) {
        console.warn('Native PiP not available:', err);
        toggleMiniPlayer(true);
      }
    }

    async function queueCurrentSeries() {
      const sid = (currentSeries && (currentSeries.series_id || currentSeries.id))
        ? String(currentSeries.series_id || currentSeries.id)
        : null;

      if (!sid) {
        showToast('គ្មានទិន្នន័យរឿងសម្រាប់ដាក់ទាញយកទេ (No series data found)', '⚠️');
        return;
      }

      const title = (currentSeries && currentSeries.title) ? currentSeries.title : (document.getElementById('nowEpTitle')?.textContent || 'Drama');
      const cover = (currentSeries && currentSeries.cover) ? currentSeries.cover : (document.getElementById('detailThumbImg')?.src || '');
      const btn = document.getElementById('btnStreamQueue');
      const origHtml = btn ? btn.innerHTML : '📥 + Queue Series';

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ កំពុងបន្ថែម...';
      }

      const epCnt = (currentSeries && currentSeries.episode_cnt) || (currentEpisodes ? currentEpisodes.length : 0);
      const payload = {
        series_ids: [sid],
        ranges: { [sid]: 'all' },
        series_info: {
          [sid]: { title: title, cover: cover, episode_cnt: epCnt }
        }
      };

      try {
        const res = await fetch('/dl/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data && data.ok === false) {
          throw new Error(data.message || 'Failed to queue download');
        }

        showToast(`បានបន្ថែម "${title}" ទៅក្នុងបញ្ជីទាញយក!`, '📥');

        if (btn) {
          btn.innerHTML = '✓ បានដាក់ក្នុងបញ្ជី (Queued)';
          btn.style.borderColor = 'rgba(16, 185, 129, 0.6)';
          btn.style.color = '#34d399';
          setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = origHtml;
            btn.style.borderColor = '';
            btn.style.color = '';
          }, 3500);
        }

        // Trigger download polling to update header counters immediately without opening drawer
        if (typeof pollDownloadStatus === 'function') {
          pollDownloadStatus();
        }
        if (typeof startDownloadPolling === 'function') {
          startDownloadPolling();
        }
      } catch (err) {
        showToast(`បរាជ័យក្នុងការដាក់ទាញយក: ${err.message}`, '❌');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = origHtml;
        }
      }
    }

    function getLocalWatchlist() {
      try { return JSON.parse(localStorage.getItem('hg_watchlist') || '[]'); } catch (e) { return []; }
    }
    function saveLocalWatchlist(list) {
      try { localStorage.setItem('hg_watchlist', JSON.stringify(list)); } catch (e) {}
    }
    function updateWatchlistBtnState() {
      if (!currentSeries || !currentSeries.series_id) return;
      const btn = document.getElementById('btnWatchlist');
      if (!btn) return;
      const list = getLocalWatchlist();
      const exists = list.some(d => String(d.series_id) === String(currentSeries.series_id));
      btn.innerHTML = exists ? '<span>🔖</span> Added to Watchlist' : '<span>🏷️</span> Add to Watchlist';
    }
    function toggleCurrentWatchlist() {
      if (!currentSeries || !currentSeries.series_id) return;
      const sid = String(currentSeries.series_id);
      let list = getLocalWatchlist();
      const exists = list.some(d => String(d.series_id) === sid);
      if (exists) {
        list = list.filter(d => String(d.series_id) !== sid);
        showToast('Removed from Watchlist');
      } else {
        list.unshift({
          series_id: sid,
          title: currentSeries.title || 'Drama',
          cover: currentSeries.cover || '',
          episode_cnt: currentSeries.episode_cnt || (currentEpisodes ? currentEpisodes.length : 0),
          category: currentSeries.category || []
        });
        showToast('Saved to Watchlist! 🔖');
      }
      saveLocalWatchlist(list);
      updateWatchlistBtnState();
    }

    function setupVideoPlayer() {
      video = document.getElementById('videoPlayer');
      centerPlayBtn = document.getElementById('centerPlayBtn');
      ctrlPlayBtn = document.getElementById('ctrlPlayBtn');
      timeDisplay = document.getElementById('timeDisplay');
      playerContainer = document.getElementById('playerContainer');
      centerPlayOverlay = document.getElementById('centerPlayOverlay');
      playerControlsBar = document.getElementById('playerControlsBar');
      timelineRange = document.getElementById('timelineRange');
      playerEpBadgeText = document.getElementById('playerEpBadgeText');
      playerEpDrawer = document.getElementById('playerEpDrawer');
      playerDrawerGrid = document.getElementById('playerDrawerGrid');
      drawerSeriesTitle = document.getElementById('drawerSeriesTitle');
      drawerSubtitle = document.getElementById('drawerSubtitle');
      epGrid = document.getElementById('epGrid');

      updateEpisodeNavButtons();

      if (!video) return;
      if (video._hasSetupListeners) return;
      video._hasSetupListeners = true;

      // Smart Scrubbing / Seek bar listeners
      if (timelineRange) {
        const startScrub = () => {
          isScrubbing = true;
        };
        const moveScrub = () => {
          if (!video || !video.duration) return;
          const val = parseFloat(timelineRange.value);
          if (timeDisplay) timeDisplay.textContent = formatTime(val) + ' / ' + formatTime(video.duration);
          updateTimelineTrack(val, video.duration);
        };
        const endScrub = () => {
          if (!video || !video.duration) {
            isScrubbing = false;
            return;
          }
          const val = parseFloat(timelineRange.value);
          video.currentTime = val;
          isScrubbing = false;
          handlePlayerUserActivity();
        };

        timelineRange.addEventListener('pointerdown', startScrub);
        timelineRange.addEventListener('mousedown', startScrub);
        timelineRange.addEventListener('touchstart', startScrub, { passive: true });

        timelineRange.addEventListener('input', moveScrub);

        timelineRange.addEventListener('change', endScrub);
        timelineRange.addEventListener('pointerup', endScrub);
        timelineRange.addEventListener('mouseup', endScrub);
        timelineRange.addEventListener('touchend', endScrub);
      }

      // Time & Progress Update
      video.addEventListener('timeupdate', () => {
        showPlayerBuffering(false);
        if (!video.duration) return;
        const curr = video.currentTime;
        const dur = video.duration;
        if (!isScrubbing) {
          if (timelineRange) {
            timelineRange.max = dur;
            timelineRange.value = curr;
          }
          if (timeDisplay) timeDisplay.textContent = formatTime(curr) + ' / ' + formatTime(dur);
          updateTimelineTrack(curr, dur);
        }
      });

      video.addEventListener('loadedmetadata', () => {
        showPlayerBuffering(false);
        if (video.duration) {
          if (timelineRange) timelineRange.max = video.duration;
          if (timeDisplay) timeDisplay.textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
          updateTimelineTrack(video.currentTime, video.duration);
        }
        if (video.paused && centerPlayOverlay) {
          centerPlayOverlay.classList.remove('hidden');
        }
        updateEpisodeNavButtons();
      });

      // Buffering & fast playback state listeners
      video.addEventListener('waiting', () => { if (!video.paused) showPlayerBuffering(true); });
      video.addEventListener('canplay', () => showPlayerBuffering(false));
      video.addEventListener('canplaythrough', () => showPlayerBuffering(false));
      video.addEventListener('playing', () => showPlayerBuffering(false));
      video.addEventListener('loadeddata', () => showPlayerBuffering(false));
      video.addEventListener('loadedmetadata', () => showPlayerBuffering(false));
      video.addEventListener('pause', () => showPlayerBuffering(false));
      video.addEventListener('error', () => {
        showPlayerBuffering(false);
        const err = video.error;
        console.warn('[Video Player Event] Error:', err);
        if (err) {
          if (err.code === 4) {
            showToast('⚠️ Codec unsupported by browser. Use VLC / PotPlayer or enable chrome://flags/#enable-platform-hevc');
          } else if (err.code === 3) {
            showToast('⚠️ Video decode error. Click Next Ep or Download to watch in VLC.');
          } else {
            showToast('⚠️ Playback issue (Code ' + err.code + '). Opening in VLC / PotPlayer recommended.');
          }
        }
      });
      video.addEventListener('seeking', () => showPlayerBuffering(true));
      video.addEventListener('seeked', () => showPlayerBuffering(false));

      // Play / Pause State sync
      video.addEventListener('play', () => {
        if (centerPlayOverlay) centerPlayOverlay.classList.add('hidden');
        updatePlayBtnIcon(true);
        handlePlayerUserActivity();
      });

      video.addEventListener('pause', () => {
        if (centerPlayOverlay) centerPlayOverlay.classList.remove('hidden');
        updatePlayBtnIcon(false);
        showPlayerControls();
      });

      // Auto next when video ends
      video.addEventListener('ended', () => {
        if (autoNext && currentEpIndex < currentEpisodes.length) {
          nextEpisode();
        } else {
          if (centerPlayOverlay) centerPlayOverlay.classList.remove('hidden');
          updatePlayBtnIcon(false);
          showPlayerControls();
        }
      });

      // Fullscreen state listener across all browsers & iOS
      const handleFullscreenChange = () => {
        const isFull = Boolean(
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement
        );
        if (playerContainer) {
          if (isFull) playerContainer.classList.add('is-fullscreen');
          else playerContainer.classList.remove('is-fullscreen');
        }
        updateFullscreenBtnIcon(isFull);
      };

      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.addEventListener('mozfullscreenchange', handleFullscreenChange);
      document.addEventListener('MSFullscreenChange', handleFullscreenChange);

      video.addEventListener('webkitbeginfullscreen', () => {
        if (playerContainer) playerContainer.classList.add('is-fullscreen');
        updateFullscreenBtnIcon(true);
      });
      video.addEventListener('webkitendfullscreen', () => {
        if (playerContainer) playerContainer.classList.remove('is-fullscreen');
        updateFullscreenBtnIcon(false);
      });

      // Keyboard Shortcuts (Arrow Left/Right for Seek, Space for Play/Pause, F for Fullscreen, M for Mute)
      window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;
        if (document.getElementById('streamView').hidden) return;

        if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
          e.preventDefault();
          triggerSmartSeek('left');
        } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
          e.preventDefault();
          triggerSmartSeek('right');
        } else if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          togglePlay();
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          toggleFullscreen();
        } else if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          toggleMute();
        }
      });
    }

    function updatePlayBtnIcon(isPlaying) {
      if (!ctrlPlayBtn) ctrlPlayBtn = document.getElementById('ctrlPlayBtn');
      if (!ctrlPlayBtn) return;
      if (isPlaying) {
        ctrlPlayBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
      } else {
        ctrlPlayBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      }
    }

    function updateFullscreenBtnIcon(isFull) {
      const btn = document.getElementById('btnFullscreen');
      if (!btn) return;
      if (isFull) {
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>`;
      } else {
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
      }
    }

    function handlePlayerUserActivity() {
      showPlayerControls();
      if (controlsTimeout) clearTimeout(controlsTimeout);
      controlsTimeout = setTimeout(() => {
        if (video && !video.paused) hidePlayerControls();
      }, 3500);
    }

    function handlePlayerMouseLeave() {
      if (video && !video.paused) hidePlayerControls();
    }

    function showPlayerControls() {
      if (!playerControlsBar) playerControlsBar = document.getElementById('playerControlsBar');
      if (playerControlsBar) playerControlsBar.classList.remove('controls-hidden');
    }

    function hidePlayerControls() {
      if (!video) video = document.getElementById('videoPlayer');
      if (video && video.paused) return; // Never hide controls while paused!
      if (!playerEpDrawer) playerEpDrawer = document.getElementById('playerEpDrawer');
      if (playerEpDrawer && !playerEpDrawer.classList.contains('hidden')) return; // Do not hide when drawer open!
      if (!playerControlsBar) playerControlsBar = document.getElementById('playerControlsBar');
      if (playerControlsBar) playerControlsBar.classList.add('controls-hidden');
    }

    function togglePlay(e) {
      if (e) e.stopPropagation();
      if (!video) video = document.getElementById('videoPlayer');
      if (!video) return;
      if (!centerPlayOverlay) centerPlayOverlay = document.getElementById('centerPlayOverlay');
      if (!ctrlPlayBtn) ctrlPlayBtn = document.getElementById('ctrlPlayBtn');

      if (video.paused) {
        video.muted = false;
        if (video.volume === 0) video.volume = 1.0;
        updateMuteUI();
        const p = video.play();
        if (p !== undefined) {
          p.then(() => {
            if (centerPlayOverlay) centerPlayOverlay.classList.add('hidden');
            updatePlayBtnIcon(true);
          }).catch(() => {
            video.muted = true;
            updateMuteUI();
            video.play().then(() => {
              if (centerPlayOverlay) centerPlayOverlay.classList.add('hidden');
              updatePlayBtnIcon(true);
            }).catch(err => console.error('Play failed:', err));
          });
        }
      } else {
        video.pause();
        if (centerPlayOverlay) centerPlayOverlay.classList.remove('hidden');
        updatePlayBtnIcon(false);
      }
      handlePlayerUserActivity();
    }

    function handleTimelineSeek(val) {
      if (!video) video = document.getElementById('videoPlayer');
      if (!video) return;
      const time = parseFloat(val);
      if (video.duration) {
        video.currentTime = time;
        updateTimelineTrack(time, video.duration);
      }
      handlePlayerUserActivity();
    }

    function toggleMute(e) {
      if (e) e.stopPropagation();
      if (!video) video = document.getElementById('videoPlayer');
      if (!video) return;
      video.muted = !video.muted;
      updateMuteUI();
      handlePlayerUserActivity();
    }

    function changeVolume(val, e) {
      if (e) e.stopPropagation();
      if (!video) video = document.getElementById('videoPlayer');
      if (!video) return;
      const v = parseFloat(val);
      video.volume = v;
      video.muted = (v === 0);
      updateMuteUI();
      handlePlayerUserActivity();
    }

    function updateMuteUI() {
      const muteBtn = document.getElementById('muteBtn');
      const volSlider = document.getElementById('volSlider');
      if (!video) video = document.getElementById('videoPlayer');
      if (!muteBtn) return;
      const isMuted = !video || video.muted || video.volume === 0;
      if (isMuted) {
        muteBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
        if (volSlider) volSlider.value = 0;
      } else {
        muteBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
        if (volSlider) volSlider.value = video.volume;
      }
    }

    // Video Quality Track State & Dropdown Handlers (Default 720p as requested)
    currentPlaybackQuality = localStorage.getItem('hg_player_quality') || '720p';
    if (!localStorage.getItem('hg_default_720p_applied')) {
      currentPlaybackQuality = '720p';
      localStorage.setItem('hg_player_quality', '720p');
      localStorage.setItem('hg_default_720p_applied', '1');
    }

    function updateQualityUI() {
      const sel = document.getElementById('playerQualitySelect');
      if (!sel) return;
      sel.value = currentPlaybackQuality;

      // Dynamically append size labels to dropdown options from episode tracks metadata if available
      if (currentEpisodes && currentEpisodes.length) {
        const ep = currentEpisodes.find(e => e.index === currentEpIndex) || currentEpisodes[0];
        if (ep && ep.tracks && Array.isArray(ep.tracks)) {
          Array.from(sel.options).forEach(opt => {
            const val = opt.value.toLowerCase();
            const tr = ep.tracks.find(t => (t.definition || '').toLowerCase() === val);
            const isBytevc2 = tr && ((tr.codec_type || '').toLowerCase() === 'bytevc2' || /[?&]cs=5(&|$)/.test(tr.main_url || tr.backup_url || ''));
            const baseName = val === '1080p' ? '1080p FHD' : val === '720p' ? (isBytevc2 ? '720p (Auto 1080p)' : '720p HD') : val === '360p' ? '360p (Low)' : val;
            if (tr && tr.size_bytes) {
              const sz = (tr.size_bytes / (1024 * 1024)).toFixed(1) + 'M';
              opt.textContent = `${baseName} (${sz})`;
            } else {
              opt.textContent = baseName;
            }
          });
        }
      }
    }

    function selectQuality(q, e) {
      if (e) e.stopPropagation();
      currentPlaybackQuality = q;
      localStorage.setItem('hg_player_quality', q);
      updateQualityUI();
      showToast('✓ Video Quality set to ' + q);

      if (!video) video = document.getElementById('videoPlayer');
      if (video && currentEpisodes && currentEpisodes.length) {
        const ep = currentEpisodes.find(epItem => epItem.index === currentEpIndex) || currentEpisodes[0];
        const curTime = video.currentTime || 0;
        const isPaused = video.paused;

        let playSrc = '';
        const sTitle = (currentSeries && currentSeries.title) ? currentSeries.title : '';
        let tr = null;
        if (ep.tracks && ep.tracks.length) {
          tr = pickPlayableTrack(ep.tracks, currentPlaybackQuality);
        }
        const sId = (currentSeries && currentSeries.series_id) ? currentSeries.series_id : '';
        playSrc = `/api/video/${sId}/${ep.vid}/play?quality=${currentPlaybackQuality}&ep=${ep.index}&title=${encodeURIComponent(sTitle)}`;
        if (tr && (tr.main_url || tr.backup_url)) {
          playSrc += `&stream_url=${encodeURIComponent(tr.main_url || tr.backup_url)}`;
          if (tr.spade_a) {
            playSrc += `&spade_a=${encodeURIComponent(tr.spade_a)}`;
          }
          if (tr.codec_type) {
            playSrc += `&codec=${encodeURIComponent(tr.codec_type)}`;
          }
        }

        video.src = playSrc;
        const onCanPlay = () => {
          try { video.currentTime = curTime; } catch (err) { }
          video.removeEventListener('loadedmetadata', onCanPlay);
          if (!isPaused) {
            video.play().catch(() => { });
          }
        };
        video.addEventListener('loadedmetadata', onCanPlay, { once: true });
      }
      handlePlayerUserActivity();
    }

    function cycleSpeed(e) {
      if (e) e.stopPropagation();
      if (!video) video = document.getElementById('videoPlayer');
      if (!video) return;
      speedIdx = (speedIdx + 1) % playbackSpeeds.length;
      const s = playbackSpeeds[speedIdx];
      video.playbackRate = s;
      const speedBtn = document.getElementById('speedBtn');
      if (speedBtn) speedBtn.textContent = s + 'x';
      showToast(`Playback Speed: ${s}x`);
      handlePlayerUserActivity();
    }

    // Cross-browser & iOS Fullscreen Handler
    function toggleFullscreen(e) {
      if (e) e.stopPropagation();
      const isFull = Boolean(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );

      if (!isFull) {
        // 1. Check iOS Safari
        const isIOS = /iPhone|iPod|iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (isIOS && video.webkitEnterFullscreen) {
          try {
            video.webkitEnterFullscreen();
            return;
          } catch (_) { }
        }

        // 2. Standard HTML5 Container Fullscreen
        if (playerContainer.requestFullscreen) {
          playerContainer.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
            if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
          });
        } else if (playerContainer.webkitRequestFullscreen) {
          playerContainer.webkitRequestFullscreen();
        } else if (playerContainer.mozRequestFullScreen) {
          playerContainer.mozRequestFullScreen();
        } else if (playerContainer.msRequestFullscreen) {
          playerContainer.msRequestFullscreen();
        } else if (video.webkitEnterFullscreen) {
          video.webkitEnterFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => { });
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
      handlePlayerUserActivity();
    }

    // Smart Seek Trigger (-10s / +10s with cumulative badge feedback)
    function triggerSmartSeek(side) {
      if (!video.duration && !video.currentTime) return;
      const delta = side === 'right' ? 10 : -10;
      const newTime = Math.max(0, Math.min(video.duration || 999999, video.currentTime + delta));
      video.currentTime = newTime;

      accumulatedSeek += 10;

      const overlay = document.getElementById(side === 'right' ? 'seekFeedbackRight' : 'seekFeedbackLeft');
      const textEl = document.getElementById(side === 'right' ? 'seekFeedbackTextRight' : 'seekFeedbackTextLeft');
      const otherOverlay = document.getElementById(side === 'right' ? 'seekFeedbackLeft' : 'seekFeedbackRight');

      if (otherOverlay) otherOverlay.style.display = 'none';

      if (overlay && textEl) {
        textEl.textContent = (side === 'right' ? '+' : '-') + accumulatedSeek + 's';
        overlay.style.display = 'flex';

        if (seekFeedbackTimeout) clearTimeout(seekFeedbackTimeout);
        seekFeedbackTimeout = setTimeout(() => {
          overlay.style.display = 'none';
          accumulatedSeek = 0;
        }, 750);
      }

      handlePlayerUserActivity();
    }

    // Double Click / Single Click Handler for Desktop
    function handlePlayerAreaClick(e) {
      if (e.target.closest('.player-controls-bar') || e.target.closest('.player-ep-drawer')) return;

      const rect = playerContainer.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickRatio = clickX / rect.width;
      const side = clickRatio < 0.38 ? 'left' : clickRatio > 0.62 ? 'right' : 'center';

      if (e.detail === 2) {
        // Double click detected
        if (singleTapTimer) {
          clearTimeout(singleTapTimer);
          singleTapTimer = null;
        }
        if (side === 'left' || side === 'right') {
          triggerSmartSeek(side);
        } else {
          togglePlay();
        }
      } else if (e.detail === 1) {
        // Wait briefly to distinguish single click from double click
        if (singleTapTimer) clearTimeout(singleTapTimer);
        singleTapTimer = setTimeout(() => {
          togglePlay();
          handlePlayerUserActivity();
        }, 240);
      }
    }

    // Touch Handler for Mobile (Double Tap -10s / +10s)
    function handlePlayerTouchEnd(e) {
      if (e.target.closest('.player-controls-bar') || e.target.closest('.player-ep-drawer')) return;

      const touch = e.changedTouches[0];
      if (!touch) return;
      const rect = playerContainer.getBoundingClientRect();
      const touchX = touch.clientX - rect.left;
      const touchRatio = touchX / rect.width;
      const side = touchRatio < 0.4 ? 'left' : touchRatio > 0.6 ? 'right' : 'center';

      const now = Date.now();
      const timeDiff = now - lastTapTime;

      if (timeDiff < 320 && lastTapSide === side && (side === 'left' || side === 'right')) {
        // Double tap detected!
        if (singleTapTimer) {
          clearTimeout(singleTapTimer);
          singleTapTimer = null;
        }
        triggerSmartSeek(side);
        lastTapTime = 0;
      } else {
        // Single tap
        lastTapTime = now;
        lastTapSide = side;

        if (singleTapTimer) clearTimeout(singleTapTimer);
        singleTapTimer = setTimeout(() => {
          handlePlayerUserActivity();
        }, 260);
      }
    }

    // In-Player Episode Drawer Toggle & Render
    function toggleEpisodeDrawer(e) {
      if (e) e.stopPropagation();
      if (!playerEpDrawer) return;

      const isHidden = playerEpDrawer.classList.contains('hidden');
      if (isHidden) {
        renderPlayerDrawerEpisodes();
        playerEpDrawer.classList.remove('hidden');
        if (drawerSeriesTitle && currentSeries) {
          drawerSeriesTitle.textContent = `All Episodes (${currentEpisodes.length})`;
        }
      } else {
        playerEpDrawer.classList.add('hidden');
      }
    }

    function renderPlayerDrawerEpisodes() {
      if (!playerDrawerGrid || !currentEpisodes) return;
      playerDrawerGrid.innerHTML = currentEpisodes.map(ep => {
        const isCur = ep.index === currentEpIndex;
        return `
        <button class="ep-drawer-btn ${isCur ? 'current' : ''}" onclick="selectEpisodeFromDrawer(${ep.index}, event)">
          <span>${ep.index}</span>
          ${ep.index <= 10 ? '<span class="badge-free">FREE</span>' : '<span class="badge-vip">VIP</span>'}
        </button>
      `;
      }).join('');
    }

    function selectEpisodeFromDrawer(epIndex, e) {
      if (e) e.stopPropagation();
      if (playerEpDrawer) playerEpDrawer.classList.add('hidden');
      playEpisode(epIndex);
    }

    function formatTime(s) {
      if (isNaN(s) || s === Infinity) return "0:00";
      const mins = Math.floor(s / 60);
      const secs = Math.floor(s % 60);
      return mins + ":" + (secs < 10 ? "0" : "") + secs;
    }



    function downloadCurrentEp() {
      if (!currentSeries || !currentEpisodes.length) return;
      const ep = currentEpisodes.find(e => e.index === currentEpIndex) || currentEpisodes[0];
      const url = `/api/video/${ep.vid}/play?quality=1080p`;
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentSeries.title}_Ep${ep.index}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    function copyShareLink() {
      navigator.clipboard.writeText(window.location.href);
      alert('Stream link copied to clipboard!');
    }

    function formatTime(s) {
      if (isNaN(s)) return "0:00";
      const mins = Math.floor(s / 60);
      const secs = Math.floor(s % 60);
      return mins + ":" + (secs < 10 ? "0" : "") + secs;
    }

    function esc(str) {
      return (str || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
      })[m]);
    }

    function updatePlayerEpBadge() {
      const badge = document.getElementById('playerEpBadgeText');
      if (badge) badge.textContent = `EP ${currentEpIndex}`;
      const btnPrev = document.getElementById('btnPrevEp');
      const btnNext = document.getElementById('btnNextEp');
      if (btnPrev) btnPrev.disabled = (currentEpIndex <= 1);
      if (btnNext) btnNext.disabled = (currentEpIndex >= currentEpisodes.length);
    }

        // Submitting Downloads
        async function submitModalDownload() {
            if (!currentDetailSeries) return;

            let rangeVal = document.getElementById('customRangeInput').value.trim();
            let estimatedCount = currentDetailSeries.episode_cnt || (currentDetailSeries.episodes ? currentDetailSeries.episodes.length : 80);
            if (selectedEpisodes.size > 0 && rangeVal !== 'all') {
                const sorted = Array.from(selectedEpisodes).sort((a, b) => a - b);
                rangeVal = sorted.join(',');
                estimatedCount = sorted.length;
            } else {
                rangeVal = 'all';
            }

            const sid = currentDetailSeries.series_id;
            const title = currentDetailSeries.title;
            const cover = currentDetailSeries.cover;
            const epCnt = currentDetailSeries.episode_cnt || (currentDetailSeries.episodes ? currentDetailSeries.episodes.length : 0);

            const doSubmit = async (selectedMode) => {
                const activeMode = (typeof window.getActiveDownloadMode === 'function') ? window.getActiveDownloadMode() : 'merged';
                const finalMode = selectedMode || activeMode || 'merged';
                const payload = {
                    series_ids: [sid],
                    ranges: { [sid]: rangeVal },
                    download_mode: finalMode,
                    series_info: {
                        [sid]: {
                            title: title,
                            cover: cover,
                            episode_cnt: epCnt
                        }
                    }
                };

                try {
                    const res = await fetch('/dl/submit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await res.json();
                    downloadedSeriesCache.set(String(sid), {
                        series_id: String(sid),
                        title: title || '',
                        count: 0,
                        total: epCnt || 0,
                        summary: `${epCnt || 0} ភាគ`,
                        status: 'downloading'
                    });
                    updateVisibleCardBadges();
                    setTimeout(syncDownloadedSeriesCache, 800);
                    showToast(`បានដាក់បញ្ចូលទៅក្នុងការទាញយក! (${rangeVal})`, '📥');
                    closeDetailModal();
                    toggleDownloadsDrawer(true, 'active');
                    if (typeof pollDownloadStatus === 'function') pollDownloadStatus();
                    if (typeof startDownloadPolling === 'function') startDownloadPolling();
                } catch (err) {
                    showToast(`បរាជ័យក្នុងការដាក់ទាញយក: ${err.message}`, '❌');
                }
            };

            const proceedWithMode = () => {
                if (typeof window.promptDownloadMode === 'function') {
                    window.promptDownloadMode({
                        title: title || 'Drama',
                        episodeCount: estimatedCount,
                        onConfirm: doSubmit
                    });
                } else {
                    doSubmit();
                }
            };

            if (typeof window.checkAndPromptDuplicate === 'function') {
                window.checkAndPromptDuplicate(sid, title, 'hongguo', estimatedCount, () => {
                    proceedWithMode();
                });
            } else {
                proceedWithMode();
            }
        }

        async function quickDownload(seriesId, title, cover) {
            if (typeof requireActiveLicense === 'function' && !requireActiveLicense('ទាញយករឿង HongGuo')) {
                return;
            }
            const drama = (window.allDramas || []).find(d => String(d.series_id) === String(seriesId));
            const epCount = (drama && drama.episode_cnt) ? drama.episode_cnt : 80;

            const doSubmit = async (selectedMode) => {
                const activeMode = (typeof window.getActiveDownloadMode === 'function') ? window.getActiveDownloadMode() : 'merged';
                const finalMode = selectedMode || activeMode || 'merged';
                const payload = {
                    series_ids: [seriesId],
                    ranges: { [seriesId]: 'all' },
                    download_mode: finalMode,
                    series_info: {
                        [seriesId]: { title: title, cover: cover }
                    }
                };

                try {
                    const res = await fetch('/dl/submit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    downloadedSeriesCache.set(String(seriesId), {
                        series_id: String(seriesId),
                        title: title,
                        count: 0,
                        total: epCount || 0,
                        summary: 'កំពុងដំណើរការ',
                        status: 'downloading'
                    });
                    updateVisibleCardBadges();
                    setTimeout(syncDownloadedSeriesCache, 800);
                    showToast(`បានបន្ថែម "${title}" ទៅក្នុងបញ្ជីទាញយក!`, '📥');
                    toggleDownloadsDrawer(true, 'active');
                    if (typeof pollDownloadStatus === 'function') pollDownloadStatus();
                    if (typeof startDownloadPolling === 'function') startDownloadPolling();
                } catch (err) {
                    showToast(`Error: ${err.message}`, '❌');
                }
            };

            const proceedWithMode = () => {
                const activeMode = (typeof window.getActiveDownloadMode === 'function') ? window.getActiveDownloadMode() : 'merged';
                if (typeof window.promptDownloadMode === 'function') {
                    window.promptDownloadMode({
                        title: title || 'Drama',
                        episodeCount: epCount,
                        onConfirm: doSubmit
                    });
                } else {
                    doSubmit(activeMode);
                }
            };

            if (typeof window.checkAndPromptDuplicate === 'function') {
                window.checkAndPromptDuplicate(seriesId, title, 'hongguo', epCount, () => {
                    proceedWithMode();
                });
            } else {
                proceedWithMode();
            }
        }

        async function submitSingleEpisodeDownload(seriesId, vid, epIndex) {
            const payload = {
                series_ids: [seriesId],
                ranges: { [seriesId]: `${epIndex}` }
            };
            try {
                await fetch('/dl/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const existing = downloadedSeriesCache.get(String(seriesId)) || {};
                downloadedSeriesCache.set(String(seriesId), {
                    ...existing,
                    series_id: String(seriesId),
                    status: 'downloading'
                });
                updateVisibleCardBadges();
                setTimeout(syncDownloadedSeriesCache, 800);
                showToast(`បានដាក់ទាញយក EP${epIndex}!`, '📥');
                toggleDownloadsDrawer(true, 'active');
                if (typeof pollDownloadStatus === 'function') pollDownloadStatus();
                if (typeof startDownloadPolling === 'function') startDownloadPolling();
            } catch (err) {
                showToast(`Error: ${err.message}`, '❌');
            }
        }

        window.selectCategory = selectCategory;
        window.loadCategory = loadCategory;
        window.renderDramaGrid = renderDramaGrid;
        window.loadMoreDramas = loadMoreDramas;
        window.goToPage = goToPage;
        window.changePage = changePage;
        window.openStreamPage = openStreamPage;
        window.openDramaDetail = openDramaDetail;
        window.quickPlay = quickPlay;
        window.quickDownload = quickDownload;
        window.onSearchInputChanged = onSearchInputChanged;
        window.onSearchKeyDown = onSearchKeyDown;
        window.handleSearchInputPaste = handleSearchInputPaste;
        window.executeSearchTitle = executeSearchTitle;
        window.executeFetchLink = executeFetchLink;
        window.pasteHgFromClipboard = pasteHgFromClipboard;
        window.clearSearchInput = clearSearchInput;
        window.closeDetailModal = closeDetailModal;
        window.setRangeQuick = setRangeQuick;
        window.updateRangeSelection = updateRangeSelection;
        window.selectAllEpisodes = selectAllEpisodes;
        window.deselectAllEpisodes = deselectAllEpisodes;
        window.playFirstEpisode = playFirstEpisode;
        window.submitModalDownload = submitModalDownload;
        window.toggleEpisodeSelect = toggleEpisodeSelect;
        window.toggleEpisodeCheck = toggleEpisodeCheck;
        window.playEpisode = playEpisode;
        window.selectEpisodeFromDrawer = selectEpisodeFromDrawer;
        if (typeof clearAllHongguoStarredDramas === 'function') window.clearAllHongguoStarredDramas = clearAllHongguoStarredDramas;
        if (typeof downloadAllSelectedStarredSequential === 'function') window.downloadAllSelectedStarredSequential = downloadAllSelectedStarredSequential;
        if (typeof toggleSelectAllHongguoStarred === 'function') window.toggleSelectAllHongguoStarred = toggleSelectAllHongguoStarred;
        if (typeof downloadSingleStarredSeries === 'function') window.downloadSingleStarredSeries = downloadSingleStarredSeries;
        if (typeof updateSelectedStarredCount === 'function') window.updateSelectedStarredCount = updateSelectedStarredCount;

