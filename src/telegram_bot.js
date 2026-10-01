/**
 * 24/7 Telegram License Management Bot
 * Handles all 9 commands matching BotFather:
 * 1. /start       - 🏠 បើកផ្ទាំង Menu ដើម (BotFather Style)
 * 2. /keygen      - 🔑 បង្កើត License Key (Key Generator)
 * 3. /playlist    - 📋 បញ្ជីភ្ញៀវទាំងអស់ (Playlist)
 * 4. /online      - 🟢 ភ្ញៀវកំពុង Online
 * 5. /today       - 📅 ភ្ញៀវថ្ងៃនេះ (Today)
 * 6. /memory      - 📜 អង្គចងចាំ ៣ ខែ (Archive)
 * 7. /add         - ➕ បន្ថែមថ្ងៃ និងតម្លៃ (Add Days)
 * 8. /reset_trial - 🔄 Reset សិទ្ធិតេស្ត 3 ថ្ងៃ (Reset Trial)
 * 9. /stats       - 📊 ស្ថិតិប្រព័ន្ធសរុប
 */

const {
  getTelegramConfig,
  generateLicenseKey,
  authorizeDevice,
  getTrackedDevices,
  getPaymentRequests,
  getDeviceId,
  resetDeviceFails,
  fulfillPayWayPayment,
  isTrxAlreadyProcessed,
  markTrxProcessed,
  setDeviceCustomName,
  getAuthorizedDevicesMap,
  recordUnclaimedPayment,
  getUnclaimedPayments,
  findAndClaimRecentPayment,
  activateLicense
} = require('./license.js');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config.js');

const LOCK_FILE = path.join(DATA_DIR, 'telegram_bot.lock');

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

let _isPolling = false;
let _shouldStop = false;
let _lastUpdateId = 0;

/**
 * Helper to call Telegram Bot API
 */
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

/**
 * Sends a Telegram message
 */
async function sendBotMessage(token, chatId, textHtml, options = {}) {
  return await callTelegramApi(token, 'sendMessage', {
    chat_id: chatId,
    text: textHtml,
    parse_mode: 'HTML',
    ...options
  });
}

/**
 * Answers a Telegram callback query from an inline button click immediately
 */
async function answerCallbackQuery(token, queryId, text = '', showAlert = false) {
  try {
    return await callTelegramApi(token, 'answerCallbackQuery', {
      callback_query_id: queryId,
      text,
      show_alert: showAlert
    });
  } catch (e) {
    return { ok: false };
  }
}

/**
 * Builds the interactive BotFather Style Start Menu Keyboard
 */
function getMainMenuKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔑 បង្កើត Key (/keygen)', callback_data: 'menu:keygen' },
          { text: '🟢 ភ្ញៀវ Online (/online)', callback_data: 'menu:online' }
        ],
        [
          { text: '📋 បញ្ជីភ្ញៀវ (/playlist)', callback_data: 'menu:playlist' },
          { text: '📅 ភ្ញៀវថ្ងៃនេះ (/today)', callback_data: 'menu:today' }
        ],
        [
          { text: '➕ បន្ថែមថ្ងៃ (/add)', callback_data: 'menu:add' },
          { text: '🔄 Reset តេស្ត 3 ថ្ងៃ (/reset_trial)', callback_data: 'menu:reset_trial' }
        ],
        [
          { text: '📊 ស្ថិតិប្រព័ន្ធ (/stats)', callback_data: 'menu:stats' },
          { text: '📜 អង្គចងចាំ 3 ខែ (/memory)', callback_data: 'menu:memory' }
        ]
      ]
    }
  };
}

/**
 * Formats a Date in Phnom Penh Timezone
 */
function formatKhmerTime(dateOrIso) {
  try {
    const d = dateOrIso ? new Date(dateOrIso) : new Date();
    return d.toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' });
  } catch (e) {
    return String(dateOrIso || 'N/A');
  }
}

/**
 * Command Handler 1: /start (🏠 បើកផ្ទាំង Menu ដើម)
 */
async function handleStartCommand(token, chatId, userName) {
  const menuText =
    `🏠 <b>សូមស្វាគមន៍មកកាន់ PS DOWNLOAD License Bot!</b> 🤖\n\n` +
    `សួស្តី Admin <b>${userName || ''}</b>! នេះជាផ្ទាំងគ្រប់គ្រងអាជ្ញាប័ណ្ណ (License) ដំណើរការ 24 ម៉ោង។\n\n` +
    `🛠 <b>បញ្ជីពាក្យបញ្ជាផ្លូវការ (BotFather Commands):</b>\n` +
    `• <code>/start</code> 🏠 បើកផ្ទាំង Menu ដើម\n` +
    `• <code>/keygen</code> 🔑 បង្កើត License Key\n` +
    `• <code>/playlist</code> 📋 បញ្ជីភ្ញៀវទាំងអស់\n` +
    `• <code>/online</code> 🟢 ភ្ញៀវកំពុង Online\n` +
    `• <code>/today</code> 📅 ភ្ញៀវថ្ងៃនេះ (Today)\n` +
    `• <code>/memory</code> 📜 អង្គចងចាំ ៣ ខែ (Archive)\n` +
    `• <code>/add</code> ➕ បន្ថែមថ្ងៃ និងតម្លៃ\n` +
    `• <code>/reset_trial</code> 🔄 Reset សិទ្ធិតេស្ត 3 ថ្ងៃ\n` +
    `• <code>/stats</code> 📊 ស្ថិតិប្រព័ន្ធសរុប\n\n` +
    `👇 <b>ចុចប៊ូតុងខាងក្រោមដើម្បីដំណើរការមុខងារនីមួយៗភ្លាមៗ:</b>`;

  await sendBotMessage(token, chatId, menuText, getMainMenuKeyboard());
}

/**
 * Command Handler 2: /keygen (🔑 បង្កើត License Key)
 */
async function handleKeygenCommand(token, chatId, args = []) {
  if (!args.length || !args[0]) {
    const devices = getTrackedDevices();
    const promptText =
      `🔑 <b>បង្កើត License Key (Key Generator):</b>\n\n` +
      `👉 <b>របៀបវាយបញ្ជា:</b> <code>/keygen &lt;DeviceID&gt; [days]</code>\n\n` +
      `<b>ឧទាហរណ៍:</b>\n` +
      `• <code>/keygen HG-DBC0-79F8 7</code> (សម្រាប់ 7 ថ្ងៃ)\n` +
      `• <code>/keygen HG-DBC0-79F8 30</code> (សម្រាប់ 30 ថ្ងៃ / 1 ខែ)\n` +
      `• <code>/keygen HG-DBC0-79F8 365</code> (សម្រាប់ 1 ឆ្នាំ)\n` +
      `• <code>/keygen HG-DBC0-79F8 0</code> (សម្រាប់ Lifetime VIP)\n\n` +
      (devices.length ? `👇 <b>ឬចុចលើ Device ខាងក្រោមដើម្បីបង្កើតភ្លាមៗ:</b>` : `💡 <i>ឬលោកអ្នកគ្រាន់តែផ្ញើលេខម៉ាស៊ីន (Device ID) មកទីនេះ នោះ Bot នឹងចេញប៊ូតុងចុចបង្កើតជូនភ្លាម!</i>`);

    const inline_keyboard = [];
    devices.slice(0, 4).forEach(d => {
      inline_keyboard.push([
        { text: `💻 ${d.deviceId} (${d.computerName || 'PC'})`, callback_data: `pickdev:${d.deviceId}` }
      ]);
    });

    await sendBotMessage(token, chatId, promptText, inline_keyboard.length ? { reply_markup: { inline_keyboard } } : {});
    return;
  }

  const targetId = args[0].toUpperCase().trim();
  let days = 30;
  if (args[1] !== undefined) {
    if (args[1].toLowerCase() === 'lifetime' || args[1] === '0') days = 0;
    else days = parseInt(args[1], 10) || 30;
  }

  const key = generateLicenseKey(targetId, days);
  const label = days > 0 ? `${days} ថ្ងៃ` : 'Lifetime VIP (ពេញមួយជីវិត)';
  authorizeDevice({ deviceId: targetId, days, telegramUser: '' });

  const reply =
    `🔑 <b>បង្កើត License Key ជោគជ័យ!</b> 🎉\n\n` +
    `💻 <b>លេខម៉ាស៊ីន (Device ID):</b> <code>${targetId}</code>\n` +
    `🔑 <b>License Key:</b> <code>${key}</code>\n` +
    `📅 <b>សុពលភាព:</b> <b>${label}</b>\n` +
    `🕒 <b>កាលបរិច្ឆេទបង្កើត:</b> ${formatKhmerTime()}\n\n` +
    `👉 <i>(ចុចលើ License Key ខាងលើដើម្បី Copy រួចផ្ញើជូនភ្ញៀវ!)</i>`;

  await sendBotMessage(token, chatId, reply);
}

/**
 * Calculates exact remaining duration text for a device.
 */
function formatDeviceRemainingText(deviceId, fallbackStatus = '') {
  const authMap = getAuthorizedDevicesMap();
  const auth = authMap[deviceId];
  if (!auth) return fallbackStatus || 'unactivated';

  if (!auth.expiresAt) {
    return '👑 Lifetime VIP (ពេញមួយជីវិត)';
  }

  const diffMs = new Date(auth.expiresAt).getTime() - Date.now();
  if (diffMs <= 0) {
    return '⚠️ ផុតកំណត់ហើយ';
  }

  const days = Math.floor(diffMs / 86400000);
  const hours = Math.floor((diffMs % 86400000) / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);

  if (days > 0) {
    return `នៅសល់ ${days} ថ្ងៃ ${hours} ម៉ោង`;
  } else if (hours > 0) {
    return `នៅសល់ ${hours} ម៉ោង ${mins} នាទី`;
  } else {
    return `នៅសល់ ${mins} នាទី`;
  }
}

/**
 * Command Handler 3: /playlist (📋 បញ្ជីភ្ញៀវទាំងអស់)
 */
async function handlePlaylistCommand(token, chatId) {
  const devices = getTrackedDevices();
  const authMap = getAuthorizedDevicesMap();
  if (!devices.length) {
    await sendBotMessage(token, chatId, '📋 <b>បញ្ជីភ្ញៀវទាំងអស់ (Playlist):</b>\n\nℹ️ មិនទាន់មានភ្ញៀវណាមួយបានតភ្ជាប់ក្នុងប្រព័ន្ធឡើយ។');
    return;
  }

  let text = `📋 <b>បញ្ជីភ្ញៀវទាំងអស់ (Playlist - សរុប ${devices.length} នាក់):</b>\n\n`;
  const displayList = devices.slice(0, 15);
  const inline_keyboard = [];

  displayList.forEach((d, idx) => {
    const auth = authMap[d.deviceId] || {};
    const name = d.customName || auth.customName || '';
    const nameLabel = name ? `👤 <b>${name}</b>` : `👤 <i>(មិនទាន់ដាក់ឈ្មោះ)</i>`;
    const remaining = formatDeviceRemainingText(d.deviceId, d.status);
    const expiryStr = auth.expiresAt ? `\n   ⏳ ផុតកំណត់: ${formatKhmerTime(auth.expiresAt)}` : '';

    text += `<b>${idx + 1}.</b> ${nameLabel}\n` +
            `   💻 <code>${d.deviceId}</code>\n` +
            `   ⏱️ សុពលភាព: <b>${remaining}</b>${expiryStr}\n` +
            `   📱 Telegram: ${d.telegramUser ? `<b>${d.telegramUser}</b>` : '<i>(គ្មាន TG)</i>'} | 🖥️ ${d.computerName || 'PC'}\n` +
            `   🕒 ចូលចុងក្រោយ: ${d.lastSeen ? formatKhmerTime(d.lastSeen) : 'N/A'}\n\n`;

    if (idx < 5) {
      const btnName = name || d.deviceId.slice(-8);
      inline_keyboard.push([
        { text: `✏️ ដាក់/កែឈ្មោះ: ${btnName}`, callback_data: `rename_prompt:${d.deviceId}` },
        { text: `➕ បន្ថែមថ្ងៃ/ម៉ោង`, callback_data: `add_picker:${d.deviceId}` }
      ]);
    }
  });

  if (devices.length > 15) {
    text += `<i>... និងនៅសល់ ${devices.length - 15} នាក់ទៀតក្នុងមូលដ្ឋានទិន្នន័យ</i>\n`;
  }

  await sendBotMessage(token, chatId, text, inline_keyboard.length ? { reply_markup: { inline_keyboard } } : {});
}

/**
 * Command Handler 4: /online (🟢 ភ្ញៀវកំពុង Online)
 */
async function handleOnlineCommand(token, chatId) {
  const devices = getTrackedDevices();
  const authMap = getAuthorizedDevicesMap();
  const now = Date.now();
  // Active within last 30 minutes
  const onlineGuests = devices.filter(d => {
    if (!d.lastSeen) return false;
    const diff = now - new Date(d.lastSeen).getTime();
    return diff <= 30 * 60 * 1000;
  });

  if (!onlineGuests.length) {
    const emptyMsg =
      `🟢 <b>ភ្ញៀវកំពុង Online (Active Now):</b>\n\n` +
      `បច្ចុប្បន្នមិនទាន់មានភ្ញៀវណា Online ក្នុងរយៈពេល 30 នាទីចុងក្រោយនេះទេ។\n\n` +
      `💡 <i>(រាល់ពេលភ្ញៀវបើកកម្មវិធី ឬចុចស្វែងរក/ទាញយក វានឹងរាយការណ៍បង្ហាញនៅទីនេះភ្លាមៗ)</i>`;
    await sendBotMessage(token, chatId, emptyMsg);
    return;
  }

  let text = `🟢 <b>ភ្ញៀវកំពុង Online ជាក់ស្ដែង (${onlineGuests.length} នាក់):</b>\n\n`;
  onlineGuests.forEach((d, idx) => {
    const diffMins = Math.round((now - new Date(d.lastSeen).getTime()) / 60000);
    const timeAgo = diffMins <= 1 ? 'ទើបតែមិញនេះ' : `${diffMins} នាទីមុន`;
    const auth = authMap[d.deviceId] || {};
    const name = d.customName || auth.customName || '';
    const namePart = name ? `👤 <b>${name}</b>\n   ` : '';
    const remaining = formatDeviceRemainingText(d.deviceId, d.status);

    text += `${idx + 1}. 🟢 ${namePart}<code>${d.deviceId}</code> (${d.computerName || 'PC'})\n` +
            `   ⏱️ សុពលភាព: <b>${remaining}</b>\n` +
            `   📱 Telegram: ${d.telegramUser ? `<b>${d.telegramUser}</b>` : 'ភ្ញៀវទូទៅ'}\n` +
            `   🌐 ទីតាំង: ${d.location ? `${d.location.city || ''}, ${d.location.country || ''}` : 'N/A'}\n` +
            `   ⚡ សកម្មភាព: <b>${timeAgo}</b>\n\n`;
  });

  await sendBotMessage(token, chatId, text);
}

/**
 * Command Handler 5: /today (📅 ភ្ញៀវថ្ងៃនេះ)
 */
async function handleTodayCommand(token, chatId) {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' }); // YYYY-MM-DD
  const devices = getTrackedDevices();
  const authMap = getAuthorizedDevicesMap();
  const payments = getPaymentRequests();

  const todayGuests = devices.filter(d => {
    if (!d.lastSeen) return false;
    const dStr = new Date(d.lastSeen).toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });
    return dStr === todayStr;
  });

  const todayPayments = payments.filter(p => {
    if (!p.createdAt) return false;
    const pStr = new Date(p.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });
    return pStr === todayStr;
  });

  const todayTotalCash = todayPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

  let text =
    `📅 <b>របាយការណ៍ភ្ញៀវថ្ងៃនេះ (${todayStr}):</b>\n\n` +
    `👥 <b>ចំនួនភ្ញៀវសកម្មថ្ងៃនេះ:</b> <b>${todayGuests.length}</b> នាក់\n` +
    `💰 <b>សំណើបង់ប្រាក់ថ្ងៃនេះ:</b> <b>${todayPayments.length}</b> លើក\n` +
    `💵 <b>ចំណូលប្រចាំថ្ងៃ:</b> <b>$${todayTotalCash.toFixed(2)}</b>\n\n`;

  if (todayGuests.length > 0) {
    text += `📋 <b>បញ្ជីភ្ញៀវថ្ងៃនេះ:</b>\n`;
    todayGuests.slice(0, 10).forEach((d, idx) => {
      const auth = authMap[d.deviceId] || {};
      const name = d.customName || auth.customName || '';
      const namePart = name ? `👤 <b>${name}</b> | ` : '';
      const remaining = formatDeviceRemainingText(d.deviceId, d.status);
      text += `${idx + 1}. ${namePart}<code>${d.deviceId}</code> | ⏱️ <b>${remaining}</b>\n`;
    });
  } else {
    text += `<i>មិនទាន់មានភ្ញៀវចូលប្រើប្រាស់នៅថ្ងៃនេះឡើយ។</i>\n`;
  }

  await sendBotMessage(token, chatId, text);
}

/**
 * Finds tracked device matching query (exact or partial prefix).
 */
function findMatchingDeviceId(query) {
  if (!query) return null;
  const clean = String(query).trim().toUpperCase();
  const devices = getTrackedDevices();
  const exact = devices.find(d => d.deviceId.toUpperCase() === clean);
  if (exact) return exact.deviceId;
  const partial = devices.find(d => d.deviceId.toUpperCase().includes(clean) || clean.includes(d.deviceId.toUpperCase()));
  if (partial) return partial.deviceId;
  return clean;
}

/**
 * Command Handler 6: /memory (📜 អង្គចងចាំ ៣ ខែ - Archive History)
 * Displays list of active/tracked devices over past 90 days with Device ID, custom name, and quick actions.
 */
async function handleMemoryCommand(token, chatId) {
  const devices = getTrackedDevices();
  const authMap = getAuthorizedDevicesMap();
  const payments = getPaymentRequests();
  const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);

  const archiveDevices = devices.filter(d => new Date(d.firstSeen || d.lastSeen).getTime() >= ninetyDaysAgo);
  const archivePayments = payments.filter(p => new Date(p.createdAt).getTime() >= ninetyDaysAgo);
  const totalArchiveCash = archivePayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

  let text =
    `📜 <b>អង្គចងចាំ ៣ ខែ (Archive History - 90 Days):</b>\n\n` +
    `💻 <b>ចំនួនម៉ាស៊ីនភ្ញៀវសរុប (90 ថ្ងៃ):</b> <b>${archiveDevices.length}</b> នាក់\n` +
    `💰 <b>ប្រតិបត្តិការទូទាត់ប្រាក់:</b> <b>${archivePayments.length}</b> លើក\n` +
    `💵 <b>ចំណូលសរុប:</b> <b>$${totalArchiveCash.toFixed(2)}</b>\n\n`;

  if (archiveDevices.length === 0) {
    text += `<i>មិនទាន់មានទិន្នន័យភ្ញៀវក្នុងរយៈពេល 90 ថ្ងៃនេះនៅឡើយទេ។</i>`;
    await sendBotMessage(token, chatId, text);
    return;
  }

  text += `📋 <b>បញ្ជីលេខម៉ាស៊ីនភ្ញៀវ (ចុចលើ Device ID ដើម្បី Copy):</b>\n\n`;

  const inline_keyboard = [];

  archiveDevices.slice(0, 10).forEach((d, idx) => {
    const auth = authMap[d.deviceId] || {};
    const nameLabel = d.customName || auth.customName ? `<b>${d.customName || auth.customName}</b>` : '<i>(មិនទាន់ដាក់ឈ្មោះ)</i>';
    const statusLabel = auth.label || d.status || 'Active';
    const expiryStr = auth.expiresAt ? `\n   ⏳ ផុតកំណត់: ${formatKhmerTime(auth.expiresAt)}` : '';

    text +=
      `<b>${idx + 1}.</b> <code>${d.deviceId}</code>\n` +
      `   👤 ឈ្មោះសម្គាល់: ${nameLabel}\n` +
      `   📱 Telegram: ${d.telegramUser || 'ភ្ញៀវ'} | 🏷️ ${statusLabel}${expiryStr}\n` +
      `   🕒 ចូលចុងក្រោយ: ${formatKhmerTime(d.lastSeen || d.firstSeen)}\n\n`;

    // Action buttons for top devices
    if (idx < 5) {
      const shortDev = d.deviceId.length > 16 ? d.deviceId.slice(0, 12) + '...' : d.deviceId;
      const btnName = d.customName || auth.customName || shortDev;
      inline_keyboard.push([
        { text: `✏️ ដាក់/កែឈ្មោះ: ${btnName}`, callback_data: `rename_prompt:${d.deviceId}` },
        { text: `➕ បន្ថែមថ្ងៃ/ម៉ោង`, callback_data: `add_picker:${d.deviceId}` }
      ]);
    }
  });

  text +=
    `👉 <b>របៀបដាក់ ឬកែឈ្មោះភ្ញៀវ:</b>\n` +
    `<code>/name &lt;DeviceID&gt; &lt;ឈ្មោះសម្គាល់&gt;</code>\n` +
    `<i>ឧទាហរណ៍:</i> <code>/name ${archiveDevices[0].deviceId} បង សុខ សាន</code>\n\n` +
    `👉 <b>របៀបបន្ថែមថ្ងៃ ឬម៉ោង:</b>\n` +
    `<code>/add &lt;DeviceID&gt; &lt;ចំនួនថ្ងៃ ឬម៉ោង&gt;</code>\n` +
    `<i>ឧទាហរណ៍:</i> <code>/add ${archiveDevices[0].deviceId} 24h</code> ឬ <code>/add ${archiveDevices[0].deviceId} 30</code>`;

  await sendBotMessage(token, chatId, text, inline_keyboard.length ? { reply_markup: { inline_keyboard } } : {});
}

/**
 * Sends duration picker buttons for a device (hours, days, lifetime).
 */
async function sendAddDurationPicker(token, chatId, targetDeviceId) {
  const deviceId = findMatchingDeviceId(targetDeviceId);
  const devices = getTrackedDevices();
  const authMap = getAuthorizedDevicesMap();
  const devInfo = devices.find(d => d.deviceId === deviceId);
  const authInfo = authMap[deviceId] || {};

  const customerName = (devInfo && devInfo.customName) || authInfo.customName || '';
  const currentExpiry = authInfo.expiresAt ? formatKhmerTime(authInfo.expiresAt) : (authInfo.label || 'មិនទាន់មាន');

  let prompt =
    `➕ <b>បន្ថែមថ្ងៃ និងម៉ោង (Add Duration)</b>\n\n` +
    `💻 <b>លេខម៉ាស៊ីន (Device ID):</b> <code>${deviceId}</code>\n`;

  if (customerName) {
    prompt += `👤 <b>ឈ្មោះអតិថិជន:</b> <b>${customerName}</b>\n`;
  }
  if (authInfo.expiresAt) {
    prompt += `⏳ <b>ផុតកំណត់បច្ចុប្បន្ន:</b> ${currentExpiry}\n`;
    prompt += `💡 <i>ការបន្ថែមរយៈពេល នឹងបូកបន្តពីលើថ្ងៃផុតកំណត់ចាស់នេះ!</i>\n\n`;
  } else {
    prompt += `\n`;
  }

  prompt +=
    `👉 <b>សូមចុចជ្រើសរើសរយៈពេលដែលលោកអ្នកចង់បន្ថែម:</b>\n` +
    `<i>(ឬអ្នកអាចវាយបញ្ជាផ្ទាល់: <code>/add ${deviceId} 12h</code> ឬ <code>/add ${deviceId} 15</code>)</i>`;

  const inline_keyboard = [
    [
      { text: '⏱️ +12 ម៉ោង', callback_data: `doadd:${deviceId}:12h` },
      { text: '⏱️ +24 ម៉ោង (1 ថ្ងៃ)', callback_data: `doadd:${deviceId}:24h` },
      { text: '⏱️ +48 ម៉ោង (2 ថ្ងៃ)', callback_data: `doadd:${deviceId}:48h` }
    ],
    [
      { text: '🗓️ +7 ថ្ងៃ (1 អាទិត្យ)', callback_data: `doadd:${deviceId}:7d` },
      { text: '🗓️ +15 ថ្ងៃ', callback_data: `doadd:${deviceId}:15d` },
      { text: '🗓️ +30 ថ្ងៃ (1 ខែ)', callback_data: `doadd:${deviceId}:30d` }
    ],
    [
      { text: '🗓️ +90 ថ្ងៃ (3 ខែ)', callback_data: `doadd:${deviceId}:90d` },
      { text: '🗓️ +365 ថ្ងៃ (1 ឆ្នាំ)', callback_data: `doadd:${deviceId}:365d` }
    ],
    [
      { text: '👑 Lifetime VIP (ពេញមួយជីវិត)', callback_data: `doadd:${deviceId}:0` }
    ],
    [
      { text: '✏️ ដាក់/កែឈ្មោះភ្ញៀវ', callback_data: `rename_prompt:${deviceId}` },
      { text: '📜 អង្គចងចាំ 3 ខែ', callback_data: 'menu:memory' }
    ]
  ];

  await sendBotMessage(token, chatId, prompt, { reply_markup: { inline_keyboard } });
}

/**
 * Command Handler 7: /add (➕ បន្ថែមថ្ងៃ និងម៉ោង)
 */
async function handleAddCommand(token, chatId, args = []) {
  // If no arguments passed: show device list & help instructions
  if (!args.length || !args[0]) {
    const devices = getTrackedDevices();
    const authMap = getAuthorizedDevicesMap();

    let helpMsg =
      `➕ <b>បន្ថែមថ្ងៃ និងម៉ោង (Add Duration):</b>\n\n` +
      `👉 <b>ជំហានទី 1:</b> ជ្រើសរើស ឬវាយលេខម៉ាស៊ីនភ្ញៀវ (Device ID)\n\n` +
      `<b>របៀបវាយបញ្ជាផ្ទាល់:</b>\n` +
      `• <code>/add &lt;DeviceID&gt;</code> (ដើម្បីបើកផ្ទាំងរើសថ្ងៃ/ម៉ោង)\n` +
      `• <code>/add &lt;DeviceID&gt; 12h</code> (បន្ថែម 12 ម៉ោង)\n` +
      `• <code>/add &lt;DeviceID&gt; 24h</code> (បន្ថែម 24 ម៉ោង)\n` +
      `• <code>/add &lt;DeviceID&gt; 7</code> (បន្ថែម 7 ថ្ងៃ / 1 សប្តាហ៍)\n` +
      `• <code>/add &lt;DeviceID&gt; 30</code> (បន្ថែម 30 ថ្ងៃ / 1 ខែ)\n` +
      `• <code>/add &lt;DeviceID&gt; 365</code> (បន្ថែម 1 ឆ្នាំ)\n` +
      `• <code>/add &lt;DeviceID&gt; 0</code> (ដំឡើងទៅ Lifetime VIP)\n\n`;

    const inline_keyboard = [];
    if (devices.length > 0) {
      helpMsg += `👇 <b>ឬចុចជ្រើសរើសម៉ាស៊ីនភ្ញៀវខាងក្រោម ដើម្បីកំណត់ថ្ងៃ/ម៉ោង:</b>`;
      devices.slice(0, 6).forEach(d => {
        const auth = authMap[d.deviceId] || {};
        const labelName = d.customName || auth.customName ? `${d.customName || auth.customName} (${d.deviceId.slice(-9)})` : d.deviceId;
        inline_keyboard.push([
          { text: `💻 ${labelName}`, callback_data: `add_picker:${d.deviceId}` }
        ]);
      });
    }

    await sendBotMessage(token, chatId, helpMsg, inline_keyboard.length ? { reply_markup: { inline_keyboard } } : {});
    return;
  }

  const rawTarget = args[0].trim();
  const targetId = findMatchingDeviceId(rawTarget);

  // If user only provided Device ID (e.g. /add HG-DBC0-79F8), open Duration Picker!
  if (!args[1]) {
    await sendAddDurationPicker(token, chatId, targetId);
    return;
  }

  // Parse duration (e.g. "12h", "24h", "7", "30", "0", "lifetime")
  const durStr = String(args[1]).toLowerCase().trim();
  let days = 0;
  let hours = 0;

  if (durStr === '0' || durStr === 'lifetime' || durStr === 'vip') {
    days = 0;
    hours = 0;
  } else if (durStr.endsWith('h') || durStr.includes('h') || durStr.includes('ម៉ោង')) {
    hours = parseInt(durStr.replace(/[^\d]/g, ''), 10) || 24;
    days = 0;
  } else {
    days = parseInt(durStr.replace(/[^\d]/g, ''), 10);
    if (isNaN(days) || days < 0) days = 30;
    hours = 0;
  }

  const authRes = authorizeDevice({
    deviceId: targetId,
    days,
    hours,
    extend: true
  });

  const devList = getTrackedDevices();
  const devInfo = devList.find(d => d.deviceId === targetId);
  const custName = (devInfo && devInfo.customName) ? `👤 <b>ឈ្មោះភ្ញៀវ:</b> <b>${devInfo.customName}</b>\n` : '';

  const label = authRes.label || (hours > 0 ? `${hours} ម៉ោង` : (days > 0 ? `${days} ថ្ងៃ` : 'Lifetime VIP'));

  const reply =
    `🎉 <b>បានបន្ថែមរយៈពេលជូនម៉ាស៊ីនជោគជ័យ!</b> 🎉\n\n` +
    `💻 <b>Device ID:</b> <code>${targetId}</code>\n` +
    custName +
    `⏱️ <b>រយៈពេលដែលបានបន្ថែម:</b> <b>+${label}</b>\n` +
    `🔑 <b>License Key:</b> <code>${authRes.key}</code>\n` +
    `⏳ <b>សុពលភាពថ្មី:</b> <b>${authRes.expiresAt ? formatKhmerTime(authRes.expiresAt) : 'Lifetime VIP (ពេញមួយជីវិត)'}</b>\n` +
    `🕒 <b>ធ្វើបច្ចុប្បន្នភាពនៅ:</b> ${formatKhmerTime()}\n\n` +
    `👉 <i>ម៉ាស៊ីនអតិថិជននឹង Auto-Activate ដោយស្វ័យប្រវត្តិតាមរយៈប៊ូតុង Refresh លើកម្មវិធី!</i>`;

  const inline_keyboard = [
    [
      { text: '➕ បន្ថែមបន្តទៀត', callback_data: `add_picker:${targetId}` },
      { text: '✏️ ដាក់/កែឈ្មោះ', callback_data: `rename_prompt:${targetId}` }
    ],
    [
      { text: '📜 អង្គចងចាំ 3 ខែ', callback_data: 'menu:memory' }
    ]
  ];

  await sendBotMessage(token, chatId, reply, { reply_markup: { inline_keyboard } });
}

/**
 * Command Handler: /name or /rename (✏️ កែសម្រួល ឬដាក់ឈ្មោះសម្គាល់ភ្ញៀវ)
 */
async function handleRenameCommand(token, chatId, args = []) {
  if (!args.length || !args[0]) {
    const devices = getTrackedDevices();
    const exampleId = devices.length ? devices[0].deviceId : 'HG-DBC0-79F8-FD0C';
    const helpMsg =
      `✏️ <b>ដាក់ ឬកែឈ្មោះសម្គាល់ភ្ញៀវ (Customer Name / Tag):</b>\n\n` +
      `👉 <b>របៀបវាយបញ្ជា:</b>\n` +
      `<code>/name &lt;DeviceID&gt; &lt;ឈ្មោះភ្ញៀវ&gt;</code>\n\n` +
      `<b>ឧទាហរណ៍:</b>\n` +
      `• <code>/name ${exampleId} បង សុខ សាន</code>\n` +
      `• <code>/name ${exampleId} VIP - ពិសាល</code>\n` +
      `• <code>/name ${exampleId} ហាងកាហ្វេ ភ្នំពេញ</code>\n\n` +
      `💡 <i>ឈ្មោះនេះនឹងត្រូវចងចាំ និងបង្ហាញលើបញ្ជីភ្ញៀវទាំងអស់ និងលើអង្គចងចាំ 3 ខែ ដើម្បីងាយស្រួលចំណាំ!</i>`;

    await sendBotMessage(token, chatId, helpMsg);
    return;
  }

  const rawTarget = args[0].trim();
  const targetId = findMatchingDeviceId(rawTarget);
  const newName = args.slice(1).join(' ').trim();

  if (!newName) {
    const helpMsg =
      `⚠️ <b>សូមបញ្ជាក់ឈ្មោះភ្ញៀវផងដែរ!</b>\n\n` +
      `👉 <b>វាយតាមទម្រង់:</b>\n` +
      `<code>/name ${targetId} ឈ្មោះភ្ញៀវ</code>\n\n` +
      `<i>ឧទាហរណ៍:</i> <code>/name ${targetId} បង សុខ សាន</code>`;
    await sendBotMessage(token, chatId, helpMsg);
    return;
  }

  setDeviceCustomName(targetId, newName);
  const remaining = formatDeviceRemainingText(targetId);

  const reply =
    `✅ <b>បានកែសម្រួលឈ្មោះសម្គាល់ដោយជោគជ័យ!</b> 🎉\n\n` +
    `👤 <b>ឈ្មោះសម្គាល់ថ្មី:</b> <b>${newName}</b>\n` +
    `💻 <b>លេខម៉ាស៊ីន (Device ID):</b> <code>${targetId}</code>\n` +
    `⏱️ <b>សុពលភាពនៅសល់:</b> <b>${remaining}</b>\n` +
    `🕒 <b>កាលបរិច្ឆេទ:</b> ${formatKhmerTime()}\n\n` +
    `✨ <i>ឈ្មោះនេះត្រូវបានចងចាំក្នុងប្រព័ន្ធ និងបង្ហាញលើអេក្រង់កុំព្យូទ័រភ្ញៀវផ្ទាល់!</i>`;

  const inline_keyboard = [
    [
      { text: `➕ បន្ថែមថ្ងៃ/ម៉ោងជូន ${newName}`, callback_data: `add_picker:${targetId}` }
    ],
    [
      { text: '📜 អង្គចងចាំ 3 ខែ', callback_data: 'menu:memory' },
      { text: '📋 បញ្ជីភ្ញៀវ', callback_data: 'menu:playlist' }
    ]
  ];

  await sendBotMessage(token, chatId, reply, { reply_markup: { inline_keyboard } });
}

/**
 * Command Handler 8: /reset_trial (🔄 Reset សិទ្ធិតេស្ត 3 ថ្ងៃ)
 */
async function handleResetTrialCommand(token, chatId, args = []) {
  if (!args.length || !args[0]) {
    const devices = getTrackedDevices();
    const helpMsg =
      `🔄 <b>Reset សិទ្ធិតេស្ត 3 ថ្ងៃ (Reset Trial):</b>\n\n` +
      `👉 <b>របៀបវាយបញ្ជា:</b> <code>/reset_trial &lt;DeviceID&gt;</code>\n\n` +
      `<b>ឧទាហរណ៍:</b>\n` +
      `• <code>/reset_trial HG-DBC0-79F8</code>\n\n` +
      `💡 <i>មុខងារនេះនឹងលុបការចាក់សោរ និងផ្ដល់សិទ្ធិតេស្ត 3 ថ្ងៃ (72 ម៉ោង) ជូនអតិថិជនភ្លាមៗ!</i>\n\n` +
      (devices.length ? `👇 <b>ឬចុចជ្រើសរើស Device ខាងក្រោមដើម្បី Reset ភ្លាមៗ:</b>` : '');

    const inline_keyboard = [];
    devices.slice(0, 4).forEach(d => {
      inline_keyboard.push([
        { text: `🔄 Reset 3 ថ្ងៃ: ${d.deviceId}`, callback_data: `resettrial:${d.deviceId}` }
      ]);
    });

    await sendBotMessage(token, chatId, helpMsg, inline_keyboard.length ? { reply_markup: { inline_keyboard } } : {});
    return;
  }

  const targetId = args[0].toUpperCase().trim();
  // 1. Reset device fails and lockouts
  resetDeviceFails(targetId);

  // 2. Authorize 3 days trial
  const authRes = authorizeDevice({
    deviceId: targetId,
    days: 3,
    label: 'សិទ្ធិតេស្ត 3 ថ្ងៃ (Trial 72h)'
  });

  const reply =
    `🔄 <b>បាន Reset សិទ្ធិតេស្ត 3 ថ្ងៃ ដោយជោគជ័យ!</b> 🎉\n\n` +
    `💻 <b>លេខម៉ាស៊ីន (Device ID):</b> <code>${targetId}</code>\n` +
    `🔑 <b>Trial License Key:</b> <code>${authRes.key}</code>\n` +
    `⏳ <b>សុពលភាព:</b> <b>3 ថ្ងៃ (72 ម៉ោង)</b>\n` +
    `🔓 <b>ស្ថានភាពចាក់សោរ:</b> បានដោះសោររួចរាល់ (Unlocked)\n\n` +
    `👉 <b>ជូនដំណឹងទៅភ្ញៀវ:</b> ប្រាប់គាត់ឱ្យចុច [ 🔄 ផ្ទុកឡើងវិញ (Refresh) ] លើកម្មវិធីរបស់គាត់ នោះវានឹងបើកសិទ្ធិតេស្ត 3 ថ្ងៃភ្លាមៗ!`;

  await sendBotMessage(token, chatId, reply);
}

/**
 * Command Handler 9: /stats (📊 ស្ថិតិប្រព័ន្ធសរុប)
 */
async function handleStatsCommand(token, chatId) {
  const devices = getTrackedDevices();
  const payments = getPaymentRequests();
  const activeCount = devices.filter(d => d.status && !d.status.includes('unactivated') && !d.status.includes('Hack')).length;
  const expiredCount = devices.filter(d => d.status && d.status.includes('ផុតកំណត់')).length;
  const unactCount = devices.length - activeCount;
  const totalCash = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

  // Current online
  const now = Date.now();
  const onlineCount = devices.filter(d => d.lastSeen && (now - new Date(d.lastSeen).getTime() <= 30 * 60 * 1000)).length;

  const reply =
    `📊 <b>ស្ថិតិប្រព័ន្ធសរុប (System Statistics):</b>\n\n` +
    `💻 <b>ម៉ាស៊ីនសរុប (Total Devices):</b> <b>${devices.length}</b> គ្រឿង\n` +
    `🟢 <b>ភ្ញៀវកំពុង Online ជាក់ស្ដែង:</b> <b>${onlineCount}</b> នាក់\n` +
    `✨ <b>អាជ្ញាប័ណ្ណសកម្ម (Active):</b> <b>${activeCount}</b> គ្រឿង\n` +
    `⚠️ <b>អាជ្ញាប័ណ្ណផុតកំណត់ (Expired):</b> <b>${expiredCount}</b> គ្រឿង\n` +
    `🔐 <b>មិនទាន់ Activate:</b> <b>${unactCount}</b> គ្រឿង\n` +
    `💰 <b>សំណើបង់ប្រាក់សរុប:</b> <b>${payments.length}</b> លើក\n` +
    `💵 <b>ចំណូលសរុបដែលបានកត់ត្រា:</b> <b>$${totalCash.toFixed(2)}</b>\n` +
    `🤖 <b>ស្ថានភាព Bot:</b> កំពុងដំណើរការ 24 ម៉ោង (Online)\n` +
    `🕒 <b>ម៉ោងពិនិត្យ:</b> ${formatKhmerTime()}`;

  await sendBotMessage(token, chatId, reply, getMainMenuKeyboard());
}

/**
 * Flexible Payment Notification Parser.
 * Detects payments from ABA Mobile, ABA KHQR, PayWay, Bakong, Wing, ACLEDA, Canadia, etc.
 * Supports Khmer and English notification text, USD and KHR currencies.
 */
function parseFlexiblePaymentNotification(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const text = rawText.trim();

  // 1. Check for payment-related keywords in Khmer or English, or plus sign with currency
  const paymentKeywords = [
    'received', 'receive', 'paid', 'payment', 'transfer', 'transferred',
    'khqr', 'aba', 'payway', 'bakong', 'wing', 'acleda', 'canadia', 'apv',
    'transaction', 'trx', 'txn', 'ref', 'reference', 'success', 'successful',
    'credited', 'credit', 'deposit', 'inward', 'balance',
    'ទទួល', 'បង់', 'ផ្ទេរ', 'ទូទាត់', 'ជោគជ័យ', 'លេខប្រតិបត្តិការ', 'ប្រាក់', 'ចំណូល',
    'ចូល', 'កុង', 'គណនី', 'សរុប', 'ទឹកប្រាក់', 'ប្រតិបត្តិការ', 'ស្កេន'
  ];
  const hasKeyword = paymentKeywords.some(kw => text.toLowerCase().includes(kw));
  const hasPlusCurrency = /\+\s*(?:\$|USD)?[0-9]+/i.test(text);

  if (!hasKeyword && !hasPlusCurrency) return null;

  // 2. Extract Amount ($X.XX, USD X.XX, X.XX USD, X.XX$, or KHR / Riel)
  let amount = 0;

  // First check USD
  const m1 = text.match(/(?:\$|USD\s*)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i);
  const m2 = text.match(/([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)\s*(?:\$|\s*USD)/i);
  if (m1 && m1[1]) {
    amount = parseFloat(m1[1].replace(/,/g, ''));
  } else if (m2 && m2[1]) {
    amount = parseFloat(m2[1].replace(/,/g, ''));
  }

  // If no USD found, check KHR / Riel
  if (!amount || isNaN(amount) || amount <= 0) {
    const k1 = text.match(/(?:KHR|\s*រៀល|\s*៛)\s*([0-9]+(?:,[0-9]{3})*)/i);
    const k2 = text.match(/([0-9]+(?:,[0-9]{3})*)\s*(?:KHR|\s*រៀល|\s*៛)/i);
    const rawKhr = (k1 && k1[1]) || (k2 && k2[1]);
    if (rawKhr) {
      const numKhr = parseFloat(rawKhr.replace(/,/g, ''));
      if (numKhr >= 20000 && numKhr <= 30000) amount = 5.99;
      else if (numKhr >= 5000 && numKhr <= 8000) amount = 1.50;
      else if (numKhr > 0) amount = Math.round((numKhr / 4100) * 100) / 100;
    }
  }

  // Also check plain "+ 1.50" or "+1.50"
  if (!amount || isNaN(amount) || amount <= 0) {
    const p1 = text.match(/\+\s*(?:\$)?\s*([0-9]+(?:\.[0-9]{1,2})?)/);
    if (p1 && p1[1]) {
      amount = parseFloat(p1[1]);
    }
  }

  if (!amount || isNaN(amount) || amount <= 0) return null;

  // 3. Extract Payer Name if available
  let payer = 'Customer';
  const payerPatterns = [
    /(?:ត្រូវបានបង់ដោយ|paid by|from|payer|ពី|ផ្ញើពី|ផ្ទេរពី|អ្នកផ្ញើ|customer)\s*[:\-]?\s*([^(\n\r,។\.:]+)/i,
    /(?:account name|name|ឈ្មោះ)\s*[:\-]?\s*([^(\n\r,។\.:]+)/i
  ];
  for (const pat of payerPatterns) {
    const m = text.match(pat);
    if (m && m[1] && m[1].trim()) {
      let candidate = m[1].trim();
      candidate = candidate.replace(/\s+(?:តាម(?:រយៈ)?|via|at|by|on|នៅ).*$/i, '').trim();
      if (candidate && candidate.length > 1) {
        payer = candidate;
        break;
      }
    }
  }

  // 4. Extract Transaction / Ref ID if available
  let trxId = '';
  const trxPatterns = [
    /(?:លេខប្រតិបត្តិការ|លេខកូដប្រតិបត្តិការ|Trx(?:\.?\s*ID)?|Transaction(?:\s*ID)?|Trans(?:\s*ID)?|Txn(?:\s*ID)?|APV|Ref|Reference|Trace\s*(?:No)?|Hash)\s*[:#\s]\s*([a-zA-Z0-9_\-]+)/i,
    /(?:Code|ID)\s*[:#]\s*([a-zA-Z0-9_\-]+)/i
  ];
  for (const pat of trxPatterns) {
    const m = text.match(pat);
    if (m && m[1] && m[1].trim()) {
      trxId = m[1].trim();
      break;
    }
  }

  return { amount, payer, trxId, originalText: text };
}

/**
 * Handles PayWay / KHQR payment notification by auto-activating customer machine and generating key.
 */
async function handlePayWayPayment(token, chatId, payWayData, msg) {
  const { amount, payer, trxId } = payWayData;

  // Prevent duplicate processing of the same transaction
  if (trxId && isTrxAlreadyProcessed(trxId)) {
    console.log(`[Telegram Bot] ⚠️ Payment Trx ID ${trxId} already processed. Skipping duplicate.`);
    return;
  }
  if (trxId) markTrxProcessed(trxId, { amount, payer });

  console.log(`[Telegram Bot] 💳 Fulfilling payment: $${amount} from ${payer} (Trx: ${trxId})`);
  const result = fulfillPayWayPayment({ amount, payer, trxId });

  const msgId = msg && msg.message_id ? msg.message_id : undefined;

  if (result.autoActivated) {
    const successMsg =
      `🎉🎉🎉 <b>ទទួលបានការទូទាត់ប្រាក់ជោគជ័យ!</b> 🎉🎉🎉\n\n` +
      `💵 <b>ចំនួនទឹកប្រាក់:</b> <b>$${amount.toFixed(2)}</b>\n` +
      `👤 <b>អ្នកបង់ប្រាក់:</b> <b>${payer}</b>\n` +
      (trxId ? `🧾 <b>លេខប្រតិបត្តិការ (Trx ID):</b> <code>${trxId}</code>\n` : '') +
      `\n` +
      `⚡ <b>ដំណើរការ Auto-Activate ជោគជ័យ:</b>\n` +
      `💻 <b>លេខម៉ាស៊ីន (Device ID):</b> <code>${result.deviceId}</code>\n` +
      `🔑 <b>License Key:</b> <code>${result.key}</code>\n` +
      `📅 <b>សុពលភាព:</b> <b>${result.label}</b>\n` +
      `🕒 <b>ម៉ោងអនុញ្ញាត:</b> ${formatKhmerTime()}\n` +
      `🟢 <b>ស្ថានភាព:</b> កម្មវិធីលើកុំព្យូទ័រភ្ញៀវត្រូវបានបើកសិទ្ធិដោយស្វ័យប្រវត្តិកំពុងដំណើរការ!\n\n` +
      `👉 <i>(ភ្ញៀវមិនបាច់វាយបញ្ចូល Key ឡើយ កម្មវិធីរបស់គាត់នឹង Unlock អូតូតែម្តង)</i>`;

    await sendBotMessage(token, chatId, successMsg, msgId ? { reply_to_message_id: msgId } : {});
  } else {
    const standaloneMsg =
      `💰 <b>ទទួលបានការទូទាត់ប្រាក់: $${amount.toFixed(2)}</b>\n\n` +
      `👤 <b>អ្នកបង់ប្រាក់:</b> <b>${payer}</b>\n` +
      (trxId ? `🧾 <b>Trx ID:</b> <code>${trxId}</code>\n` : '') +
      `\n` +
      `🔑 <b>License Key ត្រូវបានបង្កើតរួចរាល់:</b>\n` +
      `👉 <code>${result.key}</code> (សុពលភាព <b>${result.label}</b>)\n\n` +
      `ℹ️ <i>មិនទាន់មាន Device ID កំពុងរង់ចាំឡើយ។ លោកអ្នកអាច Copy Key ខាងលើផ្ញើជូនភ្ញៀវ ឬចុចលើ Device ខាងក្រោមដើម្បីបើកសិទ្ធិ:</i>`;

    const devices = getTrackedDevices();
    const inline_keyboard = [];
    devices.slice(0, 3).forEach(d => {
      inline_keyboard.push([
        { text: `⚡ បើកសិទ្ធិឱ្យ ${d.deviceId} (${d.computerName || 'PC'})`, callback_data: `auth:${d.deviceId}:${result.days}` }
      ]);
    });

    await sendBotMessage(token, chatId, standaloneMsg, {
      reply_to_message_id: msgId,
      reply_markup: inline_keyboard.length ? { inline_keyboard } : undefined
    });
  }
}

/**
 * Handle manual /unlock or /paid command
 */
async function handleUnlockCommand(token, chatId, args, msg) {
  const replied = msg && msg.reply_to_message;
  const repliedText = replied ? (replied.text || replied.caption || '') : '';
  const payData = parseFlexiblePaymentNotification(repliedText);

  if (payData) {
    await handlePayWayPayment(token, chatId, payData, msg);
    return;
  }

  let amount = 1.50;
  let devId = null;
  if (args && args.length > 0) {
    for (const arg of args) {
      const clean = arg.replace('$', '').trim();
      const num = parseFloat(clean);
      if (!isNaN(num) && num > 0) {
        amount = num;
      } else if (arg.toUpperCase().includes('HG-') || /^[A-F0-9]{8,16}$/i.test(arg)) {
        devId = arg.toUpperCase().trim();
      }
    }
  }

  const result = fulfillPayWayPayment({
    amount,
    payer: (msg && msg.from && (msg.from.username ? `@${msg.from.username}` : msg.from.first_name)) || 'Admin',
    trxId: `CMD-${Date.now()}`,
    deviceId: devId
  });

  const successMsg =
    `⚡ <b>បានបើកសិទ្ធិ (Auto-Unlock) ដោយជោគជ័យ!</b>\n\n` +
    `💻 <b>លេខម៉ាស៊ីន (Device ID):</b> <code>${result.deviceId}</code>\n` +
    `🔑 <b>License Key:</b> <code>${result.key}</code>\n` +
    `📅 <b>សុពលភាព:</b> <b>${result.label}</b>\n` +
    `🕒 <b>ម៉ោងអនុញ្ញាត:</b> ${formatKhmerTime()}\n` +
    `🟢 <b>ស្ថានភាព:</b> កម្មវិធីលើកុំព្យូទ័រភ្ញៀវត្រូវបានបើកសិទ្ធិដោយស្វ័យប្រវត្តិកំពុងដំណើរការ!\n\n` +
    `👉 <i>(ភ្ញៀវមិនបាច់វាយបញ្ចូល Key ឡើយ កម្មវិធីរបស់គាត់នឹង Unlock អូតូតែម្តង)</i>`;

  await sendBotMessage(token, chatId, successMsg, msg && msg.message_id ? { reply_to_message_id: msg.message_id } : {});
}

/**
 * Handles incoming update (message or callback query)
 */
async function processTelegramUpdate(token, update, adminChatId) {
  // 1. Process Callback Queries (Inline Keyboard Buttons)
  if (update.callback_query) {
    const cq = update.callback_query;
    const fromId = String(cq.from.id);
    const data = cq.data || '';
    const chatId = (cq.message && cq.message.chat && cq.message.chat.id) || cq.from.id;

    console.log(`[Telegram Bot] 🔘 Button Clicked: "${data}" by ${cq.from.first_name || ''} (ID: ${fromId}, Chat: ${chatId})`);

    // Acknowledge immediately to remove spinner on button
    answerCallbackQuery(token, cq.id, '⚡ ដំណើរការ...').catch(() => {});

    // Security check: Only Admin chat can approve/generate
    const isAdmin = !adminChatId || String(fromId).trim() === String(adminChatId).trim() || String(chatId).trim() === String(adminChatId).trim();
    if (!isAdmin) {
      await sendBotMessage(token, chatId, '⛔ អ្នកគ្មានសិទ្ធិអនុញ្ញាតមុខងារនេះទេ');
      return;
    }

    // Menu shortcuts
    if (data.startsWith('menu:')) {
      const menuAction = data.split(':')[1];
      if (menuAction === 'keygen') await handleKeygenCommand(token, chatId, []);
      else if (menuAction === 'playlist') await handlePlaylistCommand(token, chatId);
      else if (menuAction === 'online') await handleOnlineCommand(token, chatId);
      else if (menuAction === 'today') await handleTodayCommand(token, chatId);
      else if (menuAction === 'memory') await handleMemoryCommand(token, chatId);
      else if (menuAction === 'add') await handleAddCommand(token, chatId, []);
      else if (menuAction === 'reset_trial') await handleResetTrialCommand(token, chatId, []);
      else if (menuAction === 'stats') await handleStatsCommand(token, chatId);
      return;
    }

    // Pick device shortcut
    if (data.startsWith('pickdev:')) {
      const pickedId = data.split(':')[1];
      const promptMsg =
        `💻 <b>បានជ្រើសរើស Device ID:</b> <code>${pickedId}</code>\n\n` +
        `👉 <i>សូមចុចជ្រើសរើសកញ្ចប់ខាងក្រោម ដើម្បីបង្កើត License Key:</i>`;
      const kb = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '⚡ បើកសិទ្ធិ 7 ថ្ងៃ', callback_data: `auth:${pickedId}:7` },
              { text: '⚡ បើកសិទ្ធិ 30 ថ្ងៃ', callback_data: `auth:${pickedId}:30` }
            ],
            [
              { text: '⚡ បើកសិទ្ធិ 1 ឆ្នាំ', callback_data: `auth:${pickedId}:365` },
              { text: '👑 Lifetime VIP', callback_data: `auth:${pickedId}:0` }
            ],
            [
              { text: '🔑 បង្កើត Key 30 ថ្ងៃ', callback_data: `genkey:${pickedId}:30` },
              { text: '🔄 Reset តេស្ត 3 ថ្ងៃ', callback_data: `auth:${pickedId}:3` }
            ]
          ]
        }
      };
      await sendBotMessage(token, chatId, promptMsg, kb);
      return;
    }

    // Add days shortcut
    if (data.startsWith('adddays:')) {
      const parts = data.split(':');
      await handleAddCommand(token, chatId, [parts[1], parts[2] || '30']);
      return;
    }

    // Interactive Duration Picker shortcut
    if (data.startsWith('add_picker:')) {
      const devId = data.replace('add_picker:', '').trim();
      await sendAddDurationPicker(token, chatId, devId);
      return;
    }

    // Execute duration addition from picker
    if (data.startsWith('doadd:')) {
      const parts = data.split(':');
      const devId = parts[1];
      const dur = parts[2] || '30d';
      await handleAddCommand(token, chatId, [devId, dur]);
      return;
    }

    // Rename prompt shortcut
    if (data.startsWith('rename_prompt:')) {
      const devId = data.replace('rename_prompt:', '').trim();
      const pMsg =
        `✏️ <b>របៀបដាក់ ឬកែឈ្មោះសម្រាប់ Device:</b> <code>${devId}</code>\n\n` +
        `សូម Copy ពាក្យបញ្ជាខាងក្រោម រួចវាយឈ្មោះភ្ញៀវដែលអ្នកចង់ដាក់:\n\n` +
        `👉 <code>/name ${devId} ឈ្មោះភ្ញៀវ</code>\n\n` +
        `<b>ឧទាហរណ៍:</b>\n` +
        `• <code>/name ${devId} បង សុខ សាន</code>\n` +
        `• <code>/name ${devId} VIP - ពិសាល</code>\n\n` +
        `💡 <i>ឈ្មោះនេះនឹងបង្ហាញលើបញ្ជីភ្ញៀវទាំងអស់ និងលើអង្គចងចាំ 3 ខែ ដើម្បីងាយស្រួលចំណាំ!</i>`;
      await sendBotMessage(token, chatId, pMsg);
      return;
    }

    // Reset trial shortcut
    if (data.startsWith('resettrial:')) {
      const devId = data.split(':')[1];
      await handleResetTrialCommand(token, chatId, [devId]);
      return;
    }

    const parts = data.split(':');
    const action = parts[0];
    const deviceId = parts[1];
    const daysArg = parts[2] !== undefined ? parseInt(parts[2], 10) : 30;

    if (action === 'auth') {
      const days = isNaN(daysArg) ? 30 : daysArg;
      const authRes = authorizeDevice({
        deviceId,
        days,
        telegramUser: cq.from.username ? `@${cq.from.username}` : ''
      });

      const label = days > 0 ? `${days} ថ្ងៃ` : 'Lifetime VIP (ពេញមួយជីវិត)';

      const successMsg =
        `🎉🎉🎉 <b>បានបើកសិទ្ធិ និងបង្កើត License Key ដោយជោគជ័យ!</b> 🎉🎉🎉\n\n` +
        `💻 <b>លេខម៉ាស៊ីន (Device ID):</b> <code>${deviceId}</code>\n` +
        `🔑 <b>License Key:</b> <code>${authRes.key}</code>\n` +
        `📅 <b>សុពលភាព:</b> <b>${label}</b>\n` +
        `🕒 <b>ម៉ោងអនុញ្ញាត:</b> ${formatKhmerTime()}\n\n` +
        `👉 <b>ចំណាំសម្រាប់អតិថិជន:</b>\n` +
        `1. លើកុំព្យូទ័រគាត់ គ្រាន់តែចុចប៊ូតុង <b>[ 🔄 ផ្ទុកឡើងវិញ (Refresh) ]</b> នោះវានឹង <b>Auto-Activate</b> ដោយស្វ័យប្រវត្តិ!\n` +
        `2. ឬអ្នកអាច Copy Key: <code>${authRes.key}</code> ផ្ញើជូនគាត់វាយបញ្ចូលផ្ទាល់។`;

      await sendBotMessage(token, chatId, successMsg);
      return;
    }

    if (action === 'genkey') {
      const days = isNaN(daysArg) ? 30 : daysArg;
      const key = generateLicenseKey(deviceId, days);
      const label = days > 0 ? `${days} ថ្ងៃ` : 'Lifetime VIP (ពេញមួយជីវិត)';

      const keyMsg =
        `🔑 <b>License Key ត្រូវបានបង្កើតរួចរាល់!</b>\n\n` +
        `💻 <b>Device ID:</b> <code>${deviceId}</code>\n` +
        `🔑 <b>License Key:</b> <code>${key}</code>\n` +
        `📅 <b>សុពលភាព:</b> <b>${label}</b>\n\n` +
        `👉 <i>ចុចលើ License Key ខាងលើដើម្បី Copy រួចផ្ញើជូនអតិថិជន។</i>`;

      await sendBotMessage(token, chatId, keyMsg);
      return;
    }

    if (action === 'reject') {
      await sendBotMessage(token, chatId, `❌ បានបដិសេធសំណើរបស់ Device ID: <code>${deviceId}</code>`);
      return;
    }

    return;
  }

  // 2. Process Messages (Regular messages, Channel posts, Photos with captions, Edited messages)
  const incomingMsg = update.message || update.edited_message || update.channel_post || update.edited_channel_post;
  if (incomingMsg) {
    const msg = incomingMsg;
    const chatId = msg.chat ? msg.chat.id : null;
    if (!chatId) return;

    const rawText = (msg.text || msg.caption || '').trim();
    const fromId = msg.from ? String(msg.from.id) : '';
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup' || msg.chat.type === 'channel';

    // 2a. Intercept Payment Alerts (in group, channel, or private chat)
    let paymentData = parseFlexiblePaymentNotification(rawText);
    
    // Also check if user replied to a payment notification from bank/bot
    if (!paymentData && msg.reply_to_message) {
      const repText = (msg.reply_to_message.text || msg.reply_to_message.caption || '').trim();
      paymentData = parseFlexiblePaymentNotification(repText);
    }

    if (paymentData) {
      console.log('[Telegram Bot] 💳 Intercepted Bank Payment Alert:', paymentData);
      if (typeof recordUnclaimedPayment === 'function') {
        recordUnclaimedPayment({
          amount: paymentData.amount,
          payer: paymentData.payer,
          trxId: paymentData.trxId,
          chatId: chatId,
          messageId: msg ? msg.message_id : null,
          rawText: rawText || (msg.reply_to_message ? (msg.reply_to_message.text || msg.reply_to_message.caption) : '')
        });
      }
      await handlePayWayPayment(token, chatId, paymentData, msg);
      return;
    }

    // 2b. In group: if not a command for our bot, ignore silently (don't spam group with guest message)
    if (isGroup && !rawText.startsWith('/') && !rawText.includes('@ps_media_license_bot')) {
      return;
    }

    console.log(`[Telegram Bot] 💬 Message: "${rawText}" from ${(msg.from && msg.from.first_name) || 'User'} (ID: ${fromId}, Chat: ${chatId})`);

    // Clean up command if it contains @botname (e.g. /unlock@ps_media_license_bot -> /unlock)
    const cleanRawText = rawText.replace(/@ps_media_license_bot/gi, '').trim();
    const parts = cleanRawText.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Command: /unlock, /paid, /verify, /check
    if (cmd === '/unlock' || cmd === '/paid' || cmd === '/verify' || cmd === '/check') {
      await handleUnlockCommand(token, chatId, args, msg);
      return;
    }

    // Security: If not Admin, show general welcome & contact info in private chat
    if (adminChatId && fromId && fromId !== String(adminChatId)) {
      if (isGroup) return; // Never spam group with welcome message
      const cfg = getTelegramConfig();
      const guestMsg =
        `👋 <b>សួស្តី ${(msg.from && msg.from.first_name) || ''}!</b>\n\n` +
        `នេះជា Bot ផ្លូវការសម្រាប់គ្រប់គ្រង License កម្មវិធី <b>PS DOWNLOAD</b>។\n\n` +
        `🛒 ប្រសិនបើអ្នកចង់ទិញ ឬសួរព័ត៌មានបន្ថែមអំពី License Key សូមទាក់ទង Admin:\n` +
        `👉 Telegram: <b>${cfg.adminTelegram || '@Thpisal33'}</b>`;
      await sendBotMessage(token, chatId, guestMsg);
      return;
    }

    // Command 1: /start
    if (cmd === '/start') {
      await handleStartCommand(token, chatId, (msg.from && msg.from.first_name) || 'Admin');
      return;
    }

    // Command 2: /keygen or /key
    if (cmd === '/keygen' || cmd === '/key') {
      await handleKeygenCommand(token, chatId, args);
      return;
    }

    // Command 3: /playlist
    if (cmd === '/playlist') {
      await handlePlaylistCommand(token, chatId);
      return;
    }

    // Command 4: /online
    if (cmd === '/online') {
      await handleOnlineCommand(token, chatId);
      return;
    }

    // Command 5: /today
    if (cmd === '/today') {
      await handleTodayCommand(token, chatId);
      return;
    }

    // Command 6: /memory
    if (cmd === '/memory') {
      await handleMemoryCommand(token, chatId);
      return;
    }

    // Command 7: /add
    if (cmd === '/add') {
      await handleAddCommand(token, chatId, args);
      return;
    }

    // Command 8: /reset_trial
    if (cmd === '/reset_trial' || cmd === '/resettrial') {
      await handleResetTrialCommand(token, chatId, args);
      return;
    }

    // Command 9: /stats
    if (cmd === '/stats' || cmd === '/status') {
      await handleStatsCommand(token, chatId);
      return;
    }

    // Command 10: /name or /rename
    if (cmd === '/name' || cmd === '/rename') {
      await handleRenameCommand(token, chatId, args);
      return;
    }

    // Auto-detect if user typed or pasted a Device ID directly (e.g. HG-XXXXXXXX or D73B4D8E)
    const cleanCandidate = cleanRawText.replace(/[\s:`"']/g, '').toUpperCase();
    if ((cleanCandidate.startsWith('HG-') && cleanCandidate.length >= 8) || /^(?:HG-)?[A-F0-9]{8,16}(?:-[A-F0-9]{4,16})*$/i.test(cleanCandidate)) {
      const matchedId = findMatchingDeviceId(cleanCandidate);
      const devices = getTrackedDevices();
      const dev = devices.find(d => d.deviceId === matchedId);
      const namePart = (dev && dev.customName) ? `👤 <b>ឈ្មោះ:</b> <b>${dev.customName}</b>\n` : '';

      const promptMsg =
        `💻 <b>បានទទួលលេខម៉ាស៊ីន (Device ID):</b> <code>${matchedId}</code>\n` +
        namePart + `\n` +
        `👉 <i>សូមចុចជ្រើសរើសមុខងារ ឬកញ្ចប់ខាងក្រោម ដើម្បីអនុញ្ញាតជូនគាត់:</i>`;

      const inlineKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '➕ បន្ថែមថ្ងៃ និងម៉ោង', callback_data: `add_picker:${matchedId}` },
              { text: '✏️ ដាក់/កែឈ្មោះ', callback_data: `rename_prompt:${matchedId}` }
            ],
            [
              { text: '⚡ បើកសិទ្ធិ 7 ថ្ងៃ', callback_data: `auth:${matchedId}:7` },
              { text: '⚡ បើកសិទ្ធិ 30 ថ្ងៃ', callback_data: `auth:${matchedId}:30` }
            ],
            [
              { text: '⚡ បើកសិទ្ធិ 1 ឆ្នាំ', callback_data: `auth:${matchedId}:365` },
              { text: '👑 Lifetime VIP', callback_data: `auth:${matchedId}:0` }
            ],
            [
              { text: '🔑 បង្កើត Key 30 ថ្ងៃ', callback_data: `genkey:${matchedId}:30` },
              { text: '🔄 Reset តេស្ត 3 ថ្ងៃ', callback_data: `auth:${matchedId}:3` }
            ]
          ]
        }
      };

      await sendBotMessage(token, chatId, promptMsg, inlineKeyboard);
      return;
    }

    // Fallback unknown command
    await sendBotMessage(token, chatId, '❓ មិនស្គាល់ពាក្យបញ្ជានេះទេ។ សូមវាយ <code>/start</code> ដើម្បីបើកផ្ទាំង Menu ឬផ្ញើ Device ID មកទីនេះ។');
  }
}

/**
 * Starts Long-Polling loop for the Telegram Bot.
 * Runs continuously in background without blocking the Node event loop.
 */
async function startTelegramBot() {
  if (_isPolling) {
    console.log('[Telegram Bot] Already running polling loop.');
    return { success: true, running: true };
  }

  const cfg = getTelegramConfig();
  if (!cfg.botToken) {
    console.warn('[Telegram Bot] Cannot start bot: botToken is missing in telegram_config.json');
    return { success: false, reason: 'Missing botToken' };
  }

  // Cross-process instance check to prevent 409 Conflict with standalone bot_service
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = fs.readFileSync(LOCK_FILE, 'utf8').trim();
      const existingPid = parseInt(lockData, 10);
      if (existingPid && existingPid !== process.pid && isPidAlive(existingPid)) {
        console.log(`[Telegram Bot] ℹ️ Another Telegram Bot instance is already active (PID: ${existingPid}). Skipping duplicate polling.`);
        return { success: true, running: true, pid: existingPid };
      }
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
  } catch (err) {}

  _isPolling = true;
  _shouldStop = false;
  console.log(`[Telegram Bot] 🚀 Starting 24/7 Telegram License Bot polling loop (Admin Chat ID: ${cfg.chatId || 'All'})...`);

  // Start polling in an async detached loop
  (async () => {
    while (!_shouldStop) {
      try {
        const currentCfg = getTelegramConfig();
        const token = currentCfg.botToken;
        if (!token) {
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        // Use POST with allowed_updates for fast, responsive polling that guarantees callback_queries arrive
        const url = `https://api.telegram.org/bot${token}/getUpdates`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);

        let data = null;
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              offset: _lastUpdateId,
              timeout: 3,
              allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post', 'callback_query']
            }),
            signal: controller.signal
          });
          clearTimeout(timer);
          if (res.ok) {
            data = await res.json();
          } else {
            const errText = await res.text().catch(() => '');
            if (res.status === 409) {
              console.warn('[Telegram Bot] ⚠️ Conflict: another getUpdates is active. Backing off 4s...');
              await new Promise(r => setTimeout(r, 4000));
            } else {
              console.warn(`[Telegram Bot] API returned ${res.status}:`, errText);
              await new Promise(r => setTimeout(r, 2000));
            }
            continue;
          }
        } catch (fetchErr) {
          clearTimeout(timer);
          // Network dropped or timed out, wait 1s and retry
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        if (data && data.ok && Array.isArray(data.result) && data.result.length > 0) {
          for (const update of data.result) {
            _lastUpdateId = update.update_id + 1;
            try {
              await processTelegramUpdate(token, update, currentCfg.chatId);
            } catch (procErr) {
              console.error('[Telegram Bot] ❌ Error processing update:', procErr);
            }
          }
        }
      } catch (loopErr) {
        console.error('[Telegram Bot] ❌ Polling loop caught error:', loopErr.message);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    _isPolling = false;
    console.log('[Telegram Bot] Polling loop stopped.');
  })();

  return { success: true, running: true };
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = fs.readFileSync(LOCK_FILE, 'utf8').trim();
      if (parseInt(lockData, 10) === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch (e) {}
}

/**
 * Stops the Telegram Bot long-polling loop
 */
function stopTelegramBot() {
  _shouldStop = true;
  _isPolling = false;
  releaseLock();
}

process.on('exit', releaseLock);

function isBotRunning() {
  return _isPolling;
}

/**
 * Scans recent Telegram updates (messages in group/channel/private) to verify if
 * a bank payment matching this transaction/amount has been posted.
 * If found and not yet redeemed, it automatically authorizes the device, activates the license,
 * marks transaction processed, and sends celebration notification!
 */
async function checkGroupPaymentVerification({ deviceId, plan, amount }) {
  const cleanId = String(deviceId || getDeviceId()).trim().toUpperCase();
  const numAmount = parseFloat(amount || '0') || 1.50;

  // 1. Check if device is ALREADY authorized in authorized_devices.json and not expired
  const authMap = getAuthorizedDevicesMap();
  const existingAuth = authMap[cleanId];
  if (existingAuth && existingAuth.key && existingAuth.status === 'active') {
    const expTime = new Date(existingAuth.expiresAt || 0).getTime();
    if (expTime > Date.now()) {
      // Already authorized & currently active! Ensure activated locally:
      await activateLicense(existingAuth.key, { customExpiresAt: existingAuth.expiresAt, targetDeviceId: cleanId });
      return {
        verified: true,
        autoActivated: true,
        key: existingAuth.key,
        label: existingAuth.label,
        days: existingAuth.days,
        message: '🎉 ម៉ាស៊ីនរបស់អ្នកត្រូវបានបើកសិទ្ធិដោយជោគជ័យ!'
      };
    }
  }

  // 2. Check unclaimed payments pool from Telegram group messages
  if (typeof findAndClaimRecentPayment === 'function') {
    const claimRes = findAndClaimRecentPayment({ deviceId: cleanId, amount: numAmount });
    if (claimRes && claimRes.found) {
      // Activate locally on client machine
      await activateLicense(claimRes.authRes.key, {
        customExpiresAt: claimRes.authRes.expiresAt,
        targetDeviceId: cleanId
      });

      // Send verification notification to Telegram
      const cfg = getTelegramConfig();
      const successNotice =
        `🎉🎉🎉 <b>ផ្ទៀងផ្ទាត់ការបង់ប្រាក់ជោគជ័យ (Auto-Unlocked)!</b> 🎉🎉🎉\n\n` +
        `💵 <b>ចំនួនទឹកប្រាក់:</b> <b>$${claimRes.payment.amount.toFixed(2)}</b>\n` +
        `👤 <b>អ្នកបង់ប្រាក់:</b> <b>${claimRes.payment.payer}</b>\n` +
        (claimRes.payment.trxId ? `🧾 <b>លេខប្រតិបត្តិការ (Trx ID):</b> <code>${claimRes.payment.trxId}</code>\n` : '') +
        `\n` +
        `⚡ <b>បាន Auto-Unlock ម៉ាស៊ីនភ្ញៀវដោយជោគជ័យ:</b>\n` +
        `💻 <b>លេខម៉ាស៊ីន (Device ID):</b> <code>${cleanId}</code>\n` +
        `🔑 <b>License Key:</b> <code>${claimRes.authRes.key}</code>\n` +
        `📅 <b>សុពលភាព:</b> <b>${claimRes.authRes.label}</b>\n` +
        `🕒 <b>ម៉ោងអនុញ្ញាត:</b> ${formatKhmerTime()}\n` +
        `🟢 <b>ស្ថានភាព:</b> កម្មវិធីលើកុំព្យូទ័រភ្ញៀវត្រូវបានបើកសិទ្ធិដំណើរការរួចរាល់!`;

      if (cfg.botToken) {
        if (cfg.chatId) {
          sendBotMessage(cfg.botToken, cfg.chatId, successNotice).catch(() => {});
        }
        if (claimRes.payment.chatId && String(claimRes.payment.chatId) !== String(cfg.chatId)) {
          sendBotMessage(cfg.botToken, claimRes.payment.chatId, successNotice, { reply_to_message_id: claimRes.payment.messageId }).catch(() => {});
        }
      }

      console.log(`[License Verification] ✅ Successfully verified and unlocked device ${cleanId} from Telegram group payment alert!`);

      return {
        verified: true,
        autoActivated: true,
        key: claimRes.authRes.key,
        days: claimRes.authRes.days,
        label: claimRes.authRes.label,
        payer: claimRes.payment.payer,
        amount: claimRes.payment.amount,
        trxId: claimRes.payment.trxId,
        message: '🎉 ការបង់ប្រាក់ត្រូវបានផ្ទៀងផ្ទាត់ជោគជ័យ! កម្មវិធីបានបើកសិទ្ធិដោយស្វ័យប្រវត្តិ!'
      };
    }
  }

  // 3. Fallback: Query Telegram Bot API for latest updates
  const cfg = getTelegramConfig();
  if (!cfg.botToken) {
    return { verified: false, reason: 'Missing botToken' };
  }

  try {
    const res = await callTelegramApi(cfg.botToken, 'getUpdates', {
      offset: -60,
      allowed_updates: ['message', 'channel_post', 'edited_message', 'edited_channel_post']
    });

    if (!res || !res.ok || !Array.isArray(res.result) || res.result.length === 0) {
      return { verified: false, reason: 'No recent updates' };
    }

    const nowSec = Math.floor(Date.now() / 1000);

    // Loop backwards from newest update to oldest
    for (let i = res.result.length - 1; i >= 0; i--) {
      const u = res.result[i];
      const msg = u.message || u.channel_post || u.edited_message || u.edited_channel_post;
      if (!msg) continue;

      // Only inspect messages sent within the last 60 minutes
      const msgDate = msg.date || 0;
      if (nowSec - msgDate > 3600 || nowSec - msgDate < -300) continue;

      const rawText = (msg.text || msg.caption || '').trim();
      const repText = msg.reply_to_message ? (msg.reply_to_message.text || msg.reply_to_message.caption || '').trim() : '';

      const payData = parseFlexiblePaymentNotification(rawText) || parseFlexiblePaymentNotification(repText);
      if (!payData || !payData.amount) continue;

      // Check if amount satisfies the target amount
      if (payData.amount < (numAmount - 0.05)) continue;

      // Check deduplication (transaction ID or message ID)
      const dedupeKey = payData.trxId || `TGMSG-${msg.chat.id}-${msg.message_id}-${Math.round(payData.amount * 100)}`;
      if (isTrxAlreadyProcessed(dedupeKey)) continue;

      // MATCH FOUND! Mark as processed
      markTrxProcessed(dedupeKey, { amount: payData.amount, payer: payData.payer, deviceId: cleanId });

      let days = 7;
      let planLabel = '7 ថ្ងៃ (១ សប្តាហ៍)';
      if (payData.amount >= 20.0) {
        days = 365;
        planLabel = '365 ថ្ងៃ (១ ឆ្នាំ)';
      } else if (payData.amount >= 5.0) {
        days = 30;
        planLabel = '30 ថ្ងៃ (១ ខែ)';
      } else if (payData.amount >= 1.0) {
        days = 7;
        planLabel = '7 ថ្ងៃ (១ សប្តាហ៍)';
      } else {
        days = 3;
        planLabel = '3 ថ្ងៃ (តេស្ត)';
      }

      // Authorize the device
      const authRes = authorizeDevice({
        deviceId: cleanId,
        days: days,
        telegramUser: payData.payer,
        customLabel: planLabel
      });

      // Activate locally on client machine
      await activateLicense(authRes.key, { customExpiresAt: authRes.expiresAt, targetDeviceId: cleanId });

      // Send verification notification to Telegram
      const successNotice =
        `🎉🎉🎉 <b>ផ្ទៀងផ្ទាត់ការបង់ប្រាក់ជោគជ័យ (Auto-Unlocked)!</b> 🎉🎉🎉\n\n` +
        `💵 <b>ចំនួនទឹកប្រាក់:</b> <b>$${payData.amount.toFixed(2)}</b>\n` +
        `👤 <b>អ្នកបង់ប្រាក់:</b> <b>${payData.payer}</b>\n` +
        (payData.trxId ? `🧾 <b>លេខប្រតិបត្តិការ (Trx ID):</b> <code>${payData.trxId}</code>\n` : '') +
        `\n` +
        `⚡ <b>បាន Auto-Unlock ម៉ាស៊ីនភ្ញៀវដោយជោគជ័យ:</b>\n` +
        `💻 <b>លេខម៉ាស៊ីន (Device ID):</b> <code>${cleanId}</code>\n` +
        `🔑 <b>License Key:</b> <code>${authRes.key}</code>\n` +
        `📅 <b>សុពលភាព:</b> <b>${planLabel}</b>\n` +
        `🕒 <b>ម៉ោងអនុញ្ញាត:</b> ${formatKhmerTime()}\n` +
        `🟢 <b>ស្ថានភាព:</b> កម្មវិធីលើកុំព្យូទ័រភ្ញៀវត្រូវបានបើកសិទ្ធិដំណើរការរួចរាល់!`;

      if (cfg.chatId) {
        sendBotMessage(cfg.botToken, cfg.chatId, successNotice).catch(() => {});
      }
      if (msg.chat && msg.chat.id && String(msg.chat.id) !== String(cfg.chatId)) {
        sendBotMessage(cfg.botToken, msg.chat.id, successNotice, { reply_to_message_id: msg.message_id }).catch(() => {});
      }

      console.log(`[License Verification] ✅ Successfully verified and unlocked device ${cleanId} from Telegram payment alert!`);

      return {
        verified: true,
        autoActivated: true,
        key: authRes.key,
        days: days,
        label: planLabel,
        payer: payData.payer,
        amount: payData.amount,
        trxId: payData.trxId,
        message: '🎉 ការបង់ប្រាក់ត្រូវបានផ្ទៀងផ្ទាត់ជោគជ័យ! កម្មវិធីត្រូវបានបើកសិទ្ធិដោយស្វ័យប្រវត្តិ!'
      };
    }

    return { verified: false, reason: 'No matching unredeemed payment found' };
  } catch (err) {
    console.warn('[License Verification] Error scanning Telegram updates:', err.message);
    return { verified: false, error: err.message };
  }
}

module.exports = {
  startTelegramBot,
  stopTelegramBot,
  isBotRunning,
  sendBotMessage,
  parseFlexiblePaymentNotification,
  handlePayWayPayment,
  checkGroupPaymentVerification
};
