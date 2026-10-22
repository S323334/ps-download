/**
 * PS DOWNLOAD - Mobile Web App Engine Pro
 * Multi-Platform Drama Discovery, Search by Drama Title, Video Player & Range Downloader
 * Platforms: Hongguo, MVFFM, Dailymotion, HaoSou, BeePlaylet, YouTube, TikTok, Douyin, Kuaishou, Facebook
 */

(function () {
  'use strict';

  // State
  const state = {
    currentPlatform: 'hongguo',
    currentLang: 'km',
    page: 1,
    pageSize: 48,
    isLoading: false,
    hasMore: true,
    isSearching: false,
    dramas: [],
    selectedDrama: null,
    license: { activated: false, remaining_days: 0, device_id: '' },
    activeDownload: null
  };

  let _animexinCacheList = null;
  let _activeHongguoFilter = 'all';

  // --------------------------------------------------------------------------
  // Seamless API Authenticator: Automatically injects Mobile Device HWID & Auth Headers
  // --------------------------------------------------------------------------
  const _origFetch = window.fetch.bind(window);
  window.fetch = function (url, options = {}) {
    try {
      if (typeof url === 'string' && url.startsWith('/api/')) {
        const devId = getMobileDeviceId();
        const opts = options ? { ...options } : {};
        opts.headers = {
          ...(opts.headers || {}),
          'X-Device-Id': devId,
          'Device-Id': devId,
          'X-Device-Type': 'mobile',
          'X-Client-Device-Id': devId
        };
        const sep = url.includes('?') ? '&' : '?';
        let finalUrl = url;
        if (!finalUrl.includes('device_id=')) {
          finalUrl = `${finalUrl}${sep}device_id=${encodeURIComponent(devId)}&device_type=mobile`;
        }
        return _origFetch(finalUrl, opts);
      }
    } catch (_) {}
    return _origFetch(url, options);
  };

  function getMobilePosterPlaceholder(title, platform) {
    if (typeof window.getPosterPlaceholder === 'function') {
      return window.getPosterPlaceholder(title, platform);
    }
    const cleanTitle = (title || 'Drama').slice(0, 24);
    const cleanPlat = (platform || 'PS VIDEO').toUpperCase().slice(0, 16);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0f172a"/><stop offset="50%" stop-color="#1e1b4b"/><stop offset="100%" stop-color="#090d16"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="150" cy="180" r="42" fill="#38bdf8" fill-opacity="0.12"/><polygon points="144,166 164,180 144,194" fill="#38bdf8"/><text x="150" y="250" fill="#f8fafc" font-size="14" font-weight="700" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${cleanTitle}</text><text x="150" y="272" fill="#38bdf8" font-size="11" font-weight="600" text-anchor="middle" letter-spacing="1" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${cleanPlat}</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // --------------------------------------------------------------------------
  // Universal Paste Engine (Direct Clipboard API + Native Keyboard Fallback)
  // --------------------------------------------------------------------------
  async function performUniversalPaste(targetInput = null, autoExecute = false) {
    const target = targetInput || document.getElementById('mobileSearchInput');
    let text = '';

    // Step 1: Try modern Clipboard API (Works in HTTPS & PWA)
    if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      try {
        text = await navigator.clipboard.readText();
      } catch (err) {
        console.warn('[Clipboard] readText blocked or permission denied:', err);
        text = '';
      }
    }

    // Step 2: Android / Insecure HTTP / Brave fallback via native prompt
    if (!text) {
      try {
        const prompted = window.prompt(
          '📋 សូមបិទភ្ជាប់ (Paste) Link វីដេអូ ឬឈ្មោះរឿងនៅទីនេះ៖\n(ចុចសង្កត់លើប្រអប់ ឬចុចលើ Clipboard លើក្តារចុច)',
          ''
        );
        if (prompted !== null) {
          text = prompted.trim();
        }
      } catch (_) {}
    }

    text = (text || '').trim();
    if (!text) {
      showToast('⚠️ មិនមាន Link ឬអក្សរត្រូវបានបញ្ចូលឡើយ');
      return false;
    }

    // Assign to input
    if (target) {
      target.value = text;
      toggleClearBtn();
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.focus();
    }

    // If pasted into top search input, make sure hero section is visible
    const hero = document.getElementById('heroSearchSection');
    if (hero && target === document.getElementById('mobileSearchInput')) {
      hero.style.display = 'block';
    }

    if (isUrlOrId(text)) {
      showToast('📋 បាន Paste Link ដោយជោគជ័យ! 🎉', 2500);
      if (autoExecute || state.currentPlatform !== 'hongguo') {
        if (target === document.getElementById('mobileSearchInput')) {
          setTimeout(() => { executeFetchLink(); }, 150);
        }
      } else {
        const btnFetch = document.getElementById('btnFetchLink');
        if (btnFetch) {
          btnFetch.classList.add('pulse');
          setTimeout(() => { if (btnFetch) btnFetch.classList.remove('pulse'); }, 2000);
        }
      }
    } else {
      if (state.currentPlatform !== 'hongguo') {
        showToast('⚠️ វេទិកានេះដំណើរការតាមរយៈ Link! សូមបិទភ្ជាប់ Link រួចចុច "⚡ Fetch"', 3500);
      } else {
        showToast('📋 បាន Paste ឈ្មោះរឿង! 🎉', 2500);
        if (autoExecute) {
          setTimeout(() => { executeSearchTitle(); }, 150);
        } else {
          const btnSearch = document.getElementById('btnSearchTitle');
          if (btnSearch) {
            btnSearch.classList.add('pulse');
            setTimeout(() => { if (btnSearch) btnSearch.classList.remove('pulse'); }, 2000);
          }
        }
      }
    }
    return true;
  }
  window.performUniversalPaste = performUniversalPaste;

  // Original Platform Websites Mapping (Clicking Section Title opens original website)
  const PLATFORM_ORIGINAL_URLS = {
    hongguo: 'https://hongguoduanju.com/',
    haosou: 'https://dj.1dfx.com/',
    beeplaylet: 'https://beeplaylet.com/',
    anitaku: 'https://anitaku.com.ro/',
    animexin: 'https://animexin.dev/',
    mvffm: 'https://www.mvffm.net/',
    dailymotion: 'https://www.dailymotion.com/',
    youtube: 'https://www.youtube.com/',
    tiktok: 'https://www.tiktok.com/',
    douyin: 'https://www.douyin.com/',
    kuaishou: 'https://www.kuaishou.com/',
    facebook: 'https://www.facebook.com/'
  };

  // Multi-Language Dictionary (KM Khmer, ZH Chinese, EN English)
  const I18N_MOBILE = {
    km: {
      searchPlaceholder: 'វាយឈ្មោះរឿង (ចុច 🔍 ស្វែងរក) ឬ Link (ចុច ⚡ Fetch)...',
      pasteBtn: 'Paste',
      searchBtn: 'ស្វែងរក',
      fetchBtn: 'Fetch',
      backAll: '🔙 ទាំងអស់',
      refreshBtn: 'Refresh',
      loadMore: 'ទាញយករឿងបន្ថែម... (Load More)',
      loadingMore: 'កំពុងផ្ទុករឿងបន្ថែម...',
      freeLicense: '🔒 No License Key',
      vipLicense: '🟢 VIP ({days} ថ្ងៃ)',
      navHome: 'ទំព័រដើម',
      navDownloads: 'ទាញយក',
      navSearch: 'ស្វែងរក',
      navLicense: 'License VIP',
      navSettings: 'ការកំណត់',
      navAdmin: 'ជំនួយ Admin',
      fullMovie: 'Full Movie',
      episodesUnit: 'ភាគ',
      shuffledToast: '🎲 បានច្របល់រឿងថ្មីៗជូនរួចរាល់!',
      linkWarning: '⚠️ ប្រអប់នេះមាន Link! សូមចុចប៊ូតុង "⚡ Fetch" ពណ៌ទឹកក្រូចដើម្បីទាញយក',
      titleWarning: '⚠️ នេះជាឈ្មោះរឿង មិនមែនជា Link ទេ! សូមចុចប៊ូតុង "🔍 ស្វែងរក" ពណ៌ខៀវ',
      emptySearchToast: '⚠️ សូមវាយបញ្ចូលឈ្មោះរឿងដើម្បីស្វែងរក!',
      emptyFetchToast: '⚠️ សូមបិទភ្ជាប់ Link ឬលេខកូដ Series ID!',
      visitingSiteToast: '🌐 កំពុងបើកទៅកាន់វេបសាយដើម: ',
      pasteLinkToast: '📋 បាន Paste Link! សូមចុច "⚡ Fetch" ពណ៌ទឹកក្រូចដើម្បីទាញយក',
      pasteTitleToast: '📋 បាន Paste ឈ្មោះរឿង! សូមចុច "🔍 ស្វែងរក" ពណ៌ខៀវ'
    },
    zh: {
      searchPlaceholder: '输入短剧片名 (点 🔍 搜索) 或 粘贴链接 (点 ⚡ Fetch)...',
      pasteBtn: '粘贴',
      searchBtn: '搜索',
      fetchBtn: '提取',
      backAll: '🔙 全部',
      refreshBtn: '换一批',
      loadMore: '加载更多短剧... (Load More)',
      loadingMore: '正在加载更多...',
      freeLicense: '🔒 No License Key',
      vipLicense: '🟢 VIP (剩余 {days} 天)',
      navHome: '首页',
      navDownloads: '下载管理',
      navSearch: '搜索',
      navLicense: 'VIP授权',
      navSettings: '设置',
      navAdmin: '客服帮助',
      fullMovie: '全集/电影',
      episodesUnit: '集',
      shuffledToast: '🎲 已为您换一批全新短剧！',
      linkWarning: '⚠️ 这是剧集链接！请点击橙色【⚡ Fetch】按钮提取！',
      titleWarning: '⚠️ 这是短剧名称！请点击蓝色【🔍 搜索】按钮！',
      emptySearchToast: '⚠️ 请输入短剧名称以进行搜索！',
      emptyFetchToast: '⚠️ 请粘贴短剧链接或Series ID！',
      visitingSiteToast: '🌐 正在打开官方原站: ',
      pasteLinkToast: '📋 已粘贴链接！请点击橙色【⚡ Fetch】按钮提取',
      pasteTitleToast: '📋 已粘贴短剧名称！请点击蓝色【🔍 搜索】按钮'
    },
    en: {
      searchPlaceholder: 'Enter drama title (click 🔍 Search) or Link (click ⚡ Fetch)...',
      pasteBtn: 'Paste',
      searchBtn: 'Search',
      fetchBtn: 'Fetch',
      backAll: '🔙 All',
      refreshBtn: 'Refresh',
      loadMore: 'Load More Dramas... (Load More)',
      loadingMore: 'Loading more...',
      freeLicense: '🔒 No License Key',
      vipLicense: '🟢 VIP ({days} Days)',
      navHome: 'Home',
      navDownloads: 'Downloads',
      navSearch: 'Search',
      navLicense: 'License VIP',
      navSettings: 'Settings',
      navAdmin: 'Support',
      fullMovie: 'Full Movie',
      episodesUnit: 'EPs',
      shuffledToast: '🎲 Shuffled and loaded new dramas!',
      linkWarning: '⚠️ This is a link! Please click orange [⚡ Fetch] button!',
      titleWarning: '⚠️ This is a drama title! Please click blue [🔍 Search] button!',
      emptySearchToast: '⚠️ Please enter drama title to search!',
      emptyFetchToast: '⚠️ Please paste video link or Series ID!',
      visitingSiteToast: '🌐 Opening official website: ',
      pasteLinkToast: '📋 Link pasted! Click orange [⚡ Fetch] button to proceed',
      pasteTitleToast: '📋 Title pasted! Click blue [🔍 Search] button to search'
    }
  };

  function t(key, vars = {}) {
    const lang = state.currentLang || 'km';
    let text = (I18N_MOBILE[lang] && I18N_MOBILE[lang][key]) || (I18N_MOBILE.km && I18N_MOBILE.km[key]) || key;
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
    return text;
  }

  // --------------------------------------------------------------------------
  // High-Speed Drama Title Translation Engine (Khmer, Chinese, English)
  // --------------------------------------------------------------------------
  const _MOBILE_TITLE_CACHE = new Map();
  const _pendingMobileTransSet = new Set();
  let _transMobileBatchTimer = null;

  function getMobileDisplayTitle(origTitle, dramaItem = null) {
    if (!origTitle) return '';
    const lang = state.currentLang || 'km';
    if (lang === 'zh') return origTitle;
    if (lang === 'km') {
      if (dramaItem && dramaItem.title_km) return dramaItem.title_km;
      if (/^[\u1780-\u17ff\s0-9\p{P}]+$/u.test(origTitle)) return origTitle;
    }
    if (lang === 'en' && dramaItem && dramaItem.title_en) {
      return dramaItem.title_en;
    }
    const cacheKey = `${lang}:${origTitle}`;
    if (_MOBILE_TITLE_CACHE.has(cacheKey)) {
      return _MOBILE_TITLE_CACHE.get(cacheKey);
    }
    try {
      const stored = localStorage.getItem(`hg_trans_v3_${lang}_${origTitle}`);
      if (stored) {
        _MOBILE_TITLE_CACHE.set(cacheKey, stored);
        return stored;
      }
    } catch (_) {}
    return origTitle;
  }

  function queueMobileTitleTranslation(origTitle) {
    if (!origTitle) return;
    const lang = state.currentLang || 'km';
    if (lang === 'zh') return;
    if (lang === 'km' && /^[\u1780-\u17ff\s0-9\p{P}]+$/u.test(origTitle)) return;
    const cacheKey = `${lang}:${origTitle}`;
    if (_MOBILE_TITLE_CACHE.has(cacheKey)) return;
    try {
      const stored = localStorage.getItem(`hg_trans_v3_${lang}_${origTitle}`);
      if (stored) {
        _MOBILE_TITLE_CACHE.set(cacheKey, stored);
        return;
      }
    } catch (_) {}

    _pendingMobileTransSet.add(origTitle);
    if (_transMobileBatchTimer) clearTimeout(_transMobileBatchTimer);
    _transMobileBatchTimer = setTimeout(flushMobilePendingTranslations, 120);
  }

  async function flushMobilePendingTranslations() {
    if (!_pendingMobileTransSet.size) return;
    const targetLang = state.currentLang || 'km';
    if (targetLang === 'zh') {
      _pendingMobileTransSet.clear();
      return;
    }
    const titles = Array.from(_pendingMobileTransSet).slice(0, 50);
    titles.forEach(t => _pendingMobileTransSet.delete(t));

    try {
      const res = await fetch('/api/translate/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: titles, to: targetLang })
      });
      if (res.ok) {
        const data = await res.json();
        const translations = data.translations || {};

        for (const [orig, trans] of Object.entries(translations)) {
          if (trans && trans !== orig) {
            const cacheKey = `${targetLang}:${orig}`;
            _MOBILE_TITLE_CACHE.set(cacheKey, trans);
            try {
              localStorage.setItem(`hg_trans_v3_${targetLang}_${orig}`, trans);
            } catch (_) {}
          }
        }
      }
    } catch (e) {
      console.warn('[Mobile Trans Error]:', e);
    }

    if (state.currentLang === targetLang) {
      updateVisibleMobileTitles();
    }

    if (_pendingMobileTransSet.size > 0) {
      _transMobileBatchTimer = setTimeout(flushMobilePendingTranslations, 150);
    }
  }

  function updateVisibleMobileTitles() {
    document.querySelectorAll('.drama-card').forEach(card => {
      const id = card.dataset.id;
      const titleEl = card.querySelector('.card-title');
      if (!titleEl) return;
      const orig = titleEl.getAttribute('data-original-title') || '';
      const drama = (state.dramas || []).find(d => String(d.id || d.series_id) === String(id));
      let display = orig;
      if (state.currentLang === 'zh') {
        display = orig;
      } else if (state.currentLang === 'km') {
        display = (drama && drama.title_km) || getMobileDisplayTitle(orig, drama);
      } else {
        display = (drama && drama.title_en) || getMobileDisplayTitle(orig, drama);
      }
      titleEl.textContent = display;
      titleEl.setAttribute('title', display);
      if (display === orig && state.currentLang !== 'zh') {
        queueMobileTitleTranslation(orig);
      }
    });

    const sheetTitle = document.getElementById('sheetTitle');
    if (sheetTitle && sheetTitle.dataset.originalTitle) {
      const orig = sheetTitle.dataset.originalTitle;
      const drama = state.selectedDrama;
      let display = orig;
      if (state.currentLang === 'zh') {
        display = orig;
      } else if (state.currentLang === 'km') {
        display = (drama && drama.title_km) || getMobileDisplayTitle(orig, drama);
      } else {
        display = (drama && drama.title_en) || getMobileDisplayTitle(orig, drama);
      }
      sheetTitle.textContent = display;
      if (display === orig && state.currentLang !== 'zh') {
        queueMobileTitleTranslation(orig);
      }
    }
  }

  const LANG_CYCLES = ['km', 'zh', 'en'];
  const LANG_LABELS = {
    km: '🇰🇭 KH',
    zh: '🇨🇳 CN',
    en: '🇬🇧 EN'
  };

  window.cycleLanguage = function () {
    const currentIndex = LANG_CYCLES.indexOf(state.currentLang);
    const nextIndex = (currentIndex + 1) % LANG_CYCLES.length;
    const nextLang = LANG_CYCLES[nextIndex];
    switchLanguage(nextLang);
  };

  window.switchLanguage = function(lang) {
    if (!['km', 'zh', 'en'].includes(lang)) return;
    state.currentLang = lang;
    try {
      localStorage.setItem('hongguo_app_lang', lang);
    } catch (_) {}

    const langCycleBtn = document.getElementById('langCycleBtn');
    if (langCycleBtn) {
      langCycleBtn.innerHTML = `🌐 ${LANG_LABELS[lang] || '🇰🇭 KH'}`;
    }

    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    const btnPasteText = document.getElementById('btnPasteText');
    if (btnPasteText) btnPasteText.textContent = t('pasteBtn');

    const btnSearchTitleText = document.getElementById('btnSearchTitleText');
    if (btnSearchTitleText) btnSearchTitleText.textContent = t('searchBtn');

    const btnFetchLinkText = document.getElementById('btnFetchLinkText');
    if (btnFetchLinkText) btnFetchLinkText.textContent = t('fetchBtn');

    const btnBackAllText = document.getElementById('btnBackAllText');
    if (btnBackAllText) btnBackAllText.textContent = t('backAll');

    const btnRefreshText = document.getElementById('btnRefreshText');
    if (btnRefreshText) btnRefreshText.textContent = t('refreshBtn');

    const btnLoadMoreText = document.getElementById('btnLoadMoreText');
    if (btnLoadMoreText) btnLoadMoreText.textContent = t('loadMore');

    // Update Bottom Navigation Bar labels cleanly by explicit Element IDs
    const navHomeBtn = document.getElementById('navHomeBtn');
    if (navHomeBtn) {
      const l = navHomeBtn.querySelector('.nav-label');
      if (l) l.textContent = t('navHome');
    }
    const navDownloadsBtn = document.getElementById('navDownloadsBtn');
    if (navDownloadsBtn) {
      const l = navDownloadsBtn.querySelector('.nav-label');
      if (l) l.textContent = t('navDownloads');
    }
    const navLicenseBtn = document.getElementById('navLicenseBtn');
    if (navLicenseBtn) {
      const l = navLicenseBtn.querySelector('.nav-label');
      if (l) l.textContent = t('navLicense');
    }
    const navSettingsBtn = document.getElementById('navSettingsBtn');
    if (navSettingsBtn) {
      const l = navSettingsBtn.querySelector('.nav-label');
      if (l) l.textContent = t('navSettings');
    }

    updateSearchPlaceholder(state.currentPlatform);
    updateSectionHeaderTitle(state.currentPlatform);
    updateVisibleMobileTitles();
    checkLicenseStatus();
  };

  // DOM Elements
  const searchInput = document.getElementById('mobileSearchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const btnPaste = document.getElementById('btnPaste');
  const btnSearchTitle = document.getElementById('btnSearchTitle');
  const btnFetchLink = document.getElementById('btnFetchLink');
  const dramaGrid = document.getElementById('dramaGrid');
  const sectionTitle = document.getElementById('sectionTitle');
  const badgeCount = document.getElementById('badgeCount');
  const btnBackAll = document.getElementById('btnBackAll');
  const btnRefreshSection = document.getElementById('btnRefreshSection');
  const analyzedCard = document.getElementById('analyzedCard');
  const liveProgressCard = document.getElementById('liveProgressCard');
  const dramaSheetModal = document.getElementById('dramaSheetModal');
  const licenseModal = document.getElementById('licenseModal');
  const licenseChip = document.getElementById('licenseChip');

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    initApp();
  });

  async function initApp() {
    initAppTheme();
    state.currentLang = localStorage.getItem('hongguo_app_lang') || 'km';
    switchLanguage(state.currentLang);
    if (btnSearchTitle) {
      btnSearchTitle.style.display = 'inline-flex';
    }
    // Search bar is permanently visible on mobile (Screenshot 2 style)
    const hero = document.getElementById('heroSearchSection');
    if (hero) hero.style.display = 'block';

    setupEventListeners();
    setupInfiniteScroll();
    await checkLicenseStatus();
    // Auto-sync VIP license status & customer name every 15s in background
    setInterval(() => {
      checkLicenseStatus();
    }, 15000);
    setInterval(renderHeaderChipCountdown, 1000);

    // Check for software updates and update notification dot
    checkMobileUpdateStatus();
    setInterval(() => {
      checkMobileUpdateStatus();
    }, 30000);

    if (localStorage.getItem('ps_admin_mode') === '1') {
      toggleAdminMode(true);
    }
    // Cold start or reopening after clearing: Initialize platform & fresh feed!
    switchPlatform(state.currentPlatform || 'hongguo');
  }

  // --------------------------------------------------------------------------
  // App Lifecycle Guardian: Auto-refresh fresh feed on App Resume / Re-entry
  // ("ពេលចេញពីកម្មវិធី ហើយចូលមកវិញ ត្រូវតែ refresh រឿងថ្មីៗ")
  // --------------------------------------------------------------------------
  let _lastExitTimestamp = Date.now();
  let _isRefreshingOnResume = false;

  function handleAppResume(source = 'visibilitychange') {
    if (_isRefreshingOnResume || state.isSearching) return;
    const awayDuration = Date.now() - _lastExitTimestamp;
    // If user was away from the app for more than 3.5 seconds, auto-refresh fresh dramas!
    if (awayDuration > 3500) {
      console.log(`[Auto-Refresh] App resumed via ${source} after ${Math.round(awayDuration / 1000)}s away -> Refreshing fresh feed from source!`);
      _isRefreshingOnResume = true;
      _lastExitTimestamp = Date.now();
      window.refreshCurrentPlatform(true).finally(() => {
        setTimeout(() => { _isRefreshingOnResume = false; }, 1200);
      });
    }
  }

  function setupEventListeners() {
    // App Lifecycle Listeners (Triggered when user exits/clears and comes back)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        _lastExitTimestamp = Date.now();
      } else if (document.visibilityState === 'visible') {
        handleAppResume('visibilitychange');
      }
    });

    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        handleAppResume('pageshow (BFCache)');
      }
    });

    window.addEventListener('focus', () => {
      handleAppResume('focus');
    });

    // 1. Paste Button (Universal Clipboard + Native Prompt Fallback)
    if (btnPaste) {
      btnPaste.addEventListener('click', async () => {
        await performUniversalPaste(searchInput, false);
      });
    }

    // 2. Search Title Button (按短剧片名搜索)
    if (btnSearchTitle) {
      btnSearchTitle.addEventListener('click', () => {
        executeSearchTitle();
      });
    }

    // 3. Fetch Link Button (提取链接或Series ID)
    if (btnFetchLink) {
      btnFetchLink.addEventListener('click', () => {
        executeFetchLink();
      });
    }

    // 4. Search input event listeners
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        toggleClearBtn();
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = (searchInput.value || '').trim();
          if (isUrlOrId(val)) {
            executeFetchLink();
          } else {
            executeSearchTitle();
          }
        }
      });
    }

    // 5. Clear Search Button
    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          toggleClearBtn();
          searchInput.focus();
        }
        if (state.isSearching) {
          resetToAllDramas();
        }
      });
    }

    // 6. Platform Pills Click
    document.querySelectorAll('.platform-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const pill = e.currentTarget;
        const platform = pill.dataset.platform || 'hongguo';
        switchPlatform(platform);
      });
    });

    // 7. Close Modals on Overlay Click
    if (dramaSheetModal) {
      dramaSheetModal.addEventListener('click', (e) => {
        if (e.target === dramaSheetModal) closeDramaSheet();
      });
    }

    if (licenseModal) {
      licenseModal.addEventListener('click', (e) => {
        if (e.target === licenseModal) closeLicenseModal();
      });
    }

    // 8. Custom Range Download Button
    const btnCustomDl = document.getElementById('btnCustomDl');
    if (btnCustomDl) {
      btnCustomDl.addEventListener('click', () => {
        const fromEp = parseInt(document.getElementById('rangeFrom').value, 10) || 1;
        const toEp = parseInt(document.getElementById('rangeTo').value, 10) || fromEp;
        downloadDramaRange(fromEp, toEp);
      });
    }

    // 9. Download All Button
    const btnDlAll = document.getElementById('btnDlAll');
    if (btnDlAll) {
      btnDlAll.addEventListener('click', () => {
        if (!state.selectedDrama) return;
        const total = state.selectedDrama.episode_cnt || state.selectedDrama.total_episodes || state.selectedDrama.episodes?.length || 1;
        downloadDramaRange(1, total);
      });
    }

    // 10. Delegated click listener on dramaGrid
    if (dramaGrid) {
      dramaGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.drama-card');
        if (card && card.dataset.id) {
          e.preventDefault();
          openDramaById(card.dataset.id, card.dataset.platform || state.currentPlatform);
        }
      });
    }
  }

  function toggleClearBtn() {
    if (!btnClearSearch || !searchInput) return;
    btnClearSearch.style.display = searchInput.value.trim() ? 'flex' : 'none';
  }

  function isUrlOrId(str) {
    if (!str) return false;
    if (/https?:\/\/[^\s]+/i.test(str)) return true;
    if (/^\d{10,25}$/.test(str)) return true; // Hongguo series ID
    return false;
  }

  // --------------------------------------------------------------------------
  // Search Panel Toggle & Placeholder Helper
  // --------------------------------------------------------------------------
  window.toggleSearchSection = function (forceShow) {
    const hero = document.getElementById('heroSearchSection');
    if (!hero) return;
    const isHidden = (hero.style.display === 'none' || getComputedStyle(hero).display === 'none');
    const show = (forceShow !== undefined) ? forceShow : isHidden;
    hero.style.display = show ? 'block' : 'none';
    if (show) {
      updateSearchPlaceholder(state.currentPlatform);
      if (searchInput) searchInput.focus();
    }
  };

  window.goHomeView = function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (state.isSearching) {
      resetToAllDramas();
    }
  };

  function updateSearchPlaceholder(platform) {
    if (!searchInput) return;
    const lang = state.currentLang || 'km';
    const placeholders = {
      hongguo: {
        km: 'វាយឈ្មោះរឿង (ចុច 🔍 ស្វែងរក) ឬ Link/ID ហុងគ័រ (ចុច ⚡ Fetch)...',
        zh: '输入短剧片名 (点 🔍 搜索) 或 粘贴红果链接/ID (点 ⚡ Fetch)...',
        en: 'Enter Hongguo drama title (🔍 Search) or Link/ID (⚡ Fetch)...'
      },
      haosou: {
        km: 'វាយឈ្មោះរឿង HaoSou (ចុច 🔍 ស្វែងរក) ឬ Link 1dfx.com (ចុច ⚡ Fetch)...',
        zh: '输入好搜短剧片名 (点 🔍 搜索) 或 粘贴 1dfx 链接 (点 ⚡ Fetch)...',
        en: 'Enter HaoSou drama title (🔍 Search) or Link (⚡ Fetch)...'
      },
      beeplaylet: {
        km: 'វាយឈ្មោះរឿង BeePlaylet (ចុច 🔍 ស្វែងរក) ឬ Link (ចុច ⚡ Fetch)...',
        zh: '输入蜜蜂短剧片名 (点 🔍 搜索) 或 粘贴链接 (点 ⚡ Fetch)...',
        en: 'Enter BeePlaylet title (🔍 Search) or Link (⚡ Fetch)...'
      },
      anitaku: {
        km: 'វាយចំណងជើង Anime ជប៉ុន (ចុច 🔍 ស្វែងរក) ឬ Link anitaku (ចុច ⚡ Fetch)...',
        zh: '输入日本动漫片名 (点 🔍 搜索) 或 粘贴 Anitaku 链接 (点 ⚡ Fetch)...',
        en: 'Enter Anime title (🔍 Search) or Anitaku Link (⚡ Fetch)...'
      },
      animexin: {
        km: 'វាយឈ្មោះរឿងតុក្កតាចិន 3D (ចុច 🔍 ស្វែងរក) ឬ Link animexin (ចុច ⚡ Fetch)...',
        zh: '输入国产3D动画片名 (点 🔍 搜索) 或 粘贴 AnimeXin 链接 (点 ⚡ Fetch)...',
        en: 'Enter Donghua title (🔍 Search) or AnimeXin Link (⚡ Fetch)...'
      },
      mvffm: {
        km: 'វាយឈ្មោះរឿង MVFFM (ចុច 🔍 ស្វែងរក) ឬ Link mvffm.net (ចុច ⚡ Fetch)...',
        zh: '输入MVFFM片名 (点 🔍 搜索) 或 粘贴 mvffm 链接 (点 ⚡ Fetch)...',
        en: 'Enter MVFFM drama title (🔍 Search) or Link (⚡ Fetch)...'
      },
      dailymotion: {
        km: 'វាយចំណងជើងរឿង (ចុច 🔍 ស្វែងរក) ឬ Link Dailymotion (ចុច ⚡ Fetch)...',
        zh: '输入片名 (点 🔍 搜索) 或 粘贴 Dailymotion 链接 (点 ⚡ Fetch)...',
        en: 'Enter drama title (🔍 Search) or Dailymotion Link (⚡ Fetch)...'
      },
      youtube: {
        km: 'វាយឈ្មោះវីដេអូ ឬ Link YouTube / Shorts...',
        zh: '输入视频名称 或 粘贴 YouTube / Shorts 链接...',
        en: 'Enter video title or paste YouTube / Shorts link...'
      },
      tiktok: {
        km: 'បិទភ្ជាប់ Link TikTok (ចុច ⚡ Fetch)...',
        zh: '粘贴 TikTok 视频链接 (点 ⚡ Fetch)...',
        en: 'Paste TikTok video link (click ⚡ Fetch)...'
      },
      douyin: {
        km: 'បិទភ្ជាប់ Link Douyin (ចុច ⚡ Fetch)...',
        zh: '粘贴抖音视频链接 (点 ⚡ Fetch)...',
        en: 'Paste Douyin video link (click ⚡ Fetch)...'
      },
      kuaishou: {
        km: 'បិទភ្ជាប់ Link Kuaishou (ចុច ⚡ Fetch)...',
        zh: '粘贴快手视频链接 (点 ⚡ Fetch)...',
        en: 'Paste Kuaishou video link (click ⚡ Fetch)...'
      },
      facebook: {
        km: 'បិទភ្ជាប់ Link Facebook Reels/Video (ចុច ⚡ Fetch)...',
        zh: '粘贴 Facebook 视频链接 (点 ⚡ Fetch)...',
        en: 'Paste Facebook Reels/Video link (click ⚡ Fetch)...'
      }
    };
    const pDict = placeholders[platform] || placeholders.hongguo;
    searchInput.placeholder = pDict[lang] || pDict.km;
  }

  // --------------------------------------------------------------------------
  // Original Website Direct Linking (Clicking Section Title / Logo directly)
  // --------------------------------------------------------------------------
  window.openCurrentOriginalWebsite = function () {
    const url = PLATFORM_ORIGINAL_URLS[state.currentPlatform] || 'https://hongguoduanju.com/';
    window.open(url, '_blank', 'noopener,noreferrer');
    showToast(t('visitingSiteToast') + state.currentPlatform.toUpperCase());
  };

  // --------------------------------------------------------------------------
  // Category Filter Selector (All, Many EPs, Romance)
  // --------------------------------------------------------------------------
  window.selectDramaFilter = function (filter, btnEl) {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');

    _activeHongguoFilter = filter || 'all';
    if (state.currentPlatform === 'hongguo') {
      loadPlatformFeed('hongguo', true, false);
    } else {
      loadPlatformFeed(state.currentPlatform, true, false);
    }
  };

  // --------------------------------------------------------------------------
  // Platform Switching Engine
  // --------------------------------------------------------------------------
  window.switchPlatform = function (platform) {
    if (!platform) return;
    state.currentPlatform = platform;
    state.page = 1;
    state.hasMore = true;
    state.isSearching = false;

    const isHg = (platform === 'hongguo');
    const btnFetch = document.getElementById('btnFetchLink');
    if (btnFetch) {
      btnFetch.style.display = isHg ? 'inline-flex' : 'none';
    }

    // Toggle Hongguo-only filter pills (many_ep, romance)
    document.querySelectorAll('.hongguo-only-filter').forEach(el => {
      el.style.display = isHg ? 'inline-flex' : 'none';
    });

    // If active filter was a Hongguo-only filter and switched to other platform, reset to 'all'
    if (!isHg) {
      _activeHongguoFilter = 'all';
      const activeFilterPill = document.querySelector('.filter-pill.active');
      if (activeFilterPill && activeFilterPill.classList.contains('hongguo-only-filter')) {
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        const allPill = document.querySelector('.filter-pill[data-filter="all"]');
        if (allPill) allPill.classList.add('active');
      }
    }

    // Search button & search box are always visible across all platforms
    if (btnSearchTitle) {
      btnSearchTitle.style.display = 'inline-flex';
    }
    const hero = document.getElementById('heroSearchSection');
    if (hero) hero.style.display = 'block';

    // Update active pill UI
    document.querySelectorAll('.platform-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.platform === platform);
    });

    // Scroll active pill into view
    const activePill = document.querySelector(`.platform-pill[data-platform="${platform}"]`);
    if (activePill) {
      activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    // Hide back button and analyzed card
    if (btnBackAll) btnBackAll.style.display = 'none';
    if (analyzedCard) analyzedCard.style.display = 'none';

    // Update search placeholder according to platform & language
    updateSearchPlaceholder(platform);

    // Update section title
    updateSectionHeaderTitle(platform);

    // Load feed
    loadPlatformFeed(platform, true);
  };

  function updateSectionHeaderTitle(platform) {
    const lang = state.currentLang || 'km';
    const titles = {
      hongguo: { km: '🔥 HONGGUO - ហុងគ័រ', zh: '🔥 红果短剧 (Hongguo)', en: '🔥 Hongguo Short Drama' },
      haosou: { km: '⚡ HAOSOU - រឿងភាគខ្លី', zh: '⚡ 好搜短剧 (1dfx)', en: '⚡ HaoSou Short Drama' },
      beeplaylet: { km: '🐝 BEEPLAYLET - ឃ្លាំងរឿងភាគខ្លី HD', zh: '🐝 蜜蜂剧场 (BeePlaylet)', en: '🐝 BeePlaylet Short Drama' },
      anitaku: { km: '🎌 ANITAKU - ភាពយន្ត Anime ជប៉ុន', zh: '🎌 AniTaku - 日本动漫 (Anime)', en: '🎌 AniTaku - Japanese Anime' },
      animexin: { km: '🐉 ANIMEXIN - រឿងតុក្កតាចិន 3D', zh: '🐉 AnimeXin - 国产3D动画 (Donghua)', en: '🐉 AnimeXin - 3D Chinese Donghua' },
      mvffm: { km: '🎬 MVFFM - រឿងភាគចិន Full HD', zh: '🎬 MVFFM - 经典华语剧集', en: '🎬 MVFFM - Chinese Drama Series' },
      dailymotion: { km: '📺 DAILYMOTION - រឿងពេញ (Full Movie)', zh: '📺 Dailymotion - 精彩合集长剧', en: '📺 Dailymotion - Full Movies' },
      youtube: { km: '🔴 YOUTUBE - ស្វែងរក & ទាញយក', zh: '🔴 YouTube - 高清解析下载', en: '🔴 YouTube - Search & Downloader' },
      tiktok: { km: '🎵 TIKTOK - វីដេអូគ្មាន Watermark', zh: '🎵 TikTok - 国际无水印下载', en: '🎵 TikTok - HD No Watermark' },
      douyin: { km: '🇨🇳 DOUYIN - TikTok ចិន 1080p', zh: '🇨🇳 抖音 (Douyin) - 原画无水印', en: '🇨🇳 Douyin - Chinese TikTok HD' },
      kuaishou: { km: '⚡ KUAISHOU - ខៅស៊ូចិន Full HD', zh: '⚡ 快手 (Kuaishou) - 高清无水印', en: '⚡ Kuaishou - HD Video Downloader' },
      facebook: { km: '📘 FACEBOOK - Reels & Video', zh: '📘 Facebook - Reels与视频下载', en: '📘 Facebook - Reels & Videos' }
    };
    const pTitle = titles[platform] || titles.hongguo;
    const titleText = (pTitle && pTitle[lang]) || pTitle.km;
    const textEl = document.getElementById('sectionTitleText');
    if (textEl) {
      textEl.textContent = titleText;
    } else if (sectionTitle) {
      sectionTitle.innerHTML = `<span id="sectionTitleText">${titleText}</span><span class="site-arrow">↗</span>`;
    }
  }

  // Live Platform Re-fetch & Shuffle with Rule 13 Active Drama Pinning
  window.refreshCurrentPlatform = async function (silent = false) {
    const refreshBtn = document.getElementById('btnRefreshSection');
    if (refreshBtn) {
      refreshBtn.classList.add('rotating');
      setTimeout(() => refreshBtn.classList.remove('rotating'), 1000);
    }

    if (state.isSearching) {
      await executeSearchTitle();
      return;
    }

    if (['tiktok', 'douyin', 'kuaishou', 'facebook'].includes(state.currentPlatform)) {
      renderDirectPlatformHelper(state.currentPlatform);
      return;
    }

    // Live re-fetch fresh dramas from the original platform source (Hongguo, HaoSou, MVFFM, Beeplaylet, etc.)
    await loadPlatformFeed(state.currentPlatform, true, true);
    if (!silent) {
      showToast(t('shuffledToast'));
    }
  };

  window.resetToAllDramas = function () {
    state.isSearching = false;
    if (searchInput) searchInput.value = '';
    toggleClearBtn();
    if (btnBackAll) btnBackAll.style.display = 'none';
    updateSectionHeaderTitle(state.currentPlatform);
    loadPlatformFeed(state.currentPlatform, true);
  };

  // --------------------------------------------------------------------------
  // Massive Platform Feed Loader (Unified for all platforms with pagination)
  // --------------------------------------------------------------------------
  async function loadPlatformFeed(platform = 'hongguo', reset = false, isRefresh = false) {
    if (state.isLoading) return;
    state.isLoading = true;

    if (reset) {
      state.page = 1;
      state.hasMore = true;
      state.dramas = [];
      if (dramaGrid) dramaGrid.innerHTML = renderSkeletonCards(6);
    }

    // Platforms that are direct link analyzers (TikTok, Douyin, Kuaishou, Facebook, YouTube)
    if (['tiktok', 'douyin', 'kuaishou', 'facebook', 'youtube'].includes(platform)) {
      renderDirectPlatformHelper(platform);
      state.isLoading = false;
      const loadMoreContainer = document.getElementById('loadMoreContainer');
      if (loadMoreContainer) loadMoreContainer.style.display = 'none';
      return;
    }

    try {
      let items = [];
      const cacheBust = (reset || isRefresh) ? `&refresh=1&_t=${Date.now()}` : '';

      // 1. Hongguo (Load 48 items per page - huge catalog)
      if (platform === 'hongguo') {
        let hgCat = 'all';
        if (_activeHongguoFilter === 'romance') {
          hgCat = 'female';
        } else if (_activeHongguoFilter === 'many_ep') {
          hgCat = 'hot';
        }
        const res = await fetch(`/api/rank?category=${hgCat}&page=${state.page}&page_size=48${cacheBust}`);
        const json = await res.json();
        const raw = json.items || [];
        if (raw.length < 48) state.hasMore = false;
        items = raw.map(it => ({
          id: String(it.series_id || it.id || it.book_id || ''),
          title: it.title || it.series_title || 'Hongguo Drama',
          title_km: it.title_km || '',
          cover: it.cover || it.cover_url || it.cover_image || '',
          episodes_count: it.episode_cnt || it.total_episodes || '',
          platform: 'hongguo'
        }));
      }

      // 2. MVFFM (Cycles through hot, latest, monthly recommendations)
      else if (platform === 'mvffm') {
        const mvTypes = ['hot', 'latest', 'monthly'];
        const currentType = mvTypes[(state.page - 1) % mvTypes.length] || 'hot';
        const res = await fetch(`/api/mvffm/recommend?type=${currentType}${cacheBust}`);
        const json = await res.json();
        const raw = Array.isArray(json.data) ? json.data : (json.items || []);
        if (state.page >= 3) state.hasMore = false;
        items = raw.map(it => ({
          id: String(it.id || it.url || ''),
          url: it.url || '',
          title: it.title || 'MVFFM Drama',
          title_km: it.title_km || '',
          cover: it.cover || '',
          episodes_count: it.remarks || it.type || '1080p',
          platform: 'mvffm'
        }));
      }

      // 3. Dailymotion (Full Movie Dramas, 36 per page from 1,040+ movie catalog)
      else if (platform === 'dailymotion') {
        const res = await fetch(`/api/dailymotion/feed?category=trending&page=${state.page}${cacheBust}`);
        const json = await res.json();
        const raw = (json.data && json.data.list) ? json.data.list : (json.items || []);
        if (raw.length === 0) state.hasMore = false;
        items = raw.map(it => ({
          id: String(it.id || ''),
          title: it.title || 'Dailymotion Drama',
          title_km: it.title_km || '',
          cover: it.thumbnail || it.cover_url || it.thumbnail_url || it.cover || '',
          episodes_count: it.duration ? `${Math.round(it.duration / 60)} នាទី` : 'Full Movie',
          platform: 'dailymotion'
        }));
      }

      // 4. HaoSou (Multi-category feeds: all, action, rebirth, ceo, romance)
      else if (platform === 'haosou') {
        const cats = ['all', 'action', 'rebirth', 'ceo', 'romance'];
        const currentCat = cats[(state.page - 1) % cats.length] || 'all';
        const res = await fetch(`/api/haosou/recommend?category=${currentCat}${cacheBust}`);
        const json = await res.json();
        const raw = Array.isArray(json.data) ? json.data : (json.items || []);
        if (state.page >= 5) state.hasMore = false;
        items = raw.map(it => ({
          id: String(it.id || ''),
          title: it.title || 'HaoSou Drama',
          title_km: it.title_km || '',
          cover: it.cover || '',
          episodes_count: it.remarks || '全集',
          platform: 'haosou'
        }));
      }

      // 5. BeePlaylet (all, urban, costume, suspense)
      else if (platform === 'beeplaylet') {
        const cats = ['all', 'urban', 'costume', 'suspense'];
        const currentCat = cats[(state.page - 1) % cats.length] || 'all';
        const res = await fetch(`/api/beeplaylet/recommend?category=${currentCat}${cacheBust}`);
        const json = await res.json();
        const raw = Array.isArray(json.data) ? json.data : (json.items || []);
        if (state.page >= 4) state.hasMore = false;
        items = raw.map(it => ({
          id: String(it.id || ''),
          title: it.title || 'BeePlaylet Drama',
          title_km: it.title_km || '',
          cover: it.cover || '',
          episodes_count: it.remarks || 'HD',
          platform: 'beeplaylet'
        }));
      }

      // 6. AniTaku Anime (all, popular, latest, action, romance)
      else if (platform === 'anitaku') {
        const cats = ['all', 'popular', 'latest', 'action', 'romance'];
        const currentCat = cats[(state.page - 1) % cats.length] || 'all';
        const res = await fetch(`/api/anitaku/recommend?category=${currentCat}${cacheBust}`);
        const json = await res.json();
        const raw = Array.isArray(json.data) ? json.data : (json.items || []);
        if (state.page >= 5) state.hasMore = false;
        items = raw.map(it => ({
          id: String(it.id || it.url || ''),
          url: it.url || '',
          title: it.title || 'AniTaku Anime',
          cover: it.cover || it.thumbnail || it.image || '',
          episodes_count: it.ep || it.episodes || 'Sub/Dub',
          platform: 'anitaku'
        }));
      }

      // 7. AnimeXin Donghua 3D (Dynamic Shuffling on Refresh & 24 EPs per page)
      else if (platform === 'animexin') {
        if (!_animexinCacheList || reset || isRefresh) {
          const res = await fetch(`/api/animexin/recommend?category=all&refresh=1${cacheBust}`);
          const json = await res.json();
          let list = Array.isArray(json.data) ? json.data : (json.items || []);
          if (reset || isRefresh) {
            // Fisher-Yates random shuffle on refresh/reset so new 3D Donghua rotate to top!
            for (let i = list.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [list[i], list[j]] = [list[j], list[i]];
            }
          }
          _animexinCacheList = list;
        }

        const pageSize = 24;
        const start = (state.page - 1) * pageSize;
        const pageItems = (_animexinCacheList || []).slice(start, start + pageSize);
        if (start + pageSize >= (_animexinCacheList || []).length) {
          state.hasMore = false;
        }

        items = pageItems.map(it => ({
          id: String(it.id || it.url || ''),
          url: it.url || '',
          title: it.title || 'AnimeXin Donghua',
          cover: it.cover || it.thumbnail || it.image || '',
          episodes_count: it.ep || it.episodes || '3D Donghua',
          platform: 'animexin'
        }));
      }

      if (reset) {
        // Rule 13: Pin currently viewed drama at index 0 (Card #1)
        if (state.selectedDrama && items.length > 0) {
          const activeId = String(state.selectedDrama.series_id || state.selectedDrama.id || '');
          const existingIdx = items.findIndex(d => String(d.id || d.series_id) === activeId);
          let activeItem = null;
          if (existingIdx !== -1) {
            activeItem = items.splice(existingIdx, 1)[0];
          } else {
            activeItem = {
              id: activeId,
              title: state.selectedDrama.title || 'Now Playing',
              title_km: state.selectedDrama.title_km || '',
              cover: state.selectedDrama.cover || '',
              episodes_count: state.selectedDrama.episodes_count || '',
              platform: state.currentPlatform
            };
          }
          items.unshift(activeItem);
        }
        state.dramas = items;
      } else {
        // Smart deduplication before appending
        const existingIds = new Set(state.dramas.map(d => d.id));
        const newItems = items.filter(d => !existingIds.has(d.id));
        state.dramas = [...state.dramas, ...newItems];
      }

      renderDramaCards(state.dramas);
    } catch (e) {
      console.error('[Mobile Feed Error]:', e);
      if (dramaGrid && reset) {
        dramaGrid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: #94a3b8;">
            <div style="font-size: 2.2rem; margin-bottom: 8px;">📡</div>
            <p>មិនអាចទាញយកទិន្នន័យពី ${platform.toUpperCase()} បានឡើយ។</p>
            <button onclick="loadPlatformFeed('${platform}', true, true)" style="margin-top: 12px; padding: 8px 18px; background: #38bdf8; border: none; border-radius: 8px; font-weight: 700; color: #000; cursor: pointer;">សាកល្បងម្ដងទៀត</button>
          </div>
        `;
      }
    } finally {
      state.isLoading = false;
    }
  }

  // --------------------------------------------------------------------------
  // Pagination & Infinite Scroll Engine
  // --------------------------------------------------------------------------
  window.loadMoreDramas = async function () {
    if (state.isLoading || !state.hasMore || state.isSearching) return;
    state.page += 1;
    const btnText = document.getElementById('btnLoadMoreText');
    const spinner = document.getElementById('loadMoreSpinner');
    const icon = document.getElementById('loadMoreIcon');
    if (spinner) spinner.style.display = 'inline-block';
    if (icon) icon.style.display = 'none';
    if (btnText) btnText.textContent = 'កំពុងផ្ទុករឿងបន្ថែម...';
    await loadPlatformFeed(state.currentPlatform, false);
    if (spinner) spinner.style.display = 'none';
    if (icon) icon.style.display = 'inline-block';
    if (btnText) btnText.textContent = 'ទាញយករឿងបន្ថែម... (Load More)';
  };

  function setupInfiniteScroll() {
    const sentinel = document.getElementById('infiniteScrollSentinel');
    if (!sentinel || !window.IntersectionObserver) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !state.isLoading && state.hasMore && !state.isSearching) {
          loadMoreDramas();
        }
      });
    }, { rootMargin: '300px' });

    observer.observe(sentinel);
  }

  function renderDirectPlatformHelper(platform) {
    if (!dramaGrid) return;
    const configs = {
      facebook: {
        name: 'Facebook Reels & Watch Pro',
        desc: 'ទាញយកវីដេអូ Facebook Reels, Watch & Videos ក្នុងកម្រិត Full HD (MP4 Direct)',
        icon: null,
        emoji: '📘',
        pills: ['🎬 Facebook Reels', '📺 Watch & Shows', '💎 Full HD 1080p', '⚡ High Speed MP4'],
        placeholder: 'បិទភ្ជាប់ Link Facebook (Reels, Watch, Post)...',
        gradient: 'linear-gradient(90deg, #1877f2, #3b82f6, #60a5fa)',
        glow: 'rgba(24, 119, 242, 0.35)',
        iconBg: 'rgba(24, 119, 242, 0.16)',
        iconBorder: 'rgba(24, 119, 242, 0.45)',
        border: 'rgba(24, 119, 242, 0.45)',
        btnGradient: 'linear-gradient(135deg, #1877f2 0%, #0284c7 100%)',
        btnShadow: 'rgba(24, 119, 242, 0.45)',
        btnText: '⚡ វិភាគ & ទាញយក Facebook HD'
      },
      youtube: {
        name: 'YouTube 4K & MP3 Studio',
        desc: 'ស្កេនរកគ្រប់ Resolution វីដេអូ YouTube & Shorts: 4K, 2K, 1080p, 720p និង MP3 Audio',
        icon: null,
        emoji: '🔴',
        pills: ['🔍 ស្កេនគ្រប់ Resolution', '🌟 4K / 2K / 1080p', '🎵 MP3 Audio 320kbps', '📱 YouTube Shorts'],
        placeholder: 'បិទភ្ជាប់ Link YouTube (Watch, Shorts, youtu.be)...',
        gradient: 'linear-gradient(90deg, #ff0000, #ef4444, #f97316)',
        glow: 'rgba(239, 68, 68, 0.35)',
        iconBg: 'rgba(239, 68, 68, 0.16)',
        iconBorder: 'rgba(239, 68, 68, 0.45)',
        border: 'rgba(239, 68, 68, 0.45)',
        btnGradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        btnShadow: 'rgba(239, 68, 68, 0.45)',
        btnText: '🔍 ស្កេនរកកម្រិតវីដេអូ (Scan Resolutions)'
      },
      tiktok: {
        name: 'TikTok Global Downloader',
        desc: 'ទាញយកវីដេអូ TikTok កម្រិត Full HD គ្មាន Watermark (គ្មាន Logo) និង MP3',
        icon: '/tiktok_icon.svg',
        emoji: '🎵',
        pills: ['✨ គ្មាន Watermark', '💎 Full HD 1080p', '🎵 សំឡេង MP3', '⚡ 1-Tap DL'],
        placeholder: 'បិទភ្ជាប់ Link TikTok (https://www.tiktok.com/@...)...',
        gradient: 'linear-gradient(90deg, #00f2fe, #4facfe, #ff007f)',
        glow: 'rgba(0, 242, 254, 0.35)',
        iconBg: 'rgba(0, 242, 254, 0.16)',
        iconBorder: 'rgba(0, 242, 254, 0.45)',
        border: 'rgba(0, 242, 254, 0.45)',
        btnGradient: 'linear-gradient(135deg, #00f2fe 0%, #0284c7 100%)',
        btnShadow: 'rgba(0, 242, 254, 0.45)',
        btnText: '⚡ វិភាគ & ទាញយក TikTok HD'
      },
      douyin: {
        name: 'Douyin (TikTok ចិន)',
        desc: 'ទាញយកវីដេអូ Douyin កម្រិត Original 1080p គ្មាន Logo សញ្ញាសម្គាល់',
        icon: '/douyin_icon.svg',
        emoji: '📱',
        pills: ['✨ គ្មាន Logo Douyin', '🎬 Original 1080p', '⚡ High Speed', '🎵 Original Audio'],
        placeholder: 'បិទភ្ជាប់ Link Douyin (https://v.douyin.com/...)...',
        gradient: 'linear-gradient(90deg, #111111, #8b5cf6, #ec4899)',
        glow: 'rgba(139, 92, 246, 0.35)',
        iconBg: 'rgba(139, 92, 246, 0.16)',
        iconBorder: 'rgba(139, 92, 246, 0.45)',
        border: 'rgba(139, 92, 246, 0.45)',
        btnGradient: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
        btnShadow: 'rgba(139, 92, 246, 0.45)',
        btnText: '⚡ វិភាគ & ទាញយក Douyin HD'
      },
      kuaishou: {
        name: 'Kuaishou (ខៅស៊ូ)',
        desc: 'ទាញយកវីដេអូខៅស៊ូចិនកម្រិតច្បាស់ Full HD គ្មាន Watermark',
        icon: '/kuaishou_icon.svg',
        emoji: '⚡',
        pills: ['✨ គ្មាន Watermark', '💎 Full HD', '⚡ Fast Video Fetch', '🎬 Kuaishou Clips'],
        placeholder: 'បិទភ្ជាប់ Link Kuaishou (https://v.kuaishou.com/...)...',
        gradient: 'linear-gradient(90deg, #f97316, #fb923c, #ea580c)',
        glow: 'rgba(249, 115, 22, 0.35)',
        iconBg: 'rgba(249, 115, 22, 0.16)',
        iconBorder: 'rgba(249, 115, 22, 0.45)',
        border: 'rgba(249, 115, 22, 0.45)',
        btnGradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
        btnShadow: 'rgba(249, 115, 22, 0.45)',
        btnText: '⚡ វិភាគ & ទាញយក Kuaishou HD'
      }
    };

    const cfg = configs[platform] || {
      name: platform.toUpperCase(),
      desc: 'បិទភ្ជាប់លីងវីដេអូដើម្បីទាញយក',
      emoji: '⚡',
      pills: ['⚡ ស្កេនរហ័ស', '💎 Full HD'],
      placeholder: 'បិទភ្ជាប់ Link វីដេអូនៅទីនេះ...',
      gradient: 'linear-gradient(90deg, #38bdf8, #818cf8)',
      glow: 'rgba(56, 189, 248, 0.3)',
      iconBg: 'rgba(56, 189, 248, 0.15)',
      iconBorder: 'rgba(56, 189, 248, 0.4)',
      border: 'rgba(56, 189, 248, 0.4)',
      btnGradient: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
      btnShadow: 'rgba(37, 99, 235, 0.4)',
      btnText: '⚡ វិភាគ & ទាញយក'
    };

    dramaGrid.innerHTML = `
      <div class="platform-studio-card" style="
        --studio-brand-gradient: ${cfg.gradient};
        --studio-glow-color: ${cfg.glow};
        --studio-icon-bg: ${cfg.iconBg};
        --studio-icon-border: ${cfg.iconBorder};
        --studio-border-color: ${cfg.border};
        --studio-btn-gradient: ${cfg.btnGradient};
        --studio-btn-shadow: ${cfg.btnShadow};
      ">
        <div class="studio-glow-halo"></div>
        <div class="studio-header">
          <div class="studio-icon-badge">
            ${cfg.icon ? `<img src="${cfg.icon}" style="width: 34px; height: 34px; object-fit: contain;">` : cfg.emoji}
          </div>
          <h3 class="studio-title">${cfg.name}</h3>
          <p class="studio-subtitle">${cfg.desc}</p>
          <div class="studio-features-row">
            ${cfg.pills.map(p => `<span class="studio-pill">${p}</span>`).join('')}
          </div>
        </div>

        <div class="studio-input-wrap">
          <span style="font-size: 16px; opacity: 0.8;">🔗</span>
          <input 
            type="text" 
            class="studio-input-field" 
            id="studioInput_${platform}" 
            placeholder="${cfg.placeholder}"
            autocomplete="off"
            spellcheck="false"
          >
          <button type="button" class="studio-btn-paste" onclick="onStudioPasteClick('${platform}')">
            <span>📋</span>
            <span>Paste</span>
          </button>
        </div>

        <button type="button" class="studio-btn-fetch" onclick="onStudioSubmitClick('${platform}')">
          <span>${cfg.btnText}</span>
        </button>
      </div>
    `;

    // Bind Enter key
    const inputEl = document.getElementById(`studioInput_${platform}`);
    if (inputEl) {
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onStudioSubmitClick(platform);
        }
      });
      if (searchInput && searchInput.value) {
        inputEl.value = searchInput.value;
      }
    }
  }

  window.onStudioPasteClick = async function(platform) {
    const input = document.getElementById(`studioInput_${platform}`);
    if (!input) return;
    const ok = await performUniversalPaste(input, false);
    if (ok && input.value) {
      if (searchInput) searchInput.value = input.value;
      onStudioSubmitClick(platform);
    }
  };

  window.onStudioSubmitClick = function(platform) {
    const input = document.getElementById(`studioInput_${platform}`);
    const val = (input ? input.value : '').trim();
    if (!val) {
      showToast('⚠️ សូមបិទភ្ជាប់ (Paste) Link វីដេអូជាមុនសិន!');
      if (input) input.focus();
      return;
    }
    if (searchInput) searchInput.value = val;
    if (platform === 'youtube') {
      analyzeYouTubeUrl(val);
    } else {
      analyzeSingleVideoUrl(val);
    }
  };

  // --------------------------------------------------------------------------
  // Feature: Search by Drama Title (Strict: For Titles/Names Only)
  // --------------------------------------------------------------------------
  async function executeSearchTitle(customKw = null) {
    const kw = (customKw !== null ? customKw : (searchInput ? searchInput.value : '')).trim();
    if (!kw) {
      showToast('⚠️ សូមបញ្ចូលឈ្មោះរឿងដើម្បីស្វែងរក!');
      if (searchInput) searchInput.focus();
      return;
    }

    // STRICT VALIDATION FOR HONGGUO:
    // If on Hongguo and user entered a Link or Series ID instead of a title, reject and ask to click Fetch!
    if (state.currentPlatform === 'hongguo' && isUrlOrId(kw)) {
      showToast('⚠️ មិនត្រឹមត្រូវទេ! នេះជា Link ឬ ID សូមចុចប៊ូតុង "⚡ Fetch"');
      const btnFetch = document.getElementById('btnFetchLink');
      if (btnFetch) {
        btnFetch.classList.add('pulse');
        setTimeout(() => { if (btnFetch) btnFetch.classList.remove('pulse'); }, 2000);
      }
      return;
    }

    // Auto-detect for other platforms: If user entered a direct URL or ID, execute Link Fetcher directly!
    if (state.currentPlatform !== 'hongguo' && isUrlOrId(kw)) {
      return executeFetchLink(kw);
    }

    state.isSearching = true;
    state.isLoading = true;

    // Hide load more during search
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    if (loadMoreContainer) loadMoreContainer.style.display = 'none';

    // Show searching state
    if (sectionTitle) {
      sectionTitle.innerHTML = `<span id="sectionTitleText">🔍 លទ្ធផលស្វែងរក: "<b>${escapeHtml(kw)}</b>"</span><span class="site-arrow">↗</span>`;
    }
    if (btnBackAll) btnBackAll.style.display = 'inline-flex';
    if (dramaGrid) dramaGrid.innerHTML = renderSkeletonCards(6);
    if (analyzedCard) analyzedCard.style.display = 'none';

    try {
      let results = [];
      const platform = state.currentPlatform;

      // 1. Search in Hongguo
      if (platform === 'hongguo') {
        const res = await fetch(`/api/search?q=${encodeURIComponent(kw)}&page=1&page_size=48`);
        const json = await res.json();
        const raw = json.items || [];
        results = raw.map(it => ({
          id: String(it.series_id || it.id || it.book_id || ''),
          title: it.title || it.series_title || 'Drama',
          cover: it.cover || it.cover_url || it.cover_image || '',
          episodes_count: it.episode_cnt || it.total_episodes || '',
          platform: 'hongguo'
        }));
      }

      // 2. Search in MVFFM
      else if (platform === 'mvffm') {
        const res = await fetch(`/api/mvffm/search?wd=${encodeURIComponent(kw)}`);
        const json = await res.json();
        const raw = Array.isArray(json.data) ? json.data : (json.items || []);
        results = raw.map(it => ({
          id: String(it.id || it.url || ''),
          url: it.url || '',
          title: it.title || 'MVFFM Drama',
          cover: it.cover || '',
          episodes_count: it.remarks || it.type || '1080p',
          platform: 'mvffm'
        }));
      }

      // 3. Search in Dailymotion
      else if (platform === 'dailymotion') {
        const res = await fetch(`/api/dailymotion/search?q=${encodeURIComponent(kw)}&page=1`);
        const json = await res.json();
        const raw = (json.data && json.data.list) ? json.data.list : (json.items || []);
        results = raw.map(it => ({
          id: String(it.id || ''),
          title: it.title || 'Dailymotion Drama',
          cover: it.thumbnail || it.cover_url || it.thumbnail_url || it.cover || '',
          episodes_count: it.duration ? `${Math.round(it.duration / 60)} នាទី` : 'Full Movie',
          platform: 'dailymotion'
        }));
      }

      // 4. Search in HaoSou
      else if (platform === 'haosou') {
        const res = await fetch(`/api/haosou/search?wd=${encodeURIComponent(kw)}`);
        const json = await res.json();
        const raw = Array.isArray(json.data) ? json.data : (json.items || []);
        results = raw.map(it => ({
          id: String(it.id || ''),
          title: it.title || 'HaoSou Drama',
          cover: it.cover || '',
          episodes_count: it.remarks || '全集',
          platform: 'haosou'
        }));
      }

      // 5. Search in BeePlaylet
      else if (platform === 'beeplaylet') {
        const res = await fetch(`/api/beeplaylet/search?wd=${encodeURIComponent(kw)}`);
        const json = await res.json();
        const raw = Array.isArray(json.data) ? json.data : (json.items || []);
        results = raw.map(it => ({
          id: String(it.id || ''),
          title: it.title || 'BeePlaylet Drama',
          cover: it.cover || '',
          episodes_count: it.remarks || 'HD',
          platform: 'beeplaylet'
        }));
      }

      // 6. Search in AniTaku Anime
      else if (platform === 'anitaku') {
        const res = await fetch(`/api/anitaku/search?q=${encodeURIComponent(kw)}`);
        const json = await res.json();
        const raw = Array.isArray(json.data) ? json.data : (json.items || []);
        results = raw.map(it => ({
          id: String(it.id || it.url || ''),
          url: it.url || '',
          title: it.title || 'AniTaku Anime',
          cover: it.cover || it.thumbnail || '',
          episodes_count: it.ep || 'Anime',
          platform: 'anitaku'
        }));
      }

      // 7. Search in AnimeXin Donghua 3D
      else if (platform === 'animexin') {
        const res = await fetch(`/api/animexin/search?q=${encodeURIComponent(kw)}`);
        const json = await res.json();
        const raw = Array.isArray(json.data) ? json.data : (json.items || []);
        results = raw.map(it => ({
          id: String(it.id || it.url || ''),
          url: it.url || '',
          title: it.title || 'AnimeXin Donghua',
          cover: it.cover || it.thumbnail || '',
          episodes_count: it.ep || '3D',
          platform: 'animexin'
        }));
      }

      // 8. Default fallback search across Hongguo
      else {
        const res = await fetch(`/api/search?q=${encodeURIComponent(kw)}&page=1&page_size=48`);
        const json = await res.json();
        const raw = json.items || [];
        results = raw.map(it => ({
          id: String(it.series_id || it.id || ''),
          title: it.title || 'Drama',
          cover: it.cover || it.cover_url || '',
          episodes_count: it.episode_cnt || '',
          platform: 'hongguo'
        }));
      }

      state.dramas = results;
      renderDramaCards(results);

      if (results.length === 0) {
        showToast(`🔍 រកមិនឃើញរឿង "${kw}" លើ ${platform.toUpperCase()} ឡើយ`);
      } else {
        showToast(`✨ រកឃើញ ${results.length} រឿង!`);
      }
    } catch (err) {
      console.error('[Search Title Error]:', err);
      showToast('❌ Search Error: ' + err.message);
    } finally {
      state.isLoading = false;
    }
  }
  window.executeSearchTitle = executeSearchTitle;

  // --------------------------------------------------------------------------
  // Feature: Fetch via Link or Series ID (Strict: For Links/IDs Only)
  // --------------------------------------------------------------------------
  async function executeFetchLink(customVal = null) {
    const val = (customVal !== null ? customVal : (searchInput ? searchInput.value : '')).trim();
    if (!val) {
      showToast('⚠️ សូមបិទភ្ជាប់ Link ឬលេខកូដ Series ID!');
      if (searchInput) searchInput.focus();
      return;
    }

    // STRICT VALIDATION FOR HONGGUO:
    // If on Hongguo and user entered a drama title instead of a link/id, reject and ask to click Search!
    if (state.currentPlatform === 'hongguo' && !isUrlOrId(val)) {
      showToast('⚠️ មិនត្រឹមត្រូវទេ! នេះជាឈ្មោះរឿង សូមចុចប៊ូតុង "ស្វែងរក"');
      const btnSearch = document.getElementById('btnSearchTitle');
      if (btnSearch) {
        btnSearch.classList.add('pulse');
        setTimeout(() => { if (btnSearch) btnSearch.classList.remove('pulse'); }, 2000);
      }
      return;
    }

    // If on other platform and user entered a title name, seamlessly route to title search
    if (state.currentPlatform !== 'hongguo' && !isUrlOrId(val)) {
      return executeSearchTitle(val);
    }

    showToast('⏳ កំពុងដំណើរការ Fetch...', 2000);

    // 1. Direct Hongguo Series Link or raw ID
    if (val.includes('hongguoduanju.com') || /^\d{10,25}$/.test(val)) {
      const match = val.match(/[?&]series_id=(\d+)/i) || val.match(/series\/(\d+)/i) || val.match(/^(\d+)$/);
      if (match) {
        const sid = match[1];
        await openDramaById(sid, 'hongguo');
        return;
      }
    }

    // 2. MVFFM Link
    if (val.includes('mvffm.net')) {
      await openDramaById(val, 'mvffm');
      return;
    }

    // 3. Dailymotion Link
    if (val.includes('dailymotion.com') || val.includes('dai.ly')) {
      const match = val.match(/video\/([a-zA-Z0-9]+)/i) || val.match(/dai\.ly\/([a-zA-Z0-9]+)/i);
      const vid = match ? match[1] : val;
      await openDramaById(vid, 'dailymotion');
      return;
    }

    // 4. HaoSou Link
    if (val.includes('1dfx.com') || val.includes('v.djss.cc') || val.includes('djss.cc') || val.includes('haosoudj.com')) {
      await openDramaById(val, 'haosou');
      return;
    }

    // 5. BeePlaylet Link
    if (val.includes('beeplaylet.com')) {
      await openDramaById(val, 'beeplaylet');
      return;
    }

    // 6. AniTaku Anime Link
    if (val.includes('anitaku.com.ro') || val.includes('anitaku.to') || val.includes('gogoanime')) {
      await openDramaById(val, 'anitaku');
      return;
    }

    // 7. AnimeXin Donghua Link
    if (val.includes('animexin.dev') || val.includes('animexin.vip')) {
      await openDramaById(val, 'animexin');
      return;
    }

    // 8. YouTube Link
    if (val.includes('youtube.com') || val.includes('youtu.be')) {
      await analyzeYouTubeUrl(val);
      return;
    }

    // 9. TikTok / Douyin / Kuaishou / Facebook
    if (
      val.includes('tiktok.com') ||
      val.includes('douyin.com') ||
      val.includes('iesdouyin.com') ||
      val.includes('kuaishou.com') ||
      val.includes('kwai.com') ||
      val.includes('gifshow.com') ||
      val.includes('facebook.com') ||
      val.includes('fb.watch') ||
      val.includes('fb.com')
    ) {
      await analyzeSingleVideoUrl(val);
      return;
    }

    showToast('⚠️ Link នេះមិនស្ថិតក្នុងទម្រង់ដែលស្គាល់ឡើយ');
  }
  window.executeFetchLink = executeFetchLink;

  // --------------------------------------------------------------------------
  // Single Video Analyzer (TikTok, Douyin, Kuaishou, Facebook)
  // --------------------------------------------------------------------------
  async function analyzeSingleVideoUrl(url) {
    if (!requireMobileLicense()) return;
    if (!analyzedCard) return;
    analyzedCard.style.display = 'block';
    analyzedCard.innerHTML = `
      <div style="text-align: center; padding: 25px; color: #94a3b8;">
        <div class="spinner" style="margin: 0 auto 12px; width: 28px; height: 28px; border-width: 3px;"></div>
        <p style="font-weight: 700; color: #fff;">កំពុងវិភាគវីដេអូ Full HD គ្មាន Watermark...</p>
      </div>
    `;
    analyzedCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      const devId = getMobileDeviceId();
      const res = await fetch('/api/tiktok/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': devId,
          'Device-Id': devId,
          'X-Device-Type': 'mobile'
        },
        body: JSON.stringify({ url, device_id: devId })
      });
      const data = await res.json();
      if ((!data.ok && !data.success) || !data.data) {
        throw new Error(data.message || data.error || 'មិនអាចវិភាគវីដេអូនេះបានឡើយ');
      }

      const vid = data.data;
      const title = vid.title || 'Video Downloader';
      const cleanTitle = title.replace(/[\\/*?:"<>|\r\n\t]/g, '_').trim();
      const placeholderCover = getMobilePosterPlaceholder(title, vid.platform || 'Video');
      const cover = vid.cover || placeholderCover;
      const playUrl = vid.play_url || vid.url;
      const author = (vid.author && (vid.author.nickname || vid.author.name)) || vid.author || 'Creator';
      const duration = vid.duration_str || (vid.duration ? `${Math.floor(vid.duration / 60)}:${String(vid.duration % 60).padStart(2, '0')}` : '');
      const platformName = (vid.platform || 'VIDEO').toUpperCase();

      const dlUrl = `/api/mobile/download?url=${encodeURIComponent(playUrl)}&filename=${encodeURIComponent(cleanTitle + '.mp4')}&platform=${encodeURIComponent(vid.platform || 'video')}&device_id=${encodeURIComponent(devId)}`;

      analyzedCard.innerHTML = `
        <div class="analyzed-card-inner">
          <div class="analyzed-thumb-box">
            <img src="${cover}" alt="Video" class="analyzed-thumb" onerror="this.onerror=null; this.src='${placeholderCover}'">
            <div class="analyzed-platform-badge">${platformName}</div>
          </div>
          <div class="analyzed-meta">
            <div class="analyzed-title">${escapeHtml(title)}</div>
            <div class="analyzed-author">👤 ${escapeHtml(author)}${duration ? ` | ⏱️ ${duration}` : ''}</div>
            <div class="analyzed-actions" style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
              <button class="btn-direct-dl" onclick="triggerMobileDownload('${dlUrl}', '${encodeURIComponent(cleanTitle + '.mp4')}')" style="width: 100%; padding: 12px 14px; font-size: 0.9rem; font-weight: 800; border-radius: 10px; background: linear-gradient(135deg, #0284c7, #38bdf8); color: #070a13; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 4px 15px rgba(56, 189, 248, 0.4);">
                <span>💾 ទាញយក Full HD ចូលទូរសព្ទ (Save to Phone)</span>
              </button>
            </div>
          </div>
        </div>
      `;
      showToast('🎉 វិភាគជោគជ័យ! សូមចុចប៊ូតុងទាញយកចូលទូរសព្ទ');
    } catch (err) {
      analyzedCard.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #ef4444;">
          <p>⚠️ បរាជ័យក្នុងការវិភាគ: ${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

  // --------------------------------------------------------------------------
  // YouTube Quality Scanner & Resolution Hub (4K, 2K, 1080p, 720p, MP3 Audio)
  // --------------------------------------------------------------------------
  async function analyzeYouTubeUrl(url) {
    if (!requireMobileLicense()) return;
    if (!analyzedCard) return;
    analyzedCard.style.display = 'block';
    analyzedCard.innerHTML = `
      <div style="text-align: center; padding: 25px; color: #94a3b8;">
        <div class="spinner" style="margin: 0 auto 12px; width: 28px; height: 28px; border-width: 3px;"></div>
        <p style="font-weight: 700; color: #fff;">🔍 កំពុងស្កេនរកគ្រប់កម្រិតច្បាស់ YouTube (4K / 2K / 1080p / MP3)...</p>
      </div>
    `;
    analyzedCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      const devId = getMobileDeviceId();
      const res = await fetch('/api/youtube/info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': devId,
          'Device-Id': devId,
          'X-Device-Type': 'mobile'
        },
        body: JSON.stringify({ url, device_id: devId })
      });
      const data = await res.json();
      if ((!data.ok && !data.success) || !data.data) {
        throw new Error(data.message || data.error || 'មិនអាចទាញយកព័ត៌មាន YouTube បានឡើយ');
      }

      const info = data.data;
      const title = info.title || 'YouTube Video';
      const placeholderCover = getMobilePosterPlaceholder(title, 'YouTube');
      const cover = info.thumbnail || placeholderCover;
      const duration = info.duration_formatted || (info.duration ? `${Math.floor(info.duration / 60)}:${String(info.duration % 60).padStart(2, '0')}` : 'Video');
      const views = info.view_count ? Number(info.view_count).toLocaleString() : 'N/A';
      const qualities = info.qualities || [
        { id: 'best', label: '🌟 Max Quality (Auto)', height: 1080, note: 'Best Video + Audio' },
        { id: '1080', label: '🎬 Full HD (1080p)', height: 1080, note: 'FHD 1080p' },
        { id: '720', label: '📺 HD (720p)', height: 720, note: 'HD 720p' },
        { id: 'audio', label: '🎵 MP3 Audio (320kbps)', height: 0, note: 'High-Quality MP3' }
      ];

      analyzedCard.innerHTML = `
        <div class="analyzed-card-inner">
          <div class="analyzed-thumb-box">
            <img src="${cover}" alt="YouTube" class="analyzed-thumb" onerror="this.onerror=null; this.src='${placeholderCover}'">
            <div class="analyzed-platform-badge" style="background:#ef4444;">YOUTUBE</div>
          </div>
          <div class="analyzed-meta">
            <div class="analyzed-title">${escapeHtml(title)}</div>
            <div class="analyzed-author">⏱️ ${duration} | 👁️ ${views} | 👤 ${escapeHtml(info.channel || 'YouTube')}</div>
          </div>
        </div>

        <div class="yt-quality-scanner-box">
          <div class="yt-scanner-header">
            <span>📊 ស្កេនឃើញ ${qualities.length} កម្រិតច្បាស់ (Scanned Resolutions):</span>
            <span style="color:#ef4444; font-size: 0.75rem;">⚡ ចុចដើម្បីទាញយក</span>
          </div>
          <div class="yt-qualities-grid">
            ${qualities.map(q => {
              let tagClass = 'yt-tag-sd';
              let tagText = q.height ? `${q.height}p` : 'MP3';
              if (q.height >= 2160) tagClass = 'yt-tag-4k';
              else if (q.height >= 1440) tagClass = 'yt-tag-2k';
              else if (q.height >= 1080) tagClass = 'yt-tag-1080';
              else if (q.height >= 720) tagClass = 'yt-tag-720';
              else if (q.id === 'audio') tagClass = 'yt-tag-audio';
              
              return `
                <div class="yt-quality-card" onclick="startYouTubeDownload('${encodeURIComponent(url)}', '${q.id}', '${encodeURIComponent(title)}')">
                  <div class="yt-quality-top">
                    <span class="yt-quality-label">${escapeHtml(q.label || q.id)}</span>
                    <span class="${tagClass}">${tagText}</span>
                  </div>
                  <div class="yt-quality-note">${escapeHtml(q.note || '')}</div>
                  <button style="margin-top: 4px; padding: 6px 8px; border-radius: 8px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18); color: #fff; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
                    <span>📥 ទាញយក ${tagText}</span>
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
      showToast('🎉 បានស្កេនរកកម្រិតវីដេអូជោគជ័យ! សូមជ្រើសរើសកម្រិតដែលចង់ទាញយក');
    } catch (err) {
      analyzedCard.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #ef4444;">
          <p>⚠️ YouTube Error: ${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

  let _ytPollInterval = null;

  window.startYouTubeDownload = async function (encodedUrl, quality, encodedTitle = '') {
    if (!requireMobileLicense()) return;
    const url = decodeURIComponent(encodedUrl);
    const title = decodeURIComponent(encodedTitle || 'YouTube Video');
    showToast(`🚀 កំពុងដំណើរការទាញយក YouTube [${quality.toUpperCase()}]...`, 3000);

    if (liveProgressCard) {
      liveProgressCard.style.display = 'block';
      const progressTitle = document.getElementById('progressTitle');
      const progressPercentage = document.getElementById('progressPercentage');
      const progressBar = document.getElementById('progressBar');
      if (progressTitle) progressTitle.textContent = `ទាញយក YouTube: ${title.substring(0, 25)}...`;
      if (progressPercentage) progressPercentage.textContent = 'កំពុងចាប់ផ្តើម...';
      if (progressBar) progressBar.style.width = '10%';
      liveProgressCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    try {
      const devId = getMobileDeviceId();
      const res = await fetch('/api/youtube/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': devId,
          'Device-Id': devId,
          'X-Device-Type': 'mobile'
        },
        body: JSON.stringify({
          url,
          quality: quality || 'best',
          title,
          device_id: devId
        })
      });
      const data = await res.json();
      if (data.ok || data.success) {
        showToast('✅ បានចាប់ផ្តើមទាញយក YouTube!', 3000);
        startYouTubeTasksPolling();
      } else {
        showToast('❌ ' + (data.message || data.error || 'Download failed'), 4000);
      }
    } catch (e) {
      showToast('❌ Error: ' + e.message, 4000);
    }
  };

  function startYouTubeTasksPolling() {
    if (_ytPollInterval) clearInterval(_ytPollInterval);
    _ytPollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/youtube/tasks');
        const data = await res.json();
        const tasks = (data && data.tasks) || [];
        if (tasks.length === 0) {
          clearInterval(_ytPollInterval);
          _ytPollInterval = null;
          return;
        }
        const active = tasks.find(t => t.status === 'downloading') || tasks[0];
        if (active && liveProgressCard) {
          const progressTitle = document.getElementById('progressTitle');
          const progressPercentage = document.getElementById('progressPercentage');
          const progressBar = document.getElementById('progressBar');
          const progressSpeed = document.getElementById('progressSpeed');
          const progressEta = document.getElementById('progressEta');

          if (progressTitle) progressTitle.textContent = active.name || 'YouTube Video';
          if (progressPercentage) progressPercentage.textContent = `${active.percent || 0}%`;
          if (progressBar) progressBar.style.width = `${active.percent || 0}%`;
          if (progressSpeed && active.speed) progressSpeed.textContent = `⚡ ${active.speed}`;
          if (progressEta && active.eta) progressEta.textContent = `⏱️ ${active.eta}`;

          if (active.status === 'completed') {
            const ytRawTitle = (active.title || active.name || 'YouTube_Video');
            const ytCleanTitle = ytRawTitle.replace(/[\\/*?:"<>|\r\n\t]/g, '_').trim();
            const ext = (active.quality === 'audio' || (active.filePath && active.filePath.endsWith('.mp3'))) ? '.mp3' : '.mp4';
            const ytFilename = ytCleanTitle + ext;
            const devId = getMobileDeviceId();
            const phoneDlUrl = `/api/mobile/download?yt_id=${encodeURIComponent(active.id)}&filename=${encodeURIComponent(ytFilename)}&device_id=${encodeURIComponent(devId)}`;

            showToast('🎉 ទាញយក YouTube ជោគជ័យ! កំពុងបញ្ជូនចូលទូរសព្ទ...', 4000);

            // Automatically stream/save to phone storage
            triggerMobileDownload(phoneDlUrl, ytFilename);

            if (liveProgressCard) {
              const progressTitle = document.getElementById('progressTitle');
              const progressPercentage = document.getElementById('progressPercentage');
              const progressBar = document.getElementById('progressBar');
              if (progressTitle) progressTitle.textContent = `✅ ${ytFilename}`;
              if (progressPercentage) progressPercentage.textContent = '១០០% រួចរាល់!';
              if (progressBar) {
                progressBar.style.width = '100%';
                progressBar.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
              }

              let dlBtn = document.getElementById('btnYtPhoneSave');
              if (!dlBtn) {
                dlBtn = document.createElement('button');
                dlBtn.id = 'btnYtPhoneSave';
                dlBtn.style.cssText = 'width: 100%; margin-top: 10px; padding: 10px 14px; background: linear-gradient(135deg, #10b981, #059669); color: #fff; font-weight: 800; font-size: 0.85rem; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);';
                liveProgressCard.appendChild(dlBtn);
              }
              dlBtn.innerHTML = '<span>💾 ចុចទាញយកចូលទូរសព្ទម្តងទៀត (Save to Phone)</span>';
              dlBtn.onclick = () => triggerMobileDownload(phoneDlUrl, ytFilename);
            }

            clearInterval(_ytPollInterval);
            _ytPollInterval = null;
          } else if (active.status === 'error') {
            showToast('❌ YouTube Error: ' + (active.error || 'Download failed'));
            clearInterval(_ytPollInterval);
            _ytPollInterval = null;
          }
        }
      } catch (_) {}
    }, 1500);
  }

  window.triggerMobileDownload = function (rawUrl, rawFilename) {
    if (!requireMobileLicense()) return;
    const devId = getMobileDeviceId();
    let url = typeof rawUrl === 'string' ? decodeURIComponent(rawUrl).trim() : '';
    let filename = (rawFilename ? decodeURIComponent(rawFilename) : 'video.mp4').replace(/[\\/*?:"<>|\r\n\t]/g, '_').trim();

    // If it's a 3rd party CDN stream (TikTok, Douyin, Kuaishou, Facebook), route through /api/mobile/download proxy
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const isInternal = url.includes(window.location.host) || url.startsWith('/') || url.includes('ps-download-bot-irhw.onrender.com');
      if (!isInternal) {
        url = `/api/mobile/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}&device_id=${encodeURIComponent(devId)}`;
      }
    }

    // Attach mobile device_id for authorization
    if (!url.includes('device_id=') && devId) {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}device_id=${encodeURIComponent(devId)}&device_type=mobile`;
    }

    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_self'; // Crucial for Android WebView DownloadListener to trigger native Downloads folder!
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        try { document.body.removeChild(link); } catch (_) {}
      }, 1000);
      showToast(`📥 កំពុងបញ្ជូនទាញយកទៅទូរសព្ទ: ${filename.substring(0, 30)}...`, 3000);
    } catch (_) {
      window.location.href = url;
    }
  };

  window.triggerBrowserDownload = function (url, filename) {
    window.triggerMobileDownload(url, filename);
  };

  // --------------------------------------------------------------------------
  // Universal Image Resolver (Proxies images from AnimeXin, AniTaku, etc.)
  // --------------------------------------------------------------------------
  function getMobileCoverImageUrl(rawCover, platform) {
    if (!rawCover) return '';
    let url = String(rawCover).trim();
    if (!url) return '';
    if (url.startsWith('http://')) {
      url = url.replace(/^http:\/\//i, 'https://');
    }
    if (/^https?:\/\//i.test(url)) {
      const p = (platform || state.currentPlatform || '').toLowerCase();
      if (
        p === 'animexin' ||
        p === 'anitaku' ||
        url.includes('animexin') ||
        url.includes('anitaku') ||
        url.includes('gogo') ||
        url.includes('wp-content') ||
        url.includes('blogger.googleusercontent.com')
      ) {
        return `/api/image-proxy?url=${encodeURIComponent(url)}`;
      }
    }
    return url;
  }

  // --------------------------------------------------------------------------
  // Drama Cards Renderer (Screenshot 2 Style: 3-Columns Grid)
  // --------------------------------------------------------------------------
  function renderDramaCards(dramas) {
    if (!dramaGrid) return;
    if (dramas.length === 0) {
      dramaGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: #94a3b8;">
          <div style="font-size: 2rem; margin-bottom: 8px;">🔍</div>
          <p>រកមិនឃើញរឿងភាគឡើយ។ សូមសាកល្បងវាយឈ្មោះរឿងផ្សេង ឬប្តូរ Platform។</p>
          <button onclick="resetToAllDramas()" style="margin-top: 12px; padding: 7px 16px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 8px; color: #38bdf8; font-weight: 700; cursor: pointer;">ត្រឡប់ទៅរឿងទាំងអស់</button>
        </div>
      `;
      return;
    }

    dramaGrid.innerHTML = dramas.map((item, idx) => {
      const id = String(item.id || item.series_id || item.book_id || '');
      const origTitle = item.title || item.series_title || 'Drama';
      let displayTitle = origTitle;
      if (state.currentLang === 'zh') {
        displayTitle = origTitle;
      } else if (state.currentLang === 'km') {
        displayTitle = item.title_km || getMobileDisplayTitle(origTitle, item);
      } else {
        displayTitle = item.title_en || getMobileDisplayTitle(origTitle, item);
      }
      if (displayTitle === origTitle && state.currentLang !== 'zh') {
        queueMobileTitleTranslation(origTitle);
      }
      const platform = item.platform || state.currentPlatform;
      const placeholderCover = getMobilePosterPlaceholder(displayTitle, platform);
      let rawCover = item.thumbnail || item.cover || item.cover_image || item.cover_url || '';
      const safeCover = getMobileCoverImageUrl(rawCover, platform);
      const coverUrl = safeCover || placeholderCover;
      const epCountNum = parseInt(item.episodes_count || item.episode_cnt || '70', 10) || 70;
      const tagText = item.type || item.remarks || (platform === 'hongguo' ? '热门短剧' : platform.toUpperCase());

      return `
        <div class="drama-card-3col" data-id="${escapeHtml(id)}" data-platform="${escapeHtml(platform)}" onclick="openDramaById('${escapeAttr(id)}', '${platform}')">
          <div class="poster-box-3col">
            <img class="poster-img-3col" src="${coverUrl}" alt="${escapeHtml(displayTitle)}" loading="lazy" referrerpolicy="no-referrer" data-raw-cover="${escapeAttr(rawCover)}" onerror="if(!this.dataset.proxied && this.dataset.rawCover && this.dataset.rawCover.startsWith('http')){this.dataset.proxied='1';this.src='/api/image-proxy?url='+encodeURIComponent(this.dataset.rawCover);}else{this.onerror=null;this.src='${placeholderCover}';}">
            <div class="card-badge-fhd">Full HD</div>
            <div class="card-badge-ep">${escapeHtml(String(epCountNum))} ភាគ</div>
          </div>
          <div class="card-content-3col">
            <div class="card-title-3col" data-original-title="${escapeHtml(origTitle)}" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</div>
            <div class="card-tags-3col">${escapeHtml(tagText)}</div>
          </div>
        </div>
      `;
    }).join('');

    updatePaginationBar();
  }

  // --------------------------------------------------------------------------
  // Numeric Pagination Engine (Screenshot 2 Style)
  // --------------------------------------------------------------------------
  window.goToPage = async function (p) {
    if (state.isLoading || p === state.page || p < 1) return;
    state.page = p;
    showToast(`⏳ កំពុងផ្ទុកទំព័រទី ${p}...`, 1200);
    await loadPlatformFeed(state.currentPlatform, true, true);
    updatePaginationBar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.goToPrevPage = function () {
    if (state.page > 1) {
      goToPage(state.page - 1);
    } else {
      showToast('⚠️ នេះជាទំព័រដំបូងបង្អស់');
    }
  };

  window.goToNextPage = function () {
    goToPage(state.page + 1);
  };

  function updatePaginationBar() {
    const container = document.getElementById('pageNumbersContainer');
    if (!container) return;
    const cur = state.page || 1;
    let start = Math.max(1, cur - 2);
    let end = start + 4;
    let html = '';
    for (let p = start; p <= end; p++) {
      html += `<button type="button" class="page-num-btn ${p === cur ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`;
    }
    container.innerHTML = html;
  }

  // --------------------------------------------------------------------------
  // Category Filter Pills Handler (Screenshot 2 Style)
  // --------------------------------------------------------------------------
  window.selectDramaFilter = function (filter, el) {
    document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
    if (el) el.classList.add('active');

    if (filter === 'all') {
      renderDramaCards(state.dramas);
    } else if (filter === 'many_ep') {
      const sorted = [...state.dramas].sort((a, b) => {
        const epA = parseInt(a.episodes_count || a.episode_cnt || 0, 10);
        const epB = parseInt(b.episodes_count || b.episode_cnt || 0, 10);
        return epB - epA;
      });
      renderDramaCards(sorted);
      showToast('🔥 បានតម្រៀបតាមរឿងដែលមានភាគច្រើនបំផុត');
    } else if (filter === 'romance') {
      const filtered = state.dramas.filter(d => {
        const t = (d.title || '') + (d.title_km || '') + (d.type || '');
        return /爱|恋|婚|妻|夫|甜|宠|总裁|千金|romance/i.test(t);
      });
      renderDramaCards(filtered.length > 0 ? filtered : state.dramas);
      showToast('❤️ បានចម្រាញ់រឿងប្រភេទស្នេហា');
    }
  };

  function renderSkeletonCards(count = 6) {
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `
        <div class="drama-card" style="opacity: 0.6; pointer-events: none;">
          <div class="card-poster-wrapper" style="background: linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite;"></div>
          <div class="card-content">
            <div style="height: 14px; background: #334155; border-radius: 4px; margin-bottom: 6px;"></div>
            <div style="height: 10px; width: 60%; background: #1e293b; border-radius: 4px;"></div>
          </div>
        </div>
      `;
    }
    return html;
  }

  // --------------------------------------------------------------------------
  // Interactive Drama Sheet & Episode Downloader (All Platforms)
  // --------------------------------------------------------------------------
  window.openDramaById = async function (dramaId, platform = 'hongguo') {
    if (!dramaId) return;
    showToast('⏳ កំពុងផ្ទុកព័ត៌មានរឿង...', 1800);

    try {
      let detail = null;

      // 1. Hongguo
      if (platform === 'hongguo') {
        const res = await fetch(`/api/series/${dramaId}`);
        detail = await res.json();
      }

      // 2. MVFFM
      else if (platform === 'mvffm') {
        const res = await fetch('/api/mvffm/detail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: dramaId })
        });
        const json = await res.json();
        detail = json.data || json;
      }

      // 3. Dailymotion
      else if (platform === 'dailymotion') {
        const res = await fetch(`/api/dailymotion/detail?id=${dramaId}`);
        const json = await res.json();
        detail = json.data || json;
        if (detail && (!detail.episodes || detail.episodes.length === 0)) {
          detail.episodes = [{
            ep: 1,
            title: detail.title || 'Full Movie',
            stream_url: detail.stream_url || `/api/dailymotion/stream?id=${dramaId}`
          }];
        }
      }

      // 4. HaoSou
      else if (platform === 'haosou') {
        const res = await fetch('/api/haosou/detail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: dramaId })
        });
        const json = await res.json();
        detail = json.data || json;
      }

      // 5. BeePlaylet
      else if (platform === 'beeplaylet') {
        const res = await fetch('/api/beeplaylet/detail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: dramaId })
        });
        const json = await res.json();
        detail = json.data || json;
      }

      // 6. AniTaku Anime
      else if (platform === 'anitaku') {
        const res = await fetch('/api/anitaku/detail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: dramaId })
        });
        const json = await res.json();
        detail = json.data || json;
      }

      // 7. AnimeXin Donghua
      else if (platform === 'animexin') {
        const res = await fetch('/api/animexin/detail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: dramaId })
        });
        const json = await res.json();
        detail = json.data || json;
      }

      if (!detail) throw new Error('Cannot load drama detail');

      state.selectedDrama = detail;
      state.selectedDrama.platform = platform;
      renderDramaSheet(detail, platform);
    } catch (err) {
      console.error('[Open Drama Error]:', err);
      showToast('❌ Error: ' + err.message);
    }
  };

  function renderDramaSheet(detail, platform) {
    const modal = document.getElementById('dramaSheetModal') || dramaSheetModal;
    if (!modal) return;

    const title = detail.series_title || detail.title || 'Short Drama';
    const placeholderCover = getMobilePosterPlaceholder(title, detail.platform || 'Drama');
    const rawCover = detail.thumbnail || detail.cover_image || detail.cover || detail.cover_url || '';
    const safeCover = getMobileCoverImageUrl(rawCover, platform);
    const coverUrl = safeCover || placeholderCover;
    const episodes = detail.episodes || [];
    const totalEps = detail.episode_cnt || detail.total_episodes || episodes.length || 1;

    // Header info
    const posterEl = document.getElementById('sheetPoster') || document.getElementById('sheetDramaPoster');
    if (posterEl) {
      posterEl.src = coverUrl;
      posterEl.dataset.rawCover = rawCover;
      posterEl.onerror = () => {
        if (!posterEl.dataset.proxied && rawCover && rawCover.startsWith('http')) {
          posterEl.dataset.proxied = '1';
          posterEl.src = `/api/image-proxy?url=${encodeURIComponent(rawCover)}`;
        } else {
          posterEl.onerror = null;
          posterEl.src = placeholderCover;
        }
      };
    }

    const titleEl = document.getElementById('sheetTitle') || document.getElementById('sheetDramaTitle');
    if (titleEl) {
      const origDramaTitle = detail.series_title || detail.title || 'Short Drama';
      const dispDramaTitle = getMobileDisplayTitle(origDramaTitle);
      queueMobileTitleTranslation(origDramaTitle);
      titleEl.dataset.originalTitle = origDramaTitle;
      titleEl.textContent = dispDramaTitle;
    }

    const sourceTagEl = document.getElementById('sheetSourceTag') || document.getElementById('sheetDramaPlatformTag');
    if (sourceTagEl) sourceTagEl.textContent = platform.toUpperCase();

    const epBadgeEl = document.getElementById('sheetEpBadge') || document.getElementById('sheetDramaEpsTag');
    if (epBadgeEl) {
      epBadgeEl.textContent = (platform === 'dailymotion' || totalEps <= 1) ? 'Full Movie' : `${totalEps} ភាគ`;
    }

    // Reset range input defaults
    const rangeFrom = document.getElementById('rangeFrom');
    const rangeTo = document.getElementById('rangeTo');
    if (rangeFrom) {
      rangeFrom.min = 1;
      rangeFrom.max = totalEps;
      rangeFrom.value = 1;
    }
    if (rangeTo) {
      rangeTo.min = 1;
      rangeTo.max = totalEps;
      rangeTo.value = Math.min(10, totalEps);
    }

    // Download All Button text & icon
    const btnDlAll = document.getElementById('btnDlAll');
    if (btnDlAll) {
      if (platform === 'dailymotion' || totalEps <= 1) {
        btnDlAll.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>🎬 ទាញយក Full Movie (1080p)</span>
        `;
      } else {
        btnDlAll.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>📦 ទាញយកទាំងអស់ (Full Series ${totalEps} ភាគ)</span>
        `;
      }
    }

    // Render Packs (1-10, 11-20, 21-30...)
    const packsGrid = document.getElementById('packsGrid');
    if (packsGrid) {
      packsGrid.innerHTML = '';
      if (platform === 'dailymotion' || totalEps <= 1) {
        const btn = document.createElement('button');
        btn.className = 'btn-pack-dl';
        btn.innerHTML = `<span>🎬 Full Movie ពេញមួយរឿង</span>`;
        btn.onclick = () => downloadDramaRange(1, 1);
        packsGrid.appendChild(btn);
      } else {
        const packSize = 10;
        const totalPacks = Math.ceil(totalEps / packSize);
        for (let p = 0; p < totalPacks; p++) {
          const start = p * packSize + 1;
          const end = Math.min((p + 1) * packSize, totalEps);
          const btn = document.createElement('button');
          btn.className = 'btn-pack-dl';
          btn.innerHTML = `<span>📦 ភាគ ${start} - ${end}</span>`;
          btn.onclick = () => downloadDramaRange(start, end);
          packsGrid.appendChild(btn);
        }
      }
    }

    // Render Individual Episode Selectors
    const episodesGrid = document.getElementById('episodesSelectorGrid');
    if (episodesGrid) {
      episodesGrid.innerHTML = '';
      const displayCount = Math.min(totalEps, 200);
      for (let i = 1; i <= displayCount; i++) {
        const epData = episodes[i - 1] || {};
        const vid = epData.vid || epData.id || '';
        const btn = document.createElement('button');
        btn.className = 'btn-single-ep';
        btn.id = `epBtn_${i}`;
        btn.textContent = totalEps === 1 ? '▶ Movie' : `EP ${i}`;
        btn.onclick = () => playAndDownloadSingleEp(i, vid, epData);
        episodesGrid.appendChild(btn);
      }
    }

    // Show modal
    modal.classList.add('active');
  }

  window.closeDramaSheet = function () {
    if (dramaSheetModal) dramaSheetModal.classList.remove('active');
    const playerWrapper = document.getElementById('sheetPlayerWrapper');
    const videoElem = document.getElementById('sheetVideo');
    if (playerWrapper) playerWrapper.classList.remove('active');
    if (videoElem) {
      videoElem.pause();
      videoElem.src = '';
    }
  };

  // --------------------------------------------------------------------------
  // In-Sheet Video Player Preview
  // --------------------------------------------------------------------------
  window.playAndDownloadSingleEp = function (epNum, vid, epData = {}) {
    if (!requireMobileLicense()) return;
    if (!state.selectedDrama) return;

    // Highlight button
    document.querySelectorAll('.btn-single-ep').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`epBtn_${epNum}`);
    if (btn) btn.classList.add('active');

    const playerWrapper = document.getElementById('sheetPlayerWrapper');
    const videoElem = document.getElementById('sheetVideo');

    if (playerWrapper && videoElem) {
      playerWrapper.classList.add('active');
      const detail = state.selectedDrama;
      const seriesId = detail.series_id || detail.id;
      const platform = detail.platform || state.currentPlatform;
      const devId = getMobileDeviceId();

      let playUrl = '';
      if (platform === 'hongguo') {
        const targetVid = vid || (detail.episodes && detail.episodes[epNum - 1]?.vid);
        playUrl = `/api/video/${seriesId}/${targetVid}/play?quality=720p&device_id=${encodeURIComponent(devId)}`;
      } else if (platform === 'dailymotion') {
        playUrl = detail.stream_url || `/api/dailymotion/stream?id=${seriesId}&device_id=${encodeURIComponent(devId)}`;
      } else if (epData.url) {
        playUrl = epData.url;
      }

      if (playUrl) {
        videoElem.src = playUrl;
        videoElem.play().catch(() => {});
        playerWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        showToast(`🎬 កំពុងចាក់ភាគទី ${epNum}...`);
      }
    }
  };

  function triggerInAppDownload(url, filename) {
    window.triggerMobileDownload(url, filename);
  }

  // --------------------------------------------------------------------------
  // Batch & Range Downloader Engine
  // --------------------------------------------------------------------------
  window.downloadDramaRange = async function (startEp, endEp) {
    if (!requireMobileLicense()) return;
    if (!state.selectedDrama) return;
    const detail = state.selectedDrama;
    const seriesId = detail.series_id || detail.id;
    const rawTitle = detail.series_title || detail.title || 'Drama';
    const cleanTitle = rawTitle.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
    const totalEps = detail.episode_cnt || detail.episodes?.length || 1;
    const platform = detail.platform || state.currentPlatform;

    const s = Math.max(1, Math.min(totalEps, parseInt(startEp, 10)));
    const e = Math.max(1, Math.min(totalEps, parseInt(endEp, 10)));
    const count = e - s + 1;

    showToast(`📦 បានទទួលបញ្ជាទាញយកភាគ ${s} ដល់ ${e} (សរុប ${count} ភាគ)`);
    closeDramaSheet();

    if (liveProgressCard) liveProgressCard.classList.add('active');
    state.activeDownload = { canceled: false };

    const btnCancel = document.getElementById('btnCancelDl');
    if (btnCancel) {
      btnCancel.textContent = 'បញ្ឈប់';
      btnCancel.style.background = 'rgba(239, 68, 68, 0.2)';
      btnCancel.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      btnCancel.style.color = '#f87171';
      btnCancel.onclick = cancelActiveDownload;
    }

    // 1. Download Drama Poster image alongside videos so it shows in phone's Gallery / Album!
    const coverUrl = detail.cover || detail.cover_url || detail.thumb || detail.thumb_url || detail.thumbnail || '';
    if (coverUrl && s === 1) {
      try {
        const posterFilename = `${cleanTitle}_00_Poster.jpg`;
        const posterDownloadUrl = `/img?url=${encodeURIComponent(coverUrl)}&download=1&filename=${encodeURIComponent(posterFilename)}`;
        triggerInAppDownload(posterDownloadUrl, posterFilename);
        await new Promise(r => setTimeout(r, 800));
      } catch (_) {}
    }

    for (let ep = s; ep <= e; ep++) {
      if (state.activeDownload.canceled) {
        showToast(`🛑 បានបញ្ឈប់ការទាញយកត្រឹមភាគ ${ep - 1}!`);
        const currentPct = Math.round(((ep - s) / count) * 100);
        updateProgressUI(`🛑 បានបញ្ឈប់ការទាញយក`, currentPct, `បានបញ្ឈប់ត្រឹមភាគទី ${ep - 1}`);
        if (btnCancel) {
          btnCancel.textContent = 'បិទ';
          btnCancel.style.background = 'rgba(255, 255, 255, 0.1)';
          btnCancel.style.borderColor = 'rgba(255, 255, 255, 0.2)';
          btnCancel.style.color = '#94a3b8';
          btnCancel.onclick = () => { if (liveProgressCard) liveProgressCard.classList.remove('active'); };
        }
        break;
      }

      const epIdx = ep - 1;
      const epData = detail.episodes ? detail.episodes[epIdx] : null;
      const vid = epData ? (epData.vid || epData.id || '') : '';
      const currentPct = Math.round(((ep - s + 1) / count) * 100);

      updateProgressUI(
        `⚡ [${ep - s + 1}/${count}] ${cleanTitle} - ភាគទី ${ep}`,
        currentPct,
        `កំពុងទាញយកក្នុងកម្មវិធីដោយស្វ័យប្រវត្តិ (ភាគ ${ep - s + 1} នៃ ${count})...`
      );

      try {
        let downloadUrl = '';
        const filename = `${cleanTitle}_EP${String(ep).padStart(3, '0')}.mp4`;
        const devId = getMobileDeviceId();

        if (platform === 'hongguo') {
          downloadUrl = `/api/video/${seriesId}/${vid}/play?quality=1080p&download=1&device_id=${encodeURIComponent(devId)}&filename=${encodeURIComponent(filename)}`;
        } else if (platform === 'dailymotion') {
          downloadUrl = detail.stream_url || `/api/dailymotion/stream?id=${seriesId}&device_id=${encodeURIComponent(devId)}`;
        } else if (epData && epData.url) {
          downloadUrl = epData.url;
        }

        if (downloadUrl) {
          triggerInAppDownload(downloadUrl, filename);
        }

        // Interval between episode downloads so mobile queues each EP cleanly
        await new Promise(r => setTimeout(r, 1200));
      } catch (err) {
        console.error(`Error downloading EP ${ep}:`, err);
      }
    }

    if (!state.activeDownload.canceled) {
      updateProgressUI(`🎉 រួចរាល់! បានទាញយកភាគ ${s} ដល់ ${e}`, 100, `បានរក្សាទុកក្នុង Downloads របស់ទូរស័ព្ទ (សរុប ${count} ភាគ)`);
      if (btnCancel) {
        btnCancel.textContent = 'បិទ';
        btnCancel.style.background = 'rgba(56, 189, 248, 0.2)';
        btnCancel.style.borderColor = 'rgba(56, 189, 248, 0.4)';
        btnCancel.style.color = '#38bdf8';
        btnCancel.onclick = () => { if (liveProgressCard) liveProgressCard.classList.remove('active'); };
      }
      setTimeout(() => {
        if (liveProgressCard) liveProgressCard.classList.remove('active');
      }, 7000);
    }
  };

  function updateProgressUI(title, pct, meta) {
    const titleEl = document.getElementById('progressTitle');
    const pctEl = document.getElementById('progressPercentage');
    const fillEl = document.getElementById('progressBarFill');
    const metaEl = document.getElementById('progressMeta');

    if (titleEl) titleEl.textContent = title;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (metaEl) metaEl.textContent = meta;
  }

  window.cancelActiveDownload = function () {
    if (state.activeDownload) {
      state.activeDownload.canceled = true;
      showToast('🛑 កំពុងបញ្ឈប់ការទាញយក...');
    }
  };

  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // Mobile Unique HWID Device Identity & Independent Licensing
  // --------------------------------------------------------------------------
  function getMobileDeviceId() {
    let id = null;
    try {
      id = localStorage.getItem('ps_mobile_device_id');
    } catch (_) {}

    // Check cookie
    if (!id || !id.startsWith('HG-M')) {
      try {
        const match = document.cookie.match(/(?:^|;\s*)ps_mobile_device_id=([^;]+)/);
        if (match && match[1] && match[1].startsWith('HG-M')) {
          id = match[1];
        }
      } catch (_) {}
    }

    // If still not found (e.g. fresh reinstall or cleared storage),
    // compute deterministic hardware fingerprint so the same phone ALWAYS recovers its exact same ID!
    if (!id || !id.startsWith('HG-M')) {
      try {
        let glInfo = '';
        try {
          const canvas = document.createElement('canvas');
          const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
          if (gl) {
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            if (ext) {
              glInfo = (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') + '~' + (gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '');
            }
          }
        } catch (_) {}

        const raw = [
          screen.width || 0,
          screen.height || 0,
          screen.colorDepth || 0,
          window.devicePixelRatio || 1,
          navigator.hardwareConcurrency || 2,
          navigator.platform || '',
          navigator.userAgent || '',
          glInfo
        ].join('|');

        let h1 = 0x811c9dc5;
        let h2 = 0x27d4eb2f;
        for (let i = 0; i < raw.length; i++) {
          const code = raw.charCodeAt(i);
          h1 = Math.imul(h1 ^ code, 0x01000193);
          h2 = Math.imul(h2 ^ (code << 1), 0x01000193);
        }
        const hex1 = ((h1 >>> 0) + 0x100000000).toString(16).substring(1).toUpperCase();
        const hex2 = ((h2 >>> 0) + 0x100000000).toString(16).substring(1).toUpperCase();
        const hex = (hex1 + hex2).substring(0, 11);
        id = `HG-M${hex.substring(0, 3)}-${hex.substring(3, 7)}-${hex.substring(7, 11)}`;
      } catch (_) {
        id = 'HG-MD80-31FE-A516';
      }

      // Persist across localStorage and 10-year Cookie
      try { localStorage.setItem('ps_mobile_device_id', id); } catch (_) {}
      try { document.cookie = `ps_mobile_device_id=${id}; path=/; max-age=315360000; SameSite=Lax`; } catch (_) {}
    }

    return id;
  }

  function getMobileModelName() {
    const ua = navigator.userAgent || '';
    let model = 'Mobile Device';
    if (/Android/i.test(ua)) {
      const match = ua.match(/Android[^;]+; ([^;)]+)\)/);
      if (match && match[1]) {
        model = match[1].replace(/Build\/.*/, '').trim();
      } else {
        model = 'Android Smartphone';
      }
    } else if (/iPhone/i.test(ua)) {
      model = 'Apple iPhone';
    } else if (/iPad/i.test(ua)) {
      model = 'Apple iPad';
    }
    return model;
  }

  function fallbackCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('✅ បាន Copy លេខកូដម៉ាស៊ីន: ' + text);
    } catch (_) {
      showToast('កូដម៉ាស៊ីន: ' + text);
    }
    document.body.removeChild(textarea);
  }

  function requireMobileLicense() {
    if (!state.license || !state.license.activated || (state.license.remaining_days <= 0 && !state.license.is_lifetime)) {
      openLicenseModal();
      showToast('🔒 ឧបករណ៍នេះមិនទាន់មាន License ឡើយ! សូមបញ្ចូល License Key (No License Key)', 4000);
      return false;
    }
    return true;
  }

  // --------------------------------------------------------------------------
  // Complete 40 App Color Themes (២៥ ពណ៌ចម្រុះ Gradient/Hologram + ១៥ ពណ៌ទោលប្រណិត)
  // --------------------------------------------------------------------------
  const THEME_LIST = [
    // 25 Blended Gradients, Rainbow & Hologram Themes
    { id: 'cyber_neon', name: '🌌 Cyber Neon (ខៀវ + អក្សរមាស)', dot: 'linear-gradient(135deg, #38bdf8, #fde047)', group: 'gradient' },
    { id: 'sunset_aura', name: '🌅 Sunset Aura (ទឹកក្រូច + អក្សរ Cyan)', dot: 'linear-gradient(135deg, #fb923c, #38bdf8)', group: 'gradient' },
    { id: 'aurora_diamond', name: '💎 Aurora Diamond (បៃតង + អក្សរផ្កាឈូក)', dot: 'linear-gradient(135deg, #10b981, #f472b6)', group: 'gradient' },
    { id: 'imperial_gold', name: '👑 Imperial Gold (មាស + អក្សរខៀវ)', dot: 'linear-gradient(135deg, #fde047, #60a5fa)', group: 'gradient' },
    { id: 'crimson_cyber', name: '🔥 Crimson Cyber (ក្រហម + អក្សរបៃតង Lime)', dot: 'linear-gradient(135deg, #ff2e63, #a3e635)', group: 'gradient' },
    { id: 'cosmic_galaxy', name: '🔮 Cosmic Galaxy (ស្វាយ + អក្សរ Peach)', dot: 'linear-gradient(135deg, #c084fc, #fb923c)', group: 'gradient' },
    { id: 'ocean_deep', name: '🌊 Ocean Deep (ខៀវសមុទ្រ + អក្សរមាស)', dot: 'linear-gradient(135deg, #00f2fe, #fde047)', group: 'gradient' },
    { id: 'sakura_bloom', name: '🌸 Sakura Bloom (ផ្កាឈូក + អក្សរ Jade)', dot: 'linear-gradient(135deg, #ff758c, #2dd4bf)', group: 'gradient' },
    { id: 'electric_lime', name: '⚡ Electric Lime (បៃតង Neon + អក្សរស្វាយ)', dot: 'linear-gradient(135deg, #a8ff78, #e879f9)', group: 'gradient' },
    { id: 'peach_sherbet', name: '🍑 Peach Sherbet (ផ្លែប៉េស + អក្សរខៀវ Ice)', dot: 'linear-gradient(135deg, #f97316, #38bdf8)', group: 'gradient' },
    { id: 'rainbow_prism', name: '🌈 Rainbow Prism (ឥន្ទធនូចម្រុះ ៧ពណ៌ | អក្សរមាស)', dot: 'linear-gradient(135deg, #ff007f, #f59e0b, #10b981, #38bdf8)', group: 'gradient' },
    { id: 'hologram_matrix', name: '🪩 Hologram Matrix (ពន្លឺចាំងចម្រុះ | អក្សរ Neon Cyan)', dot: 'linear-gradient(135deg, #a78bfa, #38bdf8, #34d399, #f472b6)', group: 'gradient' },
    { id: 'candy_pop', name: '🍭 Candy Pop (ស្ករគ្រាប់ផ្អែម ផ្កាឈូក+ខៀវ | អក្សរមាស)', dot: 'linear-gradient(135deg, #f43f5e, #ec4899, #38bdf8)', group: 'gradient' },
    { id: 'fire_ice', name: '🧊 Fire & Ice (ភ្លើងក្រហម + ទឹកកកខៀវ | អក្សរមាស)', dot: 'linear-gradient(135deg, #ef4444, #f97316, #38bdf8)', group: 'gradient' },
    { id: 'neon_tokyo', name: '🗼 Neon Tokyo (ស៊ីប៊័រតូក្យូ ស្វាយ+ផ្កាឈូក | អក្សរ Aqua)', dot: 'linear-gradient(135deg, #d946ef, #8b5cf6, #06b6d4)', group: 'gradient' },
    { id: 'dragon_emerald', name: '🐉 Dragon Emerald (ត្បូងមរកតនាគរាជ | អក្សរមាស)', dot: 'linear-gradient(135deg, #059669, #10b981, #6ee7b7)', group: 'gradient' },
    { id: 'volcano_lava', name: '🌋 Volcano Lava (កម្អែលភ្នំភ្លើង ក្រហម+ទឹកក្រូច | អក្សរមាស)', dot: 'linear-gradient(135deg, #dc2626, #ea580c, #f59e0b)', group: 'gradient' },
    { id: 'cyberpunk_2077', name: '🕹️ Cyberpunk (លឿងម៉ាស៊ីន + ខៀវស៊ីប៊័រ | អក្សរក្រហម)', dot: 'linear-gradient(135deg, #facc15, #eab308, #06b6d4)', group: 'gradient' },
    { id: 'midnight_amethyst', name: '🦄 Midnight Amethyst (ត្បូងស្វាយអធ្រាត្រ | អក្សរ Mint)', dot: 'linear-gradient(135deg, #7c3aed, #a855f7, #ec4899)', group: 'gradient' },
    { id: 'solar_flare', name: '☀️ Solar Flare (ពន្លឺព្រះអាទិត្យ មាស+ទឹកក្រូច | អក្សរខៀវ)', dot: 'linear-gradient(135deg, #f59e0b, #fbbf24, #f43f5e)', group: 'gradient' },
    { id: 'aurora_borealis', name: '🌌 Aurora Borealis (ពន្លឺប៉ូលខាងជើង ខៀវ+បៃតង | អក្សរ Rose)', dot: 'linear-gradient(135deg, #0284c7, #06b6d4, #10b981)', group: 'gradient' },
    { id: 'deep_nebula', name: '🛸 Deep Nebula (ពពកអវកាស ស្វាយជ្រៅ+ខៀវ | អក្សរមាស)', dot: 'linear-gradient(135deg, #4f46e5, #7c3aed, #c084fc)', group: 'gradient' },
    { id: 'rose_gold', name: '🥂 Rose Gold (មាសផ្កាឈូកប្រណិត | អក្សរ Sapphire)', dot: 'linear-gradient(135deg, #f43f5e, #fb7185, #fde047)', group: 'gradient' },
    { id: 'toxic_matrix', name: '☣️ Toxic Matrix (បៃតងជាតិពុល Neon | អក្សរ Hot Pink)', dot: 'linear-gradient(135deg, #84cc16, #22c55e, #14b8a6)', group: 'gradient' },
    { id: 'cotton_candy', name: '🧁 Cotton Candy (ស្ករសំឡីទន់ ខៀវ+ផ្កាឈូក | អក្សរមាស)', dot: 'linear-gradient(135deg, #93c5fd, #c4b5fd, #fbcfe8)', group: 'gradient' },

    // 15 Vibrant Solid Themes
    { id: 'blue', name: '🔷 Sky Blue (ខៀវ + អក្សរមាស Gold)', dot: '#38bdf8', group: 'solid' },
    { id: 'emerald', name: '🟢 Emerald Green (បៃតង + អក្សរ Rose Pink)', dot: '#10b981', group: 'solid' },
    { id: 'purple', name: '🟣 Electric Purple (ស្វាយ + អក្សរ Cyan)', dot: '#a855f7', group: 'solid' },
    { id: 'amber', name: '🟡 Amber Gold (មាស + អក្សរ Indigo Blue)', dot: '#f59e0b', group: 'solid' },
    { id: 'ruby_red', name: '🔴 Ruby Red (ក្រហម + អក្សរ Champagne Gold)', dot: '#e11d48', group: 'solid' },
    { id: 'hot_pink', name: '💖 Hot Pink (ផ្កាឈូក + អក្សរ Lime Mint)', dot: '#ec4899', group: 'solid' },
    { id: 'mint_cyan', name: '🌿 Mint Cyan (បៃតងជីអង្កាម + អក្សរ Tangerine)', dot: '#06b6d4', group: 'solid' },
    { id: 'tangerine', name: '🍊 Tangerine (ទឹកក្រូច + អក្សរ Sky Blue)', dot: '#ea580c', group: 'solid' },
    { id: 'silver', name: '⚪ Titanium Silver (ប្រាក់ + អក្សរមាស Aurora)', dot: '#e2e8f0', group: 'solid' },
    { id: 'midnight', name: '🖤 Midnight Stealth (ខ្មៅ + អក្សរ Electric Cyan)', dot: '#64748b', group: 'solid' },
    { id: 'cobalt_blue', name: '🌊 Cobalt Blue (ខៀវកូបាល់ជ្រៅ | អក្សរមាស)', dot: '#2563eb', group: 'solid' },
    { id: 'teal_marine', name: '🐬 Teal Marine (បៃតងសមុទ្រទឹករលក | អក្សរ Coral)', dot: '#0d9488', group: 'solid' },
    { id: 'crimson_blood', name: '🩸 Crimson Blood (ក្រហមឈាមជ្រៅ | អក្សរ Ice Cyan)', dot: '#b91c1c', group: 'solid' },
    { id: 'sunflower_yellow', name: '🌻 Sunflower Yellow (លឿងផ្កាឈូករ័ត្ន | អក្សរ Royal Blue)', dot: '#eab308', group: 'solid' },
    { id: 'violet_ultra', name: '🔮 Ultra Violet (ស្វាយជ្រៅអ៊ុលត្រា | អក្សរ Neon Lime)', dot: '#7c3aed', group: 'solid' }
  ];

  function renderHeaderChipCountdown() {
    if (!licenseChip) return;
    const lic = state.license || {};
    if (!lic.activated || (lic.remaining_days <= 0 && !lic.is_lifetime)) {
      licenseChip.className = 'license-chip unlicensed';
      licenseChip.innerHTML = '🔒 No Key';
      return;
    }

    licenseChip.className = 'license-chip';
    if (lic.is_lifetime) {
      licenseChip.innerHTML = '👑 ពេញមួយជីវិត';
      return;
    }

    let diffMs = 0;
    if (lic.expires_at) {
      diffMs = new Date(lic.expires_at).getTime() - Date.now();
    } else if (lic.remaining_days) {
      diffMs = lic.remaining_days * 86400000;
    }

    if (diffMs > 0) {
      const totalSec = Math.floor(diffMs / 1000);
      const d = Math.floor(totalSec / 86400);
      const h = Math.floor((totalSec % 86400) / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;

      if (d > 0) {
        // Includes Days, Hours, Minutes, AND live Seconds: "🟢 6ថ្ងៃ 22ម៉ 15ន 38វិ"
        licenseChip.innerHTML = `🟢 ${d}ថ្ងៃ ${h}ម៉ ${m}ន ${s}វិ`;
      } else if (h > 0) {
        // Under 24h: "🟢 22ម៉ 15ន 38វិ"
        licenseChip.innerHTML = `🟢 ${h}ម៉ ${m}ន ${s}វិ`;
      } else {
        // Under 1h: "🟢 15ន 38វិ"
        licenseChip.innerHTML = `🟢 ${m}ន ${s}វិ`;
      }
      return;
    }

    licenseChip.className = 'license-chip unlicensed';
    licenseChip.innerHTML = '🔒 ផុតកំណត់';
  }

  // Tapping the header chip:
  // - If unlicensed: Opens license modal ("បើអ្នកមិនទាន់មានឡាយសិនធីទេចុចទៅគឺត្រូវតែចូលទៅកន្លែង License")
  // - If licensed: Cycles through the 20 theme colors! ("បើអ្នកមានឡាយសិនឃីចុចទៅប្ដូរពណ៌")
  window.handleVipChipTap = function () {
    const lic = state.license || {};
    const isLicensed = lic.activated && (lic.remaining_days > 0 || lic.is_lifetime);

    if (!isLicensed) {
      openLicenseModal();
      showToast('🔒 សូមបញ្ចូល License Key ដើម្បីបើកដំណើរការ!', 3000);
      return;
    }

    const curAccent = document.documentElement.getAttribute('data-accent') || 'cyber_neon';
    let idx = THEME_LIST.findIndex(t => t.id === curAccent);
    if (idx < 0) idx = 0;
    const nextIdx = (idx + 1) % THEME_LIST.length;
    const nextTheme = THEME_LIST[nextIdx];

    setAccentColor(nextTheme.id);
    showToast(`🎨 ពណ៌: ${nextTheme.name} (${nextIdx + 1}/${THEME_LIST.length})`, 1800);
  };

  async function checkLicenseStatus() {
    try {
      const devId = getMobileDeviceId();
      const model = getMobileModelName();
      const res = await fetch(`/api/license/status?device_id=${encodeURIComponent(devId)}&device_type=mobile&model=${encodeURIComponent(model)}`);
      const data = await res.json();
      state.license = data;

      const authScreen = document.getElementById('mobileAuthScreen');
      const mainScreen = document.getElementById('mobileMainScreen');
      const authHwidDisplay = document.getElementById('authHwidDisplay');
      const modalDeviceId = document.getElementById('modalDeviceId');

      if (authHwidDisplay) authHwidDisplay.textContent = devId;
      if (modalDeviceId) modalDeviceId.textContent = devId;

      const isLicensed = Boolean(data && data.activated && (data.remaining_days > 0 || data.is_lifetime));
      const rememberPref = localStorage.getItem('ps_mobile_remember_license');
      const isRemembered = (rememberPref === '1');
      const isSessionUnlocked = sessionStorage.getItem('ps_mobile_session_unlocked') === '1';

      const rememberCheck = document.getElementById('authRememberCheck');
      if (rememberCheck && rememberPref !== null) {
        rememberCheck.checked = isRemembered;
      }

      // If license expired or revoked, purge local remember tokens
      if (!isLicensed) {
        localStorage.removeItem('ps_mobile_remember_license');
        localStorage.removeItem('ps_mobile_saved_key');
        sessionStorage.removeItem('ps_mobile_session_unlocked');
      }

      // AUTO-ENTER RULE:
      // 1. If licensed AND user checked "Remember License" -> Auto-enter without entering key!
      // 2. If licensed AND unlocked in current session -> Keep unlocked!
      // 3. If licensed BUT user did NOT check Remember -> Require entering key on next app launch!
      // 4. If unlicensed or expired -> ALWAYS show Auth Screen!
      if (isLicensed && (isRemembered || isSessionUnlocked)) {
        if (authScreen) authScreen.style.display = 'none';
        if (mainScreen) mainScreen.style.display = 'block';
      } else {
        if (authScreen) authScreen.style.display = 'flex';
        if (mainScreen) mainScreen.style.display = 'none';

        const savedKey = localStorage.getItem('ps_mobile_saved_key') || '';
        const keyInput = document.getElementById('authKeyInput');
        if (keyInput && !keyInput.value && savedKey) {
          keyInput.value = savedKey;
        }
      }

      renderHeaderChipCountdown();
      return isLicensed;
    } catch (_) {
      return false;
    }
  }

  window.pasteLicenseKeyToAuthInput = async function () {
    const input = document.getElementById('authKeyInput');
    await performUniversalPaste(input, false);
  };

  window.activateFromAuthScreen = async function () {
    const keyInput = document.getElementById('authKeyInput');
    const key = (keyInput ? keyInput.value : '').trim();
    if (!key) {
      showToast('⚠️ សូមវាយបញ្ចូល License Key!');
      if (keyInput) keyInput.focus();
      return;
    }

    // Admin Mode Secret Codes: 3333, admin33, PS-ADMIN-2026
    if (key === '3333' || key.toLowerCase() === 'admin33' || key.toUpperCase() === 'PS-ADMIN-2026') {
      toggleAdminMode(true);
      showToast('👑 បានបើកសិទ្ធិ PS Admin KeyGen Pro!');
      if (keyInput) keyInput.value = '';
      return;
    }

    try {
      const devId = getMobileDeviceId();
      const model = getMobileModelName();
      showToast('⏳ កំពុងផ្ទៀងផ្ទាត់ License Key...', 2000);
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          targetDeviceId: devId,
          computerName: model
        })
      });
      const data = await res.json();
      if (data.success) {
        // Handle Remember License Checkbox
        const rememberCheck = document.getElementById('authRememberCheck');
        const shouldRemember = rememberCheck ? rememberCheck.checked : true;
        if (shouldRemember) {
          localStorage.setItem('ps_mobile_remember_license', '1');
          localStorage.setItem('ps_mobile_saved_key', key);
        } else {
          localStorage.setItem('ps_mobile_remember_license', '0');
          localStorage.removeItem('ps_mobile_saved_key');
        }
        sessionStorage.setItem('ps_mobile_session_unlocked', '1');

        const daysText = data.is_lifetime ? 'ពេញមួយជីវិត (Lifetime)' : `${data.remaining_days || 0} ថ្ងៃ`;
        showToast(`🎉 បាន Activate ជោគជ័យ! សុពលភាព: ${daysText}`, 3500);
        if (keyInput) keyInput.value = '';
        await checkLicenseStatus();
        loadPlatformFeed(state.currentPlatform, true, true);
      } else {
        showToast('❌ ' + (data.error || 'License Key មិនត្រឹមត្រូវ!'), 4000);
      }
    } catch (e) {
      showToast('❌ Error: ' + e.message);
    }
  };

  let _vipCountdownTimer = null;

  function renderVipCountdown() {
    const lic = state.license || {};
    if (!lic.activated || (lic.remaining_days <= 0 && !lic.is_lifetime)) return;

    const countBox = document.getElementById('vipCountdownContainer');
    const lifetimeBox = document.getElementById('vipLifetimeNotice');

    if (lic.is_lifetime) {
      if (lifetimeBox) lifetimeBox.style.display = 'block';
      if (countBox) countBox.style.display = 'none';
      return;
    }

    if (countBox) countBox.style.display = 'block';
    if (lifetimeBox) lifetimeBox.style.display = 'none';

    // Calculate exact milliseconds remaining
    let diffMs = 0;
    if (lic.expires_at) {
      diffMs = new Date(lic.expires_at).getTime() - Date.now();
    } else if (lic.remaining_days) {
      diffMs = lic.remaining_days * 86400000;
    }

    if (diffMs <= 0) {
      const elDays = document.getElementById('cntDays');
      const elHours = document.getElementById('cntHours');
      const elMins = document.getElementById('cntMins');
      const elSecs = document.getElementById('cntSecs');
      if (elDays) elDays.textContent = '00';
      if (elHours) elHours.textContent = '00';
      if (elMins) elMins.textContent = '00';
      if (elSecs) elSecs.textContent = '00';
      return;
    }

    const totalSec = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    const elDays = document.getElementById('cntDays');
    const elHours = document.getElementById('cntHours');
    const elMins = document.getElementById('cntMins');
    const elSecs = document.getElementById('cntSecs');

    if (elDays) elDays.textContent = String(days).padStart(2, '0');
    if (elHours) elHours.textContent = String(hours).padStart(2, '0');
    if (elMins) elMins.textContent = String(mins).padStart(2, '0');
    if (elSecs) elSecs.textContent = String(secs).padStart(2, '0');
  }

  window.openLicenseModal = async function () {
    const activeSec = document.getElementById('licenseActiveSection');
    const unlicensedSec = document.getElementById('licenseUnlicensedSection');
    const modalTitle = document.getElementById('licenseModalTitle');
    const custNameEl = document.getElementById('vipCustomerName');

    function updateModalView(lic) {
      if (lic && lic.activated && (lic.remaining_days > 0 || lic.is_lifetime)) {
        // ACTIVE VIP USER: Show live countdown & customer info, HIDE Key input field!
        if (activeSec) activeSec.style.display = 'flex';
        if (unlicensedSec) unlicensedSec.style.display = 'none';
        if (modalTitle) modalTitle.innerHTML = '👑 ស្ថានភាព License VIP';
        if (custNameEl) {
          const name = lic.custom_name ? String(lic.custom_name).trim() : '';
          custNameEl.innerHTML = name ? `👑 អតិថិជន VIP (${name})` : `👑 អតិថិជន VIP (VIP Active)`;
        }

        renderVipCountdown();
        if (_vipCountdownTimer) clearInterval(_vipCountdownTimer);
        _vipCountdownTimer = setInterval(renderVipCountdown, 1000);
      } else {
        // UNLICENSED USER: Show Device ID & Key input field
        if (activeSec) activeSec.style.display = 'none';
        if (unlicensedSec) unlicensedSec.style.display = 'flex';
        if (modalTitle) modalTitle.innerHTML = '🔒 ស្ថានភាព License VIP';
        if (_vipCountdownTimer) clearInterval(_vipCountdownTimer);
      }
    }

    // 1. Render immediately from local state
    updateModalView(state.license || {});
    if (licenseModal) licenseModal.classList.add('active');

    // 2. Fetch fresh status from server/Render Cloud so Telegram changes show instantly!
    try {
      await checkLicenseStatus();
      updateModalView(state.license || {});
    } catch (_) {}
  };

  window.closeLicenseModal = function () {
    if (_vipCountdownTimer) {
      clearInterval(_vipCountdownTimer);
      _vipCountdownTimer = null;
    }
    if (licenseModal) licenseModal.classList.remove('active');
  };

  window.copyDeviceId = function () {
    const devId = getMobileDeviceId();
    if (devId) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(devId).then(() => {
          showToast('✅ បាន Copy លេខកូដម៉ាស៊ីន: ' + devId);
        }).catch(() => {
          fallbackCopyText(devId);
        });
      } else {
        fallbackCopyText(devId);
      }
    }
  };

  // --------------------------------------------------------------------------
  // SCREEN 3: DOWNLOADS VIEW ENGINE (Screenshot 3 Style)
  // --------------------------------------------------------------------------
  let _currentDlTab = 'done'; // 'active' or 'done'

  window.openDownloadsView = function () {
    const mainScreen = document.getElementById('mobileMainScreen');
    const dlScreen = document.getElementById('mobileDownloadsScreen');
    if (mainScreen) mainScreen.style.display = 'none';
    if (dlScreen) dlScreen.style.display = 'flex';
    renderDownloadsList();
  };

  window.closeDownloadsView = function () {
    const mainScreen = document.getElementById('mobileMainScreen');
    const dlScreen = document.getElementById('mobileDownloadsScreen');
    if (dlScreen) dlScreen.style.display = 'none';
    if (mainScreen) mainScreen.style.display = 'block';
  };

  window.switchDownloadsTab = function (tab) {
    _currentDlTab = tab;
    const tabActive = document.getElementById('tabDlActive');
    const tabDone = document.getElementById('tabDlDone');
    if (tabActive) tabActive.classList.toggle('active', tab === 'active');
    if (tabDone) tabDone.classList.toggle('active', tab === 'done');
    renderDownloadsList();
  };

  window.toggleDlCardAccordion = function (idx) {
    const body = document.getElementById(`dlAccordionBody_${idx}`);
    const arrow = document.getElementById(`dlAccordionArrow_${idx}`);
    if (body) {
      const isHidden = (body.style.display === 'none' || getComputedStyle(body).display === 'none');
      body.style.display = isHidden ? 'block' : 'none';
      if (arrow) arrow.textContent = isHidden ? '⌃' : '⌄';
    }
  };

  // --------------------------------------------------------------------------
  // Native Android Folder Picker Modal Controller (Screenshot Style: ឯកសារទាំងអស់)
  // --------------------------------------------------------------------------
  const _SYSTEM_ANDROID_FOLDERS = [
    { name: 'Alarms', items: 0, date: '1 មករា 2025' },
    { name: 'Android', items: 4, date: '22 ឧសភា' },
    { name: 'Audiobooks', items: 0, date: '1 មករា 2025' },
    { name: 'bytedance', items: 1, date: '21 ឧសភា' },
    { name: 'Browser', items: 1, date: '2 កញ្ញា' },
    { name: 'ColorOS', items: 1, date: '10 មិថុនា' },
    { name: 'DCIM', items: 5, date: '28 កញ្ញា' },
    { name: 'Documents', items: 1, date: '13 កញ្ញា' },
    { name: 'Download', items: 68, date: '21 តុលា' },
    { name: 'Everphoto', items: 1, date: '21 ឧសភា' },
    { name: 'front', items: 2, date: '15 សីហា' },
    { name: 'Movies', items: 3, date: '20 តុលា' },
    { name: 'Music', items: 0, date: '10 កក្កដា' },
    { name: 'Pictures', items: 12, date: '18 តុលា' },
    { name: 'Podcasts', items: 0, date: '1 មករា 2025' },
    { name: 'PS_Download', items: 10, date: '22 តុលា' },
    { name: 'Ringtones', items: 1, date: '5 កុម្ភៈ' },
    { name: 'Tencent', items: 2, date: '18 មិថុនា' }
  ];

  let _pickerCurrentSelectedPath = localStorage.getItem('ps_mobile_storage_path') || '/storage/emulated/0/Download';
  let _folderFilterKeyword = '';

  window.openFolderPickerModal = function () {
    const modal = document.getElementById('folderPickerModal');
    if (!modal) return;
    _pickerCurrentSelectedPath = localStorage.getItem('ps_mobile_storage_path') || '/storage/emulated/0/Download';
    _folderFilterKeyword = '';
    renderFolderPickerList();
    modal.style.display = 'flex';
  };

  window.closeFolderPickerModal = function () {
    const modal = document.getElementById('folderPickerModal');
    if (modal) modal.style.display = 'none';
  };

  window.selectFolderItem = function (folderName) {
    _pickerCurrentSelectedPath = `/storage/emulated/0/${folderName}`;
    const pathText = document.getElementById('pickerChosenPathText');
    if (pathText) pathText.textContent = _pickerCurrentSelectedPath;

    document.querySelectorAll('.picker-folder-item').forEach(el => {
      const isSel = (el.dataset.name === folderName);
      el.classList.toggle('selected', isSel);
      const arrow = el.querySelector('.picker-folder-arrow');
      if (arrow) arrow.textContent = isSel ? '✓' : '›';
    });
  };

  window.confirmFolderPicker = function () {
    const chosen = _pickerCurrentSelectedPath || '/storage/emulated/0/Download';
    localStorage.setItem('ps_mobile_storage_path', chosen);
    const disp = document.getElementById('dlStoragePathDisplay');
    if (disp) disp.textContent = chosen;
    closeFolderPickerModal();
    showToast(`✅ បានជ្រើសរើសទីតាំង: ${chosen}`);
  };

  window.addNewFolderPrompt = function () {
    const name = window.prompt('📁 វាយបញ្ចូលឈ្មោះ Folder ថ្មី៖', 'PS_Download');
    if (name && name.trim()) {
      const clean = name.trim().replace(/[\\/*?:"<>|]/g, '_');
      const exists = _SYSTEM_ANDROID_FOLDERS.find(f => f.name.toLowerCase() === clean.toLowerCase());
      if (!exists) {
        _SYSTEM_ANDROID_FOLDERS.unshift({ name: clean, items: 0, date: 'ទើបបង្កើត' });
      }
      selectFolderItem(clean);
      renderFolderPickerList();
      showToast(`📁 បានបង្កើត Folder "${clean}"!`);
    }
  };

  window.focusFolderSearch = function () {
    const kw = window.prompt('🔍 វាយឈ្មោះ Folder ដើម្បីស្វែងរក៖', '');
    if (kw !== null) {
      _folderFilterKeyword = kw.trim().toLowerCase();
      renderFolderPickerList();
    }
  };

  function renderFolderPickerList() {
    const container = document.getElementById('pickerFolderList');
    const pathText = document.getElementById('pickerChosenPathText');
    const countSub = document.getElementById('pickerItemCountSub');
    if (pathText) pathText.textContent = _pickerCurrentSelectedPath;

    let list = _SYSTEM_ANDROID_FOLDERS;
    if (_folderFilterKeyword) {
      list = list.filter(f => f.name.toLowerCase().includes(_folderFilterKeyword));
    }

    if (countSub) countSub.textContent = `ធាតុសរុប ${list.length}`;

    if (!container) return;

    const curFolder = _pickerCurrentSelectedPath.split('/').pop() || 'Download';

    container.innerHTML = list.map(f => {
      const isSel = (f.name.toLowerCase() === curFolder.toLowerCase());
      return `
        <div class="picker-folder-item ${isSel ? 'selected' : ''}" data-name="${escapeAttr(f.name)}" onclick="selectFolderItem('${escapeAttr(f.name)}')">
          <div class="picker-folder-icon">
            <svg viewBox="0 0 24 24">
              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
            </svg>
          </div>
          <div class="picker-folder-details">
            <div class="picker-folder-name">${escapeHtml(f.name)}</div>
            <div class="picker-folder-meta">ធាតុ ${f.items}  |  ${escapeHtml(f.date)}</div>
          </div>
          <div class="picker-folder-arrow">${isSel ? '✓' : '›'}</div>
        </div>
      `;
    }).join('');
  }

  window.promptChangeStorageLocation = function () {
    openFolderPickerModal();
  };

  window.cleanAllFinishedDownloads = function () {
    if (confirm('តើអ្នកពិតជាចង់លុបប្រវត្តិទាញយកទាំងអស់មែនទេ?')) {
      localStorage.setItem('ps_mobile_downloads_list', JSON.stringify([]));
      renderDownloadsList();
      showToast('🗑️ បានលុបប្រវត្តិទាញយកទាំងអស់រួចរាល់!');
    }
  };

  window.playDownloadedEpisode = function (title, url, epStr) {
    if (!url) {
      showToast('⚠️ វីដេអូនេះត្រូវបានរក្សាទុកក្នុង Phone Downloads រួចរាល់!');
      return;
    }
    openDramaSheet();
    const videoPlayer = document.getElementById('sheetVideoPlayer');
    const sheetTitle = document.getElementById('sheetTitle');
    if (sheetTitle) sheetTitle.textContent = `${title} (${epStr})`;
    if (videoPlayer) {
      videoPlayer.src = url;
      videoPlayer.play().catch(() => {});
    }
  };

  window.playFirstEpisode = function (idx) {
    const items = getSavedDownloads();
    const listToRender = (_currentDlTab === 'active') ? items.filter(it => it.status === 'downloading') : items.filter(it => it.status !== 'downloading');
    const drama = listToRender[idx];
    if (drama && drama.episodes && drama.episodes.length > 0) {
      const first = drama.episodes[0];
      playDownloadedEpisode(drama.title_km || drama.title, first.url, first.epStr);
    }
  };

  window.deleteDramaItem = function (idx) {
    const items = getSavedDownloads();
    const listToRender = (_currentDlTab === 'active') ? items.filter(it => it.status === 'downloading') : items.filter(it => it.status !== 'downloading');
    const target = listToRender[idx];
    if (target) {
      const updated = items.filter(it => it.id !== target.id);
      saveDownloadsList(updated);
      renderDownloadsList();
      showToast('🗑️ បានលុបរឿងចេញពីបញ្ជីទាញយក');
    }
  };

  window.deleteEpisodeItem = function (dramaIdx, epIdx) {
    const items = getSavedDownloads();
    const listToRender = (_currentDlTab === 'active') ? items.filter(it => it.status === 'downloading') : items.filter(it => it.status !== 'downloading');
    const drama = listToRender[dramaIdx];
    if (drama && drama.episodes) {
      drama.episodes.splice(epIdx, 1);
      if (drama.episodes.length === 0) {
        return deleteDramaItem(dramaIdx);
      }
      saveDownloadsList(items);
      renderDownloadsList();
      showToast('🗑️ បានលុបភាគនេះរួចរាល់');
    }
  };

  window.copyEpisodeLink = function (url) {
    if (url) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          showToast('📋 បានចម្លង Link វីដេអូរួចរាល់!');
        }).catch(() => fallbackCopyText(url));
      } else {
        fallbackCopyText(url);
      }
    }
  };

  function getSavedDownloads() {
    try {
      const raw = localStorage.getItem('ps_mobile_downloads_list');
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    return [];
  }

  function saveDownloadsList(list) {
    try {
      localStorage.setItem('ps_mobile_downloads_list', JSON.stringify(list));
    } catch (_) {}
  }

  function renderDownloadsList() {
    const container = document.getElementById('dlItemsContainer');
    const badgeActive = document.getElementById('dlActiveCountBadge');
    const badgeDone = document.getElementById('dlDoneCountBadge');
    const topBadge = document.getElementById('topDlBadge');
    const storageDisplay = document.getElementById('dlStoragePathDisplay');

    const savedPath = localStorage.getItem('ps_mobile_storage_path') || '/storage/emulated/0/Download/PS_Download';
    if (storageDisplay) storageDisplay.textContent = savedPath;

    let items = getSavedDownloads();

    const activeItems = items.filter(it => it.status === 'downloading');
    const doneItems = items.filter(it => it.status !== 'downloading');

    if (badgeActive) badgeActive.textContent = `(${activeItems.length})`;
    if (badgeDone) badgeDone.textContent = `(${doneItems.length})`;
    if (topBadge) topBadge.textContent = String(doneItems.length);

    if (!container) return;

    const listToRender = (_currentDlTab === 'active') ? activeItems : doneItems;

    if (listToRender.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 48px 20px; color: #64748b;">
          <div style="font-size: 2.8rem; margin-bottom: 12px;">📁</div>
          <p style="font-size: 0.95rem; color: #94a3b8; margin: 0 0 6px 0;">មិនទាន់មានវីដេអូ${_currentDlTab === 'active' ? 'កំពុងទាញយក' : 'បានបញ្ចប់'}ឡើយ</p>
          <p style="font-size: 0.8rem; color: #64748b; margin: 0;">រាល់វីដេអូដែលអ្នកទាញយក នឹងបង្ហាញនៅទីនេះទាំងអស់</p>
        </div>
      `;
      return;
    }

    container.innerHTML = listToRender.map((drama, idx) => {
      const dramaTitle = drama.title_km || drama.title || 'Drama';
      const origTitle = drama.title || dramaTitle;
      const eps = drama.episodes || [];
      const epsCount = eps.length || drama.episodesCount || 1;
      const totalSize = drama.totalSize || `${(epsCount * 6.5).toFixed(1)} MB`;
      const folderName = drama.folder || drama.title || 'Drama';
      const cover = drama.cover || getMobilePosterPlaceholder(dramaTitle, 'PS Video');

      const episodesHtml = eps.map((ep, epIdx) => {
        const epStr = ep.epStr || `EP${String(ep.ep || epIdx + 1).padStart(2, '0')}`;
        const epSize = ep.size || '9.4 MB';
        const epFilename = ep.filename || `${origTitle}_${epStr}.mp4`;
        const epUrl = ep.url || '';

        return `
          <div class="dl-ep-row">
            <span class="dl-ep-badge">${escapeHtml(epStr)}</span>
            <div class="dl-ep-info">
              <span class="dl-ep-size">${escapeHtml(epSize)}</span>
              <span class="dl-ep-name" title="${escapeHtml(epFilename)}">${escapeHtml(epFilename)}</span>
            </div>
            <div class="dl-ep-actions">
              <button type="button" class="btn-ep-play-circle" onclick="playDownloadedEpisode('${escapeAttr(dramaTitle)}', '${escapeAttr(epUrl)}', '${escapeAttr(epStr)}')" title="ចាក់វីដេអូ">
                ▶
              </button>
              <button type="button" class="btn-ep-icon-action" onclick="copyEpisodeLink('${escapeAttr(epUrl)}')" title="Copy Link">
                🔗
              </button>
              <button type="button" class="btn-ep-icon-action" onclick="deleteEpisodeItem(${idx}, ${epIdx})" title="លុប">
                🗑️
              </button>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="dl-drama-accordion-card">
          <div class="dl-card-summary">
            <img class="dl-summary-poster" src="${escapeAttr(cover)}" alt="${escapeHtml(dramaTitle)}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='${getMobilePosterPlaceholder(dramaTitle, 'PS Video')}';">
            <div class="dl-summary-details">
              <div class="dl-summary-title">${escapeHtml(dramaTitle)}</div>
              <div class="dl-summary-stats">${epsCount} ភាគ • ${escapeHtml(totalSize)}</div>
              <div class="dl-summary-folder">📁 ${escapeHtml(folderName)}</div>
            </div>
            <button type="button" class="btn-accordion-toggle" onclick="toggleDlCardAccordion(${idx})">
              <span>👁️ មើលភាគ (${epsCount})</span>
              <span id="dlAccordionArrow_${idx}">⌃</span>
            </button>
          </div>

          <div class="dl-accordion-body" id="dlAccordionBody_${idx}">
            <div class="dl-accordion-subbar">
              <span class="dl-subbar-count">ភាគទាំងអស់ (${epsCount})</span>
              <div style="display: flex; gap: 8px; align-items: center;">
                <button type="button" class="btn-play-first-ep" onclick="playFirstEpisode(${idx})">
                  ▶ ចាក់ភាគទី ១
                </button>
                <button type="button" class="btn-ep-icon-action" onclick="deleteDramaItem(${idx})" title="លុបរឿងនេះ">
                  🗑️
                </button>
              </div>
            </div>
            <div class="dl-episodes-list">
              ${episodesHtml}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // --------------------------------------------------------------------------
  // Admin Mode & Mobile Key Generator Engine
  // --------------------------------------------------------------------------
  let _selectedAdminDays = 7;
  let _generatedAdminKey = '';
  let _logoTapCount = 0;
  let _logoTapTimer = null;

  window.handleBrandTap = function () {
    _logoTapCount++;
    if (_logoTapTimer) clearTimeout(_logoTapTimer);
    _logoTapTimer = setTimeout(() => { _logoTapCount = 0; }, 2500);
    if (_logoTapCount >= 5) {
      _logoTapCount = 0;
      openLicenseModal();
      toggleAdminMode(true);
      showToast('👑 បានបើកសិទ្ធិ PS Admin KeyGen Pro!');
    }
  };

  window.toggleAdminMode = function (show) {
    const panel = document.getElementById('adminKeyGenPanel');
    if (panel) {
      panel.style.display = show ? 'block' : 'none';
    }
    if (show) {
      try { localStorage.setItem('ps_admin_mode', '1'); } catch (_) {}
    } else {
      try { localStorage.removeItem('ps_admin_mode'); } catch (_) {}
      showToast('🔒 បានចាកចេញពី Admin Mode');
    }
  };

  window.selectAdminDuration = function (days, btn) {
    _selectedAdminDays = parseInt(days, 10);
    document.querySelectorAll('.btn-admin-dur').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  };

  window.pasteCustomerDevId = async function () {
    try {
      let text = '';
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }
      text = (text || '').trim();
      const input = document.getElementById('adminCustDevId');
      if (input && text) {
        input.value = text;
        showToast('📋 បាន Paste: ' + text);
      } else {
        showToast('ក្តារតម្កល់ទទេ (សូមចុចសង្កត់ដើម្បី Paste)');
      }
    } catch (_) {
      showToast('សូមចុចសង្កត់ដើម្បី Paste កូដម៉ាស៊ីនភ្ញៀវ');
    }
  };

  window.adminExecuteAutoAuthorize = async function () {
    const devIdInput = document.getElementById('adminCustDevId');
    const nameInput = document.getElementById('adminCustName');
    const custId = (devIdInput ? devIdInput.value : '').trim().toUpperCase();
    const custName = (nameInput ? nameInput.value : '').trim();

    if (!custId) {
      return showToast('⚠️ សូមបញ្ចូលលេខកូដម៉ាស៊ីនភ្ញៀវ (Device ID)');
    }

    showToast('⏳ កំពុងដំណើរការ Auto-Unlock...');
    try {
      const res = await fetch('/api/license/admin/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: custId,
          days: _selectedAdminDays,
          customName: custName
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`🎉 ជោគជ័យ! បានបើកសោរជូនម៉ាស៊ីន ${custId} ចំនួន ${_selectedAdminDays === 0 ? 'ពេញមួយជីវិត' : _selectedAdminDays + ' ថ្ងៃ'}`);
        const resultBox = document.getElementById('adminGenResultBox');
        const keyText = document.getElementById('adminGenKeyText');
        _generatedAdminKey = data.key || '';
        if (resultBox && keyText && _generatedAdminKey) {
          resultBox.style.display = 'block';
          keyText.textContent = _generatedAdminKey;
        }
      } else {
        showToast('❌ បរាជ័យ: ' + (data.error || 'មិនអាចបើកសោរបាន'));
      }
    } catch (e) {
      showToast('❌ Error: ' + e.message);
    }
  };

  window.adminExecuteGenerateKey = async function () {
    const devIdInput = document.getElementById('adminCustDevId');
    const nameInput = document.getElementById('adminCustName');
    const custId = (devIdInput ? devIdInput.value : '').trim().toUpperCase();
    const custName = (nameInput ? nameInput.value : '').trim();

    if (!custId) {
      return showToast('⚠️ សូមបញ្ចូលលេខកូដម៉ាស៊ីនភ្ញៀវ (Device ID)');
    }

    showToast('⏳ កំពុងបង្កើត License Key...');
    try {
      const res = await fetch('/api/license/admin/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: custId,
          days: _selectedAdminDays,
          durationValue: _selectedAdminDays,
          unit: 'days'
        })
      });
      const data = await res.json();
      if (data.success && data.key) {
        _generatedAdminKey = data.key;
        const resultBox = document.getElementById('adminGenResultBox');
        const keyText = document.getElementById('adminGenKeyText');
        if (resultBox && keyText) {
          resultBox.style.display = 'block';
          keyText.textContent = _generatedAdminKey;
        }
        showToast('🎉 បានបង្កើត Key ជោគជ័យ: ' + _generatedAdminKey);
      } else {
        showToast('❌ បរាជ័យក្នុងការបង្កើត Key');
      }
    } catch (e) {
      showToast('❌ Error: ' + e.message);
    }
  };

  window.copyAdminGeneratedKey = function () {
    if (!_generatedAdminKey) return;
    const nameInput = document.getElementById('adminCustName');
    const custName = (nameInput ? nameInput.value : '').trim();
    const durLabel = _selectedAdminDays === 0 ? 'ពេញមួយជីវិត (Lifetime VIP)' : `${_selectedAdminDays} ថ្ងៃ`;
    const readyMsg = `🎉 ជំរាបសួរ ${custName ? custName + ' ' : ''}បាទ!\nនេះជា License Key របស់អ្នក:\n\n🔑 License Key: ${_generatedAdminKey}\n⏳ សុពលភាព: ${durLabel}\n\n👉 សូម Copy កូដខាងលើ រួចចូលកម្មវិធីចុច Activate ជាការស្រេច។ អរគុណច្រើនបាទ!`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(readyMsg).then(() => {
        showToast('✅ បានចម្លងសារ Telegram រួចរាល់! អាចផ្ញើជូនភ្ញៀវបានភ្លាម');
      }).catch(() => {
        fallbackCopyText(_generatedAdminKey);
      });
    } else {
      fallbackCopyText(_generatedAdminKey);
    }
  };

  window.activateKey = async function () {
    const keyInput = document.getElementById('licenseKeyInput');
    const key = (keyInput ? keyInput.value : '').trim();
    if (!key) return showToast('⚠️ សូមវាយបញ្ចូល License Key');

    // Admin Mode Secret Codes: 3333, admin33, PS-ADMIN-2026
    if (key === '3333' || key.toLowerCase() === 'admin33' || key.toUpperCase() === 'PS-ADMIN-2026') {
      toggleAdminMode(true);
      showToast('👑 បានបើកសិទ្ធិ PS Admin KeyGen Pro!');
      if (keyInput) keyInput.value = '';
      return;
    }

    try {
      const devId = getMobileDeviceId();
      const model = getMobileModelName();
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          targetDeviceId: devId,
          computerName: model
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('🎉 បានបើកសិទ្ធិ License ដោយជោគជ័យ!');
        closeLicenseModal();
        checkLicenseStatus();
      } else {
        showToast('❌ ' + (data.error || 'License Key មិនត្រឹមត្រូវ'));
      }
    } catch (e) {
      showToast('❌ Error: ' + e.message);
    }
  };

  // --------------------------------------------------------------------------
  // Utilities & Toast Notifications
  // --------------------------------------------------------------------------
  function showToast(msg, duration = 3000) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast-item';
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 300);
    }, duration);
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

  function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // --------------------------------------------------------------------------
  // PWA (Progressive Web App) Install Engine
  // --------------------------------------------------------------------------
  let _deferredPrompt = null;
  const pwaBanner = document.getElementById('pwaInstallBanner');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPrompt = e;
    if (pwaBanner && !sessionStorage.getItem('pwa_dismissed')) {
      pwaBanner.style.display = 'flex';
    }
  });

  window.triggerPwaInstall = async function () {
    if (_deferredPrompt) {
      _deferredPrompt.prompt();
      const choiceResult = await _deferredPrompt.userChoice;
      if (choiceResult && choiceResult.outcome === 'accepted') {
        showToast('🎉 កំពុងដំឡើងកម្មវិធីលើទូរសព្ទដៃ...', 4000);
      }
      _deferredPrompt = null;
      if (pwaBanner) pwaBanner.style.display = 'none';
    } else {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      if (isIOS) {
        alert('📲 របៀបដំឡើងលើ iPhone / iPad (Safari)៖\n\n1. ចុចប៊ូតុង Share (ចែករំលែក ⬆️) នៅបាតក្រោម\n2. អូសចុះក្រោម រួចជ្រើសរើស "Add to Home Screen (➕ បន្ថែមទៅអេក្រង់ដើម)"\n3. ចុច "Add" ដើម្បីដំឡើង');
      } else {
        alert('📲 របៀបដំឡើងជា App លើ Android (Chrome)៖\n\n1. ចុចសញ្ញាចុចបី (⋮) នៅជ្រុងខាងស្តាំលើនៃ Chrome\n2. ជ្រើសរើស "Add to Home screen" ឬ "Install app"\n3. កម្មវិធីនឹងលោតចេញជា App លើអេក្រង់ទូរសព្ទ!');
      }
    }
  };

  window.dismissPwaInstall = function () {
    if (pwaBanner) pwaBanner.style.display = 'none';
    try { sessionStorage.setItem('pwa_dismissed', '1'); } catch (_) {}
  };

  // --------------------------------------------------------------------------
  // Mobile Settings & Software Updater Engine (ស៊ីធី & Update ប្រព័ន្ធ)
  // --------------------------------------------------------------------------
  const settingsModal = document.getElementById('mobileSettingsModal');
  let _hasPendingUpdate = false;
  let _latestVersionNumber = '3.3.0';

  async function checkMobileUpdateStatus() {
    try {
      const res = await fetch(`/api/update/check?_t=${Date.now()}`);
      const data = await res.json();
      if (data && data.has_update) {
        _hasPendingUpdate = true;
        _latestVersionNumber = data.latest_version || '3.3.1';
      } else {
        _hasPendingUpdate = false;
      }
    } catch (_) {
      _hasPendingUpdate = false;
    }

    // Allow URL trigger for testing: /m?update=1
    try {
      if (new URLSearchParams(window.location.search).get('update') === '1') {
        _hasPendingUpdate = true;
        _latestVersionNumber = '3.3.1';
      }
    } catch (_) {}

    renderMobileUpdateUI();
  }

  function renderMobileUpdateUI() {
    const dot = document.getElementById('settingsUpdateDot');
    const updateBox = document.getElementById('mobileUpdateBox');
    const icon = document.getElementById('mobileUpdateIcon');
    const title = document.getElementById('mobileUpdateTitle');
    const sub = document.getElementById('mobileUpdateSub');
    const btn = document.getElementById('mobileUpdateActionBtn');

    if (dot) {
      dot.style.display = _hasPendingUpdate ? 'block' : 'none';
    }

    if (!updateBox) return;

    if (_hasPendingUpdate) {
      // Glow and active when update IS available!
      updateBox.style.opacity = '1';
      updateBox.style.pointerEvents = 'auto';
      updateBox.style.cursor = 'pointer';
      updateBox.style.background = 'linear-gradient(135deg, rgba(2, 132, 199, 0.28), rgba(56, 189, 248, 0.2))';
      updateBox.style.borderColor = '#38bdf8';
      updateBox.style.boxShadow = '0 0 18px rgba(56, 189, 248, 0.4)';

      if (icon) {
        icon.textContent = '✨';
        icon.style.color = '#38bdf8';
      }
      if (title) {
        title.textContent = `✨ រកឃើញកំណែថ្មី (v${_latestVersionNumber})!`;
        title.style.color = '#38bdf8';
      }
      if (sub) {
        sub.textContent = 'ចុចទីនេះដើម្បី Update កូដថ្មីភ្លាមៗ';
        sub.style.color = '#e2e8f0';
      }
      if (btn) {
        btn.textContent = '⚡ Update ឥឡូវនេះ';
        btn.style.background = 'linear-gradient(135deg, #0284c7, #38bdf8)';
        btn.style.color = '#070a13';
        btn.style.borderColor = '#38bdf8';
        btn.style.fontWeight = '800';
      }
    } else {
      // Dimmed and disabled when up to date ("អក្សរលាក់ចុចអត់កើតទេ")
      updateBox.style.opacity = '0.45';
      updateBox.style.pointerEvents = 'none';
      updateBox.style.cursor = 'default';
      updateBox.style.background = 'rgba(15, 23, 42, 0.6)';
      updateBox.style.borderColor = 'rgba(255, 255, 255, 0.08)';
      updateBox.style.boxShadow = 'none';

      if (icon) {
        icon.textContent = '🔄';
        icon.style.color = '#64748b';
      }
      if (title) {
        title.textContent = 'កំណែចុងក្រោយបំផុត (Up to Date)';
        title.style.color = '#94a3b8';
      }
      if (sub) {
        sub.textContent = 'គ្មានកូដថ្មីត្រូវ Update ឡើយ';
        sub.style.color = '#64748b';
      }
      if (btn) {
        btn.textContent = 'Update';
        btn.style.background = 'rgba(255, 255, 255, 0.05)';
        btn.style.color = '#64748b';
        btn.style.borderColor = 'rgba(255, 255, 255, 0.08)';
        btn.style.fontWeight = '700';
      }
    }
  }

  // --------------------------------------------------------------------------
  // Theme & Accent Color System (Day / Night & Color Customization)
  // --------------------------------------------------------------------------
  window.setAppTheme = function (theme) {
    const isLight = (theme === 'light');
    document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
    try { localStorage.setItem('ps_mobile_theme', isLight ? 'light' : 'dark'); } catch (_) {}
    const btnDark = document.getElementById('themeBtnDark');
    const btnLight = document.getElementById('themeBtnLight');
    if (btnDark && btnLight) {
      btnLight.style.background = isLight ? '#38bdf8' : 'transparent';
      btnLight.style.color = isLight ? '#070a13' : '#94a3b8';
      btnDark.style.background = isLight ? 'transparent' : '#38bdf8';
      btnDark.style.color = isLight ? '#94a3b8' : '#070a13';
    }
  };

  window.setAccentColor = function (accent) {
    if (!accent) accent = 'cyber_neon';
    document.documentElement.setAttribute('data-accent', accent);
    try { localStorage.setItem('ps_mobile_accent', accent); } catch (_) {}
  };

  function initAppTheme() {
    const savedTheme = localStorage.getItem('ps_mobile_theme') || 'dark';
    const savedAccent = localStorage.getItem('ps_mobile_accent') || 'cyber_neon';
    setAppTheme(savedTheme);
    setAccentColor(savedAccent);
  }

  window.handleMobileUpdateBoxClick = function () {
    if (_hasPendingUpdate) {
      executeMobileAppUpdate();
    }
  };

  window.openMobileSettingsModal = async function () {
    if (settingsModal) settingsModal.classList.add('active');
    initAppTheme();
    checkMobileUpdateStatus();
    try {
      const res = await fetch('/api/ping');
      const data = await res.json();
      const statusElem = document.getElementById('settingsServerStatus');
      const verBadge = document.getElementById('settingsVersionBadge');
      if (statusElem) {
        statusElem.innerHTML = `🟢 ម៉ាស៊ីនដំណើរការល្អ (Port ${data.port || 1994})`;
      }
      if (verBadge && data.version) {
        verBadge.textContent = `v${data.version}`;
      }
    } catch (_) {
      const statusElem = document.getElementById('settingsServerStatus');
      if (statusElem) {
        statusElem.innerHTML = `🟡 មិនអាចទាក់ទង Server ផ្ទាល់បានឡើយ (Offline / Cache Mode)`;
      }
    }
  };

  window.closeMobileSettingsModal = function () {
    if (settingsModal) settingsModal.classList.remove('active');
  };

  window.executeMobileAppUpdate = async function () {
    const btn = document.getElementById('mobileUpdateActionBtn');
    const sub = document.getElementById('mobileUpdateSub');
    if (btn) btn.textContent = '⏳ កំពុង Update...';
    if (sub) sub.textContent = 'កំពុងទាញយកកូដកំណែចុងក្រោយ...';

    showToast('🔄 កំពុងទាញយកកូដកំណែចុងក្រោយ...', 3000);

    try {
      // 1. Unregister and purge Service Worker caches
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.update().catch(() => {});
        }
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }

      // 2. Ping server to ensure connection is live
      await fetch(`/api/ping?_t=${Date.now()}`).catch(() => ({}));

      showToast('🎉 បាន Update កម្មវិធីទៅកំណែចុងក្រោយបំផុតដោយជោគជ័យ!', 2500);

      setTimeout(() => {
        window.location.href = `/m?v=${Date.now()}`;
      }, 1200);
    } catch (err) {
      console.warn('[Update Error]:', err);
      window.location.reload();
    }
  };

  // If running in standalone app mode (already installed), hide banner
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
    if (pwaBanner) pwaBanner.style.display = 'none';
  } else {
    setTimeout(() => {
      if (pwaBanner && !sessionStorage.getItem('pwa_dismissed')) {
        pwaBanner.style.display = 'flex';
      }
    }, 2000);
  }

})();
