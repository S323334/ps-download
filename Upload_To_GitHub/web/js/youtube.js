        function extractCleanYouTubeUrl(rawText) {
            if (!rawText || typeof rawText !== 'string') return '';
            const text = rawText.trim();
            if (!text) return '';

            // 1. Full URL with protocol (watch, shorts, embed, live, youtu.be)
            const fullMatch = text.match(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:youtube\.com\/(?:watch\?[^\s"<>]+|shorts\/[^\s"<>/?#]+|embed\/[^\s"<>/?#]+|v\/[^\s"<>/?#]+|live\/[^\s"<>/?#]+)|youtu\.be\/[a-zA-Z0-9_-]+[^\s"<>]*)/i);
            if (fullMatch) {
                return fullMatch[0];
            }

            // 2. Generic URL matching youtube.com or youtu.be domain with protocol
            const genericMatch = text.match(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:youtube\.com|youtu\.be)\/[^\s"<>]*/i);
            if (genericMatch) {
                return genericMatch[0];
            }

            // 3. No protocol (e.g. www.youtube.com/... or youtu.be/...)
            const noProtoMatch = text.match(/(?:(?:www|m)\.)?(?:youtube\.com\/(?:watch\?[^\s"<>]+|shorts\/[^\s"<>/?#]+|embed\/[^\s"<>/?#]+|v\/[^\s"<>/?#]+|live\/[^\s"<>/?#]+)|youtu\.be\/[a-zA-Z0-9_-]+[^\s"<>]*)/i);
            if (noProtoMatch) {
                return 'https://' + noProtoMatch[0].replace(/^https?:\/\//, '');
            }

            // 4. Raw 11-char YouTube Video ID
            if (/^[a-zA-Z0-9_-]{11}$/.test(text)) {
                return `https://www.youtube.com/watch?v=${text}`;
            }

            return text;
        }

        function isYouTubeUrl(url) {
            if (!url) return false;
            return /(?:youtube\.com|youtu\.be)/i.test(url) || /^[a-zA-Z0-9_-]{11}$/.test(url.trim());
        }

        async function handleYtUrlPaste(event) {
            let pastedText = '';
            if (event && event.clipboardData) {
                pastedText = event.clipboardData.getData('text');
            }
            if (!pastedText && window.electronAPI && typeof window.electronAPI.readClipboard === 'function') {
                try {
                    pastedText = await window.electronAPI.readClipboard();
                } catch (e) {}
            }

            clearTimeout(_ytInputDebounceTimer);

            setTimeout(async () => {
                const inputEl = document.getElementById('ytUrlInput');
                let rawVal = pastedText;
                if (!rawVal && inputEl) {
                    rawVal = inputEl.value;
                }
                if (!rawVal && window.electronAPI && typeof window.electronAPI.readClipboard === 'function') {
                    try { rawVal = await window.electronAPI.readClipboard(); } catch (e) {}
                }

                rawVal = (rawVal || '').trim();
                if (!rawVal) return;

                const cleanUrl = extractCleanYouTubeUrl(rawVal);
                if (cleanUrl && isYouTubeUrl(cleanUrl)) {
                    if (inputEl) inputEl.value = cleanUrl;
                }
            }, 30);
        }

        function handleYtUrlInput(val) {
            clearTimeout(_ytInputDebounceTimer);
            // Stay idle on input/paste; do NOT automatically analyze.
            // Analysis is only triggered when the user clicks "⚡ វិភាគវីដេអូ" or presses Enter.
        }

        function onYtInputKeyDown(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                analyzeCurrentYtUrl();
            }
        }

        function clearYtInput() {
            const el = document.getElementById('ytUrlInput');
            if (el) {
                el.value = '';
                el.focus();
            }
            _lastAnalyzedYtUrl = '';
            const card = document.getElementById('ytVideoCard');
            if (card) card.style.display = 'none';
        }

        async function pasteYtFromClipboard() {
            const inputEl = document.getElementById('ytUrlInput');
            const dict = I18N_DICT[currentLang] || I18N_DICT['zh'];
            try {
                let text = '';
                // 1. Native desktop Electron clipboard API (highest reliability)
                if (window.electronAPI && typeof window.electronAPI.readClipboard === 'function') {
                    try {
                        text = await window.electronAPI.readClipboard();
                    } catch (err) {
                        console.warn('Native clipboard read error:', err);
                    }
                }
                // 2. Standard Web Clipboard API fallback
                if (!text && navigator.clipboard && navigator.clipboard.readText) {
                    try {
                        text = await navigator.clipboard.readText();
                    } catch (err) {
                        console.warn('Navigator clipboard read error:', err);
                    }
                }

                if (text && text.trim()) {
                    const rawText = text.trim();
                    const cleanUrl = extractCleanYouTubeUrl(rawText);
                    const finalVal = (cleanUrl && isYouTubeUrl(cleanUrl)) ? cleanUrl : rawText;

                    if (inputEl) {
                        inputEl.value = finalVal;
                        inputEl.focus();
                    }
                    showToast(dict.ytToastPasted || 'Pasted!', '📋');
                } else {
                    if (inputEl) inputEl.focus();
                    showToast(dict.ytToastPressCtrlV || 'Please press Ctrl+V to paste link', '📋');
                }
            } catch (e) {
                console.warn('pasteYtFromClipboard error:', e);
                if (inputEl) inputEl.focus();
                showToast(dict.ytToastPressCtrlV || 'Please press Ctrl+V to paste link', '📋');
            }
        }

        async function analyzeCurrentYtUrl(overrideUrl = null) {
            if (typeof requireActiveLicense === 'function' && !requireActiveLicense('វិភាគវីដេអូ YouTube')) {
                return;
            }
            const inputEl = document.getElementById('ytUrlInput');
            let rawUrl = (overrideUrl || (inputEl ? inputEl.value : '')).trim();
            const cleanUrl = extractCleanYouTubeUrl(rawUrl);
            const url = cleanUrl || rawUrl;
            const dict = I18N_DICT[currentLang] || I18N_DICT['zh'];

            if (!url) {
                showToast(dict.ytToastInvalidUrl || 'Please enter or paste a YouTube link!', '⚠️');
                if (inputEl) inputEl.focus();
                return;
            }

            if (!isYouTubeUrl(url)) {
                showToast(dict.ytToastInvalidUrl || 'Please enter a valid YouTube link (e.g. watch, shorts, youtu.be)!', '⚠️');
                return;
            }

            if (inputEl && inputEl.value !== url) {
                inputEl.value = url;
            }
            _lastAnalyzedYtUrl = url;

            const btnAnalyze = document.getElementById('btnYtAnalyze');
            const spinner = document.getElementById('ytAnalyzeSpinner');
            const btnText = document.getElementById('ytAnalyzeBtnText');

            if (btnAnalyze) btnAnalyze.disabled = true;
            if (spinner) spinner.style.display = 'inline-block';
            if (btnText) btnText.textContent = dict.ytAnalyzing || '...';

            try {
                const res = await fetch('/api/youtube/info', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });

                const data = await res.json();
                if (!res.ok || !data.ok) {
                    throw new Error(data.message || 'Failed to analyze YouTube video');
                }

                currentYtVideo = data.data;
                renderYouTubeVideoCard(currentYtVideo);
                showToast(dict.ytToastAnalyzed || 'Analyzed! Select resolution to download', '✅');
            } catch (err) {
                showToast(`Error: ${err.message}`, '❌');
            } finally {
                if (btnAnalyze) btnAnalyze.disabled = false;
                if (spinner) spinner.style.display = 'none';
                if (btnText) btnText.textContent = dict.ytAnalyzeBtnText || '⚡ Fetch';
            }
        }

        function renderYouTubeVideoCard(video) {
            if (!video) return;
            const dict = I18N_DICT[currentLang] || I18N_DICT['zh'];
            const card = document.getElementById('ytVideoCard');
            const thumb = document.getElementById('ytCardThumb');
            const duration = document.getElementById('ytCardDuration');
            const maxRes = document.getElementById('ytCardMaxRes');
            const title = document.getElementById('ytCardTitle');
            const channel = document.getElementById('ytCardChannel');
            const views = document.getElementById('ytCardViews');
            const date = document.getElementById('ytCardDate');
            const qualityGrid = document.getElementById('ytQualityGrid');
            const outputDirDisplay = document.getElementById('ytOutputDirDisplay');

            if (thumb) thumb.src = video.thumbnail || '';
            if (duration) duration.textContent = video.duration_formatted || '00:00';
            if (maxRes) {
                const h = video.max_height || 1080;
                maxRes.textContent = h >= 2160 ? '🌟 4K UHD' : (h >= 1440 ? '💎 2K QHD' : (h >= 1080 ? '🎬 1080p FHD' : '📺 720p HD'));
            }
            if (title) {
                title.setAttribute('data-original-title', video.title || '');
                if (currentLang === 'original') {
                    title.textContent = video.title || 'YouTube Video';
                } else {
                    title.textContent = getDisplayTitle(video.title) || video.title || 'YouTube Video';
                    queueTitleTranslation(video.title);
                }
            }
            if (channel) channel.textContent = video.channel || 'Creator';
            if (views) views.textContent = `👁️ ${video.view_count_formatted || video.view_count} ${dict.ytViews || 'views'}`;
            if (date) {
                const d = video.upload_date;
                date.textContent = d ? `📅 ${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : (dict.ytDateRecent || '📅 Recent');
            }

            if (typeof recordDownloadMemory === 'function' && video) {
                recordDownloadMemory({
                    id: String(video.id || video.url),
                    platform: 'youtube',
                    title: video.title,
                    khmer_title: video.title,
                    cover: video.thumbnail || '',
                    url: video.url,
                    total_episodes: 1
                });
            }

            // Quality grid
            selectedYtQuality = 'best';
            if (qualityGrid) {
                qualityGrid.innerHTML = '';
                const qualities = video.qualities || [];
                qualities.forEach((q, index) => {
                    const chip = document.createElement('div');
                    chip.className = `yt-quality-chip ${q.id === 'best' ? 'active' : ''}`;
                    chip.dataset.qualityId = q.id;
                    chip.dataset.qualityHeight = q.height || '';
                    chip.onclick = () => selectYtQuality(chip, q.id);

                    const label = getYtQualityLabel(q.id, q.height) || q.label;
                    chip.innerHTML = `
                        <span>${escapeHtml(label)}</span>
                        ${q.height ? `<span class="yt-chip-res-tag">${q.height}p</span>` : ''}
                    `;
                    qualityGrid.appendChild(chip);
                });
            }

            const tip = document.getElementById('ytQualityTip');
            if (tip) {
                tip.textContent = getYtQualityTip('best');
            }

            // Output dir
            fetch('/api/youtube/tasks')
                .then(r => r.json())
                .then(d => {
                    if (d.output_dir && outputDirDisplay) {
                        outputDirDisplay.textContent = d.output_dir;
                    }
                })
                .catch(() => {});

            if (card) {
                card.style.display = 'grid';
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        function selectYtQuality(chipEl, qualityId) {
            selectedYtQuality = qualityId;
            const allChips = document.querySelectorAll('.yt-quality-chip');
            allChips.forEach(c => c.classList.remove('active'));
            if (chipEl) chipEl.classList.add('active');

            const tip = document.getElementById('ytQualityTip');
            if (tip) {
                tip.textContent = getYtQualityTip(qualityId);
            }
        }

        async function startCurrentYtDownload() {
            if (typeof requireActiveLicense === 'function' && !requireActiveLicense('ទាញយកវីដេអូ YouTube')) {
                return;
            }
            const dict = I18N_DICT[currentLang] || I18N_DICT['zh'];
            if (!currentYtVideo || !currentYtVideo.url) {
                showToast(dict.ytToastAnalyzeFirst || 'Please analyze a video first!', '⚠️');
                return;
            }

            const btn = document.getElementById('btnStartYtDownload');
            if (btn) btn.disabled = true;

            try {
                const res = await fetch('/api/youtube/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: currentYtVideo.url,
                        quality: selectedYtQuality || 'best',
                        title: currentYtVideo.title,
                        thumbnail: currentYtVideo.thumbnail || ''
                    })
                });

                const data = await res.json();
                if (!res.ok || !data.ok) {
                    throw new Error(data.message || 'Failed to start download');
                }

                if (typeof recordDownloadMemory === 'function' && currentYtVideo) {
                    recordDownloadMemory({
                        id: String(currentYtVideo.id || currentYtVideo.url),
                        platform: 'youtube',
                        title: currentYtVideo.title,
                        khmer_title: currentYtVideo.title,
                        cover: currentYtVideo.thumbnail || '',
                        url: currentYtVideo.url,
                        total_episodes: 1
                    });
                }

                showToast(`${dict.ytToastStarted || '🚀 Download started'}: ${currentYtVideo.title.substring(0, 30)}...`, '📥');
                fetchYouTubeTasks();
                startYouTubeTasksPolling();
            } catch (err) {
                showToast(`Error: ${err.message}`, '❌');
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        async function fetchYouTubeTasks() {
            try {
                const res = await fetch('/api/youtube/tasks');
                const data = await res.json();
                if (!res.ok || !data.ok) return;

                const tasks = data.tasks || [];
                renderYouTubeTasks(tasks);

                const outEl = document.getElementById('ytOutputDirDisplay');
                if (outEl && data.output_dir) {
                    outEl.textContent = data.output_dir;
                }

                // Check if any task is actively downloading or merging
                const hasActive = tasks.some(t => t.status === 'downloading' || t.status === 'merging');
                if (hasActive) {
                    startYouTubeTasksPolling();
                }
            } catch (e) {}
        }

        function startYouTubeTasksPolling() {
            if (ytTasksPollingTimer) return;
            ytTasksPollingTimer = setInterval(fetchYouTubeTasks, 900);
        }

        function stopYouTubeTasksPolling() {
            if (ytTasksPollingTimer) {
                clearInterval(ytTasksPollingTimer);
                ytTasksPollingTimer = null;
            }
        }

        function renderYouTubeTasks(tasks) {
            const container = document.getElementById('ytTasksContainer');
            const emptyEl = document.getElementById('ytEmptyTasks');
            const badge = document.getElementById('ytTasksBadge');
            const dict = I18N_DICT[currentLang] || I18N_DICT['zh'];

            if (!container || !emptyEl) return;

            const activeCount = tasks.filter(t => t.status === 'downloading' || t.status === 'merging').length;
            if (badge) {
                if (tasks.length > 0) {
                    badge.style.display = 'inline-block';
                    const activeTxt = dict.ytDownloadingActive || 'downloading';
                    badge.textContent = `${activeCount > 0 ? activeCount + ' ' + activeTxt + ' / ' : ''}${tasks.length}`;
                } else {
                    badge.style.display = 'none';
                }
            }

            if (!tasks || tasks.length === 0) {
                emptyEl.style.display = 'block';
                container.style.display = 'none';
                return;
            }

            emptyEl.style.display = 'none';
            container.style.display = 'flex';

            container.innerHTML = tasks.map(t => {
                let badgeClass = 'yt-badge-downloading';
                let statusLabel = dict.ytStatusDownloading || '⬇️ Downloading';
                if (t.status === 'merging') {
                    badgeClass = 'yt-badge-merging';
                    statusLabel = dict.ytStatusMerging || '🔄 Merging Audio (FFmpeg)';
                } else if (t.status === 'completed') {
                    badgeClass = 'yt-badge-completed';
                    statusLabel = dict.ytStatusCompleted || '✅ Completed';
                } else if (t.status === 'canceled') {
                    badgeClass = 'yt-badge-canceled';
                    statusLabel = dict.ytStatusCanceled || '⛔ Canceled';
                } else if (t.status === 'error') {
                    badgeClass = 'yt-badge-error';
                    statusLabel = dict.ytStatusFailed || '❌ Failed';
                }

                const qualityTag = t.quality === 'audio' ? '🎵 MP3' : (t.quality === 'best' ? (dict.ytQualityBest || '🌟 Max Quality') : `${t.quality}p`);
                const isFinished = ['completed', 'canceled', 'error'].includes(t.status);
                const etaText = t.eta && t.eta !== 'NA' && !isFinished ? `<span>${dict.ytTaskEta || '⏱️ ETA: '}${escapeHtml(t.eta)}</span>` : '';
                const taskDisplayTitle = currentLang === 'original' ? t.title : (getDisplayTitle(t.title) || t.title);
                if (currentLang !== 'original') queueTitleTranslation(t.title);

                return `
                    <div class="yt-task-card" id="yt_card_${escapeHtml(t.id)}">
                        <div class="yt-task-icon">
                            ${t.status === 'completed' ? '✅' : (t.quality === 'audio' ? '🎵' : '▶️')}
                        </div>
                        <div class="yt-task-main">
                            <div class="yt-task-title-row">
                                <span class="yt-task-title" data-original-title="${escapeHtml(t.title)}" title="${escapeHtml(taskDisplayTitle)}">${escapeHtml(taskDisplayTitle)}</span>
                                <span class="yt-task-badge ${badgeClass}">${statusLabel}</span>
                            </div>

                            <div class="yt-progress-track">
                                <div class="yt-progress-fill ${t.status === 'completed' ? 'completed' : (t.status === 'merging' ? 'merging' : '')}"
                                     style="width: ${t.status === 'completed' ? 100 : (t.percentNum || 0)}%;"></div>
                            </div>

                            <div class="yt-task-meta-row">
                                <span>🎯 ${qualityTag}</span>
                                <span>${t.status === 'completed' ? '100%' : (t.percent || '0%')}</span>
                                ${t.speed ? `<span>⚡ ${escapeHtml(t.speed)}</span>` : ''}
                                ${etaText}
                                ${t.size && t.size !== 'NA' ? `<span>📦 ${escapeHtml(t.size)}</span>` : ''}
                            </div>
                        </div>

                        <div class="yt-task-actions">
                            ${!isFinished ? `
                                <button type="button" class="btn btn-secondary yt-btn-sm" onclick="cancelYouTubeTask('${escapeHtml(t.id)}')" title="${escapeHtml(dict.ytTaskCancel || 'Cancel')}">
                                    ${dict.ytTaskCancel || '✕ Cancel'}
                                </button>
                            ` : ''}
                            ${t.status === 'completed' ? `
                                <button type="button" class="btn btn-primary yt-btn-sm" onclick="openYouTubeFolder('${escapeHtml((t.filePath || '').replace(/\\/g, '\\\\'))}')" title="${escapeHtml(dict.ytTaskOpenFile || 'Open File')}">
                                    ${dict.ytTaskOpenFile || '📂 Open File'}
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }

        async function cancelYouTubeTask(taskId) {
            const dict = I18N_DICT[currentLang] || I18N_DICT['zh'];
            try {
                await fetch('/api/youtube/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ task_id: taskId })
                });
                showToast(dict.ytToastCanceled || 'Download canceled!', '⚠️');
                fetchYouTubeTasks();
            } catch (e) {
                showToast(dict.ytToastCancelError || 'Error canceling download', '❌');
            }
        }

        async function clearFinishedYtTasks() {
            const dict = I18N_DICT[currentLang] || I18N_DICT['zh'];
            try {
                await fetch('/api/youtube/clear', { method: 'POST' });
                showToast(dict.ytToastCleared || 'Cleared finished tasks!', '🧹');
                fetchYouTubeTasks();
            } catch (e) {
                showToast('Error', '❌');
            }
        }

        async function openYouTubeFolder(filePath = null) {
            const dict = I18N_DICT[currentLang] || I18N_DICT['zh'];
            try {
                const res = await fetch('/api/youtube/open_folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: filePath || '' })
                });
                const data = await res.json();
                if (data.ok) {
                    showToast(dict.ytToastFolderOpened || 'Opened YouTube folder in Explorer!', '📂');
                }
            } catch (e) {
                showToast(dict.ytToastFolderError || 'Cannot open folder', '❌');
            }
        }

        async function browseYouTubeFolder() {
            const dict = I18N_DICT[currentLang] || I18N_DICT['zh'];
            try {
                if (window.electronAPI && window.electronAPI.selectFolder) {
                    const selected = await window.electronAPI.selectFolder();
                    if (selected) {
                        const outEl = document.getElementById('ytOutputDirDisplay');
                        if (outEl) outEl.textContent = selected;
                        showToast(dict.ytToastFolderSelected || 'Selected new download folder!', '📁');
                        return;
                    }
                }
                const res = await fetch('/dl/browse_folder', { method: 'POST' });
                const data = await res.json();
                if (data.status === 'success' && data.path) {
                    const outEl = document.getElementById('ytOutputDirDisplay');
                    if (outEl) outEl.textContent = data.path;
                    showToast(dict.ytToastFolderSelected || 'Selected new download folder!', '📁');
                }
            } catch (e) {
                showToast('Error', '❌');
            }
        }