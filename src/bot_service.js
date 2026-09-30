/**
 * Standalone 24/7 Telegram License Bot & Cloud API Runner
 * Allows running the Telegram Bot and Cloud License Server continuously 24/7 on any
 * Cloud Platform (Render.com, Railway.app, Koyeb, VPS) without requiring the local PC to be on.
 */

const http = require('http');
const { startTelegramBot, stopTelegramBot } = require('./telegram_bot.js');
const { getTelegramConfig, getDeviceId, getAuthorizedDevicesMap } = require('./license.js');

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

// 1. Start HTTP Server for Cloud Health Checks & Remote License Verification
const server = http.createServer((req, res) => {
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
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), bot: 'running' }));
    return;
  }

  // Remote check for client auto-activation
  if (url.pathname === '/api/license/check') {
    const devId = (url.searchParams.get('deviceId') || '').trim().toUpperCase();
    const authorizedMap = typeof getAuthorizedDevicesMap === 'function' ? getAuthorizedDevicesMap() : {};
    if (devId && authorizedMap[devId]) {
      const rec = authorizedMap[devId];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        authorized: true,
        key: rec.key,
        days: rec.days,
        label: rec.label,
        message: '🎉 ម៉ាស៊ីនរបស់អ្នកត្រូវបាន Admin អនុញ្ញាតពីចម្ងាយដោយជោគជ័យ!'
      }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ authorized: false, message: 'មិនទាន់មានការអនុញ្ញាតពី Admin ឡើយ' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`[INFO] 🌐 Cloud Web & License API Server listening on port ${PORT}`);
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
