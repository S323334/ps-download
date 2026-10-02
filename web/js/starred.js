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

// =========================================================
// QUALITY & FRAMERATE PERSISTENCE & HELPERS
// =========================================================
let _starredQualitySettings = {}; // `${platform}:${id}` -> quality object

function loadStarredQualities() {
    try {
        // Clear any old legacy pre-cached test probe data from old key
        if (localStorage.getItem('ps_starred_qualities')) {
            localStorage.removeItem('ps_starred_qualities');
        }
        const raw = localStorage.getItem('ps_starred_qualities_v2') || '{}';
        _starredQualitySettings = JSON.parse(raw);
    } catch (_) {
        _starredQualitySettings = {};
    }
}
loadStarredQualities();

function saveStarredDramaQuality(id, platform, q) {
    const key = getStarredItemKey(id, platform);
    _starredQualitySettings[key] = q;
    try {
        localStorage.setItem('ps_starred_qualities_v2', JSON.stringify(_starredQualitySettings));
    } catch (_) {}
}

function getDefaultQualitySettings(id, platform) {
    return {
        resolution: '1080p',
        height: 1080,
        fps: 30,
        origRes: '1080p',
        origFps: 30,
        scanned: false,
        userModified: false,
        resolutions: [
            { label: '1080p', name: '1080p (Full HD)', height: 1080, savePct: 0 },
            { label: '720p', name: '720p (HD)', height: 720, savePct: 35 },
            { label: '540p', name: '540p (qHD)', height: 540, savePct: 55 },
            { label: '480p', name: '480p (SD - សន្សំ 65%)', height: 480, savePct: 65 },
            { label: '360p', name: '360p (Low - សន្សំ 80%)', height: 360, savePct: 80 }
        ],
        framerates: [
            { fps: 30, label: '30 fps (Auto)' },
            { fps: 60, label: '60 fps (Smooth / រលូន)' },
            { fps: 30, label: '30 fps (Standard / ធម្មតា)' },
            { fps: 24, label: '24 fps (Cinema / សន្សំទំហំ)' }
        ]
    };
}

function getStarredDramaQuality(id, platform) {
    const key = getStarredItemKey(id, platform);
    if (!_starredQualitySettings[key]) {
        _starredQualitySettings[key] = getDefaultQualitySettings(id, platform);
    }
    return _starredQualitySettings[key];
}

function onStarredQualityChange(id, platform, val) {
    const q = getStarredDramaQuality(id, platform);
    q.resolution = val;
    q.height = parseInt(val, 10) || 1080;
    q.userModified = true;
    saveStarredDramaQuality(id, platform, q);

    // Update real-time memory saving badge on card
    const card = document.querySelector(`.starred-card[data-card-id="${id}"][data-card-platform="${platform}"]`);
    if (card) {
        const badge = card.querySelector('.starred-saving-badge');
        if (badge) {
            const opt = (q.resolutions || []).find(r => r.label === val);
            const savePct = opt ? opt.savePct : 0;
            if (savePct > 0) {
                badge.className = 'starred-saving-badge';
                badge.innerHTML = `💾 សន្សំ Memory ~${savePct}% (${escapeHtml(val)})`;
            } else {
                badge.className = 'starred-saving-badge tier-original';
                badge.innerHTML = `💎 គុណភាពដើម (${escapeHtml(q.origRes || val)} @ ${escapeHtml(String(q.origFps || 30))}fps)`;
            }
        }
    }
}

function onStarredFpsChange(id, platform, val) {
    const q = getStarredDramaQuality(id, platform);
    q.fps = parseInt(val, 10) || 30;
    q.userModified = true;
    saveStarredDramaQuality(id, platform, q);
}

async function scanStarredDramaQuality(id, platform, showNotice = false) {
    const key = getStarredItemKey(id, platform);
    const card = document.querySelector(`.starred-card[data-card-id="${id}"][data-card-platform="${platform}"]`);
    const origBadge = card ? card.querySelector('.starred-orig-badge') : null;
    if (origBadge) {
        origBadge.classList.add('scanning');
        origBadge.innerHTML = '⏳ កំពុងស្កេន...';
    }

    try {
        const res = await fetch(`/api/video/probe?id=${encodeURIComponent(id)}&platform=${encodeURIComponent(platform)}`);
        const d = await res.json();
        if (d && d.ok) {
            const q = getStarredDramaQuality(id, platform);
            q.scanned = true;
            q.origRes = d.original_resolution || '1080p';
            q.origFps = d.fps || 30;
            q.resolutions = d.resolutions || q.resolutions;
            q.framerates = d.framerates || q.framerates;
            if (!q.userModified) {
                q.resolution = q.origRes;
                q.height = parseInt(q.origRes, 10) || 1080;
                q.fps = q.origFps;
            }
            saveStarredDramaQuality(id, platform, q);

            // Re-render card quality box smoothly
            if (card) {
                const box = card.querySelector('.starred-quality-box, .starred-quality-box-unscanned');
                if (box) {
                    box.outerHTML = renderQualityBoxHtml(id, platform, q);
                }
            }
            if (showNotice) {
                showToast(`✅ បានស្កេន: ${q.origRes} @ ${q.origFps}fps`, '🔍');
            }
            return q;
        }
    } catch (e) {
        console.warn('Probe error:', e);
        if (origBadge) {
            origBadge.classList.remove('scanning');
            origBadge.innerHTML = '⚠️ មិនអាចស្កេនបាន';
        }
    }
    return null;
}

async function rescanStarredCardQuality(id, platform, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const card = document.querySelector(`.starred-card[data-card-id="${id}"][data-card-platform="${platform}"]`);
    const btn = card ? card.querySelector('.starred-btn-card-scan') : null;
    if (btn) btn.classList.add('scanning');
    try {
        await scanStarredDramaQuality(id, platform, true);
    } finally {
        if (btn) btn.classList.remove('scanning');
    }
}

async function scanAllVisibleStarredQualities() {
    const allList = getGlobalStarredDramas();
    const filtered = _currentStarredFilter === 'all'
        ? allList
        : allList.filter(item => item.platform === _currentStarredFilter);

    if (filtered.length === 0) {
        showToast('គ្មានរឿងនៅក្នុងបញ្ជីសម្រាប់ស្កេនទេ', 'ℹ️');
        return;
    }

    const btn = document.getElementById('btnStarredBatchScan');
    if (btn) btn.classList.add('scanning');
    showToast(`🔍 កំពុងស្កេនពិនិត្យគុណភាព & FPS នៃ ${filtered.length} រឿង...`, '🔍');

    try {
        const items = filtered.map(it => ({ id: it.id, platform: it.platform }));
        const res = await fetch('/api/video/probe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items })
        });
        const data = await res.json();
        if (data && data.ok && Array.isArray(data.data)) {
            data.data.forEach(itemResult => {
                if (itemResult && itemResult.id) {
                    const q = getStarredDramaQuality(itemResult.id, itemResult.platform);
                    q.scanned = true;
                    q.origRes = itemResult.original_resolution || '1080p';
                    q.origFps = itemResult.fps || 30;
                    q.resolutions = itemResult.resolutions || q.resolutions;
                    q.framerates = itemResult.framerates || q.framerates;
                    if (!q.userModified) {
                        q.resolution = q.origRes;
                        q.height = parseInt(q.origRes, 10) || 1080;
                        q.fps = q.origFps;
                    }
                    saveStarredDramaQuality(itemResult.id, itemResult.platform, q);
                }
            });
            renderGlobalStarredGrid();
            showToast(`✅ ស្កេនចប់សព្វគ្រប់! បានរកឃើញកម្រិតដើម និង FPS នៃ ${filtered.length} រឿង`, '🚀');
        } else {
            // Fallback parallel probe
            await Promise.allSettled(filtered.map(it => scanStarredDramaQuality(it.id, it.platform)));
            showToast(`✅ ស្កេនចប់សព្វគ្រប់!`, '🚀');
        }
    } catch (err) {
        console.warn('Batch scan failed:', err);
        showToast(`❌ បរាជ័យក្នុងការស្កេន: ${err.message}`, '❌');
    } finally {
        if (btn) btn.classList.remove('scanning');
    }
}

// =========================================================
// SELECTION LOGIC (SELECT ALL & CARD TOGGLES)
// =========================================================
function handleStarredSelectAllClick(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const allList = getGlobalStarredDramas();
    const filtered = _currentStarredFilter === 'all'
        ? allList
        : allList.filter(item => item.platform === _currentStarredFilter);

    if (filtered.length === 0) return;

    // Check if currently all are selected
    let allSelected = true;
    for (const it of filtered) {
        if (!_selectedStarredKeys.has(getStarredItemKey(it.id, it.platform))) {
            allSelected = false;
            break;
        }
    }

    const nextState = !allSelected;
    toggleSelectAllStarredDramas(nextState);
}

function onStarredSelectAllChange(isChecked) {
    toggleSelectAllStarredDramas(Boolean(isChecked));
}

function toggleStarredCardSelection(id, platform, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const key = getStarredItemKey(id, platform);
    if (_selectedStarredKeys.has(key)) {
        _selectedStarredKeys.delete(key);
    } else {
        _selectedStarredKeys.add(key);
    }
    updateStarredSelectionUI();
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

function toggleSelectAllStarredDramas(isAll) {
    const allList = getGlobalStarredDramas();
    const filtered = _currentStarredFilter === 'all'
        ? allList
        : allList.filter(item => item.platform === _currentStarredFilter);

    filtered.forEach(it => {
        const k = getStarredItemKey(it.id, it.platform);
        if (isAll) {
            _selectedStarredKeys.add(k);
        } else {
            _selectedStarredKeys.delete(k);
        }
    });

    updateStarredSelectionUI();
}
const toggleSelectAllStarred = toggleSelectAllStarredDramas;

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

    // Batch Toolbar visibility
    const tb = document.getElementById('starredBatchToolbar');
    if (tb) {
        tb.style.display = totalVisible > 0 ? 'flex' : 'none';
    }

    // Select All Checkbox & Wrapper
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

function renderQualityBoxHtml(id, platform, q) {
    // Auto-correct any legacy 608p in client memory to 1080p
    if (q.origRes === '608p' || (q.origRes && q.origRes.includes('608'))) {
        q.origRes = '1080p';
        q.resolution = '1080p';
        q.height = 1080;
        q.resolutions = [
            { label: '1080p', name: '1080p (Full HD)', height: 1080, savePct: 0 },
            { label: '720p', name: '720p (HD - សន្សំ 35%)', height: 720, savePct: 35 },
            { label: '540p', name: '540p (qHD - សន្សំ 55%)', height: 540, savePct: 55 },
            { label: '480p', name: '480p (SD - សន្សំ 65%)', height: 480, savePct: 65 },
            { label: '360p', name: '360p (Low - សន្សំ 80%)', height: 360, savePct: 80 }
        ];
        saveStarredDramaQuality(id, platform, q);
    }

    // When not yet scanned, do NOT render the dropdowns box! Show only sleek scan trigger
    if (!q.scanned) {
        return `
            <div class="starred-quality-box-unscanned" onclick="event.stopPropagation()">
                <button type="button" class="starred-btn-card-scan" onclick="rescanStarredCardQuality('${escapeHtml(id)}', '${escapeHtml(platform)}', event)" title="ចុចដើម្បីពិនិត្យគុណភាព និង Frame Rate ដើម">
                    <span class="scan-icon">🔍</span> ស្កេនគុណភាព & FPS
                </button>
            </div>
        `;
    }

    const activeRes = q.resolution || q.origRes || '1080p';
    const activeFps = q.fps || q.origFps || 30;
    const curOpt = (q.resolutions || []).find(r => r.label === activeRes);
    const savePct = curOpt ? curOpt.savePct : 0;

    const resOptionsHtml = (q.resolutions || []).map(r => `
        <option value="${escapeHtml(r.label)}" ${r.label === activeRes ? 'selected' : ''}>
            ${escapeHtml(r.name || r.label)}
        </option>
    `).join('');

    const fpsOptionsHtml = (q.framerates || []).map(f => `
        <option value="${f.fps}" ${Number(f.fps) === Number(activeFps) ? 'selected' : ''}>
            ${escapeHtml(f.label)}
        </option>
    `).join('');

    return `
        <div class="starred-quality-box" onclick="event.stopPropagation()">
            <div class="starred-quality-box-header">
                <span class="starred-orig-badge" title="គុណភាពដើមដែលបានស្កេន">
                    ✅ ដើម: ${escapeHtml(q.origRes)} @ ${escapeHtml(String(q.origFps))}fps
                </span>
                <button type="button" class="starred-btn-rescan" onclick="rescanStarredCardQuality('${escapeHtml(id)}', '${escapeHtml(platform)}', event)" title="ស្កេនគុណភាពឡើងវិញ">
                    ⚡ ស្កេន
                </button>
            </div>
            <div class="starred-selectors-row">
                <div class="starred-control-col">
                    <label>គុណភាព</label>
                    <select class="starred-select-styled starred-quality-select" onchange="onStarredQualityChange('${escapeHtml(id)}', '${escapeHtml(platform)}', this.value)">
                        ${resOptionsHtml}
                    </select>
                </div>
                <div class="starred-control-col">
                    <label>Frame Rate</label>
                    <select class="starred-select-styled starred-fps-select" onchange="onStarredFpsChange('${escapeHtml(id)}', '${escapeHtml(platform)}', this.value)">
                        ${fpsOptionsHtml}
                    </select>
                </div>
            </div>
            <div class="starred-saving-badge ${savePct > 0 ? '' : 'tier-original'}">
                ${savePct > 0 ? `💾 សន្សំ Memory ~${savePct}% (${escapeHtml(activeRes)})` : `💎 គុណភាពដើម (${escapeHtml(q.origRes)} @ ${escapeHtml(String(q.origFps))}fps)`}
            </div>
        </div>
    `;
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
        const q = getStarredDramaQuality(item.id, item.platform);
        const qualityBoxHtml = renderQualityBoxHtml(item.id, item.platform, q);

        return `
            <div class="starred-card ${isSelected ? 'selected' : ''}" data-card-id="${escapeHtml(item.id)}" data-card-platform="${escapeHtml(item.platform)}" onclick="playStarredDrama('${escapeHtml(item.id)}', '${escapeHtml(item.platform)}')">
                <div class="starred-poster-wrapper">
                    <img class="starred-poster" src="${escapeHtml(cover)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.src='/favicon.ico';">
                    
                    <div class="starred-card-cb-wrap" onclick="toggleStarredCardSelection('${escapeHtml(item.id)}', '${escapeHtml(item.platform)}', event)" title="គ្រីសដើម្បីទាញយក">
                        <input type="checkbox" class="starred-card-cb" ${isSelected ? 'checked' : ''} tabindex="-1">
                    </div>

                    <span class="starred-platform-tag platform-${escapeHtml(item.platform)}">${pLabel}</span>
                    <button class="starred-unstar-btn" onclick="event.stopPropagation(); removeStarredDrama('${escapeHtml(item.id)}', '${escapeHtml(item.platform)}')" title="ដកចេញពី PIN">★</button>
                </div>
                <div class="starred-body">
                    <div class="starred-card-title" data-original-title="${escapeHtml(item.title)}" title="${escapeHtml(item.title)}">${escapeHtml(displayTitle)}</div>
                    <div class="starred-meta">
                        <span class="starred-platform-name">${pLabel}</span>
                        ${item.eps ? `<span class="starred-eps">${escapeHtml(String(item.eps))} ភាគ</span>` : ''}
                    </div>

                    ${qualityBoxHtml}

                    <div class="starred-card-actions" onclick="event.stopPropagation()">
                        <button class="starred-btn-play" onclick="playStarredDrama('${escapeHtml(item.id)}', '${escapeHtml(item.platform)}')">
                            ▶️ ${currentLang === 'zh' ? '播放 / 查看' : (currentLang === 'km' ? 'មើល / Play' : 'Play')}
                        </button>
                        <button class="starred-btn-dl-single" onclick="downloadSingleStarredDrama('${escapeHtml(item.id)}', '${escapeHtml(item.platform)}', '${escapeHtml(item.title)}', '${escapeHtml(cover)}')" title="ទាញយកភាគទាំងអស់តាមគុណភាពដែលបានរើស">
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
    showToast(`🚀 កំពុងចាប់ផ្តើមទាញយក ${count} រឿងតាមគុណភាពដែលបានកំណត់...`, '📥');

    let successCount = 0;

    for (const item of selectedItems) {
        try {
            const q = getStarredDramaQuality(item.id, item.platform);
            const chosenRes = q.resolution || '1080p';
            const chosenHeight = q.height || parseInt(chosenRes, 10) || 1080;
            const chosenFps = q.fps || 30;

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
                                episodes: eps,
                                quality: chosenRes,
                                fps: chosenFps,
                                target_height: chosenHeight
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
                            episodes: d.data.episodes,
                            quality: chosenRes,
                            fps: chosenFps,
                            target_height: chosenHeight
                        })
                    });
                    successCount++;
                }
            } else {
                // Hongguo
                const payload = {
                    series_ids: [item.id],
                    ranges: { [item.id]: 'all' },
                    qualities: {
                        [item.id]: {
                            resolution: chosenRes,
                            height: chosenHeight,
                            fps: chosenFps
                        }
                    },
                    quality: chosenRes,
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

        const q = getStarredDramaQuality(id, platform);
        const chosenRes = q.resolution || '1080p';
        const chosenHeight = q.height || parseInt(chosenRes, 10) || 1080;
        const chosenFps = q.fps || 30;

        showToast(`🚀 កំពុងរៀបចំទាញយក "${title}" (${chosenRes} @ ${chosenFps}fps)...`, '📥');
        
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
                                episodes: eps,
                                quality: chosenRes,
                                fps: chosenFps,
                                target_height: chosenHeight
                            })
                        });
                        showToast(`✅ បានដាក់ទាញយក "${title}" (${chosenRes})!`, '🚀');
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
                            episodes: d.data.episodes,
                            quality: chosenRes,
                            fps: chosenFps,
                            target_height: chosenHeight
                        })
                    });
                    showToast(`✅ បានដាក់ទាញយក "${title}" (${chosenRes})!`, '🚀');
                }
            } else {
                // Hongguo
                const payload = {
                    series_ids: [id],
                    ranges: { [id]: 'all' },
                    qualities: {
                        [id]: {
                            resolution: chosenRes,
                            height: chosenHeight,
                            fps: chosenFps
                        }
                    },
                    quality: chosenRes,
                    series_info: {
                        [id]: { title: title, cover: cover }
                    }
                };
                await fetch('/dl/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                showToast(`✅ បានដាក់ទាញយក "${title}" (${chosenRes})!`, '🚀');
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

window.handleStarredSelectAllClick = handleStarredSelectAllClick;
window.onStarredSelectAllChange = onStarredSelectAllChange;
window.toggleSelectAllStarred = toggleSelectAllStarredDramas;
window.toggleSelectAllStarredDramas = toggleSelectAllStarredDramas;
window.toggleStarredCardSelection = toggleStarredCardSelection;
window.onStarredCardCheckChange = onStarredCardCheckChange;
window.downloadSelectedStarredDramas = downloadSelectedStarredDramas;
window.downloadSingleStarredDrama = downloadSingleStarredDrama;
window.scanAllVisibleStarredQualities = scanAllVisibleStarredQualities;
window.scanStarredDramaQuality = scanStarredDramaQuality;
window.rescanStarredCardQuality = rescanStarredCardQuality;
window.onStarredQualityChange = onStarredQualityChange;
window.onStarredFpsChange = onStarredFpsChange;

function removeStarredDrama(id, platform) {
    let list = getGlobalStarredDramas();
    const idStr = String(id);
    list = list.filter(item => !(item.id === idStr && item.platform === platform));
    _selectedStarredKeys.delete(getStarredItemKey(idStr, platform));
    delete _starredQualitySettings[getStarredItemKey(idStr, platform)];
    try {
        localStorage.setItem('ps_starred_qualities_v2', JSON.stringify(_starredQualitySettings));
    } catch (_) {}
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
        _starredQualitySettings = {};
        try {
            localStorage.removeItem('ps_starred_qualities');
            localStorage.removeItem('ps_starred_qualities_v2');
        } catch (_) {}
        renderGlobalStarredGrid();
        showToast('បានសម្អាតរឿង PIN ទាំងអស់!', '🧹');
    }
}
window.clearAllStarredDramas = clearAllStarredDramas;

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
