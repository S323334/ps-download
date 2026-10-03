// =========================================================
// TIKTOK, DOUYIN (TIKTOK ចិន) & KUAISHOU (ខៅស៊ូ) FRONTEND LOGIC
// =========================================================

let _analyzedTtVideo = null;
let _selectedTtFormat = 'no_watermark';
let _ttTasksPollingTimer = null;
let _currentTtSubPlatform = 'tiktok';
let _currentTtMediaMode = 'video';

/**
 * Switch sub-platform between TikTok, Douyin, and Kuaishou
 */
function setTtSubPlatform(subPlatform) {
    if (!['tiktok', 'douyin', 'kuaishou'].includes(subPlatform)) {
        subPlatform = 'tiktok';
    }
    _currentTtSubPlatform = subPlatform;

    const titleEl = document.getElementById('ttHeroTitle');
    const subTitleEl = document.getElementById('ttHeroSubtitle');
    const inputEl = document.getElementById('ttUrlInput');
    const heroIcon = document.getElementById('ttHeroIcon');

    if (subPlatform === 'douyin') {
        if (heroIcon) heroIcon.src = '/douyin_icon.svg';
        if (titleEl) titleEl.innerHTML = '<span class="tt-title-cyan">TikTok ចិន (Douyin)</span>';
        if (subTitleEl) subTitleEl.textContent = 'ទាញយកវីដេអូពី TikTok ចិន (Douyin / 抖音) គុណភាពខ្ពស់ គ្មាន Watermark (No Watermark)';
        if (inputEl) inputEl.placeholder = 'បិទភ្ជាប់លីង TikTok ចិន / Douyin (Paste link: https://v.douyin.com/...)...';
    } else if (subPlatform === 'kuaishou') {
        if (heroIcon) heroIcon.src = '/kuaishou_icon.svg';
        if (titleEl) titleEl.innerHTML = '<span class="tt-title-cyan">ខៅស៊ូ (Kuaishou)</span>';
        if (subTitleEl) subTitleEl.textContent = 'ទាញយកវីដេអូពី ខៅស៊ូ (Kuaishou / 快手) គុណភាពខ្ពស់ គ្មាន Watermark (No Watermark)';
        if (inputEl) inputEl.placeholder = 'បិទភ្ជាប់លីង ខៅស៊ូ / Kuaishou (Paste link: https://v.kuaishou.com/...)...';
    } else {
        if (heroIcon) heroIcon.src = '/tiktok_icon.svg';
        if (titleEl) titleEl.innerHTML = '<span class="tt-title-cyan">TikTok</span>';
        if (subTitleEl) subTitleEl.textContent = 'ទាញយកវីដេអូពី TikTok គុណភាពខ្ពស់ គ្មាន Watermark (No Watermark)';
        if (inputEl) inputEl.placeholder = 'បិទភ្ជាប់លីង TikTok (Paste link: https://vt.tiktok.com/... ឬ https://www.tiktok.com/@...)...';
    }
}

/**
 * Toggle media mode: 'video' vs 'poster'
 */
function setTtMediaMode(mode) {
    _currentTtMediaMode = mode;
    const vContainer = document.getElementById('ttVideoContainer');
    const pContainer = document.getElementById('ttPosterDisplay');
    const btnV = document.getElementById('btnTtModeVideo');
    const btnP = document.getElementById('btnTtModePoster');
    const player = document.getElementById('ttVideoPlayer');

    if (btnV) btnV.classList.toggle('active', mode === 'video');
    if (btnP) btnP.classList.toggle('active', mode === 'poster');

    if (mode === 'poster') {
        if (vContainer) vContainer.style.display = 'none';
        if (pContainer) pContainer.style.display = 'flex';
        if (player && !player.paused) {
            try { player.pause(); } catch (_) {}
        }
    } else {
        if (pContainer) pContainer.style.display = 'none';
        if (vContainer) vContainer.style.display = 'flex';
        if (player && player.src) {
            player.play().catch(() => {});
        }
    }
}

function onTtInputKeyDown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        analyzeCurrentTtUrl();
    }
}

async function pasteTtFromClipboard() {
    const input = document.getElementById('ttUrlInput');
    let text = '';
    if (window.electronAPI && typeof window.electronAPI.readClipboard === 'function') {
        try { text = await window.electronAPI.readClipboard(); } catch (_) {}
    }
    if (!text && navigator.clipboard && navigator.clipboard.readText) {
        try { text = await navigator.clipboard.readText(); } catch (_) {}
    }
    if (text && input) {
        input.value = text.trim();
        input.focus();
        if (typeof showToast === 'function') showToast('បានបិទភ្ជាប់ (Paste) ដោយជោគជ័យ!', '📋');
        // Stay silent! Do NOT auto-analyze!
    } else {
        if (typeof showToast === 'function') showToast('មិនអាច paste បានទេ', '⚠️');
    }
}

function clearTtInput() {
    const input = document.getElementById('ttUrlInput');
    if (input) input.value = '';
    const card = document.getElementById('ttVideoCard');
    if (card) card.style.display = 'none';
    const player = document.getElementById('ttVideoPlayer');
    if (player) {
        player.pause();
        player.src = '';
    }
    _analyzedTtVideo = null;
}

/**
 * Analyze Video Link (TikTok, Douyin, Kuaishou) with strict platform validation
 */
async function analyzeCurrentTtUrl() {
    const input = document.getElementById('ttUrlInput');
    const rawVal = input ? input.value.trim() : '';
    if (!rawVal) {
        if (typeof showToast === 'function') showToast('សូមបញ្ចូល ឬបិទភ្ជាប់លីងជាមុនសិន', '⚠️');
        return;
    }

    // Strict platform link validation
    const lowerVal = rawVal.toLowerCase();

    // 1. Reject YouTube links in TikTok / Douyin / Kuaishou
    if (lowerVal.includes('youtube.com') || lowerVal.includes('youtu.be')) {
        if (typeof showToast === 'function') {
            showToast('⚠️ លីងនេះជាលីង YouTube មិនអាចប្រើក្នុងផ្ទាំងនេះទេ! សូមចូលទៅកាន់ផ្ទាំង YOUTUBE', 'warning');
        } else {
            alert('⚠️ លីងនេះជាលីង YouTube មិនអាចប្រើក្នុងផ្ទាំងនេះទេ!');
        }
        return;
    }

    // 2. Validate current platform
    if (_currentTtSubPlatform === 'tiktok') {
        const isTt = lowerVal.includes('tiktok.com');
        if (!isTt) {
            if (typeof showToast === 'function') {
                showToast('⚠️ លីងនេះមិនមែនជាលីង TikTok ឡើយ! សូមបិទភ្ជាប់លីង TikTok (tiktok.com)', 'warning');
            } else {
                alert('⚠️ លីងនេះមិនមែនជាលីង TikTok ឡើយ!');
            }
            return;
        }
    } else if (_currentTtSubPlatform === 'douyin') {
        const isDy = lowerVal.includes('douyin.com') || lowerVal.includes('iesdouyin.com');
        if (!isDy) {
            if (typeof showToast === 'function') {
                showToast('⚠️ លីងនេះមិនមែនជាលីង TikTok ចិន (Douyin) ឡើយ! សូមបិទភ្ជាប់លីង Douyin (douyin.com)', 'warning');
            } else {
                alert('⚠️ លីងនេះមិនមែនជាលីង TikTok ចិន (Douyin) ឡើយ!');
            }
            return;
        }
    } else if (_currentTtSubPlatform === 'kuaishou') {
        const isKs = lowerVal.includes('kuaishou.com') || lowerVal.includes('kuaishouapp.com') || lowerVal.includes('gifshow.com');
        if (!isKs) {
            if (typeof showToast === 'function') {
                showToast('⚠️ លីងនេះមិនមែនជាលីង ខៅស៊ូ (Kuaishou) ឡើយ! សូមបិទភ្ជាប់លីង Kuaishou (kuaishou.com)', 'warning');
            } else {
                alert('⚠️ លីងនេះមិនមែនជាលីង ខៅស៊ូ (Kuaishou) ឡើយ!');
            }
            return;
        }
    }

    const btnAnalyze = document.getElementById('btnTtAnalyze');
    const spinner = document.getElementById('ttAnalyzeSpinner');
    const btnText = document.getElementById('ttAnalyzeBtnText');
    const originalText = btnText ? btnText.textContent : '⚡ វិភាគវីដេអូ';

    if (btnAnalyze) btnAnalyze.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    if (btnText) btnText.textContent = 'កំពុងវិភាគ...';

    try {
        const res = await fetch('/api/tiktok/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: rawVal, platform: _currentTtSubPlatform })
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
            throw new Error(json.message || 'បរាជ័យក្នុងការវិភាគវីដេអូ');
        }

        const data = json.data;
        _analyzedTtVideo = data;
        renderTtVideoCard(data);

        if (typeof showToast === 'function') {
            showToast('✓ វិភាគវីដេអូជោគជ័យ! អ្នកអាចមើល និងទាញយកបាន', 'success');
        }

    } catch (err) {
        if (typeof showToast === 'function') {
            showToast(`⚠️ ${err.message}`, 'error');
        } else {
            alert(err.message);
        }
    } finally {
        if (btnAnalyze) btnAnalyze.disabled = false;
        if (spinner) spinner.style.display = 'none';
        if (btnText) btnText.textContent = originalText;
    }
}

/**
 * Render Video Card & Start In-App Preview (with Dual Poster and Video Player)
 */
function renderTtVideoCard(item) {
    const card = document.getElementById('ttVideoCard');
    const player = document.getElementById('ttVideoPlayer');
    const posterImg = document.getElementById('ttPosterImg');
    const titleEl = document.getElementById('ttCardTitle');
    const authorEl = document.getElementById('ttCardAuthor');
    const durationEl = document.getElementById('ttCardDuration');
    const platformBadge = document.getElementById('ttCardPlatformBadge');
    const outDirEl = document.getElementById('ttOutputDirDisplay');

    if (!card) return;
    card.style.display = 'grid';

    if (titleEl) titleEl.textContent = item.title || 'TikTok / Douyin Video';
    if (authorEl) authorEl.textContent = `👤 ${item.author?.nickname || 'Creator'}`;
    if (durationEl) durationEl.textContent = `⏱️ ${item.duration_str || '00:00'}`;

    if (platformBadge) {
        const pNames = {
            tiktok: '🎵 TikTok',
            douyin: '🔥 Douyin (TikTok ចិន)',
            kuaishou: '⚡ Kuaishou (ខៅស៊ូ)'
        };
        platformBadge.textContent = pNames[item.platform] || item.platform.toUpperCase();
    }

    // Set Poster Cover Image
    const coverUrl = item.cover || '/ps_logo.jpg';
    if (posterImg) {
        posterImg.src = coverUrl;
    }
    if (player) {
        player.poster = coverUrl;
    }

    // Load In-App Native Video Preview via Stream Proxy for reliable CORS & seek support
    if (player && item.play_url) {
        player.pause();
        const proxiedStreamUrl = `/api/tiktok/stream_proxy?url=${encodeURIComponent(item.play_url)}`;
        player.src = proxiedStreamUrl;
        player.load();
        player.play().catch(() => {});

        // If video stream encounters network issue, fallback to poster
        player.onerror = () => {
            console.warn('[TikTok Player] Stream playback failed, falling back to poster');
            setTtMediaMode('poster');
        };
    }

    // Default to video mode if play_url exists, otherwise poster
    if (item.play_url) {
        setTtMediaMode('video');
    } else {
        setTtMediaMode('poster');
    }

    // Default to Watermark-Free MP4
    selectTtFormat('no_watermark');

    // Smooth scroll to card
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Update Output Dir Display
    fetch('/api/tiktok/tasks')
        .then(r => r.json())
        .then(d => {
            if (d && d.output_dir && outDirEl) {
                outDirEl.textContent = d.output_dir;
                outDirEl.title = d.output_dir;
            }
        })
        .catch(() => {});
}

/**
 * Format Selector: No Watermark, With Watermark, Audio Only
 */
function selectTtFormat(format) {
    _selectedTtFormat = format;
    document.querySelectorAll('.tt-format-option').forEach(el => {
        el.classList.toggle('active', el.dataset.format === format);
    });

    const dlBtnText = document.getElementById('ttDownloadBtnText');
    if (dlBtnText) {
        if (format === 'no_watermark') dlBtnText.textContent = 'ទាញយកវីដេអូគ្មាន Watermark (No Watermark MP4)';
        else if (format === 'watermark') dlBtnText.textContent = 'ទាញយកវីដេអូដើម (Original MP4)';
        else if (format === 'audio_only') dlBtnText.textContent = 'ទាញយកតែសំឡេងតន្ត្រី (MP3 Audio)';
    }
}

/**
 * Start Download
 */
async function downloadCurrentTtVideo() {
    if (!_analyzedTtVideo) {
        if (typeof showToast === 'function') showToast('សូមវិភាគវីដេអូជាមុនសិន', '⚠️');
        return;
    }

    let downloadUrl = _analyzedTtVideo.play_url;
    if (_selectedTtFormat === 'watermark' && _analyzedTtVideo.wmplay_url) {
        downloadUrl = _analyzedTtVideo.wmplay_url;
    } else if (_selectedTtFormat === 'audio_only' && _analyzedTtVideo.music_url) {
        downloadUrl = _analyzedTtVideo.music_url;
    }

    try {
        const res = await fetch('/api/tiktok/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: _analyzedTtVideo.raw_url,
                play_url: downloadUrl,
                format: _selectedTtFormat,
                title: _analyzedTtVideo.title,
                author: _analyzedTtVideo.author?.nickname || '',
                platform: _analyzedTtVideo.platform
            })
        });

        const json = await res.json();
        if (!res.ok || !json.ok) {
            throw new Error(json.message || 'បរាជ័យក្នុងការចាប់ផ្ដើមទាញយក');
        }

        if (typeof showToast === 'function') {
            showToast('📥 បានចាប់ផ្តើមទាញយកវីដេអូ...', 'success');
        }

        fetchTikTokTasks();
        startTtTasksPolling();

    } catch (err) {
        if (typeof showToast === 'function') {
            showToast(`⚠️ ${err.message}`, 'error');
        } else {
            alert(err.message);
        }
    }
}

/**
 * Fetch & Render Active TikTok Downloads
 */
async function fetchTikTokTasks() {
    try {
        const res = await fetch('/api/tiktok/tasks');
        const json = await res.json();
        if (!res.ok || !json.ok) return;

        const tasks = json.tasks || [];
        const container = document.getElementById('ttTasksContainer');
        const emptyState = document.getElementById('ttEmptyTasks');
        const badge = document.getElementById('ttTasksBadge');

        if (badge) {
            badge.textContent = tasks.length;
            badge.style.display = tasks.length > 0 ? 'inline-block' : 'none';
        }

        if (!container || !emptyState) return;

        if (tasks.length === 0) {
            container.style.display = 'none';
            emptyState.style.display = 'flex';
            stopTtTasksPolling();
            return;
        }

        emptyState.style.display = 'none';
        container.style.display = 'flex';

        let hasActive = false;
        container.innerHTML = tasks.map(t => {
            if (t.status === 'downloading') hasActive = true;
            const pct = Math.min(100, Math.max(0, t.progress_pct || 0));

            let statusLabel = 'កំពុងទាញយក...';
            let statusColor = '#38bdf8';
            if (t.status === 'completed') {
                statusLabel = '✓ រួចរាល់';
                statusColor = '#10b981';
            } else if (t.status === 'error') {
                statusLabel = `⚠️ ${t.error_message || 'បរាជ័យ'}`;
                statusColor = '#ef4444';
            } else if (t.status === 'canceled') {
                statusLabel = '🚫 បានលុបចោល';
                statusColor = '#94a3b8';
            }

            const pBadge = t.platform === 'douyin' ? '🔥 Douyin' : (t.platform === 'kuaishou' ? '⚡ Kuaishou' : '🎵 TikTok');

            return `
                <div class="tt-task-card" id="ttTaskCard_${escapeHtml(t.task_id)}">
                    <div class="tt-task-header-row">
                        <span style="font-size:0.75rem; background:rgba(255,255,255,0.08); padding:2px 8px; border-radius:6px; color:#22d3ee; font-weight:700;">${pBadge}</span>
                        <div class="tt-task-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</div>
                        <div style="font-weight:700; font-size:0.85rem; color:${statusColor};">${statusLabel}</div>
                    </div>

                    <div class="tt-progress-track">
                        <div class="tt-progress-fill" style="width: ${pct}%;"></div>
                    </div>

                    <div class="tt-task-meta">
                        <div>
                            <span>${pct}%</span>
                            ${t.size_str ? `<span style="margin-left:8px; color:#cbd5e1;">${escapeHtml(t.size_str)}</span>` : ''}
                            ${t.speed_str ? `<span style="margin-left:8px; color:#38bdf8;">${escapeHtml(t.speed_str)}</span>` : ''}
                        </div>
                        <div style="display:flex; gap:10px; align-items:center;">
                            ${t.eta_str && t.status === 'downloading' ? `<span>ETA: ${escapeHtml(t.eta_str)}</span>` : ''}
                            ${t.status === 'downloading' ? `
                                <button type="button" class="btn btn-secondary btn-sm" onclick="cancelTtTask('${escapeHtml(t.task_id)}')" style="padding:2px 8px; font-size:0.75rem; border-color:rgba(239,68,68,0.4); color:#fca5a5;">លុបចោល</button>
                            ` : ''}
                            ${t.status === 'completed' ? `
                                <button type="button" class="btn btn-secondary btn-sm" onclick="openTikTokFolder()" style="padding:2px 8px; font-size:0.75rem;">📂 បើក Folder</button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        if (hasActive) {
            startTtTasksPolling();
        } else {
            stopTtTasksPolling();
        }

    } catch (_) {}
}

function startTtTasksPolling() {
    if (_ttTasksPollingTimer) return;
    _ttTasksPollingTimer = setInterval(fetchTikTokTasks, 1500);
}

function stopTtTasksPolling() {
    if (_ttTasksPollingTimer) {
        clearInterval(_ttTasksPollingTimer);
        _ttTasksPollingTimer = null;
    }
}

async function cancelTtTask(taskId) {
    try {
        await fetch('/api/tiktok/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: taskId })
        });
        fetchTikTokTasks();
    } catch (_) {}
}

async function openTikTokFolder() {
    try {
        await fetch('/api/tiktok/open_folder', { method: 'POST' });
    } catch (_) {}
}

async function pickTtFolder() {
    if (window.electronAPI && typeof window.electronAPI.selectFolder === 'function') {
        const folder = await window.electronAPI.selectFolder();
        if (folder) {
            const outDirEl = document.getElementById('ttOutputDirDisplay');
            if (outDirEl) {
                outDirEl.textContent = folder;
                outDirEl.title = folder;
            }
        }
    }
}

window.analyzeCurrentTtUrl = analyzeCurrentTtUrl;
window.pasteTtFromClipboard = pasteTtFromClipboard;
window.clearTtInput = clearTtInput;
window.onTtInputKeyDown = onTtInputKeyDown;
window.selectTtFormat = selectTtFormat;
window.downloadCurrentTtVideo = downloadCurrentTtVideo;
window.cancelTtTask = cancelTtTask;
window.openTikTokFolder = openTikTokFolder;
window.pickTtFolder = pickTtFolder;
window.fetchTikTokTasks = fetchTikTokTasks;
