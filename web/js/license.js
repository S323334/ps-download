/**
 * Client-Side License Authentication, Auto-Activation & Device Tracking Module.
 * Ensures the application is only accessible when activated, supports auto-activation
 * when approved by Admin, and tracks client device and Telegram username.
 */

let _currentLicenseData = null;
let _licenseCountdownTimer = null;
let _isClosingModalSuccess = false;

function getLicenseSignature(data) {
    if (!data) return '';
    const key = String(data.key || data.license_key || '').trim().toUpperCase();
    const exp = String(data.expiresAt || data.expires_at || '').trim();
    const days = String(data.days !== undefined ? data.days : (data.remaining_days !== undefined ? data.remaining_days : '')).trim();
    if (!key && !exp) return '';
    return `${key}__${exp}__${days}`;
}

function isLicenseActive() {
    return !!(_currentLicenseData && _currentLicenseData.activated === true && !_currentLicenseData.expired);
}

function getLicenseRemainingDays() {
    if (_currentLicenseData && typeof _currentLicenseData.remaining_days === 'number') {
        return _currentLicenseData.remaining_days;
    }
    return null;
}

/**
 * Computes exact remaining days, hours, minutes for live countdown badge.
 */
function computeLicenseTimeDetails(data) {
    if (!data) return { status: 'unactivated', text: '🔑 ទិញ License (VIP)', icon: '🔐' };

    const custPrefix = data.custom_name ? `👤 ${data.custom_name} • ` : '';

    if (!data.activated) {
        if (data.expired) {
            return { status: 'expired', text: `${custPrefix}⚠️ License ផុតកំណត់ (ទិញថ្មី)`, icon: '⚠️' };
        }
        return { status: 'unactivated', text: `${custPrefix}🔑 ទិញ License (VIP)`, icon: '🔐' };
    }

    if (data.is_lifetime || data.type === 'master' || data.type === 'lifetime' || (!data.expires_at && !data.remaining_days)) {
        return { status: 'lifetime', text: `${custPrefix}👑 Lifetime VIP`, icon: '👑' };
    }

    // Live countdown computation from expires_at timestamp or remaining numbers
    const now = Date.now();
    let diffMs = 0;
    if (data.expires_at) {
        diffMs = new Date(data.expires_at).getTime() - now;
    } else if (typeof data.remaining_days === 'number') {
        const h = typeof data.remaining_hours === 'number' ? data.remaining_hours : 0;
        const m = typeof data.remaining_minutes === 'number' ? data.remaining_minutes : 0;
        diffMs = (data.remaining_days * 86400000) + (h * 3600000) + (m * 60000);
    }

    if (diffMs <= 0) {
        data.activated = false;
        data.expired = true;
        return { status: 'expired', text: `${custPrefix}⚠️ License ផុតកំណត់`, icon: '⚠️' };
    }

    const days = Math.floor(diffMs / 86400000);
    const hours = Math.floor((diffMs % 86400000) / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);

    let timeStr = '';
    if (days > 0) {
        timeStr = `នៅសល់ ${days} ថ្ងៃ ${hours} ម៉ោង ${mins} នាទី ${secs} វិនាទី`;
    } else if (hours > 0) {
        timeStr = `នៅសល់ ${hours} ម៉ោង ${mins} នាទី ${secs} វិនាទី`;
    } else {
        timeStr = `នៅសល់ ${mins} នាទី ${secs} វិនាទី`;
    }

    const icon = days <= 2 ? '⏳' : '✨';
    const status = days <= 2 ? 'expiring-soon' : 'active-pro';

    return {
        status,
        icon,
        days,
        hours,
        mins,
        secs,
        timeOnlyStr: timeStr,
        text: `${custPrefix}${timeStr}`,
        expiresAt: data.expires_at,
        customerName: data.custom_name || ''
    };
}

function updateHeaderLicenseBadge(data) {
    const badge = document.getElementById('btnHeaderLicenseStatus');
    const icon = document.getElementById('headerLicenseIcon');
    const text = document.getElementById('headerLicenseText');
    if (!badge || !text) return;

    if (icon) {
        icon.style.display = 'none'; // Completely hide the left icon inside the red circle
    }

    const info = computeLicenseTimeDetails(data);
    badge.className = 'btn btn-license-badge';

    let contentHtml = '';
    const safeEscape = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s || '');

    if (info.customerName && (info.status === 'active-pro' || info.status === 'expiring-soon' || info.status === 'lifetime')) {
        // EXACTLY 1 ICON: The 👤 on the name. The second line has NO duplicate icon!
        const subText = info.status === 'lifetime' ? '👑 Lifetime VIP' : safeEscape(info.timeOnlyStr || info.text);
        contentHtml = `
            <div style="display:flex; flex-direction:column; gap:2px; text-align:left; overflow:hidden; width:100%; line-height:1.28;">
                <div style="font-weight:700; font-size:0.72rem; color:#f8fafc; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">👤 ${safeEscape(info.customerName)}</div>
                <div style="font-size:0.67rem; color:inherit; font-weight:600; white-space:nowrap; overflow:hidden;">${subText}</div>
            </div>
        `;
    } else if (info.customerName && (info.status === 'expired' || info.status === 'unactivated')) {
        const subText = info.status === 'expired' ? 'License ផុតកំណត់ (ទិញថ្មី)' : 'ទិញ License (VIP)';
        contentHtml = `
            <div style="display:flex; flex-direction:column; gap:2px; text-align:left; overflow:hidden; width:100%; line-height:1.28;">
                <div style="font-weight:700; font-size:0.72rem; color:#f8fafc; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">👤 ${safeEscape(info.customerName)}</div>
                <div style="font-size:0.67rem; color:inherit; font-weight:600; white-space:nowrap; overflow:hidden;">${subText}</div>
            </div>
        `;
    } else {
        // Without customerName: Keep exactly 1 clean icon
        if (info.status === 'lifetime') {
            contentHtml = `<span style="font-size:0.72rem; line-height:1.25;">👑 Lifetime VIP</span>`;
        } else if (info.status === 'active-pro' || info.status === 'expiring-soon') {
            contentHtml = `<span style="font-size:0.72rem; line-height:1.25;">⏳ ${safeEscape(info.timeOnlyStr || info.text)}</span>`;
        } else if (info.status === 'expired') {
            contentHtml = `<span style="font-size:0.70rem; color:#fca5a5;">⚠️ License ផុតកំណត់</span>`;
        } else {
            contentHtml = `<span style="font-size:0.70rem;">🔑 ទិញ License (VIP)</span>`;
        }
    }

    if (info.status === 'lifetime') {
        badge.classList.add('lifetime-vip');
        text.innerHTML = contentHtml;
        badge.title = 'License សកម្មពេញមួយជីវិត (Lifetime VIP)';
    } else if (info.status === 'active-pro') {
        badge.classList.add('active-pro');
        text.innerHTML = contentHtml;
        badge.title = `License សកម្ម: ${info.text}${info.expiresAt ? ` (ផុតកំណត់: ${new Date(info.expiresAt).toLocaleString()})` : ''}`;
    } else if (info.status === 'expiring-soon') {
        badge.classList.add('expiring-soon');
        text.innerHTML = contentHtml;
        badge.title = `License ជិតផុតកំណត់: ${info.text}${info.expiresAt ? ` (ផុតកំណត់: ${new Date(info.expiresAt).toLocaleString()})` : ''}`;
    } else if (info.status === 'expired') {
        badge.classList.add('expired');
        text.innerHTML = contentHtml;
        badge.title = 'License របស់អ្នកបានផុតកំណត់ហើយ! ចុចដើម្បីទិញ ឬបញ្ចូល Key ថ្មី';
    } else {
        badge.classList.add('unactivated');
        text.innerHTML = contentHtml;
        badge.title = 'កម្មវិធីមិនទាន់មាន License ឡើយ! ចុចដើម្បីទិញ ឬ Activate';
    }
}

function startLicenseLiveCountdown() {
    if (_licenseCountdownTimer) clearInterval(_licenseCountdownTimer);
    _licenseCountdownTimer = setInterval(() => {
        if (_currentLicenseData) {
            updateHeaderLicenseBadge(_currentLicenseData);
        }
    }, 1000);
}

/**
 * Shows the congratulations message in the alert box and waits before smoothly closing modal.
 * Saves the signature so THIS license will NEVER celebrate or auto-close again!
 */
function triggerSuccessfulActivationClose(label = '', message = '', sig = '') {
    if (_isClosingModalSuccess) return;
    _isClosingModalSuccess = true;

    stopPaymentAutoCheck();
    stopModalFastSync();
    stopGroupVerificationPolling();

    if (sig) {
        localStorage.setItem('celebrated_license_sig', sig);
    }

    const displayLabel = label || (_currentLicenseData && _currentLicenseData.label) || 'សកម្ម';
    showToast('🎉 ' + (message || 'ម៉ាស៊ីនរបស់អ្នកត្រូវបានបើកសិទ្ធិដោយជោគជ័យ!'), '✅');
    showLicenseAlert(`🎉 អបអរសាទរ! អាជ្ញាប័ណ្ណត្រូវបានបើកសិទ្ធិ: ${displayLabel}`, 'success');

    const modal = document.getElementById('licenseActivationModal');
    setTimeout(() => {
        if (modal) {
            modal.style.transition = 'opacity 0.4s ease';
            modal.style.opacity = '0';
            setTimeout(() => {
                modal.style.display = 'none';
                modal.style.opacity = '1';
                modal.classList.remove('active');
                _isClosingModalSuccess = false;
            }, 400);
        } else {
            _isClosingModalSuccess = false;
        }
        checkAppLicenseStatus(true);
    }, 1800);
}

let _modalFastSyncTimer = null;
function startModalFastSync() {
    if (_modalFastSyncTimer) clearInterval(_modalFastSyncTimer);
    _modalFastSyncTimer = setInterval(async () => {
        const modal = document.getElementById('licenseActivationModal');
        if (!modal || modal.style.display === 'none' || !modal.classList.contains('active')) {
            stopModalFastSync();
            return;
        }
        if (_isClosingModalSuccess) return;
        try {
            const res = await fetch('/api/license/check-auto');
            const data = await res.json();
            if (data && data.authorized) {
                const currentSig = getLicenseSignature(data);
                const lastCelebrated = localStorage.getItem('celebrated_license_sig') || '';

                // Only celebrate & auto-close ONCE upon actual new purchase or new authorization!
                if (currentSig && currentSig !== lastCelebrated) {
                    localStorage.setItem('celebrated_license_sig', currentSig);
                    triggerSuccessfulActivationClose(data.label || (data.days ? `${data.days} ថ្ងៃ` : 'សកម្ម'), data.message, currentSig);
                }
            }
        } catch (_) {}
    }, 2500);
}

function stopModalFastSync() {
    if (_modalFastSyncTimer) {
        clearInterval(_modalFastSyncTimer);
        _modalFastSyncTimer = null;
    }
}

function closeLicenseModalForBrowsing() {
    stopPaymentAutoCheck();
    stopModalFastSync();
    stopGroupVerificationPolling();
    const modal = document.getElementById('licenseActivationModal');
    if (modal) {
        modal.style.transition = 'opacity 0.25s ease';
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.style.display = 'none';
            modal.style.opacity = '1';
            modal.classList.remove('active');
        }, 250);
    }
    sessionStorage.setItem('license_modal_dismissed', 'true');
    showToast('👁️ អ្នកអាចមើលផ្ទាំងរូបភាពរឿងដោយសេរី (មុខងារមើល និងដោនឡូតត្រូវការ License)', 'ℹ️');
}

function openLicenseActivationModal(force = false) {
    const modal = document.getElementById('licenseActivationModal');
    const notice = document.getElementById('licenseActionNoticeBanner');
    const alertBox = document.getElementById('licenseAlertBox');

    _isClosingModalSuccess = false;

    if (alertBox && !checkNotifyPaidLock()) {
        alertBox.style.display = 'none';
        alertBox.innerHTML = '';
    }

    if (notice && force) {
        notice.style.display = 'none';
    }
    if (modal) {
        modal.style.display = 'flex';
        modal.style.opacity = '1';
        modal.classList.add('active');
    }
    startModalFastSync();
}

/**
 * Intercepts any click action (poster click, play, download, YouTube fetch).
 * If license is missing/expired, alerts the user and opens the activation modal.
 */
function requireActiveLicense(actionLabel = 'មុខងារនេះ') {
    if (isLicenseActive()) {
        return true;
    }

    const modal = document.getElementById('licenseActivationModal');
    const notice = document.getElementById('licenseActionNoticeBanner');

    const isExpired = _currentLicenseData && _currentLicenseData.expired;
    const titleText = isExpired ? '⚠️ License របស់អ្នកបានផុតកំណត់ហើយ!' : '⚠️ អ្នកមិនទាន់មាន License ឡើយ!';
    const reasonText = isExpired
        ? `សុពលភាព License របស់អ្នកបានផុតកំណត់ហើយ ដូច្នេះមិនអាច <b>${escapeHtml(actionLabel)}</b> បានទេ។ សូមជ្រើសរើសកញ្ចប់ទិញបន្ត ឬបញ្ចូល License Key ថ្មី!`
        : `មុខងារ <b>${escapeHtml(actionLabel)}</b> ដំណើរការបានសម្រាប់តែកុំព្យូទ័រដែលមាន License សកម្មប៉ុណ្ណោះ។ សូមជ្រើសរើសកញ្ចប់ ឬបញ្ចូល License Key ដើម្បីបើកដំណើរការ!`;

    if (notice) {
        notice.innerHTML = `
            <div style="font-weight:800; font-size:0.92rem; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                <span>🔒</span> <span>${titleText}</span>
            </div>
            <div>${reasonText}</div>
        `;
        notice.style.display = 'block';
    }

    showToast(`🔒 អ្នកមិនមាន License ទេ! មិនអាច "${actionLabel}" បានឡើយ`, '⚠️');

    if (modal) {
        modal.style.display = 'flex';
        modal.style.opacity = '1';
        modal.classList.add('active');
    }

    return false;
}

// Attach globally for all modules
window.isLicenseActive = isLicenseActive;
window.requireActiveLicense = requireActiveLicense;
window.openLicenseActivationModal = openLicenseActivationModal;
window.closeLicenseModalForBrowsing = closeLicenseModalForBrowsing;
window.getLicenseRemainingDays = getLicenseRemainingDays;

async function checkAppLicenseStatus() {
    const modal = document.getElementById('licenseActivationModal');
    const deviceIdEl = document.getElementById('licenseDeviceIdText');
    const settingsLicText = document.getElementById('settingsLicenseTypeText');
    const tgInput = document.getElementById('clientTelegramInput');

    // Restore saved Telegram username
    const savedTg = localStorage.getItem('client_tg_user') || '';
    if (tgInput && savedTg) {
        tgInput.value = savedTg;
    }

    try {
        const res = await fetch('/api/license/status');
        let data = await res.json();
        _currentLicenseData = data;

        // If not activated locally, silently check Cloud for Remote Auto-Authorization
        if (!data.activated) {
            try {
                const autoRes = await fetch('/api/license/check-auto');
                const autoData = await autoRes.json();
                if (autoData && autoData.authorized) {
                    const freshRes = await fetch('/api/license/status');
                    data = await freshRes.json();
                    _currentLicenseData = data;
                }
            } catch (_) {}
        }

        if (deviceIdEl && data.device_id) {
            deviceIdEl.innerText = data.device_id;
        }

        // Auto-report ping to server (Device Tracking & Anti-Leak)
        reportDevicePing(data.device_id, savedTg);
        if (!window._devicePingInterval) {
            window._devicePingInterval = setInterval(() => {
                if (_currentLicenseData && _currentLicenseData.device_id) {
                    reportDevicePing(_currentLicenseData.device_id);
                }
            }, 120000);
        }

        // Continuous Background Live-Sync: syncs days and names from Telegram Bot every 25 seconds
        if (!window._backgroundLiveSyncInterval) {
            window._backgroundLiveSyncInterval = setInterval(async () => {
                try {
                    const chkRes = await fetch('/api/license/check-auto');
                    const cloudRes = await chkRes.json();
                    if (cloudRes) {
                        if (cloudRes.revoked) {
                            showToast('🔒 License ត្រូវបានដកហូតដោយ Admin', '⚠️');
                            checkAppLicenseStatus();
                        } else if (cloudRes.authorized) {
                            const freshRes = await fetch('/api/license/status');
                            const freshData = await freshRes.json();
                            if (freshData && freshData.activated) {
                                _currentLicenseData = freshData;
                                updateHeaderLicenseBadge(freshData);
                            }
                        }
                    }
                } catch (_) {}
            }, 25000);
        }

        // Update header status badge & start live countdown timer
        updateHeaderLicenseBadge(data);
        startLicenseLiveCountdown();

        if (data.activated) {
            // Seed current active license signature as already celebrated so opening the modal does not falsely trigger
            const currentSig = getLicenseSignature(data);
            if (currentSig && !localStorage.getItem('celebrated_license_sig')) {
                localStorage.setItem('celebrated_license_sig', currentSig);
            }

            // Already Activated: Hide activation modal only if not actively opened by user
            if (modal && !modal.classList.contains('active')) {
                modal.style.display = 'none';
                modal.classList.remove('active');
            }
            if (settingsLicText) {
                const typeLabel = data.label || 'Lifetime VIP (ពេញមួយជីវិត)';
                const info = computeLicenseTimeDetails(data);
                const remDays = info.text ? ` - ${info.text}` : '';
                settingsLicText.innerHTML = `✅ បានបើកដំណើរការរួច (${escapeHtml(typeLabel)}${remDays})`;
            }
            return true;
        } else {
            // NOT Activated or Expired: Do NOT auto-open modal on startup!
            // Let the user browse posters and explore the app freely!
            if (modal && !modal.classList.contains('active')) {
                modal.style.display = 'none';
                modal.classList.remove('active');
            }
            const alertBox = document.getElementById('licenseAlertBox');
            if (alertBox && !checkNotifyPaidLock()) {
                alertBox.style.display = 'none';
            }
            if (settingsLicText) {
                const isExp = data && data.expired;
                settingsLicText.innerHTML = isExp 
                    ? `<span style="color:#ef4444;">⚠️ License ផុតកំណត់ហើយ</span>` 
                    : `<span style="color:#ef4444;">❌ មិនទាន់ Activate ឡើយ</span>`;
            }
            return false;
        }
    } catch (err) {
        console.warn('[License] Failed to check status:', err);
        return false;
    }
}

/**
 * Reports device ping & Telegram username to backend tracking database & Telegram Bot
 */
async function reportDevicePing(deviceId, tgUser) {
    try {
        const lic = (typeof _currentLicenseData === 'object' && _currentLicenseData) ? _currentLicenseData : {};
        const key = lic.key || localStorage.getItem('ps_license_key') || '';
        const customName = lic.custom_name || localStorage.getItem('client_custom_name') || '';
        const status = lic.status || (lic.valid ? 'active' : 'unactivated');
        const expiresAt = lic.expires_at || null;
        const remainingDays = lic.remaining_days !== undefined ? lic.remaining_days : null;

        try {
            const trackResp = await fetch('/api/license/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    deviceId: deviceId,
                    telegramUser: tgUser || localStorage.getItem('client_tg_user') || '',
                    customName: customName,
                    computerName: '',
                    key: key,
                    status: status,
                    expiresAt: expiresAt,
                    remainingDays: remainingDays
                })
            });
            if (trackResp.ok) {
                const trackData = await trackResp.json();
                if (trackData && trackData.customName && trackData.customName !== customName) {
                    localStorage.setItem('client_custom_name', trackData.customName);
                    if (_currentLicenseData) {
                        _currentLicenseData.custom_name = trackData.customName;
                    }
                    updateHeaderLicenseBadge(_currentLicenseData);
                }
            }
        } catch (_) {}

        // 2. Real-Time Cloud Heartbeat: Ping 24/7 Render Cloud Server
        // Automatically updates Online status and syncs Admin's latest customName immediately!
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const cloudResp = await fetch('https://ps-download-bot-irhw.onrender.com/api/license/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    deviceId: deviceId,
                    telegramUser: tgUser || localStorage.getItem('client_tg_user') || '',
                    customName: customName,
                    computerName: '',
                    key: key,
                    status: status,
                    appVersion: '3.2.2'
                })
            });
            clearTimeout(timeoutId);
            if (cloudResp.ok) {
                const cloudData = await cloudResp.json();
                if (cloudData && cloudData.customName && cloudData.customName !== customName) {
                    console.log('[License] 🔄 Admin updated name to:', cloudData.customName);
                    localStorage.setItem('client_custom_name', cloudData.customName);
                    if (_currentLicenseData) {
                        _currentLicenseData.custom_name = cloudData.customName;
                    }
                    updateHeaderLicenseBadge(_currentLicenseData);
                }
            }
        } catch (_) {}
    } catch (e) {
        // Silent
    }
}

// Periodic heartbeat ping every 20s for live tracking & instant name updates
setInterval(() => {
    try {
        if (_currentLicenseData && _currentLicenseData.device_id) {
            reportDevicePing(_currentLicenseData.device_id);
        }
    } catch (_) {}
}, 20000);

function onClientTelegramChange(val) {
    const clean = val.trim();
    localStorage.setItem('client_tg_user', clean);
    if (_currentLicenseData && _currentLicenseData.device_id) {
        reportDevicePing(_currentLicenseData.device_id, clean);
    }
}

/**
 * Auto-Activation: Client simply clicks "ផ្ទុកឡើងវិញ (Refresh / Auto Activate)"
 * If Admin has authorized their Device ID, it unlocks automatically!
 */
async function refreshAndCheckAutoActivation() {
    const btn = document.getElementById('btnRefreshAutoLicense');
    const icon = document.getElementById('btnRefreshAutoIcon');
    const text = document.getElementById('btnRefreshAutoText');
    const modal = document.getElementById('licenseActivationModal');

    if (btn) btn.disabled = true;
    if (icon) icon.classList.add('spin-anim');
    if (text) text.innerText = 'កំពុងពិនិត្យមើល...';

    // Save telegram username if typed
    const tgInput = document.getElementById('clientTelegramInput');
    if (tgInput && tgInput.value.trim()) {
        onClientTelegramChange(tgInput.value.trim());
    }

    try {
        const res = await fetch('/api/license/check-auto');
        const data = await res.json();

        if (data.authorized) {
            const sig = getLicenseSignature(data);
            triggerSuccessfulActivationClose(data.label || 'សកម្ម', data.message || 'ម៉ាស៊ីនរបស់អ្នកត្រូវបាន Admin អនុញ្ញាតដោយជោគជ័យ!', sig);
        } else {
            showToast('⚠️ ប្រព័ន្ធកំពុងមានបញ្ហាសូមផ្ញើវិក័យប័ត្រឱ្យទៅអែតមីន @Thpisal33', '⚠️');
            showLicenseAlert(
                `⚠️ <b>ប្រព័ន្ធកំពុងមានបញ្ហាសូមផ្ញើវិក័យប័ត្រឱ្យទៅអែតមីន:</b> <a href="https://t.me/Thpisal33" target="_blank" onclick="openAdminTelegramChat()" style="color:#38bdf8; text-decoration:underline; font-weight:700;">@Thpisal33</a><br><div style="margin-top:8px;"><button type="button" class="btn btn-primary btn-sm" onclick="openAdminTelegramChat()" style="background:#229ED9; border:none; padding:5px 12px; font-size:0.78rem; font-weight:700; border-radius:6px; cursor:pointer; color:#fff;">✈️ ចុចផ្ញើវិក្កយបត្រទៅ Telegram (@Thpisal33)</button></div>`,
                'error'
            );
            showSystemNoticeModal();
        }
    } catch (err) {
        showToast('⚠️ ប្រព័ន្ធកំពុងមានបញ្ហាសូមផ្ញើវិក័យប័ត្រឱ្យទៅអែតមីន @Thpisal33', '⚠️');
        showLicenseAlert(
            `⚠️ <b>ប្រព័ន្ធកំពុងមានបញ្ហាសូមផ្ញើវិក័យប័ត្រឱ្យទៅអែតមីន:</b> <a href="https://t.me/Thpisal33" target="_blank" onclick="openAdminTelegramChat()" style="color:#38bdf8; text-decoration:underline; font-weight:700;">@Thpisal33</a><br><div style="margin-top:8px;"><button type="button" class="btn btn-primary btn-sm" onclick="openAdminTelegramChat()" style="background:#229ED9; border:none; padding:5px 12px; font-size:0.78rem; font-weight:700; border-radius:6px; cursor:pointer; color:#fff;">✈️ ចុចផ្ញើវិក្កយបត្រទៅ Telegram (@Thpisal33)</button></div>`,
            'error'
        );
        showSystemNoticeModal();
    } finally {
        if (btn) btn.disabled = false;
        if (icon) icon.classList.remove('spin-anim');
        if (text) text.innerText = 'ផ្ទុកឡើងវិញ (Refresh / Check License)';
    }
}

/**
 * Toggle between Auto Mode and Manual Key Entry
 */
function toggleManualKeyMode() {
    const box = document.getElementById('manualKeyWrapper');
    const toggleLink = document.getElementById('linkToggleManualKey');
    if (!box) return;

    const isHidden = box.style.display === 'none' || !box.style.display;
    box.style.display = isHidden ? 'block' : 'none';
    if (toggleLink) {
        toggleLink.innerHTML = isHidden ? '▲ បិទផ្ទាំងបញ្ចូល Key ដោយខ្លួនឯង' : '🔑 ឬបញ្ចូល License Key ដោយខ្លួនឯង (Enter Key Manually) ▾';
    }
    if (isHidden) {
        const inp = document.getElementById('licenseKeyInput');
        if (inp) inp.focus();
    }
}

async function copyClientTelegramInfo() {
    const deviceIdEl = document.getElementById('licenseDeviceIdText');
    const tgInput = document.getElementById('clientTelegramInput');
    const deviceId = deviceIdEl ? deviceIdEl.innerText.trim() : '';
    const tgUser = tgInput ? tgInput.value.trim() : (localStorage.getItem('client_tg_user') || '');

    const tgPart = tgUser ? `\n👤 Telegram ខ្ញុំ: ${tgUser}` : '';
    const message = `👋 សួស្តី Admin @Thpisal33! ខ្ញុំបានទាញយកកម្មវិធី PS DOWNLOAD និងចង់ស្នើសុំ License:\n\n💻 លេខម៉ាស៊ីន (Device ID): ${deviceId}${tgPart}\n\n👉 សូមជួយបើកសិទ្ធិ ឬផ្ញើ License Key ឱ្យខ្ញុំផង! សូមអរគុណ! 🙏`;

    try {
        await copyToClipboard(message);
        showToast('📋 បានចម្លងព័ត៌មាន! សូម Paste ផ្ញើទៅកាន់ Telegram @Thpisal33', '✅');
        const btn = document.getElementById('btnCopyAllInfoText');
        if (btn) {
            const orig = btn.innerText;
            btn.innerText = 'បានចម្លងរួចរាល់!';
            setTimeout(() => { btn.innerText = orig; }, 2000);
        }
    } catch (e) {
        showToast('មិនអាចចម្លងបានឡើយ: ' + e.message, '⚠️');
    }
}

async function copyDeviceId() {
    const deviceIdEl = document.getElementById('licenseDeviceIdText');
    const id = deviceIdEl ? deviceIdEl.innerText.trim() : '';
    if (!id) return;

    try {
        await copyToClipboard(id);
        showToast('📋 បានចម្លង Device ID!', '✅');
    } catch (e) {
        showToast('មិនអាចចម្លងបានឡើយ', '⚠️');
    }
}

async function pasteLicenseKey() {
    try {
        let text = '';
        if (navigator.clipboard && navigator.clipboard.readText) {
            text = await navigator.clipboard.readText();
        }
        const inp = document.getElementById('licenseKeyInput');
        if (inp && text) {
            inp.value = text.trim().toUpperCase();
            inp.focus();
        }
    } catch (e) {
        showToast('សូមចុច Ctrl + V ដើម្បី Paste', '💡');
    }
}

async function submitLicenseActivation() {
    const input = document.getElementById('licenseKeyInput');
    const key = input ? input.value.trim().toUpperCase() : '';
    const alertBox = document.getElementById('licenseAlertBox');
    const btn = document.getElementById('btnActivateLicense');
    const btnText = document.getElementById('btnActivateText');
    const btnIcon = document.getElementById('btnActivateIcon');
    const modal = document.getElementById('licenseActivationModal');

    if (!key) {
        showLicenseAlert('❌ សូមបញ្ចូល License Key របស់អ្នក', 'error');
        if (input) input.focus();
        return;
    }

    if (btn) btn.disabled = true;
    if (btnIcon) btnIcon.innerText = '⏳';
    if (btnText) btnText.innerText = 'កំពុងផ្ទៀងផ្ទាត់...';
    if (alertBox) alertBox.style.display = 'none';

    const tgInput = document.getElementById('clientTelegramInput');
    const tgUser = tgInput ? tgInput.value.trim() : (localStorage.getItem('client_tg_user') || '');

    try {
        const res = await fetch('/api/license/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key,
                telegramUser: tgUser,
                computerName: window.location.hostname
            })
        });
        const result = await res.json();

        if (result.success) {
            const sig = getLicenseSignature(result);
            triggerSuccessfulActivationClose(result.label || 'សកម្ម', result.message || 'បានបើកដំណើរការជោគជ័យ! សូមស្វាគមន៍!', sig);
        } else {
            showLicenseAlert(result.error || '❌ License Key មិនត្រឹមត្រូវ សូមពិនិត្យមើលឡើងវិញ', 'error');
            if (result.isLocked) {
                if (input) input.disabled = true;
                if (btn) btn.disabled = true;
                showToast('🚨 កម្មវិធីត្រូវបានចាក់សោរដោយសារវាយលេខកូដខុសច្រើនដង!', '⚠️');
            } else if (result.failedCount >= 4) {
                showToast(`⚠️ ប្រយ័ត្ន! វាយខុស ${result.failedCount} ដងហើយ! ព័ត៌មានត្រូវបានរាយការណ៍ទៅ Admin`, '⚠️');
            }
        }
    } catch (err) {
        showLicenseAlert('❌ មិនអាចភ្ជាប់ទៅកាន់ប្រព័ន្ធផ្ទៀងផ្ទាត់បានឡើយ: ' + err.message, 'error');
    } finally {
        if (btn && !btn.disabled) {
            btn.disabled = false;
            if (btnIcon) btnIcon.innerText = '⚡';
            if (btnText) btnText.innerText = 'បើកដំណើរការកម្មវិធី (Activate License)';
        }
    }
}

function showLicenseAlert(msg, type = 'error') {
    const alertBox = document.getElementById('licenseAlertBox');
    if (!alertBox) return;

    alertBox.innerHTML = msg;
    alertBox.style.display = 'block';
    if (type === 'success') {
        alertBox.style.background = 'rgba(16, 185, 129, 0.18)';
        alertBox.style.borderColor = '#10b981';
        alertBox.style.color = '#34d399';
    } else {
        alertBox.style.background = 'rgba(239, 68, 68, 0.18)';
        alertBox.style.borderColor = '#ef4444';
        alertBox.style.color = '#fca5a5';
    }
}

function showChangeLicensePrompt() {
    const modal = document.getElementById('licenseActivationModal');
    const input = document.getElementById('licenseKeyInput');
    const alertBox = document.getElementById('licenseAlertBox');

    if (alertBox) alertBox.style.display = 'none';
    if (input) {
        input.value = '';
        input.placeholder = 'បញ្ចូល License Key ថ្មី...';
    }
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
}

// Subscription Pricing & KHQR Payment Logic ($1.50/week, $5.99/month)
let _currentPlan = { id: '', amount: '1.50', label: '១ សប្តាហ៍ ($1.50)' };

let _paymentAutoCheckTimer = null;

function startPaymentAutoCheck() {
    if (_paymentAutoCheckTimer) return;
    console.log('[License] 🔄 Started auto-activation polling every 2.5s...');
    _paymentAutoCheckTimer = setInterval(async () => {
        if (_isClosingModalSuccess) return;
        try {
            const res = await fetch('/api/license/check-auto');
            const data = await res.json();
            if (data && data.authorized) {
                const currentSig = getLicenseSignature(data);
                const lastCelebrated = localStorage.getItem('celebrated_license_sig') || '';

                if (currentSig && currentSig !== lastCelebrated) {
                    localStorage.setItem('celebrated_license_sig', currentSig);
                    triggerSuccessfulActivationClose(data.label || (_currentPlan && _currentPlan.label) || (data.days ? `${data.days} ថ្ងៃ` : 'សកម្ម'), data.message, currentSig);
                }
            }
        } catch (e) {}
    }, 2500);
}

function stopPaymentAutoCheck() {
    if (_paymentAutoCheckTimer) {
        clearInterval(_paymentAutoCheckTimer);
        _paymentAutoCheckTimer = null;
        console.log('[License] ⏹️ Stopped auto-activation polling');
    }
}

function selectPricingPlan(planId, amount, label) {
    const sec = document.getElementById('qrPaymentSection');
    const cardWeek = document.getElementById('planCardWeek');
    const cardMonth = document.getElementById('planCardMonth');
    const qrAmount = document.getElementById('qrPriceAmountText');
    const qrImg = document.getElementById('qrPaymentImage');

    // If QR section is already open AND user clicks the SAME plan, close it (toggle)
    if (sec && sec.style.display !== 'none' && _currentPlan && _currentPlan.id === planId) {
        closeQRPaymentCard();
        return;
    }

    _currentPlan = { id: planId, amount, label };

    if (planId === '1_week') {
        if (cardWeek) {
            cardWeek.style.border = '1.5px solid #3b82f6';
            cardWeek.style.background = 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(37,99,235,0.18))';
            cardWeek.style.boxShadow = '0 0 10px rgba(59,130,246,0.3)';
        }
        if (cardMonth) {
            cardMonth.style.border = '1.5px solid rgba(255,255,255,0.12)';
            cardMonth.style.background = 'rgba(255,255,255,0.04)';
            cardMonth.style.boxShadow = 'none';
        }
        if (qrImg) qrImg.src = '/qr_1_50.png?t=' + Date.now();
    } else {
        if (cardMonth) {
            cardMonth.style.border = '1.5px solid #10b981';
            cardMonth.style.background = 'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(5,150,105,0.18))';
            cardMonth.style.boxShadow = '0 0 10px rgba(16,185,129,0.3)';
        }
        if (cardWeek) {
            cardWeek.style.border = '1.5px solid rgba(255,255,255,0.12)';
            cardWeek.style.background = 'rgba(255,255,255,0.04)';
            cardWeek.style.boxShadow = 'none';
        }
        if (qrImg) qrImg.src = '/qr_5_99.png?t=' + Date.now();
    }

    if (qrAmount) qrAmount.innerText = `$${amount}`;

    // Pop open the QR section and hide placeholder!
    const placeholder = document.getElementById('qrPlaceholderNotice');
    if (placeholder) placeholder.style.display = 'none';
    if (sec) {
        sec.style.display = 'block';
    }

    // Register pending checkout intent on backend
    const deviceIdEl = document.getElementById('licenseDeviceIdText');
    const devId = deviceIdEl ? deviceIdEl.innerText.trim() : '';
    fetch('/api/license/pending-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: devId, plan: label, amount })
    }).catch(() => {});

    // Start auto-checking for ABA PayWay fulfillment
    startPaymentAutoCheck();
}

function closeQRPaymentCard() {
    stopPaymentAutoCheck();
    const sec = document.getElementById('qrPaymentSection');
    const cardWeek = document.getElementById('planCardWeek');
    const cardMonth = document.getElementById('planCardMonth');
    const placeholder = document.getElementById('qrPlaceholderNotice');
    if (sec) sec.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    _currentPlan = { id: '', amount: '1.50', label: '១ សប្តាហ៍ ($1.50)' };
    if (cardWeek) {
        cardWeek.style.border = '1.5px solid rgba(255,255,255,0.12)';
        cardWeek.style.background = 'rgba(255,255,255,0.04)';
        cardWeek.style.boxShadow = 'none';
    }
    if (cardMonth) {
        cardMonth.style.border = '1.5px solid rgba(255,255,255,0.12)';
        cardMonth.style.background = 'rgba(255,255,255,0.04)';
        cardMonth.style.boxShadow = 'none';
    }
}

function toggleQRPaymentCard() {
    const sec = document.getElementById('qrPaymentSection');
    if (!sec) return;
    if (sec.style.display === 'none') {
        selectPricingPlan('1_week', '1.50', '១ សប្តាហ៍ ($1.50)');
    } else {
        closeQRPaymentCard();
    }
}

let _notifyCooldownTimer = null;

function startNotifyPaidCooldown(seconds) {
    const btn = document.getElementById('btnNotifyPaid');
    const btnText = document.getElementById('btnNotifyPaidText');
    if (!btn || !btnText) return;

    if (_notifyCooldownTimer) clearInterval(_notifyCooldownTimer);

    let remaining = seconds;
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btn.style.cursor = 'not-allowed';
    btn.style.background = '#475569';
    btnText.innerText = `⏱️ សូមរង់ចាំ (${remaining}s)...`;

    _notifyCooldownTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(_notifyCooldownTimer);
            _notifyCooldownTimer = null;
            localStorage.removeItem('notify_paid_lock_until');
            const alertBox = document.getElementById('licenseAlertBox');
            if (alertBox) alertBox.style.display = 'none';
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            btnText.innerText = 'ខ្ញុំបានបាញ់លុយរួចរាល់ (Notify Admin)';
        } else {
            btnText.innerText = `⏱️ សូមរង់ចាំ (${remaining}s)...`;
        }
    }, 1000);
}

function checkNotifyPaidLock() {
    const lockUntil = parseInt(localStorage.getItem('notify_paid_lock_until') || '0', 10);
    const now = Date.now();
    if (lockUntil > now) {
        const remaining = Math.ceil((lockUntil - now) / 1000);
        startNotifyPaidCooldown(remaining);
        showLicenseAlert(
            `💬 <b>សូមទាក់ទងទៅ admin ផ្ទាល់ ដើម្បីផ្ញើវិក្កយបត្រ៖</b> <a href="https://t.me/Thpisal33" target="_blank" onclick="openAdminTelegramChat()" style="color:#38bdf8; text-decoration:underline; font-weight:700;">@Thpisal33</a><br><div style="margin-top:8px;"><button type="button" class="btn btn-primary btn-sm" onclick="openAdminTelegramChat()" style="background:#229ED9; border:none; padding:5px 14px; font-size:0.78rem; font-weight:700; border-radius:6px; cursor:pointer; color:#fff;">✈️ ផ្ញើវិក្កយបត្រទៅកាន់ Telegram (@Thpisal33)</button></div>`,
            'error'
        );
        return true;
    }
    const alertBox = document.getElementById('licenseAlertBox');
    if (alertBox) alertBox.style.display = 'none';
    return false;
}

let _groupVerificationPollingTimer = null;

function stopGroupVerificationPolling() {
    if (_groupVerificationPollingTimer) {
        clearInterval(_groupVerificationPollingTimer);
        _groupVerificationPollingTimer = null;
    }
}

function startGroupVerificationPolling(deviceId, amount) {
    stopGroupVerificationPolling();
    let checksLeft = 10; // 10 times * 3s = 30 seconds

    _groupVerificationPollingTimer = setInterval(async () => {
        checksLeft--;
        try {
            const res = await fetch(`/api/license/check-payment-verification?deviceId=${encodeURIComponent(deviceId)}&amount=${encodeURIComponent(amount)}`);
            const data = await res.json();
            if (data && data.verified && data.autoActivated) {
                const sig = getLicenseSignature(data);
                triggerSuccessfulActivationClose(data.label || (_currentPlan && _currentPlan.label) || (data.days ? `${data.days} ថ្ងៃ` : 'សកម្ម'), 'ការបង់ប្រាក់ត្រូវបានផ្ទៀងផ្ទាត់ជោគជ័យ! កម្មវិធីត្រូវបានបើកសិទ្ធិ!', sig);
                return;
            }
        } catch (e) {}

        if (checksLeft <= 0) {
            stopGroupVerificationPolling();
        }
    }, 3000);
}

async function notifyPaymentSent() {
    const tgInput = document.getElementById('clientTelegramInput');
    const deviceIdEl = document.getElementById('licenseDeviceIdText');
    const btn = document.getElementById('btnNotifyPaid');
    const btnText = document.getElementById('btnNotifyPaidText');

    const tgUser = tgInput ? tgInput.value.trim() : (localStorage.getItem('client_tg_user') || '');
    const deviceId = deviceIdEl ? deviceIdEl.innerText.trim() : '';

    if (btn) btn.disabled = true;
    if (btnText) btnText.innerText = '🔍 កំពុងឆែកមើលការបង់ប្រាក់...';

    try {
        const res = await fetch('/api/license/notify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deviceId: deviceId,
                telegramUser: tgUser,
                plan: _currentPlan.label,
                amount: _currentPlan.amount
            })
        });

        const data = await res.json();

        // 1. IF VERIFIED: Show success alert banner, wait, and smoothly close modal
        if (data.verified && data.autoActivated) {
            const sig = getLicenseSignature(data);
            triggerSuccessfulActivationClose(data.label || (_currentPlan && _currentPlan.label) || (data.days ? `${data.days} ថ្ងៃ` : 'សកម្ម'), 'ការបង់ប្រាក់ត្រូវបានផ្ទៀងផ្ទាត់ជោគជ័យ! កម្មវិធីត្រូវបានបើកសិទ្ធិ!', sig);
            return;
        }

        // 2. Not verified yet: Show clear warning and let user click again!
        startGroupVerificationPolling(deviceId, _currentPlan.amount);

        showLicenseAlert(
            `⚠️ <b>មិនទាន់ទទួលបានការបង់ប្រាក់នៅឡើយទេ!</b><br>` +
            `ប្រព័ន្ធមិនទាន់ឃើញសារលុយចូលពីធនាគារឡើយ។ សូមរង់ចាំបន្តិច (ប្រហែល 5-10 វិនាទី) រួចចុច <b>"ខ្ញុំបានបាញ់រួចរាល់"</b> ម្តងទៀត!`,
            'error'
        );
    } catch (err) {
        showToast('⚠️ មានបញ្ហាក្នុងការផ្ទៀងផ្ទាត់ សូមសាកល្បងម្ដងទៀត', '⚠️');
    } finally {
        // Reset button after 1.5s so customer can click again without being locked out!
        setTimeout(() => {
            if (btn && !_isClosingModalSuccess) {
                btn.disabled = false;
                if (btnText) {
                    btnText.innerText = '🔄 ចុចផ្ទៀងផ្ទាត់ម្តងទៀត (Check Again)';
                }
            }
        }, 1500);
    }
}

function openExternalLink(url) {
    if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}

async function copyAdminTelegramUsername() {
    await copyToClipboard('@Thpisal33');
    showToast('📋 បានចម្លងឈ្មោះ Telegram: @Thpisal33', '✅');
}

async function openAdminTelegramChat() {
    const tgInput = document.getElementById('clientTelegramInput');
    const deviceIdEl = document.getElementById('licenseDeviceIdText');
    const tgUser = tgInput ? tgInput.value.trim() : (localStorage.getItem('client_tg_user') || '');
    const deviceId = deviceIdEl ? deviceIdEl.innerText.trim() : '';
    const plan = (_currentPlan && _currentPlan.label) || '១ សប្តាហ៍ ($1.50)';
    const amount = (_currentPlan && _currentPlan.amount) || '1.50';

    const msg = `👋 សួស្តី Admin @Thpisal33! ខ្ញុំបានទូទាត់ទិញ License កម្មវិធី PS DOWNLOAD:\n\n📦 កញ្ចប់: ${plan} ($${amount})\n💻 Device ID: ${deviceId}\n👤 Telegram ខ្ញុំ: ${tgUser || '(មិនបញ្ជាក់)'}\n\n👉 នេះជាវិក្កយបត្របង់ប្រាក់របស់ខ្ញុំ សូមជួយពិនិត្យ និងបើកសិទ្ធិឱ្យខ្ញុំផង! សូមអរគុណ! 🙏`;
    
    try {
        await copyToClipboard(msg);
        showToast('📋 បានចម្លងព័ត៌មានវិក្កយបត្រ! កំពុងបើក Telegram @Thpisal33...', '✈️');
    } catch (e) {}

    setTimeout(() => {
        openExternalLink('https://t.me/Thpisal33');
    }, 250);
}

async function openTelegramAdminChat() {
    return openAdminTelegramChat();
}

function showSystemNoticeModal() {
    const modal = document.getElementById('systemNoticeModal');
    const deviceIdEl = document.getElementById('licenseDeviceIdText');
    const tgInput = document.getElementById('clientTelegramInput');
    const noticeDev = document.getElementById('systemNoticeDeviceId');
    const noticeTg = document.getElementById('systemNoticeTgUser');
    const noticePlan = document.getElementById('systemNoticePlan');

    const deviceId = deviceIdEl ? deviceIdEl.innerText.trim() : '';
    const tgUser = tgInput ? tgInput.value.trim() : (localStorage.getItem('client_tg_user') || '');

    if (noticeDev) noticeDev.innerText = deviceId || 'HG-0000-0000-0000';
    if (noticeTg) noticeTg.innerText = tgUser ? `@${tgUser.replace(/^@/, '')}` : '(មិនទាន់បានបំពេញ)';
    if (noticePlan) noticePlan.innerText = _currentPlan ? `${_currentPlan.label} ($${_currentPlan.amount})` : '១ សប្តាហ៍ ($1.50)';

    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

function showContactAdminModal(isLocked = false) {
    const modal = document.getElementById('contactAdminDirectModal');
    const deviceIdEl = document.getElementById('licenseDeviceIdText');
    const noticeDev = document.getElementById('contactAdminDeviceId');
    const noticePlan = document.getElementById('contactAdminPlan');
    const lockNotice = document.getElementById('contactAdminLockNotice');

    const deviceId = deviceIdEl ? deviceIdEl.innerText.trim() : '';

    if (noticeDev) noticeDev.innerText = deviceId || 'HG-0000-0000-0000';
    if (noticePlan) noticePlan.innerText = _currentPlan ? `${_currentPlan.label} ($${_currentPlan.amount})` : '១ សប្តាហ៍ ($1.50)';
    if (lockNotice) lockNotice.style.display = isLocked ? 'block' : 'none';

    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

function closeContactAdminModal() {
    const modal = document.getElementById('contactAdminDirectModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

function closeSystemNoticeModal() {
    const modal = document.getElementById('systemNoticeModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

// Auto-format license input with dashes while typing
document.addEventListener('DOMContentLoaded', () => {
    const inp = document.getElementById('licenseKeyInput');
    if (inp) {
        inp.addEventListener('input', (e) => {
            let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (val.length > 16) val = val.substring(0, 16);
            const parts = [];
            for (let i = 0; i < val.length; i += 4) {
                parts.push(val.substring(i, i + 4));
            }
            e.target.value = parts.join('-');
        });
    }

    // Secret Key combination for Developer to open Admin Generator: Ctrl + Alt + Shift + A
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.altKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
            e.preventDefault();
            window.open('/admin', '_blank');
        }
    });

    // Check if notify paid button is locked
    checkNotifyPaidLock();

    // Run license check right away
    checkAppLicenseStatus();

    // Auto-sync license changes (e.g. name or days changed in Admin) when switching back to app
    window.addEventListener('focus', () => {
        checkAppLicenseStatus();
    });

    // Background auto-sync every 20s
    setInterval(() => {
        checkAppLicenseStatus();
    }, 20000);
});
