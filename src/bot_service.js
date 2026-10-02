/**
 * Standalone 24/7 Telegram License Bot & Cloud API Runner
 * Allows running the Telegram Bot and Cloud License Server continuously 24/7 on any
 * Cloud Platform (Render.com, Railway.app, Koyeb, VPS) without requiring the local PC to be on.
 */

const http = require('http');
const { startTelegramBot, stopTelegramBot, sendBotMessage, parseFlexiblePaymentNotification } = require('./telegram_bot.js');
const {
  getTelegramConfig,
  getDeviceId,
  getAuthorizedDevicesMap,
  findAndClaimRecentPayment,
  registerPendingCheckout,
  fulfillPayWayPayment,
  recordUnclaimedPayment,
  getUnclaimedPayments,
  setDeviceCustomName
} = require('./license.js');

const _ACTIVE_CLOUD_DEVICES = new Map(); // deviceId -> live active device info

const PORT = parseInt(process.env.PORT || '3000', 10);

console.log('==============================================================');
console.log('       🤖 PS DOWNLOAD - 24/7 TELEGRAM BOT & CLOUD SERVER       ');
console.log('==============================================================');

const cfg = getTelegramConfig();
console.log(`[Config] Bot Token:  ${cfg.botToken ? `${cfg.botToken.slice(0, 10)}...` : '❌ Missing'}`);
console.log(`[Config] Admin Chat: ${cfg.chatId || 'All'}`);
console.log(`[Config] Server Host Device: ${getDeviceId()}`);
console.log('--------------------------------------------------------------');

if (!cfg.botToken) {
  console.error('[ERROR] Telegram Bot Token is missing in data/telegram_config.json!');
  process.exit(1);
}

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let bodyText = '';
    req.on('data', chunk => bodyText += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(bodyText || '{}'));
      } catch (e) {
        resolve({});
      }
    });
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// 1. Start HTTP Server for Cloud Health Checks & Remote License Verification
const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const hostHeader = req.headers.host || `localhost:${PORT}`;
  const url = new URL(req.url, `http://${hostHeader}`);

  // Landing Page
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html lang="km">
      <head>
        <meta charset="UTF-8">
        <title>PS DOWNLOAD - 24/7 License & Bot Cloud Server</title>
        <style>
          body { background: #07090e; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(56, 189, 248, 0.3); padding: 36px 40px; border-radius: 16px; text-align: center; max-width: 520px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
          h1 { color: #38bdf8; margin: 0 0 12px 0; font-size: 1.6rem; }
          .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); padding: 5px 14px; border-radius: 20px; font-weight: 700; font-size: 0.85rem; margin-bottom: 16px; }
          p { color: #cbd5e1; font-size: 0.95rem; line-height: 1.5; margin: 8px 0; }
          .footer { color: #64748b; font-size: 0.8rem; margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 14px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🤖 PS DOWNLOAD Cloud Server</h1>
          <div class="badge">● Online 24/7/365</div>
          <p>ប្រព័ន្ធគ្រប់គ្រង License និង Telegram Bot កំពុងដំណើរការយ៉ាងរលូន ២៤ ម៉ោងលើ Cloud។</p>
          <p style="color: #94a3b8;">ទោះបីកុំព្យូទ័របិទ ឬដាច់ភ្លើង ក៏ Bot នៅតែឆ្លើយតប និងបញ្ជា License បានជានិច្ច។</p>
          <div class="footer">Admin Contact: @Thpisal33</div>
        </div>
      </body>
      </html>
    `);
    return;
  }

  // Health check for Cloud Platforms
  if (url.pathname === '/healthz' || url.pathname === '/api/health') {
    return sendJson(res, 200, { status: 'ok', uptime: process.uptime(), bot: 'running' });
  }

  // Remote check for client auto-activation
  if (url.pathname === '/api/license/check' && req.method === 'GET') {
    const devId = (url.searchParams.get('deviceId') || '').trim().toUpperCase();
    const authorizedMap = typeof getAuthorizedDevicesMap === 'function' ? getAuthorizedDevicesMap() : {};
    if (devId && authorizedMap[devId]) {
      const rec = authorizedMap[devId];
      const isRevoked = Boolean(rec.revoked || rec.status === 'revoked');
      return sendJson(res, 200, {
        authorized: !isRevoked,
        revoked: isRevoked,
        key: rec.key,
        days: rec.days,
        label: rec.label,
        customName: rec.customName || '',
        expiresAt: rec.expiresAt,
        message: isRevoked ? 'License ត្រូវបានដកហូតដោយ Admin' : '🎉 ម៉ាស៊ីនរបស់អ្នកត្រូវបាន Admin អនុញ្ញាតពីចម្ងាយដោយជោគជ័យ!'
      });
    }
    return sendJson(res, 200, { authorized: false, message: 'មិនទាន់មានការអនុញ្ញាតពី Admin ឡើយ' });
  }

  // Real-Time Heartbeat from Active Customer Machines (Cloud Online Ping & Name Sync)
  if (url.pathname === '/api/license/heartbeat' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const cleanId = String(body.deviceId || '').trim().toUpperCase();
    if (cleanId) {
      const authMap = typeof getAuthorizedDevicesMap === 'function' ? getAuthorizedDevicesMap() : {};
      const auth = authMap[cleanId] || {};
      const now = Date.now();
      const existing = _ACTIVE_CLOUD_DEVICES.get(cleanId) || {};
      const resolvedName = auth.customName || existing.customName || body.customName || body.telegramUser || '';

      _ACTIVE_CLOUD_DEVICES.set(cleanId, {
        deviceId: cleanId,
        telegramUser: body.telegramUser || existing.telegramUser || auth.telegramUser || '',
        customName: resolvedName,
        computerName: body.computerName || existing.computerName || '',
        key: auth.key || body.key || existing.key || '',
        status: auth.status || body.status || 'active',
        expiresAt: auth.expiresAt || body.expiresAt || null,
        lastSeen: now,
        firstSeen: existing.firstSeen || now,
        appVersion: body.appVersion || '3.2.2',
        isOnline: true
      });

      return sendJson(res, 200, {
        success: true,
        customName: resolvedName,
        revoked: Boolean(auth.revoked || auth.status === 'revoked')
      });
    }
    return sendJson(res, 400, { success: false, error: 'Missing deviceId' });
  }

  // Admin Instant Customer Name Sync (from Desktop Admin Control Center)
  if (url.pathname === '/api/license/set-name' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const cleanId = String(body.deviceId || '').trim().toUpperCase();
    const cleanName = String(body.customName || '').trim();
    if (cleanId) {
      if (typeof setDeviceCustomName === 'function') {
        try { setDeviceCustomName(cleanId, cleanName); } catch (_) {}
      }
      if (_ACTIVE_CLOUD_DEVICES.has(cleanId)) {
        const dev = _ACTIVE_CLOUD_DEVICES.get(cleanId);
        dev.customName = cleanName;
      }
      return sendJson(res, 200, { success: true, customName: cleanName });
    }
    return sendJson(res, 400, { success: false, error: 'Missing deviceId' });
  }

  // Admin Fetch All Tracked Machines from Cloud
  if (url.pathname === '/api/license/tracked-cloud' && req.method === 'GET') {
    const now = Date.now();
    const list = [];
    const authMap = typeof getAuthorizedDevicesMap === 'function' ? getAuthorizedDevicesMap() : {};

    for (const [id, dev] of _ACTIVE_CLOUD_DEVICES.entries()) {
      dev.isOnline = (now - dev.lastSeen) < 180000; // Online if pinged within last 3 minutes
      list.push(dev);
    }

    for (const [id, auth] of Object.entries(authMap)) {
      if (!_ACTIVE_CLOUD_DEVICES.has(id)) {
        list.push({
          deviceId: id,
          telegramUser: auth.telegramUser || '',
          customName: auth.customName || auth.telegramUser || '',
          computerName: 'Authorized PC',
          key: auth.key || '',
          status: auth.status || 'active',
          expiresAt: auth.expiresAt || null,
          lastSeen: auth.authorizedAt ? new Date(auth.authorizedAt).getTime() : 0,
          isOnline: false
        });
      }
    }

    return sendJson(res, 200, { success: true, devices: list });
  }

  // Register pending checkout intent from client
  if (url.pathname === '/api/license/pending-checkout' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const result = registerPendingCheckout(body);
    return sendJson(res, 200, { success: true, pending: result });
  }

  // Verify payment immediately when client clicks "ខ្ញុំបានបាញ់រួចហើយ"
  if (url.pathname === '/api/license/verify-payment' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const cleanId = String(body.deviceId || '').trim().toUpperCase();
    const numAmount = parseFloat(body.amount || 0) || 1.50;

    if (!cleanId) {
      return sendJson(res, 400, { verified: false, error: 'Missing deviceId' });
    }

    // 1. Check if device is ALREADY active in authorized_devices
    const authMap = typeof getAuthorizedDevicesMap === 'function' ? getAuthorizedDevicesMap() : {};
    const existing = authMap[cleanId];
    if (existing && existing.key && existing.status === 'active') {
      const expTime = new Date(existing.expiresAt || 0).getTime();
      if (expTime > Date.now()) {
        return sendJson(res, 200, {
          verified: true,
          autoActivated: true,
          key: existing.key,
          days: existing.days,
          label: existing.label,
          expiresAt: existing.expiresAt,
          message: '🎉 ម៉ាស៊ីនរបស់អ្នកត្រូវបានបើកសិទ្ធិដោយជោគជ័យរួចរាល់!'
        });
      }
    }

    // 2. Check unclaimed payments pool from Telegram group messages
    const claimRes = findAndClaimRecentPayment({ deviceId: cleanId, amount: numAmount });
    if (claimRes && claimRes.found) {
      // Send celebration alert to Telegram
      const currentCfg = getTelegramConfig();
      const celebration =
        `🎉🎉🎉 <b>ផ្ទៀងផ្ទាត់ការបង់ប្រាក់ជោគជ័យ (Auto-Unlocked)!</b> 🎉🎉🎉\n\n` +
        `💵 <b>ចំនួនទឹកប្រាក់:</b> <b>$${claimRes.payment.amount.toFixed(2)}</b>\n` +
        `👤 <b>អ្នកបង់ប្រាក់:</b> <b>${claimRes.payment.payer}</b>\n` +
        (claimRes.payment.trxId ? `🧾 <b>លេខប្រតិបត្តិការ (Trx ID):</b> <code>${claimRes.payment.trxId}</code>\n` : '') +
        `\n` +
        `⚡ <b>បាន Auto-Unlock ម៉ាស៊ីនភ្ញៀវដោយស្វ័យប្រវត្តិ:</b>\n` +
        `💻 <b>លេខម៉ាស៊ីន (Device ID):</b> <code>${cleanId}</code>\n` +
        `🔑 <b>License Key:</b> <code>${claimRes.authRes.key}</code>\n` +
        `📅 <b>សុពលភាព:</b> <b>${claimRes.authRes.label}</b>\n` +
        `🕒 <b>ម៉ោងអនុញ្ញាត:</b> ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' })}\n` +
        `🟢 <b>ស្ថានភាព:</b> កម្មវិធីលើកុំព្យូទ័រភ្ញៀវត្រូវបានបើកសិទ្ធិដំណើរការរួចរាល់!`;

      if (currentCfg.botToken) {
        if (currentCfg.chatId) {
          sendBotMessage(currentCfg.botToken, currentCfg.chatId, celebration).catch(() => {});
        }
        if (claimRes.payment.chatId && String(claimRes.payment.chatId) !== String(currentCfg.chatId)) {
          sendBotMessage(currentCfg.botToken, claimRes.payment.chatId, celebration).catch(() => {});
        }
      }

      console.log(`[Cloud Verify] ✅ Claimed payment $${claimRes.payment.amount} for device ${cleanId}!`);

      return sendJson(res, 200, {
        verified: true,
        autoActivated: true,
        key: claimRes.authRes.key,
        days: claimRes.authRes.days,
        label: claimRes.authRes.label,
        expiresAt: claimRes.authRes.expiresAt,
        payer: claimRes.payment.payer,
        amount: claimRes.payment.amount,
        trxId: claimRes.payment.trxId,
        message: '🎉 ការបង់ប្រាក់ត្រូវបានផ្ទៀងផ្ទាត់ជោគជ័យ! កម្មវិធីត្រូវបានបើកសិទ្ធិភ្លាមៗ!'
      });
    }

    // 3. Not found yet: register pending checkout intent so when bank alert arrives it matches
    registerPendingCheckout({ deviceId: cleanId, plan: body.plan, amount: numAmount });

    return sendJson(res, 200, {
      verified: false,
      message: '⚠️ មិនទាន់ទទួលបានការបង់ប្រាក់នៅឡើយទេ! សូមរង់ចាំបន្តិច (ប្រហែល 5-10 វិនាទី) រួចចុច "ខ្ញុំបានបាញ់រួចរាល់" ម្តងទៀត'
    });
  }

  // Webhook for External Forwarders (SMS Forwarder app, Webhook from Bank, etc.)
  if ((url.pathname === '/api/payway/webhook' || url.pathname === '/api/payment/webhook') && req.method === 'POST') {
    const body = await parseJsonBody(req);
    let amount = body.amount;
    let payer = body.payer || '';
    let trxId = body.trxId || body.hash || body.transactionId || '';
    let devId = body.deviceId || null;

    if (body.text || body.message) {
      const parsed = parseFlexiblePaymentNotification(body.text || body.message);
      if (parsed) {
        amount = parsed.amount;
        payer = parsed.payer || payer;
        trxId = parsed.trxId || trxId;
      }
    }

    if (amount) {
      const numAmt = parseFloat(amount) || 1.50;
      // Also record as unclaimed payment
      recordUnclaimedPayment({
        amount: numAmt,
        payer: payer || 'Webhook',
        trxId: trxId || `WH-${Date.now()}`
      });

      const result = fulfillPayWayPayment({
        amount: numAmt,
        payer: payer || 'External-Webhook',
        trxId: trxId || `WH-${Date.now()}`,
        deviceId: devId
      });
      return sendJson(res, 200, result);
    }

    return sendJson(res, 400, { error: 'No valid amount found' });
  }

  // Get Unclaimed Payments (for debugging or admin inspection)
  if (url.pathname === '/api/license/unclaimed-payments' && req.method === 'GET') {
    return sendJson(res, 200, { success: true, unclaimed: getUnclaimedPayments() });
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[INFO] 🌐 Cloud Web & License API Server listening on 0.0.0.0:${PORT}`);
});

// 2. Start Telegram Bot Polling
startTelegramBot().then(res => {
  if (res.success) {
    console.log('[INFO] ✅ Telegram License Bot is running successfully 24/7!');
    console.log('[INFO] Open Telegram and send /help or /start to your bot to test.');
  } else {
    console.error('[ERROR] Failed to start Telegram Bot:', res.reason);
  }
});

// Process Management
process.on('SIGINT', () => {
  console.log('\n[INFO] Stopping Telegram Bot & Server...');
  stopTelegramBot();
  server.close(() => {
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught exception in Bot Service:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[CRITICAL] Unhandled rejection in Bot Service:', reason);
});
