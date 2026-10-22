/**
 * 🎬 PS DOWNLOADER - 24/7 Telegram Video & Audio Downloader Bot Engine
 * Dedicated Standalone Bot for: @Ps_media_free_tes_bot
 * 
 * Features:
 * - 🔒 Strict License System (Lock from video #1 until licensed)
 * - ⚡ 1-Tap Copy Account ID (TG-XXXXX) for easy purchasing
 * - 🚀 1-Click Auto-Unlock by Admin (/add TG-XXXXX 30)
 * - 🔑 License Key activation system (/key PS-XXXX-XXXX)
 * - 🎵 TikTok (Global) - No Watermark Full HD + MP3
 * - 🇨🇳 Douyin (TikTok ចិន) - No Watermark Full HD + MP3
 * - ⚡ Kuaishou (ខៅស៊ូ) - No Watermark Full HD
 * - 🔴 YouTube & YouTube Shorts - 720p/1080p MP4 + MP3 Audio
 * - 📘 Facebook & Instagram Reels
 * - 🎭 Short Dramas & Direct MP4 Links
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const { DATA_DIR } = require('./config.js');
const { tiktokDownloader } = require('./tiktok_downloader.js');
const { scraper, extractSeriesId } = require('./scraper.js');
const cenc = require('../lib/cenc.js');

const CONFIG_FILE = path.join(DATA_DIR, 'video_bot_config.json');
const LOCK_FILE = path.join(DATA_DIR, 'video_downloader_bot.lock');
const TEMP_BOT_DIR = path.join(DATA_DIR, 'temp_bot');
const USERS_DB_FILE = path.join(DATA_DIR, 'video_bot_users.json');
const KEYS_DB_FILE = path.join(DATA_DIR, 'video_bot_keys.json');

if (!fs.existsSync(TEMP_BOT_DIR)) {
  try { fs.mkdirSync(TEMP_BOT_DIR, { recursive: true }); } catch (_) {}
}

const httpsKeepAliveAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 60000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 45000
});

const httpKeepAliveAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 60000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 45000
});

// User active drama sessions & cancellable jobs
const _USER_DRAMA_SESSION = new Map();
const _ACTIVE_DRAMA_JOBS = new Map();

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (_) {}
  return {
    botToken: '8542235124:AAEw1TIZ8K1sZjJ2aGq5KUk8nXTpj7fyb0E',
    botUsername: 'Ps_media_free_tes_bot',
    adminTelegram: '@Thpisal33',
    adminChatId: '925539914',
    desktopAppPromo: true
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const _GUEST_ALERT_TIMERS = new Map();

// -------------------------------------------------------------
// Database Helpers: Users & License Keys
// -------------------------------------------------------------
function loadUsersDb() {
  try {
    if (fs.existsSync(USERS_DB_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_DB_FILE, 'utf8'));
    }
  } catch (_) {}
  return {};
}

function saveUsersDb(users) {
  try {
    fs.writeFileSync(USERS_DB_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.error('[License DB] Error saving users:', err);
  }
}

function loadKeysDb() {
  try {
    if (fs.existsSync(KEYS_DB_FILE)) {
      return JSON.parse(fs.readFileSync(KEYS_DB_FILE, 'utf8'));
    }
  } catch (_) {}
  return {};
}

function saveKeysDb(keys) {
  try {
    fs.writeFileSync(KEYS_DB_FILE, JSON.stringify(keys, null, 2), 'utf8');
  } catch (err) {
    console.error('[License DB] Error saving keys:', err);
  }
}

/**
 * Formats Khmer date & time with hours and minutes
 */
function formatKhmerDateTime(dateStr) {
  if (!dateStr) return 'ពេញមួយជីវិត (Lifetime)';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('en-GB', {
      timeZone: 'Asia/Phnom_Penh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (_) {
    return dateStr;
  }
}

/**
 * Calculates and formats exact remaining time down to the minute
 */
function formatRemainingTime(expiresAt) {
  if (!expiresAt) return 'ពេញមួយជីវិត (គ្មានថ្ងៃផុតកំណត់)';
  const expTime = new Date(expiresAt).getTime();
  const now = Date.now();
  const diffMs = expTime - now;
  if (diffMs <= 0) return 'ផុតកំណត់ហើយ (0 នាទី)';

  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const mins = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));

  const parts = [];
  if (days > 0) parts.push(`${days} ថ្ងៃ`);
  if (hours > 0 || days > 0) parts.push(`${hours} ម៉ោង`);
  parts.push(`${mins} នាទី`);
  return parts.join(' ');
}

/**
 * Checks a user's license status with detailed countdown (Days, Hours, Minutes)
 */
function getUserLicense(userId) {
  const cleanId = String(userId).trim().replace(/^TG-/i, '');
  const cfg = loadConfig();

  // Admin always has Lifetime VIP immunity
  if (cfg.adminChatId && String(cleanId) === String(cfg.adminChatId)) {
    return {
      active: true,
      isAdmin: true,
      label: '👑 Admin (Lifetime VIP)',
      remainingStr: 'ពេញមួយជីវិត (គ្មានថ្ងៃផុតកំណត់)',
      daysRemaining: 'ពេញមួយជីវិត',
      expiresAt: null,
      expiresFormatted: 'ពេញមួយជីវិត (Lifetime)'
    };
  }

  const users = loadUsersDb();
  const u = users[cleanId];

  if (!u || u.status === 'revoked') {
    return {
      active: false,
      isAdmin: false,
      label: '🔒 មិនទាន់មាន License',
      remainingStr: 'គ្មាន (0 នាទី)',
      daysRemaining: 0,
      expiresAt: null,
      expiresFormatted: 'មិនទាន់មាន'
    };
  }

  // Lifetime VIP
  if (u.days === 0 || u.plan === 'Lifetime VIP' || (u.plan && u.plan.includes('Lifetime'))) {
    return {
      active: true,
      isAdmin: false,
      label: '👑 Lifetime VIP (ពេញមួយជីវិត)',
      remainingStr: 'ពេញមួយជីវិត (គ្មានថ្ងៃផុតកំណត់)',
      daysRemaining: 'ពេញមួយជីវិត',
      expiresAt: null,
      expiresFormatted: 'ពេញមួយជីវិត (Lifetime)'
    };
  }

  const expTime = new Date(u.expiresAt || 0).getTime();
  const now = Date.now();

  if (expTime > now) {
    const diffMs = expTime - now;
    const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    const remStr = formatRemainingTime(u.expiresAt);
    return {
      active: true,
      isAdmin: false,
      label: `🟢 សកម្ម (${remStr})`,
      remainingStr: remStr,
      daysRemaining: diffDays,
      expiresAt: u.expiresAt,
      expiresFormatted: formatKhmerDateTime(u.expiresAt)
    };
  }

  return {
    active: false,
    isAdmin: false,
    label: '🔴 ផុតកំណត់ (Expired)',
    remainingStr: 'ផុតកំណត់ហើយ (0 នាទី)',
    daysRemaining: 0,
    expiresAt: u.expiresAt,
    expiresFormatted: formatKhmerDateTime(u.expiresAt)
  };
}

/**
 * Authorizes a user (Auto-Unlock / Add Days)
 */
function authorizeUser(userId, days = 30, meta = {}) {
  const cleanId = String(userId).trim().replace(/^TG-/i, '');
  const users = loadUsersDb();
  const existing = users[cleanId] || {};

  const numDays = parseInt(days, 10);
  let expiresAt = null;
  let planLabel = '';

  if (numDays === 0) {
    planLabel = '👑 Lifetime VIP (ពេញមួយជីវិត)';
    expiresAt = null;
  } else {
    // If existing license is still active, extend it!
    const currentExp = existing.expiresAt ? new Date(existing.expiresAt).getTime() : 0;
    const baseTime = currentExp > Date.now() ? currentExp : Date.now();
    const newExp = baseTime + (numDays * 24 * 60 * 60 * 1000);
    expiresAt = new Date(newExp).toISOString();
    planLabel = `${numDays} ថ្ងៃ`;
  }

  users[cleanId] = {
    userId: cleanId,
    userName: meta.userName || existing.userName || '',
    username: meta.username || existing.username || '',
    status: 'active',
    plan: planLabel,
    days: numDays,
    expiresAt: expiresAt,
    authorizedAt: new Date().toISOString(),
    authorizedBy: meta.authorizedBy || 'Admin',
    totalDownloaded: existing.totalDownloaded || 0
  };

  saveUsersDb(users);
  return {
    ok: true,
    userId: cleanId,
    plan: planLabel,
    expiresAt: expiresAt
  };
}

/**
 * Deducts/Subtracts days from user's license (for Admin testing or adjustments)
 */
function deductUserDays(userId, daysToSubtract = 1) {
  const cleanId = String(userId).trim().replace(/^TG-/i, '');
  const users = loadUsersDb();
  const existing = users[cleanId];

  if (!existing) {
    return { ok: false, error: 'រកមិនឃើញ User ឡើយ' };
  }

  if (daysToSubtract === 'all' || daysToSubtract === 0) {
    existing.status = 'expired';
    existing.days = 0;
    existing.expiresAt = new Date(Date.now() - 60000).toISOString();
    existing.plan = '🔴 ផុតកំណត់';
    saveUsersDb(users);
    return {
      ok: true,
      userId: cleanId,
      status: 'expired',
      remainingStr: 'ផុតកំណត់ហើយ (0 នាទី)',
      expiresAt: existing.expiresAt,
      expiresFormatted: formatKhmerDateTime(existing.expiresAt)
    };
  }

  const numDays = parseInt(daysToSubtract, 10) || 1;
  const currentExp = existing.expiresAt ? new Date(existing.expiresAt).getTime() : Date.now();
  const deductMs = numDays * 24 * 60 * 60 * 1000;
  const newExp = currentExp - deductMs;

  existing.expiresAt = new Date(newExp).toISOString();
  if (newExp <= Date.now()) {
    existing.status = 'expired';
    existing.plan = '🔴 ផុតកំណត់';
    existing.days = 0;
  } else {
    existing.status = 'active';
    const remDays = Math.ceil((newExp - Date.now()) / (24 * 60 * 60 * 1000));
    existing.days = remDays;
    existing.plan = `${remDays} ថ្ងៃ`;
  }

  saveUsersDb(users);
  return {
    ok: true,
    userId: cleanId,
    status: existing.status,
    remainingStr: formatRemainingTime(existing.expiresAt),
    expiresAt: existing.expiresAt,
    expiresFormatted: formatKhmerDateTime(existing.expiresAt)
  };
}

/**
 * Generates a license key
 */
function generateLicenseKey(days = 30, createdBy = 'Admin') {
  const numDays = parseInt(days, 10);
  const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const part3 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const key = `PS-${part1}-${part2}-${part3}`;

  const keys = loadKeysDb();
  keys[key] = {
    key: key,
    days: numDays,
    plan: numDays === 0 ? 'Lifetime VIP' : `${numDays} ថ្ងៃ`,
    status: 'unclaimed',
    createdAt: new Date().toISOString(),
    createdBy: createdBy
  };

  saveKeysDb(keys);
  return { key, days: numDays, plan: keys[key].plan };
}

/**
 * Redeems a license key
 */
function redeemLicenseKey(userId, rawKey, userInfo = {}) {
  const cleanId = String(userId).trim().replace(/^TG-/i, '');
  const cleanKey = String(rawKey || '').trim().toUpperCase();

  const keys = loadKeysDb();
  const keyData = keys[cleanKey];

  if (!keyData) {
    return { ok: false, error: '❌ License Key មិនត្រឹមត្រូវឡើយ!' };
  }

  if (keyData.status === 'claimed') {
    return { ok: false, error: '⚠️ License Key នេះត្រូវបានប្រើប្រាស់រួចហើយ!' };
  }

  // Mark key as claimed
  keyData.status = 'claimed';
  keyData.claimedBy = cleanId;
  keyData.claimedAt = new Date().toISOString();
  saveKeysDb(keys);

  // Authorize user
  const authRes = authorizeUser(cleanId, keyData.days, {
    userName: userInfo.first_name || '',
    username: userInfo.username || '',
    authorizedBy: `Key:${cleanKey}`
  });

  return {
    ok: true,
    key: cleanKey,
    days: keyData.days,
    plan: authRes.plan,
    expiresAt: authRes.expiresAt
  };
}

/**
 * Formats Khmer date
 */
function formatKhmerDate(dateStr) {
  if (!dateStr) return 'ពេញមួយជីវិត (Lifetime)';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' });
  } catch (_) {
    return dateStr;
  }
}

// In-memory cache for audio streams: audioKey -> { url, title, performer }
const _AUDIO_CACHE = new Map();

setInterval(() => {
  if (_AUDIO_CACHE.size > 500) {
    const keys = Array.from(_AUDIO_CACHE.keys()).slice(0, 200);
    for (const k of keys) _AUDIO_CACHE.delete(k);
  }
}, 2 * 60 * 60 * 1000).unref();

function findYtDlp() {
  const candidates = [
    path.join(__dirname, '..', 'bin', 'yt-dlp.exe'),
    path.join(process.resourcesPath || '', 'bin', 'yt-dlp.exe'),
    path.join(__dirname, '..', '..', 'bin', 'yt-dlp.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'Scripts', 'yt-dlp.exe'),
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'Scripts', 'yt-dlp.exe'),
    'yt-dlp'
  ];
  for (const p of candidates) {
    if (p !== 'yt-dlp' && fs.existsSync(p)) return p;
  }
  return 'yt-dlp';
}

function findFfmpeg() {
  const candidates = [
    path.join(__dirname, '..', 'bin', 'ffmpeg.exe'),
    path.join(process.resourcesPath || '', 'bin', 'ffmpeg.exe'),
    path.join(__dirname, '..', '..', 'bin', 'ffmpeg.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-8.1.2-full_build', 'bin', 'ffmpeg.exe'),
    'ffmpeg'
  ];
  for (const p of candidates) {
    if (p !== 'ffmpeg' && fs.existsSync(p)) return p;
  }
  return 'ffmpeg';
}

function formatDuration(sec) {
  if (!sec || isNaN(sec)) return '00:00';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const remSec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
  return mb.toFixed(1) + ' MB';
}

function renderProgressBar(percent, length = 10) {
  const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
  const filled = Math.round((p / 100) * length);
  const empty = length - filled;
  return '▰'.repeat(filled) + '▱'.repeat(empty) + ` ${p}%`;
}

function extractUrls(text) {
  if (!text) return [];
  const matches = String(text).match(/https?:\/\/[^\s"'<>\u4e00-\u9fa5\r\n]+/gi) || [];
  return Array.from(new Set(matches.map(u => u.trim())));
}

function detectPlatform(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('kuaishou.com') || u.includes('kuaishouapp.com') || u.includes('gifshow.com') || u.includes('kwai.com')) return 'kuaishou';
  if (u.includes('douyin.com') || u.includes('iesdouyin.com')) return 'douyin';
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('facebook.com') || u.includes('fb.watch')) return 'facebook';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('hongguoduanju.com')) return 'hongguo';
  if (u.includes('haosoudj.com')) return 'haosou';
  if (u.includes('mvffm.com')) return 'mvffm';
  if (u.includes('beeplaylet.com')) return 'beeplaylet';
  if (u.includes('dailymotion.com') || u.includes('dai.ly')) return 'dailymotion';
  if (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(u)) return 'direct';
  return 'general';
}

function getPlatformLabel(platform) {
  switch (platform) {
    case 'tiktok': return '🎵 TikTok (Global)';
    case 'douyin': return '🇨🇳 TikTok ចិន (Douyin)';
    case 'kuaishou': return '⚡ ខៅស៊ូ (Kuaishou)';
    case 'youtube': return '🔴 YouTube';
    case 'facebook': return '📘 Facebook';
    case 'instagram': return '📸 Instagram Reels';
    case 'hongguo': return '🎭 Hongguo Short Drama';
    case 'haosou': return '🎭 HaoSou Short Drama';
    case 'mvffm': return '🎭 MVFFM Drama';
    case 'beeplaylet': return '🐝 BeePlaylet Drama';
    case 'dailymotion': return '🎬 Dailymotion';
    default: return '🎬 វីដេអូ';
  }
}

async function callTelegramApi(token, method, body = {}) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function sendChatAction(token, chatId, action = 'upload_video') {
  try {
    await callTelegramApi(token, 'sendChatAction', { chat_id: chatId, action: action });
  } catch (_) {}
}

async function sendBotMessage(token, chatId, textHtml, options = {}) {
  const opt = { ...options };
  if (!opt.reply_markup) {
    try {
      const cfg = loadConfig();
      const cleanId = String(chatId).replace(/^TG-/i, '');
      const isAdmin = cfg.adminChatId && String(cleanId) === String(cfg.adminChatId);
      const lic = getUserLicense(cleanId);
      opt.reply_markup = getMainReplyKeyboard(lic.active, isAdmin);
    } catch (_) {}
  }

  const res = await callTelegramApi(token, 'sendMessage', {
    chat_id: chatId,
    text: textHtml,
    parse_mode: 'HTML',
    ...opt
  });
  if (!res || !res.ok) {
    console.warn('[sendBotMessage HTML failed, retrying plain text]:', (res && res.description) || (res && res.error));
    return await callTelegramApi(token, 'sendMessage', {
      chat_id: chatId,
      text: textHtml.replace(/<[^>]+>/g, ''),
      ...opt
    });
  }
  return res;
}

function downloadFileToDisk(url, destPath, customHeaders = {}, onProgress = null) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath, { highWaterMark: 1024 * 1024 });
    const client = url.startsWith('https:') ? https : http;
    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Accept': '*/*',
      ...customHeaders
    };

    function fetchWithRedirect(targetUrl, redirects = 0) {
      if (redirects > 8) {
        file.close();
        try { fs.unlinkSync(destPath); } catch (_) {}
        return reject(new Error('Too many redirects'));
      }

      const agent = targetUrl.startsWith('https:') ? httpsKeepAliveAgent : httpKeepAliveAgent;
      const req = client.get(targetUrl, { headers: reqHeaders, agent, timeout: 45000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let nextLoc = res.headers.location;
          if (!nextLoc.startsWith('http')) nextLoc = new URL(nextLoc, targetUrl).href;
          return fetchWithRedirect(nextLoc, redirects + 1);
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          file.close();
          try { fs.unlinkSync(destPath); } catch (_) {}
          return reject(new Error(`HTTP error ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let receivedBytes = 0;
        let lastReport = 0;

        res.on('data', (chunk) => {
          receivedBytes += chunk.length;
          if (onProgress) {
            const now = Date.now();
            if (now - lastReport > 1200 || (totalBytes > 0 && receivedBytes === totalBytes)) {
              lastReport = now;
              const percent = totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : 0;
              onProgress({
                receivedBytes,
                totalBytes,
                percent,
                bar: renderProgressBar(percent),
                sizeStr: totalBytes > 0 ? `${formatBytes(receivedBytes)} / ${formatBytes(totalBytes)}` : formatBytes(receivedBytes)
              });
            }
          }
        });

        res.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve(destPath));
        });
      });

      req.on('timeout', () => {
        req.destroy();
        file.close();
        try { fs.unlinkSync(destPath); } catch (_) {}
        reject(new Error('Download timeout'));
      });

      req.on('error', (err) => {
        file.close();
        try { fs.unlinkSync(destPath); } catch (_) {}
        reject(err);
      });
    }

    fetchWithRedirect(url);
  });
}

async function sendTelegramVideo(token, chatId, videoSource, options = {}) {
  const isUrl = typeof videoSource === 'string' && videoSource.startsWith('http');
  const caption = options.caption || '';
  const replyMarkup = options.reply_markup || null;
  const replyToMsgId = options.reply_to_message_id || null;

  // 1. If it's a direct URL, attempt fast Telegram server-to-server download
  if (isUrl) {
    try {
      const payload = {
        chat_id: chatId,
        video: videoSource,
        caption: caption,
        parse_mode: 'HTML',
        supports_streaming: true
      };
      if (replyMarkup) payload.reply_markup = replyMarkup;
      if (replyToMsgId) payload.reply_to_message_id = replyToMsgId;

      const data = await callTelegramApi(token, 'sendVideo', payload);
      if (data && data.ok) return { ok: true, result: data.result, method: 'url' };
    } catch (_) {}
  }

  // 2. Local File or Buffer Multipart Upload
  let tempFilePath = null;
  let fileBuffer = null;
  let filename = options.filename || 'video.mp4';

  if (isUrl) {
    tempFilePath = path.join(TEMP_BOT_DIR, `vid_${Date.now()}_${Math.floor(Math.random() * 10000)}.mp4`);
    try {
      await downloadFileToDisk(videoSource, tempFilePath, options.headers || {}, options.onProgress || null);
    } catch (dlErr) {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (_) {}
      }
      return { ok: false, error: `Failed to fetch video stream: ${dlErr.message}` };
    }
  } else if (typeof videoSource === 'string') {
    tempFilePath = videoSource;
    filename = path.basename(tempFilePath);
  } else if (Buffer.isBuffer(videoSource)) {
    fileBuffer = videoSource;
  }

  try {
    const stats = tempFilePath ? fs.statSync(tempFilePath) : null;
    const fileSize = stats ? stats.size : (fileBuffer ? fileBuffer.length : 0);

    // Telegram Bot limit: 50MB
    if (fileSize > 50 * 1024 * 1024) {
      if (tempFilePath && isUrl) {
        try { fs.unlinkSync(tempFilePath); } catch (_) {}
      }
      return {
        ok: false,
        tooLarge: true,
        fileSize,
        sizeStr: formatBytes(fileSize),
        error: `ទំហំវីដេអូ (${formatBytes(fileSize)}) ធំជាង 50MB (ដែនកំណត់ Telegram Bot)`
      };
    }

    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');
    formData.append('supports_streaming', 'true');
    if (options.width) formData.append('width', String(options.width));
    if (options.height) formData.append('height', String(options.height));
    if (options.duration) formData.append('duration', String(options.duration));
    if (replyMarkup) {
      formData.append('reply_markup', typeof replyMarkup === 'string' ? replyMarkup : JSON.stringify(replyMarkup));
    }
    if (replyToMsgId) {
      formData.append('reply_to_message_id', String(replyToMsgId));
    }

    const buf = fileBuffer || fs.readFileSync(tempFilePath);
    const blob = new Blob([buf], { type: 'video/mp4' });
    formData.append('video', blob, filename);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (tempFilePath && isUrl && fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch (_) {}
    }

    if (data && data.ok) return { ok: true, result: data.result, method: 'multipart' };
    return { ok: false, error: data.description || 'Failed to send video' };
  } catch (err) {
    if (tempFilePath && isUrl && fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch (_) {}
    }
    return { ok: false, error: err.message };
  }
}

async function sendTelegramAudio(token, chatId, audioSource, options = {}) {
  const isUrl = typeof audioSource === 'string' && audioSource.startsWith('http');
  const caption = options.caption || '';
  const title = options.title || 'Audio';
  const performer = options.performer || 'PS DOWNLOADER';

  if (isUrl) {
    try {
      const payload = {
        chat_id: chatId,
        audio: audioSource,
        caption: caption,
        parse_mode: 'HTML',
        title: title,
        performer: performer
      };
      if (options.reply_to_message_id) payload.reply_to_message_id = options.reply_to_message_id;

      const data = await callTelegramApi(token, 'sendAudio', payload);
      if (data && data.ok) return { ok: true, result: data.result };
    } catch (_) {}
  }

  let tempAudioPath = null;
  if (isUrl) {
    tempAudioPath = path.join(TEMP_BOT_DIR, `aud_${Date.now()}_${Math.floor(Math.random() * 10000)}.mp3`);
    try {
      await downloadFileToDisk(audioSource, tempAudioPath);
    } catch (dlErr) {
      if (tempAudioPath && fs.existsSync(tempAudioPath)) {
        try { fs.unlinkSync(tempAudioPath); } catch (_) {}
      }
      return { ok: false, error: dlErr.message };
    }
  } else {
    tempAudioPath = audioSource;
  }

  try {
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');
    formData.append('title', title);
    formData.append('performer', performer);
    if (options.reply_to_message_id) {
      formData.append('reply_to_message_id', String(options.reply_to_message_id));
    }

    const buf = fs.readFileSync(tempAudioPath);
    const blob = new Blob([buf], { type: 'audio/mpeg' });
    formData.append('audio', blob, path.basename(tempAudioPath) || 'audio.mp3');

    const res = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (tempAudioPath && isUrl && fs.existsSync(tempAudioPath)) {
      try { fs.unlinkSync(tempAudioPath); } catch (_) {}
    }

    if (data && data.ok) return { ok: true, result: data.result };
    return { ok: false, error: data.description || 'Failed to send audio' };
  } catch (err) {
    if (tempAudioPath && isUrl && fs.existsSync(tempAudioPath)) {
      try { fs.unlinkSync(tempAudioPath); } catch (_) {}
    }
    return { ok: false, error: err.message };
  }
}

function downloadYouTubeVideo(url, isAudioOnly = false, onProgress = null) {
  return new Promise((resolve, reject) => {
    const ytDlp = findYtDlp();
    const ffmpeg = findFfmpeg();
    const ext = isAudioOnly ? 'mp3' : 'mp4';
    const outPath = path.join(TEMP_BOT_DIR, `yt_${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`);

    const args = [
      '--no-warnings',
      '--no-playlist',
      '--newline',
      '--js-runtimes', 'node',
      '--ffmpeg-location', ffmpeg,
      '-o', outPath
    ];

    if (isAudioOnly) {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '192K');
    } else {
      args.push('-f', 'bestvideo[ext=mp4][filesize<45M]+bestaudio[ext=m4a]/best[ext=mp4][filesize<45M]/best[filesize<45M]/worst[ext=mp4]');
      args.push('--merge-output-format', 'mp4');
    }

    args.push(url);

    const proc = spawn(ytDlp, args, { windowsHide: true });
    let stderr = '';
    let lastReport = 0;

    proc.stdout.on('data', (d) => {
      const str = d.toString();
      if (onProgress) {
        const m = str.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+(\S+)(?:\s+at\s+(\S+))?/i);
        if (m) {
          const now = Date.now();
          if (now - lastReport > 1200) {
            lastReport = now;
            const percent = parseFloat(m[1]);
            const totalStr = m[2];
            const speedStr = m[3] || '';
            onProgress({
              percent: Math.round(percent),
              bar: renderProgressBar(percent),
              sizeStr: totalStr,
              speed: speedStr
            });
          }
        }
      }
    });

    proc.stderr.on('data', d => stderr += d.toString());

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath)) {
        const stats = fs.statSync(outPath);
        resolve({
          filePath: outPath,
          size: stats.size,
          sizeStr: formatBytes(stats.size)
        });
      } else {
        if (fs.existsSync(outPath)) {
          try { fs.unlinkSync(outPath); } catch (_) {}
        }
        reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

function getYouTubeMetadata(url) {
  return new Promise((resolve, reject) => {
    const ytDlp = findYtDlp();
    const args = [
      '--dump-single-json',
      '--no-warnings',
      '--no-playlist',
      '--js-runtimes', 'node',
      url
    ];

    execFile(ytDlp, args, { timeout: 35000, maxBuffer: 30 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      try {
        const data = JSON.parse(stdout);
        resolve({
          title: data.title || 'YouTube Video',
          author: data.uploader || data.channel || 'YouTube Creator',
          duration: data.duration || 0,
          duration_str: formatDuration(data.duration),
          thumbnail: data.thumbnail || '',
          webpage_url: data.webpage_url || url
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * Builds Persistent Bottom Reply Keyboard next to chat bar
 */
function getMainReplyKeyboard(isLicensed = false, isAdmin = false) {
  if (isAdmin) {
    return {
      keyboard: [
        [{ text: '🌐 រើសវេបសាយ (Platforms)' }, { text: '👤 គណនីខ្ញុំ & នាទីនៅសល់' }],
        [{ text: '📋 បញ្ជី User' }, { text: '🔑 បង្កើត Key 30 ថ្ងៃ' }],
        [{ text: '👑 Admin Menu' }, { text: '💡 របៀបទាញយកវីដេអូ' }]
      ],
      resize_keyboard: true,
      is_persistent: true
    };
  }

  if (isLicensed) {
    return {
      keyboard: [
        [{ text: '🌐 រើសវេបសាយ (Platforms)' }, { text: '👤 គណនីខ្ញុំ & នាទីនៅសល់' }],
        [{ text: '💡 របៀបទាញយកវីដេអូ' }, { text: '💬 ទាក់ទង Admin' }]
      ],
      resize_keyboard: true,
      is_persistent: true
    };
  }

  return {
    keyboard: [
      [{ text: '🌐 រើសវេបសាយ (Platforms)' }, { text: '👤 គណនីខ្ញុំ & នាទីនៅសល់' }],
      [{ text: '💻 លេខកូដគណនីខ្ញុំ (User ID)' }, { text: '🔑 របៀបបញ្ចូល Key' }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

/**
 * Builds Interactive Inline Keyboard with 1-Tap Direct Website Launch Buttons
 */
function getWebsiteButtons(chatId, isLicensed = false, isAdmin = false) {
  const cfg = loadConfig();
  const cleanId = String(chatId).replace(/^TG-/i, '');
  const prefilledText = encodeURIComponent(`សួស្តីបង ខ្ញុំចង់បើកសិទ្ធិ License Bot: TG-${cleanId}`);
  const adminLink = `https://t.me/${(cfg.adminTelegram || '@Thpisal33').replace('@', '')}?text=${prefilledText}`;
  const directAdminLink = `https://t.me/${(cfg.adminTelegram || '@Thpisal33').replace('@', '')}`;

  const rows = [
    // Row 1: TikTok & Douyin
    [
      { text: '🎵 ចូល TikTok Web', url: 'https://www.tiktok.com' },
      { text: '🇨🇳 ចូល Douyin Web', url: 'https://www.douyin.com' }
    ],
    // Row 2: Kuaishou & YouTube
    [
      { text: '⚡ ចូល ខៅស៊ូ (Kuaishou)', url: 'https://www.kuaishou.com' },
      { text: '🔴 ចូល YouTube Web', url: 'https://www.youtube.com' }
    ],
    // Row 3: Facebook & Instagram
    [
      { text: '📘 ចូល Facebook Web', url: 'https://www.facebook.com' },
      { text: '📸 ចូល Instagram Web', url: 'https://www.instagram.com' }
    ],
    // Row 4: Short Dramas
    [
      { text: '🎭 រឿង Hongguo', url: 'https://hongguoduanju.com' },
      { text: '🎭 រឿង MVFFM', url: 'https://mvffm.com' }
    ]
  ];

  if (isAdmin) {
    rows.push([
      { text: '👑 ផ្ទាំងគ្រប់គ្រង Admin', callback_data: 'admin_open_menu' },
      { text: '📋 បញ្ជី User (/users)', callback_data: 'admin_list_users' }
    ]);
    rows.push([
      { text: '🔑 បង្កើត Key 30 ថ្ងៃ', callback_data: 'admin_quick_key' },
      { text: '👤 គណនីខ្ញុំ & នាទីនៅសល់', callback_data: 'my_profile' }
    ]);
  } else if (isLicensed) {
    rows.push([
      { text: '👤 គណនីខ្ញុំ & នាទីនៅសល់', callback_data: 'my_profile' },
      { text: '💡 របៀបទាញយកវីដេអូ', callback_data: 'how_to_dl' }
    ]);
    rows.push([
      { text: '💬 ទាក់ទង Admin', url: directAdminLink }
    ]);
  } else {
    rows.push([
      { text: '💬 ផ្ញើលេខកូដទៅ Admin ដើម្បីបើកសិទ្ធិ', url: adminLink }
    ]);
    rows.push([
      { text: '🔑 របៀបបញ្ចូល Key', callback_data: 'how_to_key' },
      { text: '👤 គណនីខ្ញុំ & នាទីនៅសល់', callback_data: 'my_profile' }
    ]);
  }

  return { inline_keyboard: rows };
}

/**
 * Builds Platform List & Website Selection Menu
 */
function getPlatformsListMessage() {
  return (
    `🌐 <b>បញ្ជីវេបសាយ & Platform ដែលគាំទ្រទាញយក (PS DOWNLOADER):</b>\n\n` +
    `លោកអ្នកអាចចុចលើប៊ូតុងខាងក្រោមដើម្បីចូលទៅកាន់វេបសាយដោយផ្ទាល់ ឬ Copy Link វីដេអូ រួចបិទភ្ជាប់ (Paste) ផ្ញើមកទីនេះ ដើម្បីទាញយកវីដេអូ Full HD គ្មាន Watermark ភ្លាមៗ ៖\n\n` +
    `1️⃣ 🎵 <b>TikTok (Global)</b> ➜ វីដេអូគ្មាន Watermark + MP3 Audio\n` +
    `2️⃣ 🇨🇳 <b>Douyin (抖音 - TikTok ចិន)</b> ➜ វីដេអូចិន Full HD គ្មាន Logo\n` +
    `3️⃣ ⚡ <b>ខៅស៊ូ (Kuaishou - 快手)</b> ➜ វីដេអូខ្លីចិនគ្មាន Watermark\n` +
    `4️⃣ 🔴 <b>YouTube & YouTube Shorts</b> ➜ 1080p/720p & MP3 192kbps\n` +
    `5️⃣ 📘 <b>Facebook & Instagram Reels</b> ➜ FB Watch & Reels គ្មាន Logo\n` +
    `6️⃣ 📸 <b>Instagram & Threads</b> ➜ Reels & Posts HD\n` +
    `7️⃣ 🎭 <b>រឿងភាគខ្លីចិន (Short Dramas)</b> ➜ Hongguo (红果), MVFFM, HaoSou, BeePlaylet...\n\n` +
    `👉 <i>គ្រាន់តែ Copy Link វីដេអូណាមួយ រួចបិទភ្ជាប់ (Paste) ផ្ញើមកទីនេះ Bot នឹងទាញយកជូនភ្លាមៗ! 🚀</i>`
  );
}

/**
 * Builds Detailed User Profile with exact days, hours, and minutes remaining
 */
function getUserProfileMessage(chatId, userName = '') {
  const lic = getUserLicense(chatId);
  const cleanId = String(chatId).replace(/^TG-/i, '');

  return (
    `👤 <b>ព័ត៌មានគណនី & សុពលភាពរបស់អ្នក</b>\n\n` +
    `💻 <b>លេខកូដគណនី (User ID):</b> <code>TG-${cleanId}</code> <i>(ចុចដើម្បី Copy)</i>\n` +
    `⏱️ <b>ស្ថានភាព License:</b> <b>${lic.label}</b>\n` +
    `⏳ <b>ពេលវេលានៅសល់:</b> <b>${lic.remainingStr}</b>\n` +
    `📅 <b>កាលបរិច្ឆេទផុតកំណត់:</b> <b>${lic.expiresFormatted}</b>\n\n` +
    (lic.active
      ? `✅ <b>គណនីសកម្ម:</b> លោកអ្នកអាចទាញយកវីដេអូបានគ្រប់វេបសាយ (TikTok, Douyin, YouTube, Facebook, ខៅស៊ូ...) ដោយសេរី! 🚀`
      : `🔒 <b>គណនីមិនទាន់មាន License / ផុតកំណត់:</b> សូមចុច Copy លេខកូដខាងលើ រួចផ្ញើទៅកាន់ Admin ដើម្បីបើកសិទ្ធិដំណើរការ!`)
  );
}

/**
 * Builds Admin 1-Click Keyboard for User Authorization, Deduction & Key Generation
 */
function getAdminAuthKeyboard(targetUserId, targetUsername = '') {
  const cleanId = String(targetUserId).replace(/^TG-/i, '');
  const chatUrl = targetUsername
    ? `https://t.me/${targetUsername.replace('@', '')}`
    : `tg://user?id=${cleanId}`;

  return {
    inline_keyboard: [
      // Row 1: Quick Add Presets
      [
        { text: '➕ 1 ថ្ងៃ', callback_data: `admin_auth:${cleanId}:1` },
        { text: '➕ 3 ថ្ងៃ', callback_data: `admin_auth:${cleanId}:3` },
        { text: '➕ 7 ថ្ងៃ', callback_data: `admin_auth:${cleanId}:7` },
        { text: '➕ 30 ថ្ងៃ', callback_data: `admin_auth:${cleanId}:30` }
      ],
      // Row 2: Longer Presets & Lifetime
      [
        { text: '➕ 90 ថ្ងៃ', callback_data: `admin_auth:${cleanId}:90` },
        { text: '➕ 365 ថ្ងៃ', callback_data: `admin_auth:${cleanId}:365` },
        { text: '👑 Lifetime VIP', callback_data: `admin_auth:${cleanId}:0` }
      ],
      // Row 3: DEDUCT / SUBTRACT DAYS (ដកថ្ងៃខែសម្រាប់តេស្ត)
      [
        { text: '➖ ដក 1 ថ្ងៃ', callback_data: `admin_sub:${cleanId}:1` },
        { text: '➖ ដក 2 ថ្ងៃ', callback_data: `admin_sub:${cleanId}:2` },
        { text: '➖ ដក 7 ថ្ងៃ', callback_data: `admin_sub:${cleanId}:7` },
        { text: '🔒 ដកទាំងអស់ (0 ថ្ងៃ)', callback_data: `admin_sub:${cleanId}:all` }
      ],
      // Row 4: Key Generation
      [
        { text: '🔑 Key 7 ថ្ងៃ', callback_data: `admin_genkey:${cleanId}:7` },
        { text: '🔑 Key 30 ថ្ងៃ', callback_data: `admin_genkey:${cleanId}:30` },
        { text: '🔑 Key 1 ឆ្នាំ', callback_data: `admin_genkey:${cleanId}:365` }
      ],
      // Row 5: Refresh & Contact
      [
        { text: '🔄 Refresh ស្ថានភាព', callback_data: `admin_view:${cleanId}` },
        { text: '💬 ឆាតទៅភ្ញៀវ', url: chatUrl }
      ]
    ]
  };
}

/**
 * Builds Admin User Management Card
 */
function getAdminUserCard(targetUserId, guestMeta = {}) {
  const cleanId = String(targetUserId).replace(/^TG-/i, '');
  const users = loadUsersDb();
  const u = users[cleanId] || {};
  const lic = getUserLicense(cleanId);
  const name = guestMeta.userName || u.userName || 'ភ្ញៀវ';
  const username = guestMeta.username || u.username || '';

  return (
    `👑 <b>ផ្ទាំងគ្រប់គ្រងអតិថិជន (Admin Control Panel)</b>\n\n` +
    `👤 <b>ឈ្មោះភ្ញៀវ:</b> <b>${escapeHtml(name)}</b> ${username ? `(@${username})` : ''}\n` +
    `💻 <b>User ID:</b> <code>TG-${cleanId}</code> <i>(ចុចលើកូដដើម្បី Copy)</i>\n` +
    `⏱️ <b>ស្ថានភាព License:</b> <b>${lic.label}</b>\n` +
    `⏳ <b>ពេលវេលានៅសល់:</b> <b>${lic.remainingStr}</b>\n` +
    `📅 <b>កាលបរិច្ឆេទផុតកំណត់:</b> <b>${lic.expiresFormatted}</b>\n` +
    `\n👇 <b>ចុចប៊ូតុងខាងក្រោមដើម្បីបន្ថែម/ដកថ្ងៃ ឬបង្កើត Key ជូនភ្ញៀវ:</b>`
  );
}

/**
 * Builds Instant Admin Notification when a guest enters bot
 */
function getGuestArrivalAlert(guestId, guestMeta = {}) {
  const cleanId = String(guestId).replace(/^TG-/i, '');
  const lic = getUserLicense(cleanId);
  const name = guestMeta.userName || 'ភ្ញៀវ';
  const username = guestMeta.username || '';

  return (
    `🔔 <b>មានភ្ញៀវទើបតែចូល Bot / ស្នើសុំប្រើប្រាស់!</b>\n\n` +
    `👤 <b>ឈ្មោះ:</b> <b>${escapeHtml(name)}</b> ${username ? `(@${username})` : ''}\n` +
    `💻 <b>User ID:</b> <code>TG-${cleanId}</code> <i>(ចុចលើកូដដើម្បី Copy)</i>\n` +
    `⏱️ <b>ស្ថានភាព License:</b> <b>${lic.label}</b>\n` +
    `⏳ <b>ពេលវេលានៅសល់:</b> <b>${lic.remainingStr}</b>\n` +
    `📅 <b>ផុតកំណត់នៅ:</b> <b>${lic.expiresFormatted}</b>\n` +
    `🕒 <b>ពេលវេលា:</b> ${formatKhmerDateTime(new Date().toISOString())}\n\n` +
    `👇 <b>ជ្រើសរើសដើម្បីបើកសិទ្ធិ (Auto-Unlock), ដកថ្ងៃ ឬបង្កើត Key ជូនភ្ញៀវ:</b>`
  );
}

/**
 * Builds License Info Message with 1-Tap Copy Code (NO PRICING TABLE FOR GUESTS)
 */
function getLicenseInfoMessage(chatId, userName = '') {
  const cfg = loadConfig();
  const lic = getUserLicense(chatId);
  const cleanId = String(chatId).replace(/^TG-/i, '');

  return (
    `👑 <b>ប្រព័ន្ធអាជ្ញាប័ណ្ណ (PS DOWNLOADER VIP)</b>\n\n` +
    `សួស្តី <b>${userName || 'មិត្តភក្តិ'}</b>! ដើម្បីទាញយកវីដេអូកម្រិត Full HD គ្មាន Watermark លោកអ្នកត្រូវការ License សកម្ម។\n\n` +
    `💻 <b>លេខកូដគណនីរបស់អ្នក (User ID):</b>\n` +
    `<code>TG-${cleanId}</code> <i>(👉 ចុចលើលេខកូដនេះដើម្បី Copy ភ្លាមៗ)</i>\n\n` +
    `⏱️ <b>ស្ថានភាពបច្ចុប្បន្ន:</b> <b>${lic.label}</b>\n` +
    `⏳ <b>ពេលវេលានៅសល់:</b> <b>${lic.remainingStr}</b>\n` +
    `📅 <b>ផុតកំណត់នៅ:</b> <b>${lic.expiresFormatted}</b>\n\n` +
    `👉 <b>របៀបបើកសិទ្ធិដំណើរការ:</b>\n` +
    `1. ចុច Copy លេខកូដ <code>TG-${cleanId}</code> ខាងលើ\n` +
    `2. ចុចប៊ូតុងខាងក្រោមដើម្បីផ្ញើទៅ Admin <b>${cfg.adminTelegram || '@Thpisal33'}</b>\n` +
    `3. Admin នឹងបើកសិទ្ធិ (Auto-Unlock) ជូនលោកអ្នកភ្លាមៗ!\n\n` +
    `🔑 <i>ប្រសិនបើអ្នកមាន License Key រួចហើយ សូមវាយ:</i>\n` +
    `<code>/key &lt;LicenseKey&gt;</code>`
  );
}

/**
 * Builds Lock Screen for Unlicensed Downloads
 */
function getDownloadLockedMessage(chatId) {
  const cfg = loadConfig();
  const lic = getUserLicense(chatId);
  const cleanId = String(chatId).replace(/^TG-/i, '');

  return (
    `🔒 <b>សុំអភ័យទោស! មុខងារទាញយកវីដេអូត្រូវការ License!</b>\n\n` +
    `💻 <b>លេខកូដគណនីរបស់អ្នក (User ID):</b>\n` +
    `<code>TG-${cleanId}</code> <i>(👉 ចុចលើកូដនេះដើម្បី Copy ភ្លាមៗ)</i>\n\n` +
    `⏱️ <b>ស្ថានភាពបច្ចុប្បន្ន:</b> <b>${lic.label}</b>\n` +
    `⏳ <b>ពេលវេលានៅសល់:</b> <b>${lic.remainingStr}</b>\n\n` +
    `⚠️ គណនីរបស់អ្នកមិនទាន់មាន License សកម្មនៅឡើយទេ ដូច្នេះមិនអាចទាញយកវីដេអូបានឡើយ។\n\n` +
    `👉 សូមចុច Copy លេខកូដខាងលើ រួចផ្ញើទៅកាន់ Admin <b>${cfg.adminTelegram || '@Thpisal33'}</b> ដើម្បីបើកសិទ្ធិដំណើរការ!`
  );
}

/**
 * Builds Welcome Banner
 */
function getDownloaderWelcomeMessage(chatId, userName = '') {
  const lic = getUserLicense(chatId);
  const cleanId = String(chatId).replace(/^TG-/i, '');

  return (
    `🎬 <b>សូមស្វាគមន៍មកកាន់ PS DOWNLOADER BOT!</b> 🤖\n\n` +
    `សួស្តី <b>${escapeHtml(userName) || 'មិត្តភក្តិ'}</b>! នេះជា Bot ផ្លូវការសម្រាប់ទាញយកវីដេអូកម្រិតច្បាស់ Full HD គ្មាន Watermark។\n\n` +
    `💻 <b>លេខកូដគណនី:</b> <code>TG-${cleanId}</code> <i>(ចុចដើម្បី Copy)</i>\n` +
    `⏱️ <b>ស្ថានភាព License:</b> <b>${lic.label}</b>\n` +
    `⏳ <b>ពេលវេលានៅសល់:</b> <b>${lic.remainingStr}</b>\n` +
    `📅 <b>ផុតកំណត់នៅ:</b> <b>${lic.expiresFormatted}</b>\n\n` +
    `📋 <b>បញ្ជីវេបសាយ & Platform ដែលគាំទ្រទាញយក (Download Lists):</b>\n` +
    `1️⃣ 🎵 <b>TikTok (Global)</b> ➜ វីដេអូគ្មាន Watermark + សំឡេង MP3\n` +
    `2️⃣ 🇨🇳 <b>Douyin (抖音 - TikTok ចិន)</b> ➜ វីដេអូចិន Full HD គ្មាន Logo\n` +
    `3️⃣ ⚡ <b>ខៅស៊ូ (Kuaishou - 快手)</b> ➜ វីដេអូខ្លីចិនគ្មាន Watermark\n` +
    `4️⃣ 🔴 <b>YouTube & Shorts</b> ➜ Full HD 1080p, 4K, ចម្រៀង MP3 192k\n` +
    `5️⃣ 📘 <b>Facebook & Reels</b> ➜ FB Watch, Reels, Post Video កម្រិតច្បាស់\n` +
    `6️⃣ 📸 <b>Instagram & Threads</b> ➜ Reels, Post, Story HD\n` +
    `7️⃣ 🎭 <b>រឿងភាគខ្លីចិន (Short Dramas)</b> ➜ Hongguo, MVFFM, HaoSou...\n\n` +
    (lic.active
      ? `👉 <i>លោកអ្នកអាចចុចលើប៊ូតុងវេបសាយខាងក្រោម ឬ Copy Link វីដេអូនោះ រួចបិទភ្ជាប់ (Paste) ផ្ញើមកទីនេះ Bot នឹងទាញយកជូនភ្លាមៗ! 🚀</i>`
      : `🔒 <i>លោកអ្នកត្រូវការសុំបើកសិទ្ធិ License ពី Admin ជាមុនសិន ទើបអាចទាញយកវីដេអូបាន។ សូមចុចប៊ូតុងខាងក្រោម:</i>`)
  );
}

/**
 * Downloads and sends an individual short drama episode with real-time percentage progress
 */
async function downloadAndSendDramaEpisode(token, chatId, msg, statusMsgId, detail, epNum) {
  const epIndex = Math.max(1, Math.min(detail.episode_cnt, parseInt(epNum, 10)));
  const ep = detail.episodes[epIndex - 1];
  if (!ep) {
    throw new Error(`រកមិនឃើញភាគ ${epNum} ឡើយ!`);
  }

  const seriesId = detail.series_id;
  const seriesTitle = detail.title || 'Drama';
  const totalEps = detail.episode_cnt || detail.episodes.length;

  if (statusMsgId) {
    await callTelegramApi(token, 'editMessageText', {
      chat_id: chatId,
      message_id: statusMsgId,
      text:
        `📥 <b>កំពុងទាញយក: ${escapeHtml(seriesTitle)}</b>\n\n` +
        `🎬 <b>ភាគទី ${epIndex} / ${totalEps}</b>\n` +
        `📊 <b>ដំណើរការ:</b> <code>${renderProgressBar(0)}</code>\n\n` +
        `⚡ <i>ប្រព័ន្ធកំពុងចាប់យក Stream Full HD 1080p... 🚀</i>`,
      parse_mode: 'HTML'
    }).catch(() => {});
  }

  const streams = await scraper.getVideoStreams(ep.vid, seriesId);
  if (!streams || !streams.tracks || streams.tracks.length === 0) {
    throw new Error(`មិនអាចចាប់យក Video Stream នៃភាគទី ${epIndex} បានឡើយ។`);
  }

  const track = streams.tracks[0];
  const streamUrl = track.main_url || track.backup_url;
  if (!streamUrl) {
    throw new Error(`គ្មាន Stream URL សម្រាប់ភាគទី ${epIndex} ឡើយ។`);
  }

  const tempEnc = path.join(TEMP_BOT_DIR, `hg_${seriesId}_${epIndex}_${Date.now()}_enc.mp4`);
  const tempFinal = path.join(TEMP_BOT_DIR, `hg_${seriesId}_${epIndex}_${Date.now()}.mp4`);

  try {
    await downloadFileToDisk(streamUrl, tempEnc, track.headers || {}, async (prog) => {
      if (statusMsgId) {
        try {
          await callTelegramApi(token, 'editMessageText', {
            chat_id: chatId,
            message_id: statusMsgId,
            text:
              `📥 <b>កំពុងទាញយក: ${escapeHtml(seriesTitle)}</b>\n\n` +
              `🎬 <b>ភាគទី ${epIndex} / ${totalEps}</b>\n` +
              `📊 <b>ដំណើរការ:</b> <code>${prog.bar}</code> (${prog.sizeStr})\n\n` +
              `⚡ <i>ប្រព័ន្ធកំពុងទាញយក Full HD គ្មាន Watermark... 🚀</i>`,
            parse_mode: 'HTML'
          });
        } catch (_) {}
      }
    });

    if (track.encrypted && track.spade_a) {
      if (statusMsgId) {
        await callTelegramApi(token, 'editMessageText', {
          chat_id: chatId,
          message_id: statusMsgId,
          text:
            `⚙️ <b>កំពុងដំណើរការ Decrypt Full HD: ${escapeHtml(seriesTitle)}</b>\n\n` +
            `🎬 <b>ភាគទី ${epIndex} / ${totalEps}</b>\n` +
            `📊 <b>ដំណើរការ:</b> <code>▰▰▰▰▰▰▰▰▰▰ 100%</code> (ជិតរួចរាល់)\n\n` +
            `🚀 <i>កំពុងបញ្ជូនវីដេអូចូល Telegram...</i>`,
          parse_mode: 'HTML'
        }).catch(() => {});
      }

      await cenc.decryptFile(tempEnc, tempFinal, track.spade_a);
      try { if (fs.existsSync(tempEnc)) fs.unlinkSync(tempEnc); } catch (_) {}
    } else {
      fs.renameSync(tempEnc, tempFinal);
    }

    const caption =
      `🎬 <b>${escapeHtml(seriesTitle)} - ភាគទី ${epIndex}</b>\n\n` +
      `📦 <b>ភាគ:</b> ${epIndex} / ${totalEps}\n` +
      `⚡ <b>កម្រិតរូបភាព:</b> Full HD 1080p (គ្មាន Watermark)\n` +
      `🏷️ <b>Platform:</b> Hongguo Short Drama (红果短剧)\n` +
      `💡 <i>រក្សាទុកក្នុង Gallery: ចុច ⋮ លើវីដេអូ ➡️ Save to Gallery</i>\n` +
      `🤖 <b>Bot:</b> @Ps_media_free_tes_bot`;

    const nextEp = epIndex + 1;
    const inlineButtons = [];
    const nextRow = [];
    if (nextEp <= totalEps) {
      nextRow.push({ text: `▶️ ទាញយកភាគ ${nextEp}`, callback_data: `dl_hg:${seriesId}:${nextEp}` });
    }
    if (nextEp + 1 <= totalEps) {
      nextRow.push({ text: `▶️ ភាគ ${nextEp + 1}`, callback_data: `dl_hg:${seriesId}:${nextEp + 1}` });
    }
    if (nextRow.length > 0) inlineButtons.push(nextRow);

    const packRow = [];
    if (nextEp <= totalEps) {
      const packEnd = Math.min(totalEps, nextEp + 4);
      packRow.push({ text: `📦 ទាញយកភាគ ${nextEp}-${packEnd} (5 ភាគ)`, callback_data: `dl_hg_pack:${seriesId}:${nextEp}:${packEnd}` });
    }
    packRow.push({ text: `📋 រើសភាគផ្សេង`, callback_data: `dl_hg_list:${seriesId}:1` });
    inlineButtons.push(packRow);

    const sendRes = await sendTelegramVideo(token, chatId, tempFinal, {
      caption: caption,
      reply_to_message_id: msg?.message_id,
      reply_markup: { inline_keyboard: inlineButtons },
      width: 720,
      height: 1280
    });

    try { if (fs.existsSync(tempFinal)) fs.unlinkSync(tempFinal); } catch (_) {}

    if (!sendRes.ok) throw new Error(sendRes.error || 'Failed to send drama episode video');

    if (statusMsgId) {
      callTelegramApi(token, 'deleteMessage', { chat_id: chatId, message_id: statusMsgId }).catch(() => {});
    }
    return true;
  } finally {
    try { if (fs.existsSync(tempEnc)) fs.unlinkSync(tempEnc); } catch (_) {}
    try { if (fs.existsSync(tempFinal)) fs.unlinkSync(tempFinal); } catch (_) {}
  }
}

/**
 * Builds Interactive Menu for Drama Series with choices (All, Packs, Custom, Single)
 */
function buildDramaSeriesMenu(seriesId, detail, requestedEp = null) {
  const totalEps = detail.episode_cnt || (detail.episodes ? detail.episodes.length : 1);
  const title = detail.title || detail.series_title || 'Short Drama';
  const desc = detail.desc ? detail.desc.slice(0, 160) + '...' : '';

  let text =
    `🎬 <b>${escapeHtml(title)}</b>\n\n` +
    `📦 <b>ចំនួនភាគសរុប:</b> <b>${totalEps} ភាគ</b> (ចប់ពេញ)\n` +
    `⚡ <b>កម្រិតរូបភាព:</b> <b>Full HD 1080p</b> (គ្មាន Watermark)\n` +
    `🏷️ <b>Platform:</b> Hongguo Short Drama (红果短剧)\n`;

  if (desc) {
    text += `\n📖 <i>${escapeHtml(desc)}</i>\n`;
  }

  if (requestedEp && requestedEp > 1) {
    text += `\n🎯 <b>ភាគដែលអ្នកបានជ្រើសរើស:</b> <b>ភាគទី ${requestedEp}</b>\n`;
  }

  text += `\n👇 <b>សូមជ្រើសរើសជម្រើសទាញយកខាងក្រោម៖</b>`;

  const inline_keyboard = [];

  // If specific episode requested in url:
  if (requestedEp) {
    inline_keyboard.push([
      { text: `▶️ ទាញយកភាគ ${requestedEp} នេះភ្លាម`, callback_data: `dl_hg:${seriesId}:${requestedEp}` }
    ]);
  }

  // 1. Download All (if totalEps > 1)
  if (totalEps > 1) {
    inline_keyboard.push([
      { text: `📦 ទាញយកទាំងអស់ (ភាគ 1 ដល់ ${totalEps})`, callback_data: `dl_hg_pack:${seriesId}:1:${totalEps}` }
    ]);
  }

  // 2. Preset Range Packs (e.g. 1-10, 11-20, 21-30...)
  if (totalEps > 10) {
    const packButtons = [];
    const step = 10;
    for (let s = 1; s <= Math.min(totalEps, 40); s += step) {
      const e = Math.min(totalEps, s + step - 1);
      packButtons.push({
        text: `⚡ ភាគ ${s}-${e}`,
        callback_data: `dl_hg_pack:${seriesId}:${s}:${e}`
      });
    }
    for (let i = 0; i < packButtons.length; i += 2) {
      inline_keyboard.push(packButtons.slice(i, i + 2));
    }
  } else if (totalEps > 1 && totalEps <= 10) {
    inline_keyboard.push([
      { text: `⚡ ភាគ 1-5`, callback_data: `dl_hg_pack:${seriesId}:1:${Math.min(totalEps, 5)}` },
      { text: `⚡ ភាគ 6-${totalEps}`, callback_data: `dl_hg_pack:${seriesId}:6:${totalEps}` }
    ]);
  }

  // 3. Custom Range and Episode 1
  const customRow = [];
  if (!requestedEp || requestedEp !== 1) {
    customRow.push({ text: `▶️ ទាញយកភាគ ១ សិន`, callback_data: `dl_hg:${seriesId}:1` });
  }
  customRow.push({ text: `🎯 កំណត់ភាគតាមចិត្ត (Custom)`, callback_data: `dl_hg_custom:${seriesId}` });
  inline_keyboard.push(customRow);

  // 4. Individual Episode Grid List
  inline_keyboard.push([
    { text: `📋 មើលបញ្ជីភាគទាំងអស់ (1-${totalEps})`, callback_data: `dl_hg_list:${seriesId}:1` }
  ]);

  return { text, reply_markup: { inline_keyboard } };
}

/**
 * Handles batch download of multiple drama episodes sequentially with stop support
 */
async function handleDramaPackDownload(token, chatId, seriesId, startEp, endEp, cachedDetail = null) {
  const lic = getUserLicense(chatId);
  if (!lic.active) {
    const lockNotice = getDownloadLockedMessage(chatId);
    await sendBotMessage(token, chatId, lockNotice);
    return;
  }

  let detail = cachedDetail;
  if (!detail) {
    detail = await scraper.getSeriesDetail(seriesId);
  }
  if (!detail || !detail.episodes || detail.episodes.length === 0) {
    throw new Error(`មិនអាចទាញយកព័ត៌មានរឿងភាគ ${seriesId} បានឡើយ។`);
  }

  const totalEps = detail.episode_cnt || detail.episodes.length;
  const sEp = Math.max(1, Math.min(totalEps, startEp));
  const eEp = Math.max(1, Math.min(totalEps, endEp));
  const title = detail.title || detail.series_title || 'Drama';
  const count = eEp - sEp + 1;

  _ACTIVE_DRAMA_JOBS.set(String(chatId), { cancel: false });

  await sendBotMessage(
    token,
    chatId,
    `📦 <b>បានទទួលការបញ្ជាទាញយក: ${escapeHtml(title)}</b>\n\n` +
    `🔢 <b>ចន្លោះភាគ:</b> <b>ភាគ ${sEp} ដល់ ភាគ ${eEp}</b> (សរុប <b>${count} ភាគ</b>)\n` +
    `⚡ <b>កម្រិតរូបភាព:</b> Full HD 1080p (គ្មាន Watermark)\n\n` +
    `<i>ប្រព័ន្ធកំពុងចាប់ផ្តើមទាញយកម្តងមួយភាគៗ... 🚀</i>`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛑 បញ្ឈប់ការទាញយក (Stop)', callback_data: 'dl_hg_stop' }]
        ]
      }
    }
  );

  for (let ep = sEp; ep <= eEp; ep++) {
    const job = _ACTIVE_DRAMA_JOBS.get(String(chatId));
    if (job && job.cancel) {
      await sendBotMessage(token, chatId, `🛑 <b>បានបញ្ឈប់ការទាញយកត្រឹមភាគទី ${ep - 1}!</b>`);
      break;
    }

    let statusMsgId = null;
    try {
      const statusRes = await sendBotMessage(
        token,
        chatId,
        `⏳ <b>[${ep - sEp + 1}/${count}] កំពុងទាញយក ${escapeHtml(title)} - ភាគទី ${ep}...</b>\n\n` +
        `📊 <b>ដំណើរការ:</b> <code>${renderProgressBar(0)}</code>\n\n` +
        `<i>សូមរង់ចាំបន្តិច... 🚀</i>`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🛑 បញ្ឈប់ (Stop)', callback_data: 'dl_hg_stop' }]
            ]
          }
        }
      );
      if (statusRes && statusRes.ok) statusMsgId = statusRes.result.message_id;
    } catch (_) {}

    try {
      await downloadAndSendDramaEpisode(token, chatId, null, statusMsgId, detail, ep);
    } catch (epErr) {
      console.error(`[PS DOWNLOADER BOT] ❌ Error downloading pack ep ${ep}:`, epErr.message);
      if (statusMsgId) {
        await callTelegramApi(token, 'editMessageText', {
          chat_id: chatId,
          message_id: statusMsgId,
          text: `⚠️ <b>ភាគទី ${ep} មានបញ្ហា:</b> ${epErr.message}`,
          parse_mode: 'HTML'
        }).catch(() => {});
      }
    }

    // Small delay between episode uploads
    await new Promise(r => setTimeout(r, 800));
  }

  _ACTIVE_DRAMA_JOBS.delete(String(chatId));
}

/**
 * Handles incoming video download request
 */
async function handleVideoDownload(token, chatId, msg, targetUrl) {
  const lic = getUserLicense(chatId);
  const cfg = loadConfig();
  const cleanId = String(chatId).replace(/^TG-/i, '');

  // -------------------------------------------------------------
  // STRICT LICENSE CHECK: Lock from video #1 if unlicensed!
  // -------------------------------------------------------------
  if (!lic.active) {
    console.log(`[PS DOWNLOADER BOT] ⛔ Blocked unlicensed download request from TG-${cleanId}`);

    const lockNotice = getDownloadLockedMessage(chatId);
    const prefilledText = encodeURIComponent(`សួស្តីបង ខ្ញុំចង់ទិញ License Bot: TG-${cleanId}`);
    const adminLink = `https://t.me/${(cfg.adminTelegram || '@Thpisal33').replace('@', '')}?text=${prefilledText}`;

    const kb = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💬 ផ្ញើលេខកូដទៅ Admin ឥឡូវនេះ', url: adminLink }],
          [
            { text: '🛒 មើលតារាងតម្លៃ License', callback_data: 'pricing' },
            { text: '🔑 របៀបបញ្ចូល Key', callback_data: 'how_to_key' }
          ]
        ]
      }
    };

    await sendBotMessage(token, chatId, lockNotice, {
      ...kb,
      reply_to_message_id: msg.message_id
    });
    return;
  }

  // -------------------------------------------------------------
  // Licensed User -> Proceed to download
  // -------------------------------------------------------------
  const platform = detectPlatform(targetUrl);
  const platformLabel = getPlatformLabel(platform);

  console.log(`[PS DOWNLOADER BOT] 🚀 Downloading: ${targetUrl} (${platformLabel}) for TG-${cleanId}`);

  // Send status notice
  let statusMsgId = null;
  try {
    const statusRes = await sendBotMessage(
      token,
      chatId,
      `⏳ <b>កំពុងដំណើរការទាញយក ${platformLabel}...</b>\n\n🔗 <code>${targetUrl.length > 50 ? targetUrl.slice(0, 47) + '...' : targetUrl}</code>\n<i>សូមរង់ចាំបន្តិច ប្រព័ន្ធកំពុងចាប់យកវីដេអូកម្រិតច្បាស់ Full HD គ្មាន Watermark... 🚀</i>`,
      { reply_to_message_id: msg.message_id }
    );
    if (statusRes && statusRes.ok) {
      statusMsgId = statusRes.result.message_id;
    }
  } catch (_) {}

  sendChatAction(token, chatId, 'upload_video').catch(() => {});

  try {
    // 1. TikTok / Douyin / Kuaishou
    if (platform === 'tiktok' || platform === 'douyin' || platform === 'kuaishou') {
      const data = await tiktokDownloader.analyzeVideo(targetUrl);
      if (!data || !data.play_url) {
        throw new Error('មិនអាចចាប់យកវីដេអូពីលីងនេះបានឡើយ។ សូមពិនិត្យមើលថាតើវីដេអូនេះជាសាធារណៈ (Public) ឬអត់។');
      }

      const cleanTitle = (data.title || 'Video').replace(/[<>]/g, '').slice(0, 200);
      const authorName = (data.author && data.author.nickname) ? data.author.nickname.replace(/[<>]/g, '') : 'Creator';
      const durationStr = data.duration_str || formatDuration(data.duration);

      let audioKey = null;
      if (data.music_url && data.music_url.startsWith('http')) {
        audioKey = `aud_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        _AUDIO_CACHE.set(audioKey, {
          url: data.music_url,
          title: cleanTitle,
          performer: authorName
        });
      }

      const inlineButtons = [];
      const row1 = [];
      if (audioKey) {
        row1.push({ text: '🎵 ទាញយកជា MP3 (Audio)', callback_data: `dl_audio:${audioKey}` });
      }
      if (data.play_url && data.play_url.startsWith('http')) {
        row1.push({ text: '🌐 Direct Video Link', url: data.play_url });
      }
      if (row1.length > 0) inlineButtons.push(row1);

      const caption =
        `🎬 <b>${cleanTitle}</b>\n\n` +
        `👤 <b>អ្នកបង្កើត:</b> ${authorName}\n` +
        `⏱️ <b>រយៈពេល:</b> ${durationStr}\n` +
        `🏷️ <b>Platform:</b> ${platformLabel}\n` +
        `⚡ <b>គុណភាព:</b> Full HD (គ្មាន Watermark)\n` +
        `🤖 <b>Bot:</b> @Ps_media_free_tes_bot`;

      const sendRes = await sendTelegramVideo(token, chatId, data.play_url, {
        caption: caption,
        reply_to_message_id: msg.message_id,
        reply_markup: inlineButtons.length > 0 ? { inline_keyboard: inlineButtons } : undefined,
        headers: {
          'Referer': platform === 'douyin' ? 'https://www.douyin.com/' : (platform === 'kuaishou' ? 'https://www.kuaishou.com/' : '')
        },
        onProgress: async (prog) => {
          if (statusMsgId) {
            try {
              await callTelegramApi(token, 'editMessageText', {
                chat_id: chatId,
                message_id: statusMsgId,
                text:
                  `📥 <b>កំពុងទាញយក: ${escapeHtml(cleanTitle)}</b>\n\n` +
                  `🏷️ <b>Platform:</b> ${platformLabel}\n` +
                  `📊 <b>ដំណើរការ:</b> <code>${prog.bar}</code> (${prog.sizeStr})\n\n` +
                  `⚡ <i>ប្រព័ន្ធកំពុងទាញយក Full HD គ្មាន Watermark... 🚀</i>`,
                parse_mode: 'HTML'
              });
            } catch (_) {}
          }
        }
      });

      if (!sendRes.ok) {
        if (sendRes.tooLarge) {
          const largeNotice =
            `⚠️ <b>វីដេអូនេះមានទំហំធំ (${sendRes.sizeStr}) លើសពី 50MB (ដែនកំណត់ Telegram Bot)។</b>\n\n` +
            `🔗 <b>Link ទាញយកល្បឿនលឿនផ្ទាល់:</b>\n<a href="${data.play_url}">👉 ចុចទីនេះដើម្បីទាញយកវីដេអូ 👈</a>\n\n` +
            `💡 <i>លោកអ្នកអាចចុចលើ Link ខាងលើ ដើម្បីទាញយកផ្ទាល់លើ Browser ឬប្រើកម្មវិធី PS DOWNLOAD លើកុំព្យូទ័រ!</i>`;
          await sendBotMessage(token, chatId, largeNotice, { reply_to_message_id: msg.message_id });
        } else {
          throw new Error(sendRes.error || 'Failed to upload video to Telegram');
        }
      }

      if (statusMsgId) {
        callTelegramApi(token, 'deleteMessage', { chat_id: chatId, message_id: statusMsgId }).catch(() => {});
      }
      return true;
    }

    // 2. YouTube & Shorts
    if (platform === 'youtube') {
      let meta = null;
      try {
        meta = await getYouTubeMetadata(targetUrl);
      } catch (_) {
        meta = { title: 'YouTube Video', author: 'YouTube', duration: 0, duration_str: '00:00' };
      }

      const cleanTitle = (meta.title || 'YouTube Video').replace(/[<>]/g, '').slice(0, 200);

      const dlRes = await downloadYouTubeVideo(targetUrl, false, async (prog) => {
        if (statusMsgId) {
          try {
            await callTelegramApi(token, 'editMessageText', {
              chat_id: chatId,
              message_id: statusMsgId,
              text:
                `📥 <b>កំពុងទាញយក: ${escapeHtml(cleanTitle)}</b>\n\n` +
                `🏷️ <b>Platform:</b> ${platformLabel}\n` +
                `📊 <b>ដំណើរការ:</b> <code>${prog.bar}</code> (${prog.sizeStr}) ${prog.speed ? `[${prog.speed}]` : ''}\n\n` +
                `⚡ <i>ប្រព័ន្ធកំពុងទាញយក Full HD... 🚀</i>`,
              parse_mode: 'HTML'
            });
          } catch (_) {}
        }
      });

      const caption =
        `🎬 <b>${cleanTitle}</b>\n\n` +
        `👤 <b>ឆានែល:</b> ${meta.author}\n` +
        `⏱️ <b>រយៈពេល:</b> ${meta.duration_str}\n` +
        `🏷️ <b>Platform:</b> ${platformLabel}\n` +
        `📦 <b>ទំហំ File:</b> ${dlRes.sizeStr}\n` +
        `🤖 <b>Bot:</b> @Ps_media_free_tes_bot`;

      const inlineButtons = [
        [{ text: '🎵 ទាញយកជា MP3 (Audio)', callback_data: `dl_yt_mp3:${encodeURIComponent(targetUrl).slice(0, 60)}` }]
      ];

      const sendRes = await sendTelegramVideo(token, chatId, dlRes.filePath, {
        caption: caption,
        reply_to_message_id: msg.message_id,
        reply_markup: { inline_keyboard: inlineButtons }
      });

      if (fs.existsSync(dlRes.filePath)) {
        try { fs.unlinkSync(dlRes.filePath); } catch (_) {}
      }

      if (!sendRes.ok) throw new Error(sendRes.error || 'Failed to send YouTube video');

      if (statusMsgId) {
        callTelegramApi(token, 'deleteMessage', { chat_id: chatId, message_id: statusMsgId }).catch(() => {});
      }
      return true;
    }

    // 3. Short Dramas: Hongguo (红果), HaoSou, MVFFM, BeePlaylet
    if (platform === 'hongguo' || platform === 'haosou' || platform === 'mvffm' || platform === 'beeplaylet') {
      const seriesId = extractSeriesId(targetUrl);
      if (!seriesId) {
        throw new Error('រកមិនឃើញ Series ID នៃរឿងភាគនេះឡើយ។ សូមពិនិត្យមើល Link ម្ដងទៀត។');
      }

      let targetVid = null;
      let requestedEpNum = null;
      const vidMatch = targetUrl.match(/(?:player|video)\/\d+\/(\d+)/i) || targetUrl.match(/[?&]vid=(\d+)/i);
      if (vidMatch) {
        targetVid = vidMatch[1];
      }

      if (statusMsgId) {
        await callTelegramApi(token, 'editMessageText', {
          chat_id: chatId,
          message_id: statusMsgId,
          text: `⏳ <b>កំពុងត្រួតពិនិត្យ និងចាប់យកចំនួនភាគពី ${platformLabel}...</b>\n\n🔗 <code>${targetUrl.length > 50 ? targetUrl.slice(0, 47) + '...' : targetUrl}</code>\n<i>សូមរង់ចាំបន្តិច... 🚀</i>`,
          parse_mode: 'HTML'
        }).catch(() => {});
      }

      const detail = await scraper.getSeriesDetail(seriesId);
      if (!detail || !detail.episodes || detail.episodes.length === 0) {
        throw new Error(`មិនអាចទាញយកព័ត៌មានរឿងភាគ ${seriesId} បានឡើយ។`);
      }

      const totalEps = detail.episode_cnt || detail.episodes.length;

      if (targetVid) {
        const foundIdx = detail.episodes.findIndex(e => String(e.vid) === String(targetVid));
        if (foundIdx >= 0) requestedEpNum = foundIdx + 1;
      }

      // Check if user specified a direct range in the message (e.g. "<url> 1-10" or "<url> 5-15")
      const msgText = (msg.text || msg.caption || '');
      const textAfterUrl = msgText.replace(targetUrl, '').trim();
      const directRangeMatch = textAfterUrl.match(/^(\d+)\s*(?:-|~|\s+to\s+|\s*ដល់\s*)(\d+)$/i);

      if (directRangeMatch) {
        let sEp = parseInt(directRangeMatch[1], 10);
        let eEp = parseInt(directRangeMatch[2], 10);
        if (sEp > eEp) { const tmp = sEp; sEp = eEp; eEp = tmp; }
        sEp = Math.max(1, Math.min(totalEps, sEp));
        eEp = Math.max(1, Math.min(totalEps, eEp));

        if (statusMsgId) {
          callTelegramApi(token, 'deleteMessage', { chat_id: chatId, message_id: statusMsgId }).catch(() => {});
        }
        await handleDramaPackDownload(token, chatId, seriesId, sEp, eEp, detail);
        return true;
      }

      // Save Drama Session for this chat
      _USER_DRAMA_SESSION.set(String(chatId), {
        seriesId,
        detail,
        totalEps,
        title: detail.title || 'Drama',
        timestamp: Date.now()
      });

      // Build & Send the Interactive Drama Series Menu!
      const menu = buildDramaSeriesMenu(seriesId, detail, requestedEpNum);
      if (statusMsgId) {
        await callTelegramApi(token, 'editMessageText', {
          chat_id: chatId,
          message_id: statusMsgId,
          text: menu.text,
          parse_mode: 'HTML',
          reply_markup: menu.reply_markup
        });
      } else {
        await sendBotMessage(token, chatId, menu.text, {
          reply_markup: menu.reply_markup,
          reply_to_message_id: msg.message_id
        });
      }
      return true;
    }

    // 4. Facebook / Instagram / General / Dailymotion
    if (platform === 'facebook' || platform === 'instagram' || platform === 'general' || platform === 'dailymotion') {
      const dlRes = await downloadYouTubeVideo(targetUrl, false, async (prog) => {
        if (statusMsgId) {
          try {
            await callTelegramApi(token, 'editMessageText', {
              chat_id: chatId,
              message_id: statusMsgId,
              text:
                `📥 <b>កំពុងទាញយកវីដេអូ (${platformLabel})...</b>\n\n` +
                `📊 <b>ដំណើរការ:</b> <code>${prog.bar}</code> (${prog.sizeStr}) ${prog.speed ? `[${prog.speed}]` : ''}\n\n` +
                `⚡ <i>ប្រព័ន្ធកំពុងទាញយក Full HD... 🚀</i>`,
              parse_mode: 'HTML'
            });
          } catch (_) {}
        }
      });

      const caption =
        `🎬 <b>ទាញយកវីដេអូបានជោគជ័យ!</b>\n\n` +
        `🏷️ <b>Platform:</b> ${platformLabel}\n` +
        `📦 <b>ទំហំ:</b> ${dlRes.sizeStr}\n` +
        `🤖 <b>Bot:</b> @Ps_media_free_tes_bot`;

      const sendRes = await sendTelegramVideo(token, chatId, dlRes.filePath, {
        caption: caption,
        reply_to_message_id: msg.message_id
      });

      if (fs.existsSync(dlRes.filePath)) {
        try { fs.unlinkSync(dlRes.filePath); } catch (_) {}
      }

      if (!sendRes.ok) throw new Error(sendRes.error || 'Failed to send video');

      if (statusMsgId) {
        callTelegramApi(token, 'deleteMessage', { chat_id: chatId, message_id: statusMsgId }).catch(() => {});
      }
      return true;
    }

    // 5. Direct MP4 link
    if (platform === 'direct') {
      const sendRes = await sendTelegramVideo(token, chatId, targetUrl, {
        caption: `🎬 <b>វីដេអូទាញយកដោយជោគជ័យ!</b>\n\n⚡ <b>Bot:</b> @Ps_media_free_tes_bot`,
        reply_to_message_id: msg.message_id
      });

      if (!sendRes.ok) throw new Error(sendRes.error || 'Failed to stream video');

      if (statusMsgId) {
        callTelegramApi(token, 'deleteMessage', { chat_id: chatId, message_id: statusMsgId }).catch(() => {});
      }
      return true;
    }

    throw new Error('ប្រភេទលីងនេះមិនទាន់ត្រូវបានគាំទ្រនៅឡើយទេ។');

  } catch (err) {
    console.error(`[PS DOWNLOADER BOT] ❌ Error downloading ${targetUrl}:`, err.message);

    const errorMsg =
      `❌ <b>បរាជ័យក្នុងការទាញយកវីដេអូ!</b>\n\n` +
      `⚠️ <b>មូលហេតុ:</b> ${err.message}\n\n` +
      `💡 <i>សូមពិនិត្យមើលថា Link វីដេអូត្រឹមត្រូវ និងបើកជាសាធារណៈ (Public) ឬសាកល្បងម្ដងទៀត។</i>`;

    if (statusMsgId) {
      await callTelegramApi(token, 'editMessageText', {
        chat_id: chatId,
        message_id: statusMsgId,
        text: errorMsg,
        parse_mode: 'HTML'
      });
    } else {
      await sendBotMessage(token, chatId, errorMsg, { reply_to_message_id: msg.message_id });
    }
  }
}

/**
 * Handles callback queries
 */
async function handleCallback(token, query) {
  const data = query.data || '';
  const chatId = query.message?.chat?.id;
  const msgId = query.message?.message_id;
  const cfg = loadConfig();

  if (data.startsWith('dl_audio:')) {
    const audioKey = data.split(':')[1];
    const cached = _AUDIO_CACHE.get(audioKey);

    if (!cached || !cached.url) {
      await callTelegramApi(token, 'answerCallbackQuery', {
        callback_query_id: query.id,
        text: '⚠️ សំឡេងនេះបានផុតកំណត់ហើយ។ សូមផ្ញើ Link ម្ដងទៀត។',
        show_alert: true
      });
      return;
    }

    await callTelegramApi(token, 'answerCallbackQuery', {
      callback_query_id: query.id,
      text: '⏳ កំពុងផ្ញើ File MP3...'
    });

    sendChatAction(token, chatId, 'upload_document').catch(() => {});

    await sendTelegramAudio(token, chatId, cached.url, {
      title: cached.title,
      performer: cached.performer,
      caption: `🎵 <b>${cached.title}</b>\n👤 <b>${cached.performer}</b>\n⚡ @Ps_media_free_tes_bot`,
      reply_to_message_id: msgId
    });
    return;
  }

  if (data.startsWith('dl_yt_mp3:')) {
    const rawUrl = decodeURIComponent(data.replace('dl_yt_mp3:', ''));

    await callTelegramApi(token, 'answerCallbackQuery', {
      callback_query_id: query.id,
      text: '⏳ កំពុងបម្លែងជា MP3...'
    });

    sendChatAction(token, chatId, 'upload_document').catch(() => {});

    try {
      const dlRes = await downloadYouTubeVideo(rawUrl, true);
      await sendTelegramAudio(token, chatId, dlRes.filePath, {
        title: 'YouTube Audio',
        performer: 'YouTube',
        caption: `🎵 <b>YouTube MP3 Audio</b>\n⚡ @Ps_media_free_tes_bot`,
        reply_to_message_id: msgId
      });

      if (fs.existsSync(dlRes.filePath)) {
        try { fs.unlinkSync(dlRes.filePath); } catch (_) {}
      }
    } catch (err) {
      await sendBotMessage(token, chatId, `❌ មិនអាចទាញយក MP3: ${err.message}`, { reply_to_message_id: msgId });
    }
    return;
  }

  // Admin 1-Click Auto-Unlock
  if (data.startsWith('admin_auth:')) {
    const [, targetId, daysStr] = data.split(':');
    const days = parseInt(daysStr, 10);
    const cleanTargetId = targetId.replace(/^TG-/i, '');

    if (!cfg.adminChatId || String(query.from?.id) !== String(cfg.adminChatId)) {
      await callTelegramApi(token, 'answerCallbackQuery', {
        callback_query_id: query.id,
        text: '❌ សិទ្ធិនេះសម្រាប់តែ Admin ប៉ុណ្ណោះ!',
        show_alert: true
      });
      return;
    }

    const users = loadUsersDb();
    const existing = users[cleanTargetId] || {};
    const targetName = existing.userName || 'ភ្ញៀវ';

    const authRes = authorizeUser(cleanTargetId, days, {
      userName: targetName,
      username: existing.username || '',
      authorizedBy: 'Admin (1-Click Telegram)'
    });
    const expText = authRes.expiresAt ? formatKhmerDate(authRes.expiresAt) : 'ពេញមួយជីវិត (Lifetime)';

    await callTelegramApi(token, 'answerCallbackQuery', {
      callback_query_id: query.id,
      text: `✅ បានបើកសិទ្ធិ ${authRes.plan} ជូន TG-${cleanTargetId} ជោគជ័យ!`
    });

    const confirmMsg =
      `⚡ <b>បានបើកសិទ្ធិ (Auto-Unlock) ជូនភ្ញៀវជោគជ័យ!</b> 🎉\n\n` +
      `👤 <b>ឈ្មោះ:</b> <b>${escapeHtml(targetName)}</b>\n` +
      `💻 <b>User ID:</b> <code>TG-${cleanTargetId}</code>\n` +
      `📅 <b>កញ្ចប់:</b> <b>${authRes.plan}</b>\n` +
      `⏳ <b>ផុតកំណត់:</b> ${expText}\n\n` +
      `🟢 <i>ប្រព័ន្ធបានផ្ញើសារជូនដំណឹងអបអរសាទរទៅ Telegram ភ្ញៀវរួចរាល់ហើយ!</i>`;

    await sendBotMessage(token, chatId, confirmMsg);

    // Notify Customer automatically!
    const customerNotice =
      `🎉🎉🎉 <b>អបអរសាទរ! គណនីរបស់អ្នកត្រូវបានបើកសិទ្ធិ (Active)!</b> 🎉🎉🎉\n\n` +
      `💻 <b>លេខកូដគណនី:</b> <code>TG-${cleanTargetId}</code>\n` +
      `📅 <b>សុពលភាព:</b> <b>${authRes.plan}</b>\n` +
      `⏳ <b>ផុតកំណត់:</b> ${expText}\n\n` +
      `👉 <b>ឥឡូវនេះ លោកអ្នកអាចផ្ញើ ឬបិទភ្ជាប់ (Paste) Link វីដេអូ</b> (TikTok, Douyin, YouTube, Facebook, ខៅស៊ូ...) មកទីនេះដើម្បីទាញយកវីដេអូ Full HD គ្មាន Watermark បានភ្លាមៗ! 🚀`;

    sendBotMessage(token, cleanTargetId, customerNotice).catch(() => {});
    return;
  }

  // Admin 1-Click Key Generator
  if (data.startsWith('admin_genkey:')) {
    const [, targetId, daysStr] = data.split(':');
    const days = parseInt(daysStr, 10);
    const cleanTargetId = targetId.replace(/^TG-/i, '');

    if (!cfg.adminChatId || String(query.from?.id) !== String(cfg.adminChatId)) {
      await callTelegramApi(token, 'answerCallbackQuery', {
        callback_query_id: query.id,
        text: '❌ សិទ្ធិនេះសម្រាប់តែ Admin ប៉ុណ្ណោះ!',
        show_alert: true
      });
      return;
    }

    const keyObj = generateLicenseKey(days, 'Admin');

    await callTelegramApi(token, 'answerCallbackQuery', {
      callback_query_id: query.id,
      text: `🔑 បានបង្កើត Key ${keyObj.plan}!`
    });

    const keyReply =
      `🔑 <b>License Key ត្រូវបានបង្កើតរួចរាល់!</b>\n\n` +
      `🎯 <b>សម្រាប់ User:</b> <code>TG-${cleanTargetId}</code>\n` +
      `🔑 <b>License Key:</b> <code>${keyObj.key}</code> <i>(ចុចលើកូដដើម្បី Copy)</i>\n` +
      `📅 <b>សុពលភាព:</b> <b>${keyObj.plan}</b>\n\n` +
      `💬 <b>សារសម្រាប់ Forward ឱ្យភ្ញៀវ:</b>\n` +
      `<blockquote>សួស្តីបង! នេះជា License Key របស់អ្នក:\n<code>/key ${keyObj.key}</code>\n(គ្រាន់តែ Copy រួច Paste ចូល Bot ជាការស្រេច)</blockquote>`;

    await sendBotMessage(token, chatId, keyReply);
    return;
  }

  // Admin 1-Click Lock/Revoke
  if (data.startsWith('admin_lock:')) {
    const targetId = data.replace('admin_lock:', '').replace(/^TG-/i, '');

    if (!cfg.adminChatId || String(query.from?.id) !== String(cfg.adminChatId)) {
      await callTelegramApi(token, 'answerCallbackQuery', {
        callback_query_id: query.id,
        text: '❌ សិទ្ធិនេះសម្រាប់តែ Admin ប៉ុណ្ណោះ!',
        show_alert: true
      });
      return;
    }

    const users = loadUsersDb();
    if (users[targetId]) {
      users[targetId].status = 'revoked';
      users[targetId].expiresAt = null;
      saveUsersDb(users);
      await callTelegramApi(token, 'answerCallbackQuery', {
        callback_query_id: query.id,
        text: `🔒 បានចាក់សោរ TG-${targetId}!`
      });
      await sendBotMessage(token, chatId, `🔒 <b>បានចាក់សោរដកហូត License របស់ <code>TG-${targetId}</code> រួចរាល់!</b>`);
    } else {
      await callTelegramApi(token, 'answerCallbackQuery', {
        callback_query_id: query.id,
        text: `❌ រកមិនឃើញ User ឡើយ!`
      });
    }
    return;
  }

  if (data === 'admin_list_users') {
    if (!cfg.adminChatId || String(query.from?.id) !== String(cfg.adminChatId)) return;
    await callTelegramApi(token, 'answerCallbackQuery', { callback_query_id: query.id });

    const users = loadUsersDb();
    const uList = Object.values(users);
    const activeCount = uList.filter(u => u.status === 'active').length;

    let userText =
      `📋 <b>បញ្ជី User ក្នុងប្រព័ន្ធ PS DOWNLOADER (${uList.length} នាក់):</b>\n` +
      `🟢 <b>សកម្ម:</b> <b>${activeCount}</b> នាក់\n\n`;

    if (uList.length === 0) {
      userText += `<i>មិនទាន់មាន User ណាត្រូវបានចុះឈ្មោះឡើយ។</i>`;
    } else {
      uList.slice(0, 15).forEach((u, idx) => {
        const lic = getUserLicense(u.userId);
        const nameStr = u.userName ? `👤 ${u.userName} | ` : '';
        userText += `${idx + 1}. ${nameStr}<code>TG-${u.userId}</code> ➜ <b>${lic.label}</b>\n`;
      });
    }

    await sendBotMessage(token, chatId, userText);
    return;
  }

  if (data === 'admin_quick_key') {
    if (!cfg.adminChatId || String(query.from?.id) !== String(cfg.adminChatId)) return;
    const keyObj = generateLicenseKey(30, 'Admin');
    await callTelegramApi(token, 'answerCallbackQuery', {
      callback_query_id: query.id,
      text: `🔑 បានបង្កើត Key 30 ថ្ងៃ!`
    });

    const keyReply =
      `🔑 <b>License Key (30 ថ្ងៃ) ត្រូវបានបង្កើតរួចរាល់!</b>\n\n` +
      `🔑 <b>Key:</b> <code>${keyObj.key}</code> <i>(ចុចលើ Key ដើម្បី Copy)</i>\n` +
      `📅 <b>សុពលភាព:</b> <b>${keyObj.plan}</b>\n\n` +
      `👉 <i>ផ្ញើ Key នេះឱ្យភ្ញៀវ នោះគាត់គ្រាន់តែវាយ <code>/key ${keyObj.key}</code> ចូល Bot ជាការស្រេច!</i>`;
    await sendBotMessage(token, chatId, keyReply);
    return;
  }

  // Admin 1-Click Deduct/Subtract Days (ដកថ្ងៃ/ខែ សម្រាប់តេស្ត)
  if (data.startsWith('admin_sub:')) {
    const [, targetId, daysArg] = data.split(':');
    const cleanTargetId = targetId.replace(/^TG-/i, '');

    if (!cfg.adminChatId || String(query.from?.id) !== String(cfg.adminChatId)) {
      await callTelegramApi(token, 'answerCallbackQuery', {
        callback_query_id: query.id,
        text: '❌ សិទ្ធិនេះសម្រាប់តែ Admin ប៉ុណ្ណោះ!',
        show_alert: true
      });
      return;
    }

    const subRes = deductUserDays(cleanTargetId, daysArg === 'all' ? 'all' : parseInt(daysArg, 10));

    if (!subRes.ok) {
      await callTelegramApi(token, 'answerCallbackQuery', {
        callback_query_id: query.id,
        text: `❌ ${subRes.error}`,
        show_alert: true
      });
      return;
    }

    const actionText = daysArg === 'all' ? 'ដកហូតទាំងអស់ (Expired)' : `ដក ${daysArg} ថ្ងៃ`;
    await callTelegramApi(token, 'answerCallbackQuery', {
      callback_query_id: query.id,
      text: `➖ បាន${actionText}! នៅសល់: ${subRes.remainingStr}`
    });

    const users = loadUsersDb();
    const targetUser = users[cleanTargetId] || {};
    const targetName = targetUser.userName || 'ភ្ញៀវ';

    const cardText = getAdminUserCard(cleanTargetId, {
      userName: targetName,
      username: targetUser.username
    });
    const kb = getAdminAuthKeyboard(cleanTargetId, targetUser.username);

    if (msgId) {
      callTelegramApi(token, 'editMessageText', {
        chat_id: chatId,
        message_id: msgId,
        text: cardText,
        parse_mode: 'HTML',
        reply_markup: kb
      }).catch(() => {});
    }

    const adminNotice =
      `➖ <b>បាន${actionText} លើគណនី <code>TG-${cleanTargetId}</code> (${escapeHtml(targetName)})!</b>\n\n` +
      `⏳ <b>សុពលភាពនៅសល់:</b> <b>${subRes.remainingStr}</b>\n` +
      `📅 <b>ផុតកំណត់នៅ:</b> <b>${subRes.expiresFormatted}</b>\n` +
      `🛡️ <b>ស្ថានភាព:</b> <b>${subRes.status === 'active' ? '🟢 សកម្ម' : '🔴 ផុតកំណត់'}</b>`;

    await sendBotMessage(token, chatId, adminNotice);

    // Notify customer
    const customerNotice =
      `ℹ️ <b>ការជូនដំណឹងអំពី License គណនី:</b>\n\n` +
      `💻 <b>លេខកូដគណនី:</b> <code>TG-${cleanTargetId}</code>\n` +
      `⏳ <b>សុពលភាពនៅសល់:</b> <b>${subRes.remainingStr}</b>\n` +
      `📅 <b>ផុតកំណត់នៅ:</b> <b>${subRes.expiresFormatted}</b>\n\n` +
      (subRes.status === 'active'
        ? `👉 លោកអ្នកនៅតែអាចទាញយកវីដេអូបានធម្មតា!`
        : `🔒 <b>គណនីរបស់អ្នកបានផុតកំណត់ហើយ!</b> សូមទាក់ទង Admin ដើម្បីបន្តសុពលភាព។`);

    sendBotMessage(token, cleanTargetId, customerNotice).catch(() => {});
    return;
  }

  // Admin View / Refresh User Card
  if (data.startsWith('admin_view:')) {
    const targetId = data.replace('admin_view:', '').replace(/^TG-/i, '');
    if (!cfg.adminChatId || String(query.from?.id) !== String(cfg.adminChatId)) return;

    await callTelegramApi(token, 'answerCallbackQuery', {
      callback_query_id: query.id,
      text: '🔄 ព័ត៌មានត្រូវបាន Refresh រួចរាល់!'
    });

    const users = loadUsersDb();
    const u = users[targetId] || {};
    const cardText = getAdminUserCard(targetId, {
      userName: u.userName,
      username: u.username
    });
    const kb = getAdminAuthKeyboard(targetId, u.username);

    if (msgId) {
      callTelegramApi(token, 'editMessageText', {
        chat_id: chatId,
        message_id: msgId,
        text: cardText,
        parse_mode: 'HTML',
        reply_markup: kb
      }).catch(() => {});
    }
    return;
  }

  if (data === 'pricing') {
    const pricingMsg = getLicenseInfoMessage(chatId, query.from?.first_name || '');
    const cleanId = String(chatId).replace(/^TG-/i, '');
    const prefilledText = encodeURIComponent(`សួស្តីបង ខ្ញុំចង់បើកសិទ្ធិ License Bot: TG-${cleanId}`);
    const adminLink = `https://t.me/${(cfg.adminTelegram || '@Thpisal33').replace('@', '')}?text=${prefilledText}`;

    await callTelegramApi(token, 'answerCallbackQuery', { callback_query_id: query.id });
    await sendBotMessage(token, chatId, pricingMsg, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💬 ផ្ញើលេខកូដទៅ Admin ឥឡូវនេះ', url: adminLink }]
        ]
      }
    });
    return;
  }

  if (data === 'how_to_key') {
    await callTelegramApi(token, 'answerCallbackQuery', { callback_query_id: query.id });
    const guide =
      `🔑 <b>របៀបបញ្ចូល License Key:</b>\n\n` +
      `បន្ទាប់ពីលោកអ្នកបាន License Key ពី Admin រួចហើយ សូម Copy License Key នោះ រួចវាយ:\n\n` +
      `👉 <code>/key PS-XXXX-XXXX-XXXX</code>\n\n` +
      `<i>(ឬគ្រាន់តែ Paste កូដ License Key ចូលក្នុងឆាតនេះតែម្តង ក៏ Bot នឹង Activate អូតូជូនភ្លាមៗដែរ!)</i>`;
    await sendBotMessage(token, chatId, guide);
    return;
  }

  if (data === 'admin_open_menu') {
    if (!cfg.adminChatId || String(query.from?.id) !== String(cfg.adminChatId)) {
      await callTelegramApi(token, 'answerCallbackQuery', {
        callback_query_id: query.id,
        text: '❌ សិទ្ធិនេះសម្រាប់តែ Admin ប៉ុណ្ណោះ!',
        show_alert: true
      });
      return;
    }
    await callTelegramApi(token, 'answerCallbackQuery', { callback_query_id: query.id });
    const adminWelcome =
      `👑 <b>ផ្ទាំងបញ្ជា Admin (PS DOWNLOADER BOT)</b>\n\n` +
      `🤖 <b>Bot:</b> @${cfg.botUsername || 'Ps_media_free_tes_bot'}\n` +
      `👤 <b>Admin:</b> <b>${(query.from && query.from.first_name) || 'Admin'}</b> (ID: <code>${chatId}</code>)\n` +
      `🛡️ <b>ស្ថានភាព:</b> <b>👑 Admin (Lifetime VIP)</b>\n\n` +
      `💡 <b>គន្លឹះគ្រប់គ្រងភ្ញៀវងាយៗ:</b>\n` +
      `• ពេលមានភ្ញៀវថ្មីចូល Bot នឹងផ្ញើសារ Alert មកលោកអ្នកដោយស្វ័យប្រវត្តិ!\n` +
      `• លោកអ្នកគ្រាន់តែចុចប៊ូតុង <b>[➕ បន្ថែម]</b> ឬ <b>[➖ ដកថ្ងៃ]</b> នោះប្រព័ន្ធនឹងធ្វើការភ្លាមៗ!\n` +
      `• ឬគ្រាន់តែ <b>Paste លេខកូដ <code>TG-XXXXX</code></b> របស់ភ្ញៀវចូលទីនេះ ដើម្បីបើកផ្ទាំងគ្រប់គ្រង!\n` +
      `• បញ្ជាកាត់បន្ថយថ្ងៃ: <code>/sub TG-XXXXX 1</code> ឬ <code>/sub TG-XXXXX all</code>\n` +
      `• បញ្ជាបន្ថែមថ្ងៃ: <code>/add TG-XXXXX 30</code>\n` +
      `• បញ្ជាចាក់សោរ: <code>/lock TG-XXXXX</code>`;

    await sendBotMessage(token, chatId, adminWelcome, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📋 បញ្ជី User (/users)', callback_data: 'admin_list_users' },
            { text: '🔑 បង្កើត Key 30 ថ្ងៃ', callback_data: 'admin_quick_key' }
          ]
        ]
      }
    });
    return;
  }

  if (data === 'my_profile') {
    await callTelegramApi(token, 'answerCallbackQuery', { callback_query_id: query.id });
    const profMsg = getUserProfileMessage(chatId, (query.from && query.from.first_name) || '');
    const lic = getUserLicense(chatId);
    const isAdminUser = cfg.adminChatId && String(chatId) === String(cfg.adminChatId);
    const cleanId = String(chatId).replace(/^TG-/i, '');
    const prefilledText = encodeURIComponent(`សួស្តីបង ខ្ញុំចង់បើកសិទ្ធិ Bot: TG-${cleanId}`);
    const adminLink = `https://t.me/${(cfg.adminTelegram || '@Thpisal33').replace('@', '')}?text=${prefilledText}`;

    const inlineButtons = [];
    if (!lic.active && !isAdminUser) {
      inlineButtons.push([{ text: '💬 ផ្ញើលេខកូដទៅ Admin', url: adminLink }]);
      inlineButtons.push([{ text: '🔑 របៀបបញ្ចូល Key', callback_data: 'how_to_key' }]);
    } else {
      inlineButtons.push([
        { text: '🌐 រើសវេបសាយទាញយក', callback_data: 'show_platforms' },
        { text: '💡 របៀបទាញយក', callback_data: 'how_to_dl' }
      ]);
    }
    await sendBotMessage(token, chatId, profMsg, {
      reply_markup: { inline_keyboard: inlineButtons }
    });
    return;
  }

  if (data === 'show_platforms') {
    await callTelegramApi(token, 'answerCallbackQuery', { callback_query_id: query.id });
    const platformMsg = getPlatformsListMessage();
    const lic = getUserLicense(chatId);
    const isAdminUser = cfg.adminChatId && String(chatId) === String(cfg.adminChatId);
    await sendBotMessage(token, chatId, platformMsg, {
      reply_markup: getWebsiteButtons(chatId, lic.active, isAdminUser)
    });
    return;
  }

  if (data === 'how_to_dl') {
    await callTelegramApi(token, 'answerCallbackQuery', { callback_query_id: query.id });
    const guideMsg =
      `💡 <b>របៀបទាញយកវីដេអូងាយៗ (៣ ជំហាន):</b>\n\n` +
      `1️⃣ បើកកម្មវិធី <b>TikTok, Douyin, YouTube, Facebook, ខៅស៊ូ</b>\n` +
      `2️⃣ ចុចប៊ូតុង <b>Share (ចែករំលែក)</b> រួចចុច <b>Copy Link (ចម្លងតំណ)</b>\n` +
      `3️⃣ ចូលមកក្នុងឆាត Bot នេះ រួច <b>Paste (បិទភ្ជាប់)</b> ផ្ញើមកទីនេះ\n\n` +
      `🚀 <i>Bot នឹងទាញយកវីដេអូកម្រិតច្បាស់ Full HD គ្មាន Watermark ផ្ញើជូនលោកអ្នកភ្លាមៗ!</i>`;
    await sendBotMessage(token, chatId, guideMsg);
    return;
  }

  if (data === 'noop') {
    await callTelegramApi(token, 'answerCallbackQuery', { callback_query_id: query.id });
    return;
  }

  // 1. Single Episode Download Callback
  if (data.startsWith('dl_hg:')) {
    const parts = data.split(':');
    const seriesId = parts[1];
    const epNum = parseInt(parts[2], 10) || 1;
    const lic = getUserLicense(chatId);

    if (!lic.active) {
      await callTelegramApi(token, 'answerCallbackQuery', {
        callback_query_id: query.id,
        text: '🔒 គណនីរបស់អ្នកមិនទាន់មាន License ឡើយ!',
        show_alert: true
      });
      return;
    }

    await callTelegramApi(token, 'answerCallbackQuery', {
      callback_query_id: query.id,
      text: `⏳ កំពុងដំណើរការទាញយកភាគទី ${epNum}...`
    });

    sendChatAction(token, chatId, 'upload_video').catch(() => {});

    let statusMsgId = null;
    try {
      const statusRes = await sendBotMessage(
        token,
        chatId,
        `⏳ <b>កំពុងដំណើរការទាញយកភាគទី ${epNum}...</b>\n\n<i>សូមរង់ចាំបន្តិច ប្រព័ន្ធកំពុងចាប់យក Stream Full HD 1080p... 🚀</i>`,
        { reply_to_message_id: msgId }
      );
      if (statusRes && statusRes.ok) statusMsgId = statusRes.result.message_id;
    } catch (_) {}

    try {
      const detail = await scraper.getSeriesDetail(seriesId);
      if (!detail || !detail.episodes || detail.episodes.length === 0) {
        throw new Error(`មិនអាចទាញយកព័ត៌មានរឿងភាគ ${seriesId} បានឡើយ។`);
      }
      await downloadAndSendDramaEpisode(token, chatId, query.message, statusMsgId, detail, epNum);
    } catch (err) {
      console.error(`[PS DOWNLOADER BOT] ❌ Error in dl_hg callback:`, err.message);
      if (statusMsgId) {
        await callTelegramApi(token, 'editMessageText', {
          chat_id: chatId,
          message_id: statusMsgId,
          text: `❌ <b>បរាជ័យក្នុងការទាញយកភាគ ${epNum}:</b> ${err.message}`,
          parse_mode: 'HTML'
        }).catch(() => {});
      }
    }
    return;
  }

  // 2. Batch/Pack Download Callback (e.g. 5, 10 or all episodes)
  if (data.startsWith('dl_hg_pack:')) {
    const parts = data.split(':');
    const seriesId = parts[1];
    const startEp = parseInt(parts[2], 10) || 1;
    const endEp = parseInt(parts[3], 10) || startEp;
    const lic = getUserLicense(chatId);

    if (!lic.active) {
      await callTelegramApi(token, 'answerCallbackQuery', {
        callback_query_id: query.id,
        text: '🔒 គណនីរបស់អ្នកមិនទាន់មាន License ឡើយ!',
        show_alert: true
      });
      return;
    }

    await callTelegramApi(token, 'answerCallbackQuery', {
      callback_query_id: query.id,
      text: `📦 កំពុងចាប់ផ្តើមទាញយកភាគ ${startEp} ដល់ ${endEp}...`
    });

    handleDramaPackDownload(token, chatId, seriesId, startEp, endEp).catch(e => console.error('[Pack Download Error]', e));
    return;
  }

  // 3. Custom Episode Range Prompt Callback
  if (data.startsWith('dl_hg_custom:')) {
    const seriesId = data.split(':')[1];
    await callTelegramApi(token, 'answerCallbackQuery', { callback_query_id: query.id });

    try {
      const detail = await scraper.getSeriesDetail(seriesId);
      const totalEps = detail ? (detail.episode_cnt || detail.episodes?.length || 1) : 1;
      const title = detail?.title || 'Drama';

      _USER_DRAMA_SESSION.set(String(chatId), {
        seriesId,
        detail,
        totalEps,
        title,
        awaitingRange: true,
        timestamp: Date.now()
      });

      const customPrompt =
        `🎯 <b>កំណត់ចន្លោះភាគដែលចង់ទាញយក (Custom Range):</b>\n\n` +
        `🎬 <b>រឿង:</b> <b>${escapeHtml(title)}</b> (សរុប <b>${totalEps}</b> ភាគ)\n\n` +
        `👉 <b>សូមវាយលេខភាគផ្ញើចូលឆាតនេះ:</b>\n` +
        `• វាយ <code>1-5</code> (ដើម្បីទាញយកពីភាគ ១ ដល់ ភាគ ៥)\n` +
        `• វាយ <code>10-20</code> (ដើម្បីទាញយកពីភាគ ១០ ដល់ ភាគ ២០)\n` +
        `• វាយ <code>7</code> (ដើម្បីទាញយកតែភាគ ៧ មួយគត់)\n\n` +
        `💡 <i>ប្រព័ន្ធនឹងចាប់ផ្តើមទាញយកចន្លោះភាគនោះជូនភ្លាមៗ!</i>`;

      await sendBotMessage(token, chatId, customPrompt);
    } catch (e) {
      await sendBotMessage(token, chatId, `❌ មិនអាចបើកផ្ទាំងកំណត់ភាគ: ${e.message}`);
    }
    return;
  }

  // 4. Cancel / Stop Download Callback
  if (data === 'dl_hg_stop') {
    _ACTIVE_DRAMA_JOBS.set(String(chatId), { cancel: true });
    await callTelegramApi(token, 'answerCallbackQuery', {
      callback_query_id: query.id,
      text: '🛑 កំពុងបញ្ឈប់ការទាញយក...',
      show_alert: true
    });
    return;
  }

  // 3. Episode Selection Grid (20 eps per page, 5 buttons per row)
  if (data.startsWith('dl_hg_list:')) {
    const parts = data.split(':');
    const seriesId = parts[1];
    const page = parseInt(parts[2], 10) || 1;
    const perPage = 20;

    await callTelegramApi(token, 'answerCallbackQuery', { callback_query_id: query.id });

    try {
      const detail = await scraper.getSeriesDetail(seriesId);
      if (!detail || !detail.episodes || detail.episodes.length === 0) {
        throw new Error('មិនអាចទាញយកបញ្ជីភាគបានឡើយ');
      }

      const totalEps = detail.episodes.length;
      const totalPages = Math.ceil(totalEps / perPage);
      const curPage = Math.max(1, Math.min(totalPages, page));
      const startEp = (curPage - 1) * perPage + 1;
      const endEp = Math.min(totalEps, curPage * perPage);

      const title = detail.title || detail.series_title || 'Hongguo Drama';
      const rows = [];
      let currentRow = [];

      for (let ep = startEp; ep <= endEp; ep++) {
        currentRow.push({
          text: `${ep}`,
          callback_data: `dl_hg:${seriesId}:${ep}`
        });
        if (currentRow.length === 5) {
          rows.push(currentRow);
          currentRow = [];
        }
      }
      if (currentRow.length > 0) rows.push(currentRow);

      const navRow = [];
      if (curPage > 1) {
        navRow.push({ text: '◀️ មុន', callback_data: `dl_hg_list:${seriesId}:${curPage - 1}` });
      }
      navRow.push({ text: `📄 ទំព័រ ${curPage}/${totalPages}`, callback_data: 'noop' });
      if (curPage < totalPages) {
        navRow.push({ text: 'បន្ទាប់ ▶️', callback_data: `dl_hg_list:${seriesId}:${curPage + 1}` });
      }
      rows.push(navRow);

      const listText =
        `📋 <b>បញ្ជីភាគរឿង: ${escapeHtml(title)}</b>\n\n` +
        `🔢 <b>ចំនួនភាគសរុប:</b> <b>${totalEps} ភាគ</b> (ទំព័រ ${curPage}/${totalPages})\n` +
        `👉 <b>សូមចុចលើលេខភាគខាងក្រោមដើម្បីទាញយក:</b>`;

      if (msgId) {
        await callTelegramApi(token, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text: listText,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: rows }
        }).catch(async () => {
          await sendBotMessage(token, chatId, listText, { reply_markup: { inline_keyboard: rows } });
        });
      } else {
        await sendBotMessage(token, chatId, listText, { reply_markup: { inline_keyboard: rows } });
      }
    } catch (err) {
      await sendBotMessage(token, chatId, `❌ មិនអាចទាញយកបញ្ជីភាគ: ${err.message}`);
    }
    return;
  }
}

/**
 * Main Long-Polling Loop
 */
async function startBot() {
  const cfg = loadConfig();
  const token = cfg.botToken;

  if (!token) {
    console.error('[PS DOWNLOADER BOT] ❌ Error: botToken is missing in data/video_bot_config.json');
    process.exit(1);
  }

  try {
    fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
  } catch (_) {}

  const botInfo = await callTelegramApi(token, 'getMe');
  if (!botInfo || !botInfo.ok) {
    console.error('[PS DOWNLOADER BOT] ❌ Failed to connect to Telegram with token:', token);
    console.error(botInfo);
    process.exit(1);
  }

  console.log('==============================================================');
  console.log(`  🎬 PS DOWNLOADER BOT IS ACTIVE: @${botInfo.result.username}  `);
  console.log('==============================================================');
  console.log(`[Bot Name]    ${botInfo.result.first_name}`);
  console.log(`[Username]    @${botInfo.result.username}`);
  console.log(`[Admin ID]    ${cfg.adminChatId || 'Not set'}`);
  console.log(`[Status]      Polling updates 24/7 with Strict License Gating...`);
  console.log('--------------------------------------------------------------');

  let lastUpdateId = 0;

  while (true) {
    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);

      let data = null;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            offset: lastUpdateId,
            timeout: 10,
            allowed_updates: ['message', 'edited_message', 'channel_post', 'callback_query']
          }),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (res.ok) {
          data = await res.json();
        } else {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
      } catch (err) {
        clearTimeout(timer);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      if (data && data.ok && Array.isArray(data.result) && data.result.length > 0) {
        for (const update of data.result) {
          lastUpdateId = update.update_id + 1;

          // 1. Callback query
          if (update.callback_query) {
            handleCallback(token, update.callback_query).catch(e => console.error('[Callback Error]', e));
            continue;
          }

          // 2. Message
          const msg = update.message || update.edited_message || update.channel_post;
          if (!msg || !msg.chat) continue;

          const rawText = (msg.text || msg.caption || '').trim();
          const chatId = msg.chat.id;
          const fromId = msg.from ? String(msg.from.id) : String(chatId);
          const isAdmin = cfg.adminChatId && String(fromId) === String(cfg.adminChatId);
          const lic = getUserLicense(chatId);

          console.log(`[PS DOWNLOADER BOT] 💬 Received from ${(msg.from && msg.from.first_name) || 'User'} (${chatId}) [Admin: ${isAdmin}]: "${rawText}"`);

          // ---------------------------------------------------------
          // GUEST ARRIVAL / ACTIVITY TRACKING & ADMIN ALERT
          // ---------------------------------------------------------
          if (!isAdmin) {
            const cleanFromId = String(fromId).replace(/^TG-/i, '');
            const guestFirstName = msg.from?.first_name || '';
            const guestLastName = msg.from?.last_name || '';
            const guestFullName = [guestFirstName, guestLastName].filter(Boolean).join(' ') || 'ភ្ញៀវ';
            const guestUsername = msg.from?.username || '';

            const users = loadUsersDb();
            if (!users[cleanFromId]) {
              users[cleanFromId] = {
                userId: cleanFromId,
                userName: guestFullName,
                username: guestUsername,
                status: 'pending',
                plan: 'មិនទាន់មាន License',
                days: 0,
                createdAt: new Date().toISOString(),
                lastSeen: new Date().toISOString()
              };
              saveUsersDb(users);
            } else {
              let updated = false;
              if (guestFullName && users[cleanFromId].userName !== guestFullName) {
                users[cleanFromId].userName = guestFullName;
                updated = true;
              }
              if (guestUsername && users[cleanFromId].username !== guestUsername) {
                users[cleanFromId].username = guestUsername;
                updated = true;
              }
              users[cleanFromId].lastSeen = new Date().toISOString();
              if (updated) saveUsersDb(users);
            }

            // Instant Alert to Admin if guest not alerted in last 10 minutes
            const lastAlert = _GUEST_ALERT_TIMERS.get(cleanFromId) || 0;
            const now = Date.now();
            if (now - lastAlert > 10 * 60 * 1000 && cfg.adminChatId) {
              _GUEST_ALERT_TIMERS.set(cleanFromId, now);

              const alertText = getGuestArrivalAlert(cleanFromId, {
                userName: guestFullName,
                username: guestUsername
              });
              const kb = getAdminAuthKeyboard(cleanFromId, guestUsername);

              sendBotMessage(token, cfg.adminChatId, alertText, {
                reply_markup: kb
              }).catch(e => console.error('[Admin Alert Error]', e));
            }
          }

          const parts = rawText.split(/\s+/);
          const cmd = parts[0].toLowerCase();
          const args = parts.slice(1);

          // ---------------------------------------------------------
          // ADMIN COMMANDS (Only available to Admin Chat ID)
          // ---------------------------------------------------------
          if (isAdmin) {
            // Admin pastes or enters a customer User ID like "TG-6160826681" or "6160826681"
            const idMatch = rawText.match(/(?:TG-)?(\d{7,15})/i);
            if (idMatch && !rawText.startsWith('/add') && !rawText.startsWith('/lock') && !rawText.startsWith('/revoke')) {
              const targetUserId = idMatch[1];
              const users = loadUsersDb();
              const u = users[targetUserId] || {};
              const cardText = getAdminUserCard(targetUserId, {
                userName: u.userName,
                username: u.username
              });
              const kb = getAdminAuthKeyboard(targetUserId, u.username);

              await sendBotMessage(token, chatId, cardText, {
                reply_markup: kb
              });
              continue;
            }

            if (cmd === '/admin' || cmd === '/menu' || rawText === '👑 Admin Menu') {
              const adminMenuText =
                `👑 <b>ផ្ទាំងបញ្ជា Admin (PS DOWNLOADER BOT)</b>\n\n` +
                `👉 <b>បញ្ជាគ្រប់គ្រងផ្សេងៗ:</b>\n` +
                `• <code>/users</code> ➜ មើលបញ្ជី User ទាំងអស់\n` +
                `• <code>/keygen 30</code> ➜ បង្កើត License Key 30 ថ្ងៃ\n` +
                `• <code>/add TG-XXXXX 30</code> ➜ បើកសិទ្ធិអូតូ\n` +
                `• <code>/sub TG-XXXXX 1</code> ➜ ដក 1 ថ្ងៃ\n` +
                `• <code>/sub TG-XXXXX all</code> ➜ ដកហូតទាំងអស់\n` +
                `• <code>/lock TG-XXXXX</code> ➜ ចាក់សោរដកហូត\n\n` +
                `💡 <i>គន្លឹះពិសេស: Admin គ្រាន់តែ Paste លេខកូដ <code>TG-XXXXX</code> របស់ភ្ញៀវចូលទីនេះ នោះផ្ទាំង 1-Click Auto-Unlock នឹងបង្ហាញឡើងភ្លាមៗ!</i>`;

              await sendBotMessage(token, chatId, adminMenuText, {
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '📋 បញ្ជី User (/users)', callback_data: 'admin_list_users' },
                      { text: '🔑 បង្កើត Key 30 ថ្ងៃ', callback_data: 'admin_quick_key' }
                    ]
                  ]
                }
              });
              continue;
            }

            // Admin Command: /sub or /minus or /deduct <TG-ID> <days>
            if (cmd === '/sub' || cmd === '/minus' || cmd === '/deduct') {
              if (args.length < 1) {
                const guide =
                  `➖ <b>របៀបដកថ្ងៃ License របស់ User (សម្រាប់តេស្ត):</b>\n\n` +
                  `👉 <code>/sub &lt;TG-ID&gt; &lt;ចំនួនថ្ងៃ&gt;</code>\n\n` +
                  `<b>ឧទាហរណ៍:</b>\n` +
                  `• <code>/sub TG-12345678 1</code> (ដក 1 ថ្ងៃ)\n` +
                  `• <code>/sub TG-12345678 2</code> (ដក 2 ថ្ងៃ)\n` +
                  `• <code>/sub TG-12345678 all</code> (ដកទាំងអស់ / ផុតកំណត់ភ្លាម)`;
                await sendBotMessage(token, chatId, guide);
                continue;
              }

              const targetUserId = args[0].replace(/^TG-/i, '');
              const daysArg = args[1] || '1';
              const subRes = deductUserDays(targetUserId, daysArg === 'all' ? 'all' : parseInt(daysArg, 10));

              if (!subRes.ok) {
                await sendBotMessage(token, chatId, `❌ ${subRes.error}`);
                continue;
              }

              const actionText = daysArg === 'all' ? 'ដកហូតទាំងអស់ (Expired)' : `ដក ${daysArg} ថ្ងៃ`;
              const adminNotice =
                `➖ <b>បាន${actionText} លើគណនី <code>TG-${targetUserId}</code>!</b>\n\n` +
                `⏳ <b>សុពលភាពនៅសល់:</b> <b>${subRes.remainingStr}</b>\n` +
                `📅 <b>ផុតកំណត់នៅ:</b> <b>${subRes.expiresFormatted}</b>\n` +
                `🛡️ <b>ស្ថានភាព:</b> <b>${subRes.status === 'active' ? '🟢 សកម្ម' : '🔴 ផុតកំណត់'}</b>`;

              await sendBotMessage(token, chatId, adminNotice);
              continue;
            }

            // Admin Command: /add <TG-ID> <days>
            if (cmd === '/add' || cmd === '/authorize' || cmd === '/unlock') {
              if (args.length < 1) {
                const guide =
                  `➕ <b>របៀបបន្ថែម / បើកសិទ្ធិ License ជូនភ្ញៀវ:</b>\n\n` +
                  `👉 <code>/add &lt;TG-ID&gt; &lt;ថ្ងៃ&gt;</code>\n\n` +
                  `<b>ឧទាហរណ៍:</b>\n` +
                  `• <code>/add TG-12345678 1</code> (បើកសិទ្ធិ 1 ថ្ងៃ)\n` +
                  `• <code>/add TG-12345678 3</code> (បើកសិទ្ធិ 3 ថ្ងៃ)\n` +
                  `• <code>/add TG-12345678 7</code> (បើកសិទ្ធិ 7 ថ្ងៃ)\n` +
                  `• <code>/add TG-12345678 30</code> (បើកសិទ្ធិ 30 ថ្ងៃ)\n` +
                  `• <code>/add TG-12345678 365</code> (បើកសិទ្ធិ 1 ឆ្នាំ)\n` +
                  `• <code>/add TG-12345678 0</code> (បើកសិទ្ធិ Lifetime VIP)`;
                await sendBotMessage(token, chatId, guide);
                continue;
              }

              const targetUserId = args[0].replace(/^TG-/i, '');
              const targetDays = args[1] !== undefined ? parseInt(args[1], 10) : 30;

              const authRes = authorizeUser(targetUserId, targetDays, {
                authorizedBy: 'Admin (Chat)'
              });

              const expText = authRes.expiresAt ? formatKhmerDateTime(authRes.expiresAt) : 'ពេញមួយជីវិត (Lifetime)';

              // 1. Reply to Admin
              const adminReply =
                `⚡ <b>បានបើកសិទ្ធិ (Auto-Unlock) ជូនភ្ញៀវដោយជោគជ័យ!</b> 🎉\n\n` +
                `💻 <b>User ID:</b> <code>TG-${targetUserId}</code>\n` +
                `📅 <b>កញ្ចប់:</b> <b>${authRes.plan}</b>\n` +
                `⏳ <b>ផុតកំណត់:</b> ${expText}\n\n` +
                `🟢 <i>ប្រព័ន្ធបានជូនដំណឹងទៅកាន់ Telegram ភ្ញៀវដោយស្វ័យប្រវត្តិកំពុងដំណើរការ!</i>`;
              await sendBotMessage(token, chatId, adminReply);

              // 2. Notify the customer automatically!
              const customerNotice =
                `🎉🎉🎉 <b>អបអរសាទរ! គណនីរបស់អ្នកត្រូវបានបើកសិទ្ធិ (Active)!</b> 🎉🎉🎉\n\n` +
                `💻 <b>លេខកូដគណនី:</b> <code>TG-${targetUserId}</code>\n` +
                `📅 <b>សុពលភាព:</b> <b>${authRes.plan}</b>\n` +
                `⏳ <b>ផុតកំណត់:</b> ${expText}\n\n` +
                `👉 <b>ឥឡូវនេះ លោកអ្នកអាចផ្ញើ ឬបិទភ្ជាប់ Link វីដេអូ</b> (TikTok, Douyin, YouTube, Facebook, ខៅស៊ូ...) មកទីនេះដើម្បីទាញយកវីដេអូ Full HD គ្មាន Watermark បានភ្លាមៗ! 🚀`;

              sendBotMessage(token, targetUserId, customerNotice).catch(() => {});
              continue;
            }

            // Admin Command: /keygen <days>
            if (cmd === '/keygen' || cmd === '/genkey' || rawText === '🔑 បង្កើត Key 30 ថ្ងៃ') {
              const days = args[0] !== undefined ? parseInt(args[0], 10) : 30;
              const keyObj = generateLicenseKey(days, 'Admin');

              const keyReply =
                `🔑 <b>License Key ត្រូវបានបង្កើតរួចរាល់!</b>\n\n` +
                `🔑 <b>Key:</b> <code>${keyObj.key}</code> <i>(ចុចលើ Key ដើម្បី Copy)</i>\n` +
                `📅 <b>សុពលភាព:</b> <b>${keyObj.plan}</b>\n\n` +
                `👉 <i>ផ្ញើ Key នេះឱ្យភ្ញៀវ នោះគាត់គ្រាន់តែវាយ <code>/key ${keyObj.key}</code> ចូល Bot ជាការស្រេច!</i>`;
              await sendBotMessage(token, chatId, keyReply);
              continue;
            }

            // Admin Command: /users or /list
            if (cmd === '/users' || cmd === '/list' || cmd === '/playlist' || rawText === '📋 បញ្ជី User') {
              const users = loadUsersDb();
              const uList = Object.values(users);
              const activeCount = uList.filter(u => u.status === 'active').length;

              let userText =
                `📋 <b>បញ្ជី User ក្នុងប្រព័ន្ធ PS DOWNLOADER (${uList.length} នាក់):</b>\n` +
                `🟢 <b>សកម្ម:</b> <b>${activeCount}</b> នាក់\n\n`;

              if (uList.length === 0) {
                userText += `<i>មិនទាន់មាន User ណាត្រូវបានចុះឈ្មោះឡើយ។</i>`;
              } else {
                uList.slice(0, 15).forEach((u, idx) => {
                  const lic = getUserLicense(u.userId);
                  const nameStr = u.userName ? `👤 ${u.userName} | ` : '';
                  userText += `${idx + 1}. ${nameStr}<code>TG-${u.userId}</code> ➜ <b>${lic.label}</b>\n`;
                });
              }

              await sendBotMessage(token, chatId, userText);
              continue;
            }

            // Admin Command: /lock <TG-ID>
            if (cmd === '/lock' || cmd === '/revoke') {
              if (args.length < 1) {
                await sendBotMessage(token, chatId, '👉 របៀបចាក់សោរ: <code>/lock &lt;TG-ID&gt;</code>');
                continue;
              }
              const targetUserId = args[0].replace(/^TG-/i, '');
              const users = loadUsersDb();
              if (users[targetUserId]) {
                users[targetUserId].status = 'revoked';
                users[targetUserId].expiresAt = null;
                saveUsersDb(users);
                await sendBotMessage(token, chatId, `🔒 បានចាក់សោរដកហូត License របស់ <code>TG-${targetUserId}</code> រួចរាល់!`);
              } else {
                await sendBotMessage(token, chatId, `❌ រកមិនឃើញ User <code>TG-${targetUserId}</code> ឡើយ!`);
              }
              continue;
            }
          }

          // ---------------------------------------------------------
          // PERSISTENT REPLY KEYBOARD BUTTONS & SHORTCUTS
          // ---------------------------------------------------------
          if (cmd === '/platforms' || cmd === '/websites' || rawText === '🌐 រើសវេបសាយ (Platforms)' || rawText === '🌐 រើសវេបសាយ') {
            const platformMsg = getPlatformsListMessage();
            await sendBotMessage(token, chatId, platformMsg, {
              reply_markup: getWebsiteButtons(chatId, lic.active, isAdmin)
            });
            continue;
          }

          if (cmd === '/id' || cmd === '/myid' || cmd === '/profile' || cmd === '/status' || rawText === '👤 គណនីខ្ញុំ & នាទីនៅសល់' || rawText === '💻 លេខកូដគណនីខ្ញុំ (User ID)') {
            const profMsg = getUserProfileMessage(chatId, (msg.from && msg.from.first_name) || '');
            const cleanId = String(chatId).replace(/^TG-/i, '');
            const prefilledText = encodeURIComponent(`សួស្តីបង ខ្ញុំចង់បើកសិទ្ធិ Bot: TG-${cleanId}`);
            const adminLink = `https://t.me/${(cfg.adminTelegram || '@Thpisal33').replace('@', '')}?text=${prefilledText}`;

            const inlineButtons = [];
            if (!lic.active && !isAdmin) {
              inlineButtons.push([{ text: '💬 ផ្ញើលេខកូដទៅ Admin', url: adminLink }]);
              inlineButtons.push([{ text: '🔑 របៀបបញ្ចូល Key', callback_data: 'how_to_key' }]);
            } else {
              inlineButtons.push([
                { text: '🌐 រើសវេបសាយទាញយក', callback_data: 'show_platforms' },
                { text: '💡 របៀបទាញយក', callback_data: 'how_to_dl' }
              ]);
            }
            await sendBotMessage(token, chatId, profMsg, {
              reply_markup: { inline_keyboard: inlineButtons }
            });
            continue;
          }

          if (cmd === '/guide' || rawText === '💡 របៀបទាញយកវីដេអូ' || rawText === '💡 ជំនួយ & របៀបប្រើ') {
            const guideMsg =
              `💡 <b>របៀបទាញយកវីដេអូងាយៗ (៣ ជំហាន):</b>\n\n` +
              `1️⃣ បើកកម្មវិធី <b>TikTok, Douyin, YouTube, Facebook, ខៅស៊ូ</b>\n` +
              `2️⃣ ចុចប៊ូតុង <b>Share (ចែករំលែក)</b> រួចចុច <b>Copy Link (ចម្លងតំណ)</b>\n` +
              `3️⃣ ចូលមកក្នុងឆាត Bot នេះ រួច <b>Paste (បិទភ្ជាប់)</b> ផ្ញើមកទីនេះ\n\n` +
              `🚀 <i>Bot នឹងទាញយកវីដេអូកម្រិតច្បាស់ Full HD គ្មាន Watermark ផ្ញើជូនលោកអ្នកភ្លាមៗ!</i>`;
            await sendBotMessage(token, chatId, guideMsg, {
              reply_markup: getMainReplyKeyboard(lic.active, isAdmin)
            });
            continue;
          }

          if (rawText === '💬 ទាក់ទង Admin') {
            const cleanId = String(chatId).replace(/^TG-/i, '');
            const prefilledText = encodeURIComponent(`សួស្តីបង ខ្ញុំចង់សួរព័ត៌មាន Bot: TG-${cleanId}`);
            const adminLink = `https://t.me/${(cfg.adminTelegram || '@Thpisal33').replace('@', '')}?text=${prefilledText}`;

            await sendBotMessage(token, chatId, `💬 <b>ទាក់ទងមកកាន់ Admin ផ្ទាល់:</b>\n👉 Telegram: <b>${cfg.adminTelegram || '@Thpisal33'}</b>`, {
              reply_markup: {
                inline_keyboard: [[{ text: '💬 ឆាតទៅ Admin ឥឡូវនេះ', url: adminLink }]]
              }
            });
            continue;
          }

          if (rawText === '🔑 របៀបបញ្ចូល Key') {
            const guide =
              `🔑 <b>របៀបបញ្ចូល License Key:</b>\n\n` +
              `បន្ទាប់ពីលោកអ្នកទទួលបាន License Key ពី Admin រួចហើយ សូម Copy License Key នោះ រួចវាយ:\n\n` +
              `👉 <code>/key PS-XXXX-XXXX-XXXX</code>\n\n` +
              `<i>(ឬគ្រាន់តែ Paste កូដ License Key ចូលក្នុងឆាតនេះតែម្តង ក៏ Bot នឹង Activate អូតូជូនភ្លាមៗដែរ!)</i>`;
            await sendBotMessage(token, chatId, guide, {
              reply_markup: getMainReplyKeyboard(lic.active, isAdmin)
            });
            continue;
          }

          // ---------------------------------------------------------
          // CUSTOMER LICENSE KEY ACTIVATION
          // ---------------------------------------------------------
          let candidateKey = null;
          if (cmd === '/key' || cmd === '/activate') {
            candidateKey = args[0] || '';
          } else if (/^PS-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/i.test(rawText.trim())) {
            candidateKey = rawText.trim();
          }

          if (candidateKey) {
            const redeemRes = redeemLicenseKey(chatId, candidateKey, {
              first_name: msg.from?.first_name || '',
              username: msg.from?.username || ''
            });

            if (redeemRes.ok) {
              const expStr = formatKhmerDateTime(redeemRes.expiresAt);
              const successMsg =
                `🎉🎉🎉 <b>អបអរសាទរ! License Key ត្រូវបាន Activate ជោគជ័យ!</b> 🎉🎉🎉\n\n` +
                `💻 <b>លេខកូដគណនី:</b> <code>TG-${String(chatId).replace(/^TG-/i, '')}</code>\n` +
                `🔑 <b>Key:</b> <code>${redeemRes.key}</code>\n` +
                `📅 <b>សុពលភាព:</b> <b>${redeemRes.plan}</b>\n` +
                `⏳ <b>ផុតកំណត់:</b> ${expStr}\n\n` +
                `👉 <b>ឥឡូវនេះ លោកអ្នកអាចផ្ញើ ឬបិទភ្ជាប់ (Paste) Link វីដេអូ</b> (TikTok, Douyin, YouTube, Facebook, ខៅស៊ូ...) មកទីនេះដើម្បីទាញយកវីដេអូ Full HD គ្មាន Watermark បានភ្លាមៗ! 🚀`;
              await sendBotMessage(token, chatId, successMsg);
            } else {
              await sendBotMessage(token, chatId, redeemRes.error || '❌ License Key មិនត្រឹមត្រូវ!');
            }
            continue;
          }

          // ---------------------------------------------------------
          // CUSTOM DRAMA RANGE INPUT (e.g. "1-5", "10-20", "5", "1 to 10")
          // ---------------------------------------------------------
          const rangeMatch = rawText.match(/^\/?(?:range\s+)?(\d+)\s*(?:-|~|\s+to\s+|\s*ដល់\s*)(\d+)$/i) || rawText.match(/^\/?(?:ep\s+)?(\d+)$/i);
          const activeSession = _USER_DRAMA_SESSION.get(String(chatId));

          if (rangeMatch && activeSession && (Date.now() - activeSession.timestamp < 30 * 60 * 1000)) {
            let startEp = parseInt(rangeMatch[1], 10);
            let endEp = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : startEp;
            if (startEp > endEp) {
              const tmp = startEp; startEp = endEp; endEp = tmp;
            }
            startEp = Math.max(1, Math.min(activeSession.totalEps, startEp));
            endEp = Math.max(1, Math.min(activeSession.totalEps, endEp));

            handleDramaPackDownload(token, chatId, activeSession.seriesId, startEp, endEp, activeSession.detail).catch(e => console.error('[Drama Range Error]', e));
            continue;
          }

          // ---------------------------------------------------------
          // DOWNLOAD VIDEO REQUEST
          // ---------------------------------------------------------
          const urls = extractUrls(rawText);
          if (urls.length > 0) {
            handleVideoDownload(token, chatId, msg, urls[0]).catch(e => console.error('[Download Error]', e));
            continue;
          }

          // ---------------------------------------------------------
          // START / HELP / LICENSE COMMANDS
          // ---------------------------------------------------------
          if (cmd.startsWith('/start') || cmd.startsWith('/help')) {
            const welcome = getDownloaderWelcomeMessage(chatId, (msg.from && msg.from.first_name) || '');
            const siteButtons = getWebsiteButtons(chatId, lic.active, isAdmin);

            // 1. Send Rich Welcome Card with Full Platform List & 8 Direct Website Launch Buttons
            await sendBotMessage(token, chatId, welcome, {
              reply_markup: siteButtons
            });

            // 2. Ensure bottom persistent reply keyboard is active
            await sendBotMessage(token, chatId, `👇 <b>ជ្រើសរើសជម្រើសខាងក្រោម ឬបិទភ្ជាប់ (Paste) Link វីដេអូដើម្បីទាញយក:</b>`, {
              reply_markup: getMainReplyKeyboard(lic.active, isAdmin)
            });
            continue;
          }

          if (cmd === '/license' || cmd === '/buy' || cmd === '/pricing') {
            const licMsg = getLicenseInfoMessage(chatId, (msg.from && msg.from.first_name) || '');
            const cleanId = String(chatId).replace(/^TG-/i, '');
            const prefilledText = encodeURIComponent(`សួស្តីបង ខ្ញុំចង់បើកសិទ្ធិ License Bot: TG-${cleanId}`);
            const adminLink = `https://t.me/${(cfg.adminTelegram || '@Thpisal33').replace('@', '')}?text=${prefilledText}`;

            await sendBotMessage(token, chatId, licMsg, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '💬 ផ្ញើលេខកូដទៅ Admin ឥឡូវនេះ', url: adminLink }]
                ]
              }
            });
            continue;
          }

          // Default fallback message
          const cleanId = String(chatId).replace(/^TG-/i, '');
          const fallback =
            `👋 <b>សួស្តី ${(msg.from && msg.from.first_name) || 'អ្នកទាំងអស់គ្នា'}!</b>\n\n` +
            `💻 <b>លេខកូដគណនីរបស់អ្នក:</b> <code>TG-${cleanId}</code>\n` +
            `⏱️ <b>ស្ថានភាព License:</b> <b>${lic.label}</b>\n\n` +
            `👉 សូមផ្ញើ ឬបិទភ្ជាប់ (Paste) <b>Link វីដេអូ</b> (TikTok, Douyin, Kuaishou, YouTube, Facebook, Reels...) មកទីនេះដើម្បីទាញយកវីដេអូកម្រិត Full HD គ្មាន Watermark ភ្លាមៗ!\n\n` +
            `ចុច <code>🌐 រើសវេបសាយ</code> ដើម្បីមើល Platform ដែលគាំទ្រ ឬចុច <code>👤 គណនីខ្ញុំ</code> ដើម្បីមើលនាទីនៅសល់។`;
          await sendBotMessage(token, chatId, fallback, {
            reply_markup: getMainReplyKeyboard(lic.active, isAdmin)
          });
        }
      }
    } catch (loopErr) {
      console.error('[Bot Loop Error]', loopErr.message);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

process.on('exit', () => {
  try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch (_) {}
});

if (require.main === module) {
  startBot();
}

module.exports = {
  startBot,
  getUserLicense,
  authorizeUser,
  deductUserDays,
  generateLicenseKey,
  redeemLicenseKey,
  getAdminUserCard,
  getAdminAuthKeyboard,
  getMainReplyKeyboard,
  getWebsiteButtons,
  getPlatformsListMessage,
  getDownloaderWelcomeMessage,
  getUserProfileMessage
};

