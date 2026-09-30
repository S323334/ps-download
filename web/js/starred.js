// =========================================================
// UNIFIED GLOBAL STARRED / FAVORITES SYSTEM
// Supports starring from Hongguo, HaoSou, and MVFFM
// =========================================================

let _currentStarredFilter = 'all';

function getGlobalStarredDramas() {
    try {
        const raw = localStorage.getItem('hongguo_starred_dramas') || '[]';
        const list = JSON.parse(raw);
        // Normalize any old format items
        return list.map(item => ({
            id: String(item.id || item.series_id || ''),
            platform: item.platform || 'hongguo',
            title: item.title || 'Drama',
            cover: item.cover || '',
            remarks: item.remarks || (item.eps ? `${item.eps} ភាគ` : ''),
            eps: item.eps || 0,
            added_at: item.added_at || Date.now()
        })).filter(it => it.id);
    } catch (e) {
        return [];
    }
}

function saveGlobalStarredDramas(arr) {
    try {
        localStorage.setItem('hongguo_starred_dramas', JSON.stringify(arr));
    } catch (e) {}
    updateGlobalStarredBadge();
}

function isDramaStarred(id, platform = null) {
    if (!id) return false;
    const idStr = String(id);
    const list = getGlobalStarredDramas();
    if (platform) {
        return list.some(item => (item.id === idStr || String(item.series_id) === idStr) && item.platform === platform);
    }
    return list.some(item => (item.id === idStr || String(item.series_id) === idStr));
}

function toggleDramaStar(firstArg, title, cover, eps, remarks, platform = 'hongguo') {
    let id, t, c, p, r, e;
    if (typeof firstArg === 'object' && firstArg !== null) {
        id = firstArg.id || firstArg.series_id;
        t = firstArg.title || 'Drama';
        c = firstArg.cover || '';
        p = firstArg.platform || 'hongguo';
        r = firstArg.remarks || (firstArg.eps ? `${firstArg.eps} ភាគ` : '');
        e = firstArg.eps || 0;
    } else {
        id = firstArg;
        t = title || 'Drama';
        c = cover || '';
        p = platform || 'hongguo';
        e = eps || 0;
        r = remarks || (e ? `${e} ភាគ` : '');
    }

    if (!id) return false;
    const idStr = String(id);
    let list = getGlobalStarredDramas();
    const idx = list.findIndex(item => (item.id === idStr || String(item.series_id) === idStr) && item.platform === p);
    let isNowStarred = false;

    if (idx >= 0) {
        list.splice(idx, 1);
        isNowStarred = false;
        showToast(`បានដក "${t}" ចេញពីផ្កាយ`, '⭐');
    } else {
        list.unshift({
            id: idStr,
            platform: p,
            title: t,
            cover: c,
            remarks: r,
            eps: e,
            added_at: Date.now()
        });
        isNowStarred = true;
        showToast(`បានដាក់ផ្កាយ / Pin "${t}"!`, '⭐');
    }

    saveGlobalStarredDramas(list);
    updateStarButtonsOnPage(idStr, p, isNowStarred);

    // If currently on Starred view, re-render
    const starredView = document.getElementById('starredView');
    if (starredView && starredView.style.display !== 'none') {
        renderGlobalStarredGrid();
    }

    return isNowStarred;
}

window.getGlobalStarredDramas = getGlobalStarredDramas;
window.isDramaStarred = isDramaStarred;
window.toggleDramaStar = toggleDramaStar;
window.updateGlobalStarredBadge = updateGlobalStarredBadge;
window.openGlobalStarredView = openGlobalStarredView;

function updateStarButtonsOnPage(id, platform, isStarred) {
    const idStr = String(id);
    // 1. Hongguo cards
    document.querySelectorAll(`.star-btn[data-sid="${idStr}"]`).forEach(btn => {
        btn.classList.toggle('starred', isStarred);
        btn.innerHTML = isStarred ? '★' : '☆';
    });
    // 2. HaoSou cards
    document.querySelectorAll(`.hs-star-btn[data-hs-star="${idStr}"]`).forEach(btn => {
        btn.classList.toggle('starred', isStarred);
        btn.innerHTML = isStarred ? '★' : '☆';
    });
    // 3. MVFFM cards
    document.querySelectorAll(`.mv-star-btn[data-mv-star="${idStr}"]`).forEach(btn => {
        btn.classList.toggle('starred', isStarred);
        btn.innerHTML = isStarred ? '★' : '☆';
    });
}

function updateGlobalStarredBadge() {
    const list = getGlobalStarredDramas();
    const count = list.length;

    // Header badge
    const badge = document.getElementById('globalStarredBadge');
    if (badge) {
        if (count > 0) {
            badge.innerText = count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }

    // Inside Starred view badge
    const totalBadge = document.getElementById('starredTotalBadge');
    if (totalBadge) totalBadge.innerText = count;
}

function openGlobalStarredView() {
    // Switch to starred view
    switchPlatform('starred');
    renderGlobalStarredGrid();
    const card = document.getElementById('starredView');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function filterStarredPlatform(p) {
    _currentStarredFilter = p || 'all';
    document.querySelectorAll('.starred-chip').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.platform === _currentStarredFilter);
    });
    renderGlobalStarredGrid();
}

let _selectedStarredKeys = new Set(); // Set of `${platform}:${id}`

function getStarredItemKey(id, platform) {
    return `${platform || 'hongguo'}:${String(id)}`;
}

function onStarredCardCheckChange(id, platform, isChecked) {
    const key = getStarredItemKey(id, platform);
    if (isChecked) {
        _selectedStarredKeys.add(key);
    } else {
        _selectedStarredKeys.delete(key);
    }
    updateStarredSelectionUI();
}

function toggleSelectAllStarred(isAll) {
    const allList = getGlobalStarredDramas();
    const filtered = _currentStarredFilter === 'all'
        ? allList
        : allList.filter(item => item.platform === _currentStarredFilter);

    if (isAll) {
        filtered.forEach(it => {
            _selectedStarredKeys.add(getStarredItemKey(it.id, it.platform));
        });
    } else {
        filtered.forEach(it => {
            _selectedStarredKeys.delete(getStarredItemKey(it.id, it.platform));
        });
    }
    updateStarredSelectionUI();
}

function updateStarredSelectionUI() {
    const allList = getGlobalStarredDramas();
    const filtered = _currentStarredFilter === 'all'
        ? allList
        : allList.filter(item => item.platform === _currentStarredFilter);

    const totalVisible = filtered.length;
    let selectedCount = 0;
    filtered.forEach(it => {
        if (_selectedStarredKeys.has(getStarredItemKey(it.id, it.platform))) {
            selectedCount++;
        }
    });

    // Toggle batch toolbar visibility
    const tb = document.getElementById('starredBatchToolbar');
    if (tb) {
        tb.style.display = totalVisible > 0 ? 'flex' : 'none';
    }

    // Select All Checkbox
    const allCb = document.getElementById('starredSelectAllCb');
    if (allCb) {
        allCb.checked = (totalVisible > 0 && selectedCount === totalVisible);
        allCb.indeterminate = (selectedCount > 0 && selectedCount < totalVisible);
    }

    // Selected Badge
    const badge = document.getElementById('starredSelectedBadge');
    if (badge) {
        badge.innerText = `(${selectedCount}/${totalVisible})`;
    }

    // Download Button Count & State
    const dlCount = document.getElementById('starredDlBtnCount');
    if (dlCount) {
        dlCount.innerText = `(${selectedCount})`;
    }
    const dlBtn = document.getElementById('btnStarredBatchDl');
    if (dlBtn) {
        dlBtn.disabled = (selectedCount === 0);
    }

    // Update DOM Cards
    document.querySelectorAll('.starred-card').forEach(card => {
        const id = card.getAttribute('data-card-id');
        const platform = card.getAttribute('data-card-platform');
        const isSel = _selectedStarredKeys.has(getStarredItemKey(id, platform));
        card.classList.toggle('selected', isSel);
        const cb = card.querySelector('.starred-card-cb');
        if (cb) cb.checked = isSel;
    });
}

function renderGlobalStarredGrid() {
    const grid = document.getElementById('starredGrid');
    if (!grid) return;

    const allList = getGlobalStarredDramas();
    updateGlobalStarredBadge();

    const filtered = _currentStarredFilter === 'all'
        ? allList
        : allList.filter(item => item.platform === _currentStarredFilter);

    const tb = document.getElementById('starredBatchToolbar');
    if (tb) {
        tb.style.display = filtered.length > 0 ? 'flex' : 'none';
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 60px 20px; color: #94a3b8;">
                <div style="font-size: 3rem; margin-bottom: 12px;">⭐</div>
                <div style="font-size: 1.1rem; font-weight: 700; color: #cbd5e1; margin-bottom: 6px;">
                    ${currentLang === 'zh' ? '暂无 PIN 收藏的短剧' : (currentLang === 'km' ? 'មិនទាន់មានរឿងបានដាក់ PIN ទេ' : 'No pinned dramas yet')}
                </div>
                <div style="font-size: 0.85rem; color: #64748b;">
                    ${currentLang === 'zh' ? '在任何网站 (Hongguo, HaoSou, MVFFM) 的短剧封面上点击 ★ 即可 PIN 收藏' : (currentLang === 'km' ? 'ចុចលើសញ្ញា ★ នៅលើរឿងក្នុង Hongguo, HaoSou, ឬ MVFFM ដើម្បីដាក់ PIN' : 'Click the ★ star on any drama card in Hongguo, HaoSou, or MVFFM to pin it here')}
                </div>
            </div>
        `;
        updateStarredSelectionUI();
        return;
    }

    // Queue title translations
    filtered.forEach(it => {
        if (it.title && typeof queueTitleTranslation === 'function') {
            queueTitleTranslation(it.title);
        }
    });

    const platformLabels = {
        hongguo: '🍎 HONGGUO',
        haosou: '🎬 HAOSOU',
        mvffm: '🎥 MVFFM'
    };

    grid.innerHTML = filtered.map(item => {
        const cover = item.cover || '/uploads/image/20250311/5754a9f551b45a5f36800c0212460d0a.png';
        const displayTitle = (currentLang === 'zh' || currentLang === 'original') ? item.title : (typeof getDisplayTitle === 'function' ? getDisplayTitle(item.title) : item.title);
        const pLabel = platformLabels[item.platform] || item.platform.toUpperCase();
        const itemKey = getStarredItemKey(item.id, item.platform);
        const isSelected = _selectedStarredKeys.has(itemKey);

        return `
            <div class="starred-card ${isSelected ? 'selected' : ''}" data-card-id="${escapeHtml(item.id)}" data-card-platform="${escapeHtml(item.platform)}" onclick="playStarredDrama('${escapeHtml(item.id)}', '${escapeHtml(item.platform)}')">
                <div class="starred-poster-wrapper">
                    <img class="starred-poster" src="${escapeHtml(cover)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.src='/favicon.ico';">
                    
                    <label class="starred-card-cb-wrap" onclick="event.stopPropagation()" title="គ្រីសដើម្បីទាញយក">
                        <input type="checkbox" class="starred-card-cb" ${isSelected ? 'checked' : ''} onchange="onStarredCardCheckChange('${escapeHtml(item.id)}', '${escapeHtml(item.platform)}', this.checked)">
                    </label>

                    <span class="starred-platform-tag platform-${escapeHtml(item.platform)}">${pLabel}</span>
                    <button class="starred-unstar-btn" onclick="event.stopPropagation(); removeStarredDrama('${escapeHtml(item.id)}', '${escapeHtml(item.platform)}')" title="ដកចេញពី PIN">★</button>
                </div>
                <div class="starred-body">
                    <div class="starred-card-title" data-original-title="${escapeHtml(item.title)}" title="${escapeHtml(item.title)}">${escapeHtml(displayTitle)}</div>
                    <div class="starred-meta">
                        <span class="starred-platform-name">${pLabel}</span>
                        ${item.eps ? `<span class="starred-eps">${escapeHtml(String(item.eps))} ភាគ</span>` : ''}
                    </div>
                    <div class="starred-card-actions" onclick="event.stopPropagation()">
                        <button class="starred-btn-play" onclick="playStarredDrama('${escapeHtml(item.id)}', '${escapeHtml(item.platform)}')">
                            ▶️ ${currentLang === 'zh' ? '播放 / 查看' : (currentLang === 'km' ? 'មើល / Play' : 'Play')}
                        </button>
                        <button class="starred-btn-dl-single" onclick="downloadSingleStarredDrama('${escapeHtml(item.id)}', '${escapeHtml(item.platform)}', '${escapeHtml(item.title)}', '${escapeHtml(cover)}')" title="ទាញយកភាគទាំងអស់">
                            📥
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    updateStarredSelectionUI();
}

async function downloadSelectedStarredDramas() {
    const allList = getGlobalStarredDramas();
    const selectedItems = allList.filter(it => _selectedStarredKeys.has(getStarredItemKey(it.id, it.platform)));

    if (selectedItems.length === 0) {
        showToast('⚠️ សូមគ្រីសរើសរឿងដែលចង់ទាញយកជាមុនសិន!', '⚠️');
        return;
    }

    const count = selectedItems.length;
    showToast(`🚀 កំពុងចាប់ផ្តើមទាញយក ${count} រឿងដែលបានរើស...`, '📥');

    let successCount = 0;

    for (const item of selectedItems) {
        try {
            if (item.platform === 'mvffm') {
                const res = await fetch(`/api/mvffm/detail?id=${encodeURIComponent(item.id)}`);
                const d = await res.json();
                if (d && d.ok && d.data) {
                    const sources = d.data.sources || [];
                    const eps = (sources[0] && sources[0].episodes) || d.data.episodes || [];
                    if (eps.length) {
                        await fetch('/api/mvffm/download', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                drama_id: item.id,
                                title: d.data.title || item.title,
                                episodes: eps
                            })
                        });
                        successCount++;
                    }
                }
            } else if (item.platform === 'haosou') {
                const res = await fetch(`/api/haosou/detail?id=${encodeURIComponent(item.id)}`);
                const d = await res.json();
                if (d && d.ok && d.data && d.data.episodes && d.data.episodes.length) {
                    await fetch('/api/haosou/download', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            book_id: item.id,
                            title: d.data.title || item.title,
                            episodes: d.data.episodes
                        })
                    });
                    successCount++;
                }
            } else {
                // Hongguo
                const payload = {
                    series_ids: [item.id],
                    ranges: { [item.id]: 'all' },
                    series_info: {
                        [item.id]: { title: item.title, cover: item.cover }
                    }
                };
                await fetch('/dl/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                successCount++;
            }
        } catch (e) {
            console.warn(`Error queueing ${item.title}:`, e);
        }
    }

    showToast(`✅ បានបញ្ជូនការទាញយក ${successCount}/${count} រឿងទៅក្នុងបញ្ជី!`, '🚀');

    if (typeof toggleDownloadsDrawer === 'function') {
        toggleDownloadsDrawer(true, 'active');
    }
}

async function downloadSingleStarredDrama(id, platform, title, cover) {
    const doDownload = async () => {
        _selectedStarredKeys.add(getStarredItemKey(id, platform));
        updateStarredSelectionUI();
        showToast(`🚀 កំពុងរៀបចំទាញយក "${title}"...`, '📥');
        
        try {
            if (platform === 'mvffm') {
                const res = await fetch(`/api/mvffm/detail?id=${encodeURIComponent(id)}`);
                const d = await res.json();
                if (d && d.ok && d.data) {
                    const sources = d.data.sources || [];
                    const eps = (sources[0] && sources[0].episodes) || d.data.episodes || [];
                    if (eps.length) {
                        await fetch('/api/mvffm/download', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                drama_id: id,
                                title: d.data.title || title,
                                episodes: eps
                            })
                        });
                        showToast(`✅ បានដាក់ទាញយក "${title}"!`, '🚀');
                    }
                }
            } else if (platform === 'haosou') {
                const res = await fetch(`/api/haosou/detail?id=${encodeURIComponent(id)}`);
                const d = await res.json();
                if (d && d.ok && d.data && d.data.episodes) {
                    await fetch('/api/haosou/download', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            book_id: id,
                            title: d.data.title || title,
                            episodes: d.data.episodes
                        })
                    });
                    showToast(`✅ បានដាក់ទាញយក "${title}"!`, '🚀');
                }
            } else {
                // Hongguo
                const payload = {
                    series_ids: [id],
                    ranges: { [id]: 'all' },
                    series_info: {
                        [id]: { title: title, cover: cover }
                    }
                };
                await fetch('/dl/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                showToast(`✅ បានដាក់ទាញយក "${title}"!`, '🚀');
            }

            if (typeof toggleDownloadsDrawer === 'function') {
                toggleDownloadsDrawer(true, 'active');
            }
        } catch (e) {
            showToast(`❌ បរាជ័យក្នុងការទាញយក: ${e.message}`, '❌');
        }
    };

    if (typeof window.checkAndPromptDuplicate === 'function') {
        window.checkAndPromptDuplicate(id, title, platform, 0, () => {
            doDownload();
        });
    } else {
        doDownload();
    }
}

window.toggleSelectAllStarred = toggleSelectAllStarred;
window.onStarredCardCheckChange = onStarredCardCheckChange;
window.downloadSelectedStarredDramas = downloadSelectedStarredDramas;
window.downloadSingleStarredDrama = downloadSingleStarredDrama;

function removeStarredDrama(id, platform) {
    let list = getGlobalStarredDramas();
    const idStr = String(id);
    list = list.filter(item => !(item.id === idStr && item.platform === platform));
    _selectedStarredKeys.delete(getStarredItemKey(idStr, platform));
    saveGlobalStarredDramas(list);
    updateStarButtonsOnPage(idStr, platform, false);
    renderGlobalStarredGrid();
    showToast('បានដកចេញពី PIN', '⭐');
}

function clearAllStarredDramas() {
    const list = getGlobalStarredDramas();
    if (!list.length) return;
    const msg = currentLang === 'zh' ? '确定要清空所有 PIN 收藏的短剧吗？' : (currentLang === 'km' ? 'តើបងពិតជាចង់លុបរឿងបានដាក់ PIN ទាំងអស់មែនទេ?' : 'Clear all pinned dramas?');
    if (confirm(msg)) {
        _selectedStarredKeys.clear();
        saveGlobalStarredDramas([]);
        renderGlobalStarredGrid();
        showToast('បានសម្អាតរឿង PIN ទាំងអស់!', '🧹');
    }
}

function playStarredDrama(id, platform) {
    if (!id || !platform) return;
    const p = String(platform).toLowerCase();

    if (p === 'mvffm') {
        switchPlatform('mvffm');
        if (typeof analyzeMvffmDrama === 'function') {
            analyzeMvffmDrama(id);
        }
    } else if (p === 'haosou') {
        switchPlatform('haosou');
        if (typeof analyzeHaoSouDrama === 'function') {
            analyzeHaoSouDrama(id);
        }
    } else {
        switchPlatform('hongguo');
        if (typeof openSeriesDetail === 'function') {
            openSeriesDetail(id);
        } else if (typeof executeFetchLink === 'function') {
            const inp = document.getElementById('searchInput');
            if (inp) inp.value = id;
            executeFetchLink();
        }
    }
}

// Helpers for individual card star toggles
function toggleHaoSouCardStar(id, title, cover, remarks) {
    toggleDramaStar({
        id,
        title,
        cover,
        platform: 'haosou',
        remarks
    });
}

function toggleMvffmCardStar(id, title, cover, remarks) {
    toggleDramaStar({
        id,
        title,
        cover,
        platform: 'mvffm',
        remarks
    });
}

// Auto-initialize global starred badge on load
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateGlobalStarredBadge);
    } else {
        updateGlobalStarredBadge();
    }
}
