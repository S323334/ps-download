/**
 * License Key and Machine Authentication System for Hongguo Downloader Desktop.
 * Provides Hardware ID locking, HMAC cryptographic key verification,
 * master key fallback, and secure local activation storage.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const { DATA_DIR, APP_VERSION } = require('./config.js');
const LICENSE_FILE = path.join(DATA_DIR, 'license.json');

// Secret salt used for HMAC signature generation (Keep secure)
const LICENSE_SECRET = process.env.HONGGUO_LICENSE_SECRET || 'HONGGUO_VIP_KEYGEN_SECRET_SALT_2026_@AGY';

// Universal Developer / Master Keys that unlock any machine instantly
const MASTER_KEYS = [
  'PS-ADMIN-2026-VIP',
  'ADMIN-VIP-LIFETIME',
  'HG-MASTER-2026-VIP',
  'HG-ADMIN-LIFETIME-PRO',
  'VIP-HONGGUO-UNLOCKED-999'
];

let _cachedDeviceId = null;

/**
 * Retrieves or generates a persistent, unique Hardware/Device ID for this machine.
 * Combines Windows MachineGuid + Computer Name + Username + CPU architecture.
 */
function getDeviceId() {
  if (_cachedDeviceId) return _cachedDeviceId;

  let rawMachineGuid = '';
  if (process.platform === 'win32') {
    try {
      const out = cp.execSync(
        'powershell -NoProfile -Command "(Get-ItemProperty -Path HKLM:\\SOFTWARE\\Microsoft\\Cryptography).MachineGuid"',
        { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
      ).toString().trim();
      if (out && out.length > 8) {
        rawMachineGuid = out;
      }
    } catch (e) {
      // Fallback
    }
  }

  // Combine system characteristics
  const host = os.hostname() || 'localhost';
  const user = (os.userInfo && os.userInfo().username) || 'user';
  const arch = os.arch() || 'x64';
  const platform = os.platform() || 'win32';

  const rawSeed = `${rawMachineGuid}|${host}|${user}|${platform}|${arch}`;
  const hexHash = crypto.createHash('sha256').update(rawSeed).digest('hex').toUpperCase();

  // Format as readable HG-XXXX-XXXX-XXXX (12 hex characters)
  const part1 = hexHash.substring(0, 4);
  const part2 = hexHash.substring(4, 8);
  const part3 = hexHash.substring(8, 12);

  _cachedDeviceId = `HG-${part1}-${part2}-${part3}`;
  return _cachedDeviceId;
}

const GENERATED_KEYS_FILE = path.join(DATA_DIR, 'generated_keys.json');

/**
 * Generates a valid HMAC License Key for a given Device ID with optional duration in days or hours.
 * Key formats:
 * - Lifetime:        LIFE-XXXX-XXXX-XXXX
 * - N Days:          D030-XXXX-XXXX-XXXX (e.g. D030 for 30 days, D001 for 1 day, D002 for 2 days)
 * - N Hours:         H001-XXXX-XXXX-XXXX (e.g. H001 for 1 hour, H006 for 6 hours, H024 for 24 hours)
 */
function generateLicenseKey(deviceId, durationValue = 0, unit = 'days') {
  const cleanId = String(deviceId || '').trim().toUpperCase();
  const dur = Math.max(0, parseInt(durationValue || '0', 10));
  
  let prefix = 'LIFE';
  let label = 'Lifetime VIP (ពេញមួយជីវិត)';
  let days = 0;
  let hours = 0;

  if (unit === 'hours' && dur > 0) {
    prefix = `H${String(dur).padStart(3, '0')}`;
    label = `${dur} ម៉ោង (${dur} Hours)`;
    hours = dur;
  } else if (dur > 0) {
    prefix = `D${String(dur).padStart(3, '0')}`;
    label = `${dur} ថ្ងៃ (${dur} Days)`;
    days = dur;
  }

  const salt = `${LICENSE_SECRET}:${prefix}`;
  const hmac = crypto.createHmac('sha256', salt).update(cleanId).digest('hex').toUpperCase();

  const p1 = hmac.substring(0, 4);
  const p2 = hmac.substring(4, 8);
  const p3 = hmac.substring(8, 12);

  const fullKey = `${prefix}-${p1}-${p2}-${p3}`;

  // Log to generated history
  saveGeneratedKeyRecord({
    deviceId: cleanId,
    key: fullKey,
    days: days,
    hours: hours,
    isUniversal: false,
    label: label,
    createdAt: new Date().toISOString()
  });

  return fullKey;
}

/**
 * Generates a Universal / Public Trial Key for ALL machines (សម្រាប់គ្រប់ម៉ាស៊ីន).
 * Does NOT require entering any Client Device ID.
 * Parameters:
 * - accessHours: Total usage hours granted to a client upon activation (e.g. 1h, 6h, 24h/1 day, 48h/2 days, 72h/3 days, 168h/7 days).
 * - claimWindowHours: Time window from now within which clients can claim/redeem this key (e.g. 1h, 2h, 12h, 24h).
 *   After claimWindowHours, new clients CANNOT activate this key anymore ("Expire មិនអាចចូលបានទៀតទេ")!
 *   Clients who claimed it in time continue using it until their access duration expires!
 * Format: UNIV-<AccessCode>-<DeadlineHex>-<Chk> (e.g. UNIV-D01-1E5A8C-7B42)
 */
function generateUniversalKey({ accessHours = 24, claimWindowHours = 24, label = '' } = {}) {
  const accHours = Math.max(1, parseInt(accessHours || '24', 10));
  const claimHours = Math.max(1, parseInt(claimWindowHours || '24', 10));

  // Determine access code
  let accessCode = '';
  if (accHours % 24 === 0 && accHours >= 24) {
    accessCode = `D${String(accHours / 24).padStart(2, '0')}`; // e.g. D01, D02, D07
  } else {
    accessCode = `H${String(accHours).padStart(2, '0')}`; // e.g. H01, H06, H12
  }

  // Claim deadline timestamp in epoch minutes
  const claimDeadlineMs = Date.now() + (claimHours * 3600 * 1000);
  const deadlineMin = Math.floor(claimDeadlineMs / 60000);
  const deadlineHex = deadlineMin.toString(16).toUpperCase();

  // Cryptographic signature
  const salt = `${LICENSE_SECRET}:UNIV`;
  const hmac = crypto.createHmac('sha256', salt).update(`${accessCode}:${deadlineHex}`).digest('hex').toUpperCase();
  const chk = hmac.substring(0, 4);

  const fullKey = `UNIV-${accessCode}-${deadlineHex}-${chk}`;

  const accessLabel = accHours >= 24 ? `${Math.round(accHours / 24)} ថ្ងៃ` : `${accHours} ម៉ោង`;
  const claimLabel = claimHours >= 24 ? `${Math.round(claimHours / 24)} ថ្ងៃ` : `${claimHours} ម៉ោង`;
  const fullLabel = label || `សាកល្បងគ្រប់ម៉ាស៊ីន (${accessLabel}) • ផុតកំណត់ចែកក្នុង ${claimLabel}`;

  const record = {
    deviceId: 'ALL_MACHINES (គ្រប់ម៉ាស៊ីន)',
    key: fullKey,
    isUniversal: true,
    accessHours: accHours,
    claimWindowHours: claimHours,
    claimDeadline: new Date(claimDeadlineMs).toISOString(),
    label: fullLabel,
    createdAt: new Date().toISOString()
  };

  saveGeneratedKeyRecord(record);

  return {
    success: true,
    key: fullKey,
    accessHours: accHours,
    claimWindowHours: claimHours,
    claimDeadline: new Date(claimDeadlineMs).toISOString(),
    label: fullLabel
  };
}

/**
 * Validates a License Key against a Device ID.
 * Supports:
 * 1. Master Keys
 * 2. Single Machine Lifetime (LIFE-XXXX-XXXX-XXXX)
 * 3. Single Machine Days (D030-XXXX-XXXX-XXXX)
 * 4. Single Machine Hours (H001-XXXX-XXXX-XXXX)
 * 5. Universal Trial Keys for ALL machines (UNIV-D01-XXXXXX-XXXX)
 */
function verifyLicenseKey(inputKey, deviceId = null) {
  if (!inputKey || typeof inputKey !== 'string') {
    return { valid: false, reason: 'សូមបញ្ចូល License Key' };
  }

  const cleanKey = inputKey.trim().toUpperCase().replace(/\s+/g, '');
  const targetDeviceId = (deviceId || getDeviceId()).trim().toUpperCase();

  // 1. Check Master Keys
  for (const mk of MASTER_KEYS) {
    if (cleanKey === mk.toUpperCase()) {
      return {
        valid: true,
        type: 'master',
        label: 'Master VIP License (Admin)',
        expires_at: null,
        is_lifetime: true
      };
    }
  }

  // 2. Check Universal Trial Key (UNIV-<AccessCode>-<DeadlineHex>-<Chk>)
  if (cleanKey.startsWith('UNIV-')) {
    const uParts = cleanKey.split('-');
    if (uParts.length === 4) {
      const [, accessCode, deadlineHex, chk] = uParts;
      const salt = `${LICENSE_SECRET}:UNIV`;
      const hmac = crypto.createHmac('sha256', salt).update(`${accessCode}:${deadlineHex}`).digest('hex').toUpperCase();

      if (hmac.substring(0, 4) !== chk) {
        return { valid: false, reason: 'License Key សាកល្បងនេះមិនត្រឹមត្រូវឡើយ' };
      }

      const deadlineMin = parseInt(deadlineHex, 16);
      if (isNaN(deadlineMin)) {
        return { valid: false, reason: 'License Key សាកល្បងនេះមិនត្រឹមត្រូវឡើយ' };
      }

      const deadlineMs = deadlineMin * 60000;
      const now = Date.now();

      // Check if claim window has expired ("ក្នុងរយៈពេល ២៤ ម៉ោង ឬ ១ ម៉ោង ដែលខ្ញុំឲ្យហ្នឹងគឺវា expire មិនអាចចូលបានទៀតទេ")
      if (now > deadlineMs) {
        return {
          valid: false,
          expiredClaim: true,
          reason: '🚨 Key សាកល្បងនេះបានផុតកំណត់នៃការយកទៅបើកសោរហើយ (Claim Window Expired)! មិនអាចយកទៅ Activate បានទៀតឡើយ។'
        };
      }

      let accessHours = 24;
      if (accessCode.startsWith('D')) {
        accessHours = parseInt(accessCode.substring(1), 10) * 24;
      } else if (accessCode.startsWith('H')) {
        accessHours = parseInt(accessCode.substring(1), 10);
      }
      if (isNaN(accessHours) || accessHours <= 0) accessHours = 24;

      const expiresAt = new Date(now + accessHours * 3600 * 1000).toISOString();
      const durLabel = accessHours >= 24 ? `${Math.round(accessHours / 24)} ថ្ងៃ` : `${accessHours} ម៉ោង`;

      return {
        valid: true,
        type: 'universal_trial',
        label: `✨ សាកល្បង VIP (${durLabel})`,
        expires_at: expiresAt,
        is_lifetime: false,
        access_hours: accessHours,
        claim_deadline: new Date(deadlineMs).toISOString()
      };
    }
  }

  // 3. Check Prefix-based Dynamic Single-Machine Keys (LIFE-XXXX-XXXX-XXXX, D030-XXXX-XXXX-XXXX, H006-XXXX-XXXX-XXXX)
  const parts = cleanKey.split('-');
  if (parts.length === 4) {
    const prefix = parts[0];
    const salt = `${LICENSE_SECRET}:${prefix}`;
    const hmac = crypto.createHmac('sha256', salt).update(targetDeviceId).digest('hex').toUpperCase();
    const expectedSuffix = `${hmac.substring(0, 4)}-${hmac.substring(4, 8)}-${hmac.substring(8, 12)}`;
    const actualSuffix = `${parts[1]}-${parts[2]}-${parts[3]}`;

    if (actualSuffix === expectedSuffix) {
      if (prefix === 'LIFE') {
        return {
          valid: true,
          type: 'lifetime',
          label: 'Lifetime VIP (ពេញមួយជីវិត)',
          expires_at: null,
          is_lifetime: true
        };
      } else if (prefix.startsWith('D')) {
        const days = parseInt(prefix.substring(1), 10);
        if (!isNaN(days) && days > 0) {
          const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
          return {
            valid: true,
            type: `${days}_days`,
            label: `អាជ្ញាប័ណ្ណ ${days} ថ្ងៃ`,
            expires_at: expiresAt,
            is_lifetime: false
          };
        }
      } else if (prefix.startsWith('H')) {
        const hours = parseInt(prefix.substring(1), 10);
        if (!isNaN(hours) && hours > 0) {
          const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
          return {
            valid: true,
            type: `${hours}_hours`,
            label: `អាជ្ញាប័ណ្ណ ${hours} ម៉ោង`,
            expires_at: expiresAt,
            is_lifetime: false
          };
        }
      }
    }
  }

  // 4. Fallback: Legacy Lifetime key (16 hex chars without LIFE- prefix)
  const legacyLifetimeHmac = crypto.createHmac('sha256', LICENSE_SECRET).update(targetDeviceId).digest('hex').toUpperCase();
  const legacyKey = `${legacyLifetimeHmac.substring(0, 4)}-${legacyLifetimeHmac.substring(4, 8)}-${legacyLifetimeHmac.substring(8, 12)}-${legacyLifetimeHmac.substring(12, 16)}`;
  if (cleanKey === legacyKey) {
    return {
      valid: true,
      type: 'lifetime',
      label: 'Lifetime VIP (ពេញមួយជីវិត)',
      expires_at: null,
      is_lifetime: true
    };
  }

  return { valid: false, reason: 'License Key មិនត្រឹមត្រូវ ឬមិនត្រូវនឹងម៉ាស៊ីននេះឡើយ' };
}

/**
 * Saves a record of generated key in data/generated_keys.json
 */
function saveGeneratedKeyRecord(record) {
  try {
    let list = [];
    if (fs.existsSync(GENERATED_KEYS_FILE)) {
      list = JSON.parse(fs.readFileSync(GENERATED_KEYS_FILE, 'utf-8'));
    }
    // Prepend to top
    list.unshift(record);
    // Keep last 100
    if (list.length > 100) list = list.slice(0, 100);
    fs.writeFileSync(GENERATED_KEYS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (e) {
    // Ignore error
  }
}

/**
 * Retrieves the history of generated keys.
 */
function getGeneratedKeysList() {
  if (!fs.existsSync(GENERATED_KEYS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(GENERATED_KEYS_FILE, 'utf-8')) || [];
  } catch (e) {
    return [];
  }
}

/**
 * System Persistent Vault Locations.
 * Survives deleting the application directory, app updates, and reinstalls.
 */
function getSystemVaultPaths() {
  const list = [];
  
  // 1. All Users / Machine-level ProgramData (e.g. C:\ProgramData\HongguoDownloader\license_vault.json)
  const programData = process.env.PROGRAMDATA || 'C:\\ProgramData';
  try {
    list.push(path.join(programData, 'HongguoDownloader', 'license_vault.json'));
  } catch (e) {}

  // 2. User AppData Roaming (e.g. C:\Users\<Name>\AppData\Roaming\HongguoDownloader\license_vault.json)
  const appData = process.env.APPDATA || (os.homedir ? path.join(os.homedir(), 'AppData', 'Roaming') : null);
  if (appData) {
    try {
      list.push(path.join(appData, 'HongguoDownloader', 'license_vault.json'));
    } catch (e) {}
  }

  // 3. User LocalAppData (e.g. C:\Users\<Name>\AppData\Local\HongguoDownloader\license_vault.json)
  const localAppData = process.env.LOCALAPPDATA || (os.homedir ? path.join(os.homedir(), 'AppData', 'Local') : null);
  if (localAppData) {
    try {
      list.push(path.join(localAppData, 'HongguoDownloader', 'license_vault.json'));
    } catch (e) {}
  }

  return list;
}

function getSystemAuthVaultPaths() {
  const list = [];
  const programData = process.env.PROGRAMDATA || 'C:\\ProgramData';
  try {
    list.push(path.join(programData, 'HongguoDownloader', 'authorized_devices.json'));
  } catch (e) {}
  const appData = process.env.APPDATA || (os.homedir ? path.join(os.homedir(), 'AppData', 'Roaming') : null);
  if (appData) {
    try {
      list.push(path.join(appData, 'HongguoDownloader', 'authorized_devices.json'));
    } catch (e) {}
  }
  return list;
}

/**
 * Saves license record to local file AND all persistent system vaults.
 */
function saveLicenseToVaults(record) {
  if (!record) return;
  const jsonStr = JSON.stringify(record, null, 2);

  // 1. Local copy in data/license.json
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LICENSE_FILE, jsonStr, 'utf-8');
  } catch (e) {
    console.warn('[License] Failed to write local license:', e.message);
  }

  // 2. System vaults (ProgramData, AppData, LocalAppData)
  for (const vaultPath of getSystemVaultPaths()) {
    try {
      const vDir = path.dirname(vaultPath);
      if (!fs.existsSync(vDir)) fs.mkdirSync(vDir, { recursive: true });
      fs.writeFileSync(vaultPath, jsonStr, 'utf-8');
    } catch (e) {
      // ignore individual vault write errors (e.g. permissions)
    }
  }
}

/**
 * Recovers license record from persistent system vaults if local copy is missing.
 */
function recoverLicenseFromVaults(targetDeviceId) {
  const cleanId = String(targetDeviceId || getDeviceId()).trim().toUpperCase();

  for (const vaultPath of getSystemVaultPaths()) {
    try {
      if (fs.existsSync(vaultPath)) {
        const raw = fs.readFileSync(vaultPath, 'utf-8');
        const data = JSON.parse(raw);
        if (data && data.key && (data.device_id === cleanId || data.type === 'master')) {
          // Verify key is still valid for this hardware
          const ver = verifyLicenseKey(data.key, cleanId);
          if (ver.valid) {
            // Restore local copy
            try {
              if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
              fs.writeFileSync(LICENSE_FILE, JSON.stringify(data, null, 2), 'utf-8');
            } catch (e) {}
            return data;
          }
        }
      }
    } catch (e) {}
  }
  return null;
}

/**
 * Gets the current activation status from local storage or persistent vaults.
 * Automatically computes real-time remaining days and handles date-based expiration.
 */
function getLicenseStatus() {
  const currentDevice = getDeviceId();
  let data = null;

  // 1. Try reading local LICENSE_FILE
  if (fs.existsSync(LICENSE_FILE)) {
    try {
      const raw = fs.readFileSync(LICENSE_FILE, 'utf-8');
      data = JSON.parse(raw);
    } catch (e) {
      data = null;
    }
  }

  // 2. If missing, corrupted or device mismatch, attempt recovery from persistent vaults!
  if (!data || !data.key || (data.type !== 'master' && data.device_id !== currentDevice)) {
    const recovered = recoverLicenseFromVaults(currentDevice);
    if (recovered) {
      data = recovered;
    }
  }

  // 3. Still no license found?
  if (!data || !data.key) {
    return {
      activated: false,
      device_id: currentDevice,
      app_version: APP_VERSION,
      message: 'កម្មវិធីមិនទាន់បាន Activate ឡើយ'
    };
  }

  // 4. Verify key matches device and current machine
  if (data.type !== 'master' && data.device_id !== currentDevice) {
    return {
      activated: false,
      device_id: currentDevice,
      app_version: APP_VERSION,
      message: 'License Key នេះត្រូវបានប្រើលើកុំព្យូទ័រផ្សេង'
    };
  }

  const verification = verifyLicenseKey(data.key, currentDevice);
  if (!verification.valid) {
    return {
      activated: false,
      device_id: currentDevice,
      app_version: APP_VERSION,
      message: 'License មិនត្រឹមត្រូវ'
    };
  }

  // 5. Expiration & Remaining Days and Hours Calculation
  let remainingDays = null;
  let remainingHours = null;
  let remainingMinutes = null;
  let isExpired = false;

  if (data.expires_at) {
    const expTime = new Date(data.expires_at).getTime();
    const now = Date.now();
    const diffMs = expTime - now;

    if (diffMs <= 0) {
      isExpired = true;
      remainingDays = 0;
      remainingHours = 0;
      remainingMinutes = 0;
    } else {
      remainingDays = Math.floor(diffMs / 86400000);
      remainingHours = Math.floor((diffMs % 86400000) / 3600000);
      remainingMinutes = Math.floor((diffMs % 3600000) / 60000);
    }
  }

  // Check custom customer name and revocation if set by Admin
  const authMap = getAuthorizedDevicesMap();
  const authRecord = authMap[currentDevice];

  // If Admin expired, revoked or transferred this license, apply expired state cleanly
  if (authRecord && (authRecord.revoked || authRecord.status === 'revoked' || authRecord.status === 'expired')) {
    deactivateLicense();
    return {
      activated: false,
      expired: true,
      device_id: currentDevice,
      license_key: data.key,
      label: data.label || verification.label,
      expires_at: authRecord.expiresAt || data.expires_at,
      remaining_days: 0,
      remaining_hours: 0,
      remaining_minutes: 0,
      custom_name: customName,
      app_version: APP_VERSION,
      message: 'License របស់អ្នកបានផុតកំណត់ហើយ'
    };
  }

  // If Admin dynamically adjusted expiresAt in authRecord, apply it
  if (authRecord && authRecord.expiresAt && data.type !== 'master') {
    data.expires_at = authRecord.expiresAt;
    const expTime = new Date(data.expires_at).getTime();
    const diffMs = expTime - Date.now();
    if (diffMs <= 0) {
      isExpired = true;
      remainingDays = 0;
      remainingHours = 0;
      remainingMinutes = 0;
    } else {
      isExpired = false;
      remainingDays = Math.floor(diffMs / 86400000);
      remainingHours = Math.floor((diffMs % 86400000) / 3600000);
      remainingMinutes = Math.floor((diffMs % 3600000) / 60000);
    }
  }

  let customName = (authRecord && authRecord.customName) || data.custom_name || '';
  if (!customName) {
    const trackedList = getTrackedDevices();
    const item = trackedList.find(d => d.deviceId === currentDevice);
    if (item && item.customName) customName = item.customName;
  }
  if (customName && data.custom_name !== customName) {
    data.custom_name = customName;
  }

  if (isExpired) {
    return {
      activated: false,
      expired: true,
      device_id: currentDevice,
      license_key: data.key,
      label: data.label || verification.label,
      expires_at: data.expires_at,
      remaining_days: 0,
      remaining_hours: 0,
      remaining_minutes: 0,
      custom_name: customName,
      app_version: APP_VERSION,
      message: 'License របស់អ្នកបានផុតកំណត់ហើយ'
    };
  }

  // Ensure system vaults are kept synced with this valid license
  saveLicenseToVaults(data);

  return {
    activated: true,
    expired: false,
    device_id: currentDevice,
    license_key: data.key,
    type: data.type || verification.type,
    label: data.label || verification.label,
    activated_at: data.activated_at,
    expires_at: data.expires_at || null,
    remaining_days: remainingDays,
    remaining_hours: remainingHours,
    remaining_minutes: remainingMinutes,
    is_lifetime: verification.is_lifetime,
    custom_name: customName,
    app_version: APP_VERSION
  };
}

const FAILED_ATTEMPTS_FILE = path.join(DATA_DIR, 'failed_attempts.json');

/**
 * Resolves current machine's public IP and physical Geolocation (City, Country, ISP, Lat/Lon).
 * Used for security alerts when suspicious crack attempts occur.
 */
async function resolveGeoLocation() {
  const fallback = {
    ip: 'Unknown',
    country: 'Unknown',
    city: 'Unknown',
    regionName: '',
    isp: 'Unknown',
    mapsUrl: ''
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch('http://ip-api.com/json/?fields=status,message,country,regionName,city,lat,lon,isp,query', {
      signal: controller.signal,
      headers: { 'User-Agent': 'HongguoSecurity/3.1' }
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'success') {
        const mapsUrl = (data.lat && data.lon) ? `https://maps.google.com/?q=${data.lat},${data.lon}` : '';
        return {
          ip: data.query || 'Unknown',
          country: data.country || 'Unknown',
          city: data.city || 'Unknown',
          regionName: data.regionName || '',
          isp: data.isp || 'Unknown',
          lat: data.lat,
          lon: data.lon,
          mapsUrl
        };
      }
    }
  } catch (e) {
    try {
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 3500);
      const res2 = await fetch('https://ipapi.co/json/', { signal: controller2.signal });
      clearTimeout(timeoutId2);
      if (res2.ok) {
        const d = await res2.json();
        const mapsUrl = (d.latitude && d.longitude) ? `https://maps.google.com/?q=${d.latitude},${d.longitude}` : '';
        return {
          ip: d.ip || 'Unknown',
          country: d.country_name || 'Unknown',
          city: d.city || 'Unknown',
          regionName: d.region || '',
          isp: d.org || 'Unknown',
          lat: d.latitude,
          lon: d.longitude,
          mapsUrl
        };
      }
    } catch (e2) {}
  }

  return fallback;
}

function getFailedAttemptsMap() {
  if (!fs.existsSync(FAILED_ATTEMPTS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(FAILED_ATTEMPTS_FILE, 'utf-8')) || {};
  } catch (e) { return {}; }
}

function saveFailedAttemptsMap(map) {
  try {
    fs.writeFileSync(FAILED_ATTEMPTS_FILE, JSON.stringify(map, null, 2), 'utf-8');
  } catch (e) {}
}

/**
 * Tracks failed license attempts. When count reaches 4 to 5, flags as crack suspect
 * and dispatches immediate Telegram alert with geolocation.
 */
async function recordFailedAttempt({ deviceId, attemptedKey, telegramUser = '', computerName = '' }) {
  const cleanId = String(deviceId || getDeviceId()).trim().toUpperCase();
  const host = computerName || os.hostname() || 'Unknown-PC';
  const user = (os.userInfo && os.userInfo().username) || '';
  const now = new Date().toISOString();

  const failMap = getFailedAttemptsMap();
  if (!failMap[cleanId]) {
    failMap[cleanId] = {
      deviceId: cleanId,
      failedCount: 0,
      attempts: [],
      telegramUser: telegramUser || '',
      computerName: host,
      firstFailedAt: now,
      lastFailedAt: now,
      lockedUntil: null
    };
  }

  const record = failMap[cleanId];
  record.failedCount = (record.failedCount || 0) + 1;
  record.lastFailedAt = now;
  if (telegramUser) record.telegramUser = telegramUser;
  record.computerName = host;

  if (attemptedKey && !record.attempts.includes(attemptedKey)) {
    record.attempts.push(attemptedKey);
    if (record.attempts.length > 20) record.attempts = record.attempts.slice(-20);
  }

  const failedCount = record.failedCount;
  let isLocked = false;
  let crackAlertSent = false;

  // Temporary lock on 5th attempt for 10 minutes
  if (failedCount >= 5) {
    record.lockedUntil = Date.now() + 10 * 60 * 1000;
    isLocked = true;
  }

  // Resolve Geolocation when suspicious (>= 4 attempts)
  let geoInfo = null;
  if (failedCount >= 4) {
    geoInfo = await resolveGeoLocation();
    record.location = geoInfo;
  }

  saveFailedAttemptsMap(failMap);

  // Update in devices_tracker.json
  try {
    if (fs.existsSync(DEVICES_TRACKER_FILE)) {
      const list = JSON.parse(fs.readFileSync(DEVICES_TRACKER_FILE, 'utf-8')) || [];
      const item = list.find(d => d.deviceId === cleanId);
      if (item) {
        item.failedAttempts = failedCount;
        item.lastFailedKey = attemptedKey;
        if (telegramUser) item.telegramUser = telegramUser;
        if (geoInfo) item.location = geoInfo;
        if (failedCount >= 4) {
          item.crackSuspect = true;
          item.status = `🚨 សង្ស័យ Hack/Crack (${failedCount} ដង)`;
        }
        fs.writeFileSync(DEVICES_TRACKER_FILE, JSON.stringify(list, null, 2), 'utf-8');
      }
    }
  } catch (e) {}

  // Trigger Immediate Telegram Alert when failedCount reaches 4 or 5+
  if (failedCount >= 4) {
    crackAlertSent = true;
    const locText = geoInfo ? (
      `📍 <b>ទីតាំង/ទីក្រុង:</b> ${geoInfo.city}, ${geoInfo.regionName ? geoInfo.regionName + ', ' : ''}${geoInfo.country}\n` +
      `🌐 <b>IP Address:</b> <code>${geoInfo.ip}</code>\n` +
      `🏢 <b>ISP (Network):</b> ${geoInfo.isp}\n` +
      (geoInfo.mapsUrl ? `🗺️ <b>Google Maps:</b> <a href="${geoInfo.mapsUrl}">ចុចមើលទីតាំងលើផែនទី Google Maps</a>\n` : '')
    ) : '📍 <b>ទីតាំង:</b> មិនអាចទាញយកបាន\n';

    const alertMsg =
      `🚨🚨🚨 <b>សញ្ញាអាសន្ន៖ មានអ្នកព្យាយាម HACK / CRACK កម្មវិធី!</b> 🚨🚨🚨\n\n` +
      `👤 <b>Telegram ជនសង្ស័យ:</b> ${record.telegramUser ? `<b>${record.telegramUser}</b>` : '<i>(មិនបានបំពេញ)</i>'}\n` +
      `💻 <b>Device ID:</b> <code>${cleanId}</code>\n` +
      `🖥️ <b>កុំព្យូទ័រ:</b> ${host} (${user})\n` +
      `❌ <b>ចំនួនដងដែលវាយកូដខុស:</b> <b>${failedCount} ដង</b> (កម្រិតសង្ស័យ Crack)\n` +
      `🔑 <b>កូដដែលគេបានសាកល្បង:</b> <code>${attemptedKey || 'N/A'}</code>\n\n` +
      `🌍 <b>ព័ត៌មានទីតាំងជនសង្ស័យ (Location Details):</b>\n${locText}\n` +
      `🕒 <b>ម៉ោងកើតហេតុ:</b> ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' })}\n` +
      `🛡️ <b>ចំណាត់ការ:</b> កម្មវិធីបានចាក់សោរ និងកត់ត្រាទុកក្នុងបញ្ជី Anti-Crack រួចរាល់!`;

    sendTelegramAlert(alertMsg).catch(() => {});
  }

  return {
    failedCount,
    isLocked,
    crackAlertSent,
    location: geoInfo
  };
}

function resetDeviceFails(deviceId) {
  const cleanId = String(deviceId || '').trim().toUpperCase();
  const failMap = getFailedAttemptsMap();
  if (failMap[cleanId]) {
    delete failMap[cleanId];
    saveFailedAttemptsMap(failMap);
  }
  // Reset in tracker
  try {
    if (fs.existsSync(DEVICES_TRACKER_FILE)) {
      const list = JSON.parse(fs.readFileSync(DEVICES_TRACKER_FILE, 'utf-8')) || [];
      const item = list.find(d => d.deviceId === cleanId);
      if (item) {
        item.failedAttempts = 0;
        item.crackSuspect = false;
        if (item.status && item.status.includes('Hack/Crack')) {
          item.status = 'unactivated';
        }
        fs.writeFileSync(DEVICES_TRACKER_FILE, JSON.stringify(list, null, 2), 'utf-8');
      }
    }
  } catch (e) {}
  return { success: true };
}

/**
 * Returns list of crack suspects and failed attempts with full geolocation & Google Maps info.
 */
function getCrackSuspectsList() {
  const failMap = getFailedAttemptsMap();
  const tracked = getTrackedDevices();
  const result = [];

  for (const cleanId of Object.keys(failMap)) {
    const item = failMap[cleanId];
    const tr = tracked.find(d => d.deviceId === cleanId);
    const loc = item.location || (tr && tr.location) || null;
    const isLocked = Boolean(item.lockedUntil && Date.now() < item.lockedUntil);

    result.push({
      deviceId: cleanId,
      telegramUser: item.telegramUser || (tr && tr.telegramUser) || '',
      computerName: item.computerName || (tr && tr.computerName) || '',
      failedCount: item.failedCount || 1,
      attempts: item.attempts || [],
      lastFailedKey: (item.attempts && item.attempts[item.attempts.length - 1]) || (tr && tr.lastFailedKey) || '',
      firstFailedAt: item.firstFailedAt || '',
      lastFailedAt: item.lastFailedAt || (tr && tr.lastSeen) || '',
      isLocked: isLocked,
      location: loc,
      mapsUrl: loc ? loc.mapsUrl : '',
      ip: loc ? loc.ip : '',
      isp: loc ? loc.isp : '',
      city: loc ? loc.city : '',
      country: loc ? loc.country : ''
    });
  }

  // Also include any devices from tracker marked with crackSuspect
  for (const tr of tracked) {
    if ((tr.crackSuspect || (tr.failedAttempts && tr.failedAttempts >= 3)) && !result.some(r => r.deviceId === tr.deviceId)) {
      result.push({
        deviceId: tr.deviceId,
        telegramUser: tr.telegramUser || '',
        computerName: tr.computerName || '',
        failedCount: tr.failedAttempts || 1,
        attempts: tr.lastFailedKey ? [tr.lastFailedKey] : [],
        lastFailedKey: tr.lastFailedKey || '',
        firstFailedAt: tr.firstSeen || '',
        lastFailedAt: tr.lastSeen || '',
        isLocked: false,
        location: tr.location || null,
        mapsUrl: tr.location ? tr.location.mapsUrl : '',
        ip: tr.location ? tr.location.ip : '',
        isp: tr.location ? tr.location.isp : '',
        city: tr.location ? tr.location.city : '',
        country: tr.location ? tr.location.country : ''
      });
    }
  }

  result.sort((a, b) => (b.failedCount || 0) - (a.failedCount || 0));
  return result;
}

/**
 * Clears failed attempts / crack suspect history.
 */
function clearFailedAttemptsHistory() {
  try {
    saveFailedAttemptsMap({});
    if (fs.existsSync(DEVICES_TRACKER_FILE)) {
      const list = JSON.parse(fs.readFileSync(DEVICES_TRACKER_FILE, 'utf-8')) || [];
      for (const item of list) {
        item.crackSuspect = false;
        item.failedAttempts = 0;
      }
      fs.writeFileSync(DEVICES_TRACKER_FILE, JSON.stringify(list, null, 2), 'utf-8');
    }
    return { success: true, message: 'បានសំអាតប្រវត្តិ Crack រួចរាល់' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Clears payment requests / notifications.
 */
function clearPaymentRequests() {
  try {
    if (fs.existsSync(PAYMENTS_FILE)) {
      fs.writeFileSync(PAYMENTS_FILE, JSON.stringify([], null, 2), 'utf-8');
    }
    return { success: true, message: 'បានសំអាតបញ្ជីសារបង់ប្រាក់រួចរាល់' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Activates the application with the provided License Key.
 * Verifies key, tracks failed attempts, locks out brute-force attacks, and alerts Admin.
 */
async function activateLicense(inputKey, metadata = {}) {
  const currentDevice = (metadata && metadata.targetDeviceId) ? String(metadata.targetDeviceId).trim().toUpperCase() : getDeviceId();
  const cleanKey = String(inputKey || '').trim().toUpperCase();
  const tgUser = metadata.telegramUser || '';
  const compName = metadata.computerName || '';

  // Check if temporarily locked
  const failMap = getFailedAttemptsMap();
  const failRec = failMap[currentDevice];
  if (failRec && failRec.lockedUntil && Date.now() < failRec.lockedUntil) {
    const minsLeft = Math.ceil((failRec.lockedUntil - Date.now()) / 60000);
    return {
      success: false,
      isLocked: true,
      error: `🚨 អ្នកបានវាយលេខកូដខុសលើសកំណត់! ម៉ាស៊ីនត្រូវបានចាក់សោរបណ្ដោះអាសន្ន។ សូមរង់ចាំ ${minsLeft} នាទីទៀត ឬទាក់ទង Admin។`
    };
  }

  const result = verifyLicenseKey(cleanKey, currentDevice);

  if (!result.valid) {
    const failInfo = await recordFailedAttempt({
      deviceId: currentDevice,
      attemptedKey: cleanKey,
      telegramUser: tgUser,
      computerName: compName
    });

    let errorMsg = result.reason || 'License Key មិនត្រឹមត្រូវ';
    if (failInfo.failedCount >= 5) {
      errorMsg = `🚨 អ្នកបានព្យាយាមវាយលេខកូដខុស ${failInfo.failedCount} ដងហើយ! ឈ្មោះ Telegram និងទីតាំងរបស់អ្នកត្រូវបានផ្ញើជូន Admin ភ្លាមៗ។ កម្មវិធីត្រូវបានចាក់សោរ!`;
    } else if (failInfo.failedCount >= 4) {
      errorMsg = `⚠️ ប្រយ័ត្ន! អ្នកបានវាយខុស ${failInfo.failedCount} ដងហើយ។ បើខុស ១ ដងទៀត ប្រព័ន្ធនឹងចាក់សោរម៉ាស៊ីន និងរាយការណ៍ទីតាំងទៅ Admin!`;
    }

    return {
      success: false,
      error: errorMsg,
      failedCount: failInfo.failedCount,
      isLocked: failInfo.isLocked,
      crackAlertSent: failInfo.crackAlertSent
    };
  }

  // Key is valid! Reset failed attempts
  resetDeviceFails(currentDevice);

  // Check if this key was already activated previously in persistent vaults
  let existingExpiresAt = null;
  for (const vaultPath of getSystemVaultPaths()) {
    try {
      if (fs.existsSync(vaultPath)) {
        const raw = fs.readFileSync(vaultPath, 'utf-8');
        const past = JSON.parse(raw);
        if (past && past.key === cleanKey && past.expires_at) {
          existingExpiresAt = past.expires_at;
          break;
        }
      }
    } catch (e) {}
  }

  if (existingExpiresAt) {
    const pastExp = new Date(existingExpiresAt).getTime();
    if (pastExp <= Date.now()) {
      return {
        success: false,
        error: '🚨 License Key នេះត្រូវបានប្រើប្រាស់ និងផុតកំណត់ហើយ! សូមទិញ Key ថ្មី ឬទាក់ទង Admin។'
      };
    }
  }

  const finalExpiresAt = (metadata && metadata.customExpiresAt) || existingExpiresAt || result.expires_at;

  let custName = (metadata && metadata.customName) || '';
  if (!custName) {
    const authMap = getAuthorizedDevicesMap();
    if (authMap[currentDevice] && authMap[currentDevice].customName) {
      custName = authMap[currentDevice].customName;
    }
  }
  if (!custName) {
    const trackedList = getTrackedDevices();
    const item = trackedList.find(d => d.deviceId === currentDevice);
    if (item && item.customName) custName = item.customName;
  }

  const record = {
    key: cleanKey,
    device_id: currentDevice,
    type: result.type,
    label: result.label,
    custom_name: custName,
    activated_at: new Date().toISOString(),
    expires_at: finalExpiresAt,
    app_version: APP_VERSION
  };

  try {
    saveLicenseToVaults(record);

    // Automatically ensure this device and key are stored in authorized_devices & devices_tracker
    try {
      let authMap = {};
      if (fs.existsSync(AUTHORIZED_DEVICES_FILE)) {
        authMap = JSON.parse(fs.readFileSync(AUTHORIZED_DEVICES_FILE, 'utf-8')) || {};
      }
      authMap[currentDevice] = {
        deviceId: currentDevice,
        key: cleanKey,
        days: result.days || 30,
        label: result.label || 'Active',
        customName: custName || tgUser || '',
        telegramUser: tgUser || (authMap[currentDevice] && authMap[currentDevice].telegramUser) || '',
        authorizedAt: new Date().toISOString(),
        expiresAt: finalExpiresAt,
        status: 'active'
      };
      fs.writeFileSync(AUTHORIZED_DEVICES_FILE, JSON.stringify(authMap, null, 2), 'utf-8');
    } catch (e) {}

    try {
      let tList = [];
      if (fs.existsSync(DEVICES_TRACKER_FILE)) {
        tList = JSON.parse(fs.readFileSync(DEVICES_TRACKER_FILE, 'utf-8')) || [];
      }
      const tIdx = tList.findIndex(d => d.deviceId === currentDevice);
      const nowIso = new Date().toISOString();
      if (tIdx >= 0) {
        tList[tIdx].status = result.label || 'Active';
        tList[tIdx].key = cleanKey;
        if (custName) tList[tIdx].customName = custName;
        else if (tgUser && !tList[tIdx].customName) tList[tIdx].customName = tgUser;
        if (tgUser) tList[tIdx].telegramUser = tgUser;
        tList[tIdx].lastSeen = nowIso;
      } else {
        tList.unshift({
          deviceId: currentDevice,
          telegramUser: tgUser || '',
          customName: custName || tgUser || '',
          computerName: compName || os.hostname() || 'Client PC',
          osUser: (os.userInfo && os.userInfo().username) || '',
          firstSeen: nowIso,
          lastSeen: nowIso,
          openCount: 1,
          status: result.label || 'Active',
          key: cleanKey
        });
      }
      fs.writeFileSync(DEVICES_TRACKER_FILE, JSON.stringify(tList, null, 2), 'utf-8');
    } catch (e) {}

    return {
      success: true,
      message: 'បានបើកដំណើរការកម្មវិធីជោគជ័យ!',
      license: record
    };
  } catch (err) {
    return { success: false, error: 'មិនអាចរក្សាទុក License បានឡើយ: ' + err.message };
  }
}

/**
 * Deactivates or removes the current license from local file and persistent vaults.
 */
function deactivateLicense() {
  if (fs.existsSync(LICENSE_FILE)) {
    try {
      fs.unlinkSync(LICENSE_FILE);
    } catch (e) {}
  }
  for (const vaultPath of getSystemVaultPaths()) {
    try {
      if (fs.existsSync(vaultPath)) fs.unlinkSync(vaultPath);
    } catch (e) {}
  }
  return { success: true, message: 'បានដក License ចេញរួចរាល់' };
}

const AUTHORIZED_DEVICES_FILE = path.join(DATA_DIR, 'authorized_devices.json');
const DEVICES_TRACKER_FILE = path.join(DATA_DIR, 'devices_tracker.json');
const TELEGRAM_CONFIG_FILE = path.join(DATA_DIR, 'telegram_config.json');

/**
 * Records or updates a client device whenever the app is launched.
 * Tracks Telegram username, Device ID, Computer Name, launch count, and first/last seen.
 */
async function recordDeviceTracking({ deviceId, telegramUser = '', computerName = '', customName = '', key = '', status = '', expiresAt = null, remainingDays = null }) {
  const cleanId = String(deviceId || getDeviceId()).trim().toUpperCase();
  const cleanTg = String(telegramUser || '').trim();
  const cleanName = String(customName || '').trim();
  const cleanKey = String(key || '').trim().toUpperCase();
  const host = computerName || os.hostname() || 'Unknown-PC';
  const user = (os.userInfo && os.userInfo().username) || '';

  let list = [];
  if (fs.existsSync(DEVICES_TRACKER_FILE)) {
    try {
      list = JSON.parse(fs.readFileSync(DEVICES_TRACKER_FILE, 'utf-8')) || [];
    } catch (e) { list = []; }
  }

  const existingIdx = list.findIndex(d => d.deviceId === cleanId);
  const now = new Date().toISOString();
  let isNewDevice = false;

  if (existingIdx >= 0) {
    list[existingIdx].lastSeen = now;
    list[existingIdx].openCount = (list[existingIdx].openCount || 1) + 1;
    if (cleanTg) list[existingIdx].telegramUser = cleanTg;
    if (cleanName) list[existingIdx].customName = cleanName;
    else if (cleanTg && !list[existingIdx].customName) list[existingIdx].customName = cleanTg;
    if (cleanKey) list[existingIdx].key = cleanKey;
    if (status) list[existingIdx].status = status;
    list[existingIdx].computerName = host;
    list[existingIdx].osUser = user;
  } else {
    isNewDevice = true;
    list.unshift({
      deviceId: cleanId,
      telegramUser: cleanTg,
      customName: cleanName || cleanTg || '',
      computerName: host,
      osUser: user,
      firstSeen: now,
      lastSeen: now,
      openCount: 1,
      status: status || 'unactivated',
      key: cleanKey || ''
    });
  }

  // Cap at 300 devices
  if (list.length > 300) list = list.slice(0, 300);

  try {
    fs.writeFileSync(DEVICES_TRACKER_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (e) {}

  // If a valid key is reported, ensure authorized_devices map also has it
  if (cleanKey) {
    try {
      let authMap = {};
      if (fs.existsSync(AUTHORIZED_DEVICES_FILE)) {
        authMap = JSON.parse(fs.readFileSync(AUTHORIZED_DEVICES_FILE, 'utf-8')) || {};
      }
      if (!authMap[cleanId] || !authMap[cleanId].key) {
        authMap[cleanId] = {
          deviceId: cleanId,
          key: cleanKey,
          days: remainingDays || 30,
          label: status || 'Active',
          customName: cleanName || cleanTg || '',
          telegramUser: cleanTg,
          authorizedAt: now,
          expiresAt: expiresAt,
          status: 'active'
        };
        fs.writeFileSync(AUTHORIZED_DEVICES_FILE, JSON.stringify(authMap, null, 2), 'utf-8');
      } else {
        if (cleanName && !authMap[cleanId].customName) authMap[cleanId].customName = cleanName;
        if (cleanTg && !authMap[cleanId].telegramUser) authMap[cleanId].telegramUser = cleanTg;
        fs.writeFileSync(AUTHORIZED_DEVICES_FILE, JSON.stringify(authMap, null, 2), 'utf-8');
      }
    } catch (e) {}
  }

  // Send Telegram Notification to Admin on new device or activation request
  if (isNewDevice || cleanTg) {
    const tgMsg = `🚨 <b>ម៉ាស៊ីនបានបើកកម្មវិធី (Device Tracker Alert)</b>\n\n` +
      `💻 <b>Device ID:</b> <code>${cleanId}</code>\n` +
      `👤 <b>Customer / Telegram:</b> <b>${cleanName || cleanTg || '<i>(មិនទាន់បញ្ចូល)</i>'}</b>\n` +
      `🖥️ <b>Computer:</b> ${host} (${user})\n` +
      `🕒 <b>Time:</b> ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' })}\n` +
      `🛡️ <b>Status:</b> ${isNewDevice ? 'ម៉ាស៊ីនថ្មី (New Device)' : 'ដំណើរការឡើងវិញ'}`;
    
    sendTelegramAlert(tgMsg).catch(() => {});
  }

  return { success: true, deviceId: cleanId, isNew: isNewDevice };
}

/**
 * Gets the list of tracked devices.
 */
function getTrackedDevices() {
  if (!fs.existsSync(DEVICES_TRACKER_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DEVICES_TRACKER_FILE, 'utf-8')) || [];
  } catch (e) {
    return [];
  }
}

/**
 * Authorizes a client device for Auto-Activation (when owner enters ID + days in Admin panel).
 * Supports days, hours, extending existing time, and custom names.
 */
function authorizeDevice({ deviceId, days = 0, hours = 0, telegramUser = '', customName = '', extend = false, customLabel = null }) {
  const cleanId = String(deviceId || '').trim().toUpperCase();
  const numDays = Math.max(0, parseInt(days || '0', 10));
  const numHours = Math.max(0, parseInt(hours || '0', 10));
  if (!cleanId) return { success: false, error: 'Missing deviceId' };

  let authMap = {};
  if (fs.existsSync(AUTHORIZED_DEVICES_FILE)) {
    try {
      authMap = JSON.parse(fs.readFileSync(AUTHORIZED_DEVICES_FILE, 'utf-8')) || {};
    } catch (e) { authMap = {}; }
  }

  // Calculate duration and expiry
  let durationMs = 0;
  let label = customLabel || 'Lifetime VIP (ពេញមួយជីវិត)';
  let keyDays = 0;

  if (numHours > 0) {
    durationMs = numHours * 3600000;
    label = `${numHours} ម៉ោង`;
    keyDays = Math.max(1, Math.ceil(numHours / 24));
  } else if (numDays > 0) {
    durationMs = numDays * 86400000;
    label = numDays >= 365 ? '1 ឆ្នាំ (365 ថ្ងៃ)' : `${numDays} ថ្ងៃ`;
    keyDays = numDays;
  }

  let expiresAt = null;
  if (durationMs > 0) {
    let baseTime = Date.now();
    if (extend && authMap[cleanId] && authMap[cleanId].expiresAt) {
      const existingExp = new Date(authMap[cleanId].expiresAt).getTime();
      if (existingExp > Date.now()) {
        baseTime = existingExp;
      }
    }
    expiresAt = new Date(baseTime + durationMs).toISOString();
  }

  // Generate valid key
  const key = generateLicenseKey(cleanId, keyDays);

  const existingRecord = authMap[cleanId] || {};
  authMap[cleanId] = {
    deviceId: cleanId,
    key: key,
    days: keyDays,
    hours: numHours,
    label: label,
    telegramUser: telegramUser || existingRecord.telegramUser || '',
    customName: customName || existingRecord.customName || telegramUser || '',
    authorizedAt: new Date().toISOString(),
    expiresAt: expiresAt,
    status: 'active'
  };

  try {
    fs.writeFileSync(AUTHORIZED_DEVICES_FILE, JSON.stringify(authMap, null, 2), 'utf-8');
  } catch (e) {}

  // Also sync authorization to persistent system vaults
  for (const p of getSystemAuthVaultPaths()) {
    try {
      const vDir = path.dirname(p);
      if (!fs.existsSync(vDir)) fs.mkdirSync(vDir, { recursive: true });
      fs.writeFileSync(p, JSON.stringify(authMap, null, 2), 'utf-8');
    } catch (e) {}
  }

  // If authorizing the current machine directly, activate immediately
  if (cleanId === getDeviceId()) {
    activateLicense(key, { customExpiresAt: authMap[cleanId].expiresAt, customName: authMap[cleanId].customName });
  }

  // Update status in devices tracker
  try {
    let list = [];
    if (fs.existsSync(DEVICES_TRACKER_FILE)) {
      list = JSON.parse(fs.readFileSync(DEVICES_TRACKER_FILE, 'utf-8')) || [];
    }
    const item = list.find(d => d.deviceId === cleanId);
    const resolvedName = customName || existingRecord.customName || telegramUser || (item && item.customName) || '';
    if (item) {
      item.status = label;
      item.key = key;
      if (telegramUser) item.telegramUser = telegramUser;
      if (resolvedName) item.customName = resolvedName;
      item.lastSeen = new Date().toISOString();
    } else {
      list.unshift({
        deviceId: cleanId,
        telegramUser: telegramUser || '',
        customName: resolvedName,
        computerName: 'Authorized PC',
        osUser: '',
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        openCount: 1,
        status: label,
        key: key
      });
    }
    fs.writeFileSync(DEVICES_TRACKER_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (e) {}

  return {
    success: true,
    deviceId: cleanId,
    key: key,
    days: keyDays,
    hours: numHours,
    label: label,
    expiresAt: expiresAt
  };
}

/**
 * Sets or updates a customer's custom friendly name/tag in devices_tracker and authorizations.
 */
function setDeviceCustomName(deviceId, customName) {
  const cleanId = String(deviceId || '').trim().toUpperCase();
  const cleanName = String(customName || '').trim();
  if (!cleanId) return { success: false, error: 'Missing deviceId' };

  let updated = false;
  if (fs.existsSync(DEVICES_TRACKER_FILE)) {
    try {
      const list = JSON.parse(fs.readFileSync(DEVICES_TRACKER_FILE, 'utf-8')) || [];
      const item = list.find(d => d.deviceId === cleanId);
      if (item) {
        item.customName = cleanName;
        fs.writeFileSync(DEVICES_TRACKER_FILE, JSON.stringify(list, null, 2), 'utf-8');
        updated = true;
      }
    } catch (e) {}
  }

  if (fs.existsSync(AUTHORIZED_DEVICES_FILE)) {
    try {
      const authMap = JSON.parse(fs.readFileSync(AUTHORIZED_DEVICES_FILE, 'utf-8')) || {};
      if (authMap[cleanId]) {
        authMap[cleanId].customName = cleanName;
        fs.writeFileSync(AUTHORIZED_DEVICES_FILE, JSON.stringify(authMap, null, 2), 'utf-8');
        updated = true;
      }
      for (const p of getSystemAuthVaultPaths()) {
        try {
          const vDir = path.dirname(p);
          if (!fs.existsSync(vDir)) fs.mkdirSync(vDir, { recursive: true });
          fs.writeFileSync(p, JSON.stringify(authMap, null, 2), 'utf-8');
        } catch (_) {}
      }
    } catch (e) {}
  }

  // Also update local license.json if it belongs to this device
  try {
    if (fs.existsSync(LICENSE_FILE)) {
      const lic = JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf-8'));
      if (lic && (lic.device_id === cleanId || cleanId === getDeviceId())) {
        lic.custom_name = cleanName;
        saveLicenseToVaults(lic);
      }
    }
  } catch (_) {}

  return { success: true, deviceId: cleanId, customName: cleanName };
}

/**
 * Gets enriched list of all tracked devices merged with authorization, online status,
 * granted days, remaining days/hours, and customer custom names.
 */
function getTrackedDevicesWithLicenseInfo() {
  const trackedList = getTrackedDevices();
  const authMap = getAuthorizedDevicesMap();
  const mapByDevice = new Map();

  // Add all tracked devices
  for (const t of trackedList) {
    if (!t.deviceId) continue;
    mapByDevice.set(t.deviceId, { ...t });
  }

  // Also include any authorized devices not yet in tracker
  for (const devId of Object.keys(authMap)) {
    const auth = authMap[devId];
    if (!mapByDevice.has(devId)) {
      mapByDevice.set(devId, {
        deviceId: devId,
        telegramUser: auth.telegramUser || '',
        customName: auth.customName || auth.telegramUser || '',
        computerName: 'Authorized PC',
        osUser: '',
        firstSeen: auth.authorizedAt || new Date().toISOString(),
        lastSeen: auth.authorizedAt || new Date().toISOString(),
        openCount: 1,
        status: auth.status || 'active',
        key: auth.key || ''
      });
    }
  }

  const now = Date.now();
  const result = [];

  for (const dev of mapByDevice.values()) {
    const devId = dev.deviceId;
    const auth = authMap[devId] || null;

    const customName = (auth && auth.customName) || dev.customName || (auth && auth.telegramUser) || dev.telegramUser || '';

    // Online status: active within the last 5 minutes (300,000 ms)
    let isOnline = false;
    let lastSeenAgo = '';
    if (dev.lastSeen) {
      const lastMs = new Date(dev.lastSeen).getTime();
      const diffMin = Math.floor((now - lastMs) / 60000);
      if (diffMin <= 5 && diffMin >= 0) {
        isOnline = true;
      }
      if (diffMin < 1) lastSeenAgo = 'អម្បាញ់មិញ (Just now)';
      else if (diffMin < 60) lastSeenAgo = `${diffMin} នាទីមុន`;
      else {
        const diffHours = Math.floor(diffMin / 60);
        if (diffHours < 24) lastSeenAgo = `${diffHours} ម៉ោងមុន`;
        else lastSeenAgo = `${Math.floor(diffHours / 24)} ថ្ងៃមុន`;
      }
    }

    let isAuthorized = Boolean(auth && (auth.key || auth.status === 'active' || auth.days !== undefined));
    let isExpired = Boolean(auth && auth.status === 'expired');
    let isRevoked = Boolean(auth && (auth.revoked || auth.status === 'revoked'));
    let isLifetime = Boolean(auth && (auth.days === 0 && (!auth.expiresAt || String(auth.label).includes('Lifetime'))));
    let daysGranted = auth ? (auth.days || 0) : 0;
    let expiresAt = auth ? auth.expiresAt : null;
    let remainingDays = 0;
    let remainingHours = 0;
    let remainingMinutes = 0;

    if (isRevoked || isExpired) {
      isExpired = true;
      remainingDays = 0;
      remainingHours = 0;
    } else if (isLifetime) {
      remainingDays = 9999;
    } else if (expiresAt) {
      const expMs = new Date(expiresAt).getTime();
      const diffMs = expMs - now;
      if (diffMs <= 0) {
        isExpired = true;
        remainingDays = 0;
        remainingHours = 0;
      } else {
        remainingDays = Math.floor(diffMs / 86400000);
        remainingHours = Math.floor((diffMs % 86400000) / 3600000);
        remainingMinutes = Math.floor((diffMs % 3600000) / 60000);
      }
    }

    result.push({
      deviceId: devId,
      customName: customName,
      telegramUser: dev.telegramUser || (auth && auth.telegramUser) || '',
      computerName: dev.computerName || '',
      osUser: dev.osUser || '',
      openCount: dev.openCount || 1,
      firstSeen: dev.firstSeen || null,
      lastSeen: dev.lastSeen || null,
      lastSeenAgo: lastSeenAgo,
      isOnline: isOnline,
      isAuthorized: isAuthorized,
      isRevoked: isRevoked,
      isLifetime: isLifetime,
      isExpired: isExpired,
      daysGranted: daysGranted,
      expiresAt: expiresAt,
      remainingDays: remainingDays,
      remainingHours: remainingHours,
      remainingMinutes: remainingMinutes,
      key: (auth && auth.key) || dev.key || '',
      label: (auth && auth.label) || dev.status || (isAuthorized ? 'Active' : 'Unactivated'),
      crackSuspect: Boolean(dev.crackSuspect || (dev.failedAttempts && dev.failedAttempts >= 4))
    });
  }

  // Sort: Online machines first, then active licenses first, then latest lastSeen first
  result.sort((a, b) => {
    if (a.isOnline && !b.isOnline) return -1;
    if (!a.isOnline && b.isOnline) return 1;
    const aHasKey = Boolean(a.isAuthorized && !a.isExpired);
    const bHasKey = Boolean(b.isAuthorized && !b.isExpired);
    if (aHasKey && !bHasKey) return -1;
    if (!aHasKey && bHasKey) return 1;
    const timeA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
    const timeB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
    return timeB - timeA;
  });

  return result;
}

/**
 * Adjusts remaining days on a device (+days or -days).
 * Immediately recalculates expiresAt and generates/updates authorization.
 */
function adjustDeviceDays({ deviceId, daysChange = 0 }) {
  const cleanId = String(deviceId || '').trim().toUpperCase();
  const change = parseInt(daysChange, 10);
  if (!cleanId || isNaN(change)) {
    return { success: false, error: 'ទិន្នន័យមិនត្រឹមត្រូវ (Invalid parameters)' };
  }

  let authMap = getAuthorizedDevicesMap();
  let auth = authMap[cleanId];
  const now = Date.now();

  if (!auth) {
    authMap[cleanId] = {
      deviceId: cleanId,
      days: Math.max(0, change),
      status: 'active',
      authorizedAt: new Date().toISOString()
    };
    auth = authMap[cleanId];
  }

  let baseExpMs = now;
  if (auth.expiresAt) {
    const curExpMs = new Date(auth.expiresAt).getTime();
    if (curExpMs > now) {
      baseExpMs = curExpMs;
    }
  }

  const deltaMs = change * 86400000;
  const newExpMs = baseExpMs + deltaMs;

  if (newExpMs <= now) {
    auth.expiresAt = new Date(now - 1000).toISOString();
    auth.status = 'expired';
    auth.days = 0;
  } else {
    auth.expiresAt = new Date(newExpMs).toISOString();
    auth.revoked = false;
    auth.status = 'active';
    const remDays = Math.ceil((newExpMs - now) / 86400000);
    auth.days = remDays;
    auth.label = `${remDays} ថ្ងៃ`;
    auth.key = generateLicenseKey(cleanId, remDays);
  }

  fs.writeFileSync(AUTHORIZED_DEVICES_FILE, JSON.stringify(authMap, null, 2), 'utf-8');
  for (const p of getSystemAuthVaultPaths()) {
    try {
      const vDir = path.dirname(p);
      if (!fs.existsSync(vDir)) fs.mkdirSync(vDir, { recursive: true });
      fs.writeFileSync(p, JSON.stringify(authMap, null, 2), 'utf-8');
    } catch (e) {}
  }

  // If modifying current device
  if (cleanId === getDeviceId()) {
    if (newExpMs <= now) {
      deactivateLicense();
    } else {
      activateLicense(auth.key, { customExpiresAt: auth.expiresAt });
    }
  }

  const finalDays = Math.max(0, Math.ceil((newExpMs - now) / 86400000));
  return {
    success: true,
    deviceId: cleanId,
    newExpiresAt: auth.expiresAt,
    daysChange: change,
    newDays: finalDays,
    key: auth.key || ''
  };
}

/**
 * Expires/Disconnects license from a device immediately (resets days to 0 and marks as expired).
 */
function revokeDeviceLicense(deviceId) {
  const cleanId = String(deviceId || '').trim().toUpperCase();
  if (!cleanId) return { success: false, error: 'Missing deviceId' };

  let authMap = getAuthorizedDevicesMap();
  const pastExpiry = new Date(Date.now() - 1000).toISOString();
  if (authMap[cleanId]) {
    authMap[cleanId].revoked = false;
    authMap[cleanId].status = 'expired';
    authMap[cleanId].expiresAt = pastExpiry;
    authMap[cleanId].days = 0;
  } else {
    authMap[cleanId] = {
      deviceId: cleanId,
      revoked: false,
      status: 'expired',
      expiresAt: pastExpiry,
      days: 0,
      authorizedAt: new Date().toISOString()
    };
  }

  fs.writeFileSync(AUTHORIZED_DEVICES_FILE, JSON.stringify(authMap, null, 2), 'utf-8');
  for (const p of getSystemAuthVaultPaths()) {
    try {
      const vDir = path.dirname(p);
      if (!fs.existsSync(vDir)) fs.mkdirSync(vDir, { recursive: true });
      fs.writeFileSync(p, JSON.stringify(authMap, null, 2), 'utf-8');
    } catch (e) {}
  }

  // Update in tracker
  try {
    if (fs.existsSync(DEVICES_TRACKER_FILE)) {
      const list = JSON.parse(fs.readFileSync(DEVICES_TRACKER_FILE, 'utf-8')) || [];
      const item = list.find(d => d.deviceId === cleanId);
      if (item) {
        item.status = 'expired';
        fs.writeFileSync(DEVICES_TRACKER_FILE, JSON.stringify(list, null, 2), 'utf-8');
      }
    }
  } catch (e) {}

  if (cleanId === getDeviceId()) {
    deactivateLicense();
  }

  return { success: true, deviceId: cleanId, message: 'បានកាត់ License លើម៉ាស៊ីននេះឱ្យផុតកំណត់ (០ ថ្ងៃ) រួចរាល់!' };
}

/**
 * Transfers remaining days from Machine 1 to Machine 2.
 * Machine 1 is completely revoked. Machine 2 gets authorized with the remaining time.
 */
function transferDeviceLicense({ fromDeviceId, toDeviceId, newCustomName = '' }) {
  const cleanFrom = String(fromDeviceId || '').trim().toUpperCase();
  const cleanTo = String(toDeviceId || '').trim().toUpperCase();

  if (!cleanFrom || !cleanTo) {
    return { success: false, error: 'សូមបញ្ចូលលេខកូដម៉ាស៊ីនទាំងពីរ (Missing Device IDs)' };
  }
  if (cleanFrom === cleanTo) {
    return { success: false, error: 'មិនអាចផ្ទេរទៅម៉ាស៊ីនដដែលបានទេ!' };
  }

  const authMap = getAuthorizedDevicesMap();
  const fromAuth = authMap[cleanFrom];

  let remainingDays = 0;
  let remainingMs = 0;
  let isLifetime = false;
  const now = Date.now();

  if (fromAuth) {
    if (fromAuth.revoked || fromAuth.status === 'revoked') {
      return { success: false, error: `ម៉ាស៊ីន ${cleanFrom} ត្រូវបានដកហូត License រួចហើយ មិនអាចផ្ទេរបានទេ!` };
    }
    if (fromAuth.days === 0 && (!fromAuth.expiresAt || String(fromAuth.label).includes('Lifetime'))) {
      isLifetime = true;
    } else if (fromAuth.expiresAt) {
      const expMs = new Date(fromAuth.expiresAt).getTime();
      remainingMs = expMs - now;
      if (remainingMs <= 0) {
        return { success: false, error: `ម៉ាស៊ីន ${cleanFrom} បានផុតកំណត់ License ហើយ គ្មានថ្ងៃនៅសល់ដើម្បីផ្ទេរឡើយ!` };
      }
      remainingDays = Math.ceil(remainingMs / 86400000);
    } else if (fromAuth.days > 0) {
      remainingDays = fromAuth.days;
      remainingMs = remainingDays * 86400000;
    }
  } else {
    return { success: false, error: `រកមិនឃើញ License របស់ម៉ាស៊ីន ${cleanFrom} ឡើយ!` };
  }

  const custName = newCustomName || (fromAuth && fromAuth.customName) || '';

  // 1. EXPIRE Machine 1 (Transferred)
  authMap[cleanFrom].revoked = false;
  authMap[cleanFrom].status = 'expired';
  authMap[cleanFrom].transferredTo = cleanTo;
  authMap[cleanFrom].expiresAt = new Date(now - 1000).toISOString();
  authMap[cleanFrom].days = 0;

  // 2. AUTHORIZE Machine 2
  let toExpiresAt = null;
  let toDays = isLifetime ? 0 : Math.max(1, remainingDays);
  let toLabel = isLifetime ? 'Lifetime VIP (ពេញមួយជីវិត)' : `${toDays} ថ្ងៃ (ផ្ទេរពី ${cleanFrom})`;

  if (!isLifetime && remainingMs > 0) {
    toExpiresAt = new Date(now + remainingMs).toISOString();
  }

  const newKey = generateLicenseKey(cleanTo, toDays);

  authMap[cleanTo] = {
    deviceId: cleanTo,
    key: newKey,
    days: toDays,
    label: toLabel,
    customName: custName,
    telegramUser: fromAuth.telegramUser || '',
    authorizedAt: new Date().toISOString(),
    expiresAt: toExpiresAt,
    transferredFrom: cleanFrom,
    status: 'active',
    revoked: false
  };

  fs.writeFileSync(AUTHORIZED_DEVICES_FILE, JSON.stringify(authMap, null, 2), 'utf-8');
  for (const p of getSystemAuthVaultPaths()) {
    try {
      const vDir = path.dirname(p);
      if (!fs.existsSync(vDir)) fs.mkdirSync(vDir, { recursive: true });
      fs.writeFileSync(p, JSON.stringify(authMap, null, 2), 'utf-8');
    } catch (e) {}
  }

  try {
    if (fs.existsSync(DEVICES_TRACKER_FILE)) {
      const list = JSON.parse(fs.readFileSync(DEVICES_TRACKER_FILE, 'utf-8')) || [];
      const itemFrom = list.find(d => d.deviceId === cleanFrom);
      if (itemFrom) itemFrom.status = `revoked (Transferred to ${cleanTo})`;
      
      const itemTo = list.find(d => d.deviceId === cleanTo);
      if (itemTo) {
        itemTo.status = toLabel;
        itemTo.customName = custName;
      }
      fs.writeFileSync(DEVICES_TRACKER_FILE, JSON.stringify(list, null, 2), 'utf-8');
    }
  } catch (e) {}

  if (cleanFrom === getDeviceId()) {
    deactivateLicense();
  }
  if (cleanTo === getDeviceId()) {
    activateLicense(newKey, { customExpiresAt: toExpiresAt });
  }

  return {
    success: true,
    fromDeviceId: cleanFrom,
    toDeviceId: cleanTo,
    transferredDays: toDays,
    isLifetime: isLifetime,
    newKey: newKey,
    expiresAt: toExpiresAt,
    customName: custName,
    message: `🎉 បានផ្ទេរ License ពី ${cleanFrom} ទៅ ${cleanTo} (${toDays} ថ្ងៃ) ដោយជោគជ័យ!`
  };
}

/**
 * Returns map of all authorized devices.
 */
function getAuthorizedDevicesMap() {
  if (!fs.existsSync(AUTHORIZED_DEVICES_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(AUTHORIZED_DEVICES_FILE, 'utf-8')) || {};
  } catch (e) {
    return {};
  }
}

/**
 * Checks if current device is authorized for auto-activation.
 * If authorized, it automatically writes license.json and activates!
 * Checks local authorizations, persistent system vaults, and optional remote cloud sync.
 */
async function checkAutoActivation(deviceId = null) {
  const targetId = String(deviceId || getDeviceId()).trim().toUpperCase();

  // Helper to find record in an auth map
  const checkRecord = async (record) => {
    if (record && (record.revoked || record.status === 'revoked')) {
      deactivateLicense();
      return { authorized: false, revoked: true, message: 'License ត្រូវបានដកហូតដោយ Admin' };
    }
    if (record && record.key) {
      const actResult = await activateLicense(record.key, {
        customExpiresAt: record.expiresAt,
        targetDeviceId: targetId,
        customName: record.customName || record.customerName || ''
      });
      if (actResult.success) {
        return {
          authorized: true,
          key: record.key,
          days: record.days,
          label: record.label,
          customName: record.customName || '',
          expiresAt: record.expiresAt,
          message: '🎉 ម៉ាស៊ីនរបស់អ្នកត្រូវបាន Admin អនុញ្ញាតដោយជោគជ័យ!'
        };
      }
    }
    return null;
  };

  // 1. Check local authorized_devices.json
  if (fs.existsSync(AUTHORIZED_DEVICES_FILE)) {
    try {
      const authMap = JSON.parse(fs.readFileSync(AUTHORIZED_DEVICES_FILE, 'utf-8')) || {};
      const res = await checkRecord(authMap[targetId]);
      if (res) return res;
    } catch (e) {}
  }

  // 1b. Check persistent system auth vaults (survives app directory deletion)
  for (const vaultPath of getSystemAuthVaultPaths()) {
    try {
      if (fs.existsSync(vaultPath)) {
        const authMap = JSON.parse(fs.readFileSync(vaultPath, 'utf-8')) || {};
        if (authMap[targetId]) {
          // Restore local file
          try {
            if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(AUTHORIZED_DEVICES_FILE, JSON.stringify(authMap, null, 2), 'utf-8');
          } catch (e) {}
          const res = await checkRecord(authMap[targetId]);
          if (res) return res;
        }
      }
    } catch (e) {}
  }

  // 2. Check remote cloud sync if configured (e.g. Cloud Bot Service, GitHub Gist or Raw JSON)
  const cfg = getTelegramConfig();
  if (cfg.cloudSyncUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      let syncUrl = cfg.cloudSyncUrl.trim();
      if (!syncUrl.includes('/api/license/check') && !syncUrl.includes('.json')) {
        syncUrl = syncUrl.replace(/\/+$/, '') + '/api/license/check';
      }
      if (syncUrl.includes('/api/license/check')) {
        syncUrl += (syncUrl.includes('?') ? '&' : '?') + `deviceId=${encodeURIComponent(targetId)}`;
      }
      const res = await fetch(syncUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'HongguoDownloader/3.1' }
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const cloudData = await res.json();
        if (cloudData && (cloudData.revoked || cloudData.status === 'revoked')) {
          deactivateLicense();
          return { authorized: false, revoked: true, message: 'License ត្រូវបានដកហូតដោយ Admin' };
        }
        const record = (cloudData && cloudData.authorized && cloudData.key)
          ? cloudData
          : (cloudData[targetId] || (cloudData.devices && cloudData.devices[targetId]));
        if (record && (record.revoked || record.status === 'revoked')) {
          deactivateLicense();
          return { authorized: false, revoked: true, message: 'License ត្រូវបានដកហូតដោយ Admin' };
        }
        if (record && record.key) {
          const actResult = await activateLicense(record.key, {
            customExpiresAt: record.expiresAt,
            targetDeviceId: targetId,
            customName: record.customName || record.customerName || ''
          });
          if (actResult.success) {
            return {
              authorized: true,
              key: record.key,
              days: record.days,
              label: record.label,
              customName: record.customName || '',
              expiresAt: record.expiresAt,
              message: '🎉 ម៉ាស៊ីនរបស់អ្នកត្រូវបាន Admin អនុញ្ញាតពីចម្ងាយដោយជោគជ័យ!'
            };
          }
        }
      }
    } catch (e) {}
  }

  return { authorized: false, message: 'មិនទាន់មានការអនុញ្ញាតពី Admin ឡើយ' };
}

/**
 * Sends Telegram notification message to the Admin/Owner chat.
 */
async function sendTelegramAlert(textHtml, options = {}) {
  const cfg = getTelegramConfig();
  if (!cfg.botToken || !cfg.chatId) return { skipped: true };

  const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
  try {
    const payload = {
      chat_id: cfg.chatId,
      text: textHtml,
      parse_mode: 'HTML',
      ...options
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    return { success: result.ok, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

const PAYMENTS_FILE = path.join(DATA_DIR, 'payments.json');

const _paymentCooldownMap = new Map();

function checkPaymentRateLimit(deviceId) {
  const now = Date.now();
  const entry = _paymentCooldownMap.get(deviceId) || { count: 0, lockedUntil: 0, firstClick: now };

  if (entry.lockedUntil > now) {
    const remaining = Math.ceil((entry.lockedUntil - now) / 1000);
    return {
      allowed: false,
      remaining,
      message: `អ្នកបានចុចច្រើនដងពេកហើយ! ប្រព័ន្ធត្រូវបានចាក់សោ ១ នាទី។ សូមទាក់ទងទៅ admin ផ្ទាល់ ដើម្បីផ្ញើវិក្កយបត្រ`
    };
  }

  // Reset window if past 60s
  if (now - entry.firstClick > 60000) {
    entry.count = 0;
    entry.firstClick = now;
  }

  entry.count += 1;
  const isNowLocked = entry.count >= 5;
  if (isNowLocked) {
    entry.lockedUntil = now + 60000;
  }
  _paymentCooldownMap.set(deviceId, entry);

  return {
    allowed: true,
    locked: isNowLocked,
    remaining: isNowLocked ? 60 : 0,
    count: entry.count
  };
}

/**
 * Records a customer's payment notification and sends instant Telegram notification to the Admin.
 * Rate limited to max 3 clicks, followed by a 1-minute cooldown.
 */
async function recordPaymentNotification({ deviceId, telegramUser, plan, amount }) {
  const cleanId = String(deviceId || getDeviceId()).trim().toUpperCase();

  // Rate limit check: 3 clicks -> 1 minute cooldown
  const rateLimit = checkPaymentRateLimit(cleanId);
  if (!rateLimit.allowed) {
    return {
      success: false,
      locked: true,
      remaining: rateLimit.remaining,
      error: rateLimit.message
    };
  }

  const cleanTg = String(telegramUser || '').trim();
  const cleanPlan = String(plan || '1 ខែ ($5.99)').trim();
  const cleanAmount = String(amount || '5.99').trim();
  const host = os.hostname() || 'Unknown-PC';
  const user = (os.userInfo && os.userInfo().username) || '';
  const now = new Date().toISOString();

  let payments = [];
  if (fs.existsSync(PAYMENTS_FILE)) {
    try {
      payments = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf-8')) || [];
    } catch (e) { payments = []; }
  }

  const paymentRecord = {
    id: `PAY-${Date.now()}`,
    deviceId: cleanId,
    telegramUser: cleanTg,
    plan: cleanPlan,
    amount: cleanAmount,
    computerName: host,
    osUser: user,
    createdAt: now,
    status: 'pending'
  };

  payments.unshift(paymentRecord);
  if (payments.length > 200) payments = payments.slice(0, 200);

  try {
    fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(payments, null, 2), 'utf-8');
  } catch (e) {}

  // Update in devices tracker
  try {
    if (fs.existsSync(DEVICES_TRACKER_FILE)) {
      const list = JSON.parse(fs.readFileSync(DEVICES_TRACKER_FILE, 'utf-8')) || [];
      const item = list.find(d => d.deviceId === cleanId);
      if (item) {
        if (cleanTg) item.telegramUser = cleanTg;
        item.lastPaymentPlan = cleanPlan;
        item.lastPaymentAmount = cleanAmount;
        fs.writeFileSync(DEVICES_TRACKER_FILE, JSON.stringify(list, null, 2), 'utf-8');
      }
    }
  } catch (e) {}

  // Fetch Geo details
  let geoText = '';
  try {
    const geo = await resolveGeoLocation();
    if (geo && geo.ip) {
      geoText = `\n🌐 <b>ទីតាំង & IP:</b> ${geo.city || 'Phnom Penh'}, ${geo.country || 'Cambodia'} (<code>${geo.ip}</code>)`;
    }
  } catch (e) {}

  // Send High-Priority Instant Telegram Alert to Admin with 1-Click Action Buttons
  const alertMsg =
    `💰💰💰 <b>សារជូនដំណឹង៖ អតិថិជនបានបាញ់ប្រាក់រួចហើយ!</b> 💰💰💰\n\n` +
    `💻 <b>លេខម៉ាស៊ីន (Device ID):</b> <code>${cleanId}</code>\n` +
    `📦 <b>កញ្ចប់ដែលបានទិញ:</b> <b>${cleanPlan}</b>\n` +
    `💵 <b>ចំនួនទឹកប្រាក់:</b> <b>$${cleanAmount}</b>\n` +
    (cleanTg ? `👤 <b>Telegram អតិថិជន:</b> <b>${cleanTg}</b>\n` : '') +
    `🖥️ <b>កុំព្យូទ័រ:</b> ${host} (${user})` +
    geoText + `\n` +
    `🕒 <b>ម៉ោងបង់ប្រាក់:</b> ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' })}\n\n` +
    `👉 <b>ចំណាត់ការ៖</b> សូមចុចប៊ូតុងខាងក្រោមដើម្បីបង្កើត License ឬបើកសិទ្ធិភ្លាមៗ:`;

  const inlineButtons = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '⚡ បើកសិទ្ធិ 7 ថ្ងៃ', callback_data: `auth:${cleanId}:7` },
          { text: '⚡ បើកសិទ្ធិ 30 ថ្ងៃ', callback_data: `auth:${cleanId}:30` }
        ],
        [
          { text: '⚡ បើកសិទ្ធិ 1 ឆ្នាំ', callback_data: `auth:${cleanId}:365` },
          { text: '👑 Lifetime VIP', callback_data: `auth:${cleanId}:0` }
        ],
        [
          { text: '🔑 បង្កើត License Key', callback_data: `genkey:${cleanId}:30` }
        ]
      ]
    }
  };

  await sendTelegramAlert(alertMsg, inlineButtons).catch(() => {});

  return {
    success: true,
    message: 'បានផ្ញើសារជូនដំណឹងទៅកាន់ Admin រួចរាល់!',
    payment: paymentRecord,
    locked: rateLimit.locked,
    remaining: rateLimit.remaining,
    clickCount: rateLimit.count
  };
}
 
const PENDING_CHECKOUTS_FILE = path.join(DATA_DIR, 'pending_checkouts.json');
const PROCESSED_TRX_FILE = path.join(DATA_DIR, 'processed_payway_trx.json');
const UNCLAIMED_PAYMENTS_FILE = path.join(DATA_DIR, 'recent_unclaimed_payments.json');

function recordUnclaimedPayment(data) {
  if (!data || !data.amount) return null;
  const now = Date.now();
  let list = [];
  if (fs.existsSync(UNCLAIMED_PAYMENTS_FILE)) {
    try {
      list = JSON.parse(fs.readFileSync(UNCLAIMED_PAYMENTS_FILE, 'utf-8')) || [];
    } catch (e) { list = []; }
  }

  // Deduplicate by trxId if exists, or matching amount + payer within 60 seconds
  const numAmount = parseFloat(data.amount || 0);
  const exists = list.find(item => {
    if (data.trxId && item.trxId && String(data.trxId).trim() === String(item.trxId).trim()) return true;
    if (Math.abs(item.amount - numAmount) < 0.05 && Math.abs(item.timestamp - now) < 60000 && item.payer === data.payer) return true;
    return false;
  });

  if (exists) return exists;

  const entry = {
    id: `PAY-${now}`,
    amount: numAmount,
    payer: String(data.payer || 'Customer').trim(),
    trxId: String(data.trxId || '').trim(),
    chatId: data.chatId || null,
    messageId: data.messageId || null,
    rawText: String(data.rawText || '').trim(),
    timestamp: now,
    claimedBy: data.claimedBy || null,
    claimedAt: data.claimedAt || null,
    key: data.key || null
  };

  list.unshift(entry);
  if (list.length > 100) list = list.slice(0, 100);

  try {
    fs.writeFileSync(UNCLAIMED_PAYMENTS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (e) {}

  return entry;
}

function getUnclaimedPayments(maxAgeMs = 3600000) {
  if (!fs.existsSync(UNCLAIMED_PAYMENTS_FILE)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(UNCLAIMED_PAYMENTS_FILE, 'utf-8')) || [];
    const now = Date.now();
    return list.filter(item => !item.claimedBy && (now - (item.timestamp || 0) <= maxAgeMs));
  } catch (e) { return []; }
}

function findAndClaimRecentPayment({ deviceId, amount, maxAgeMs = 3600000 }) {
  const cleanId = String(deviceId || getDeviceId()).trim().toUpperCase();
  const numAmount = parseFloat(amount || 0) || 1.50;
  const now = Date.now();

  if (!fs.existsSync(UNCLAIMED_PAYMENTS_FILE)) {
    return { found: false };
  }

  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(UNCLAIMED_PAYMENTS_FILE, 'utf-8')) || [];
  } catch (e) { return { found: false }; }

  // Find candidate: unclaimed OR already claimed by this exact device, within maxAgeMs, amount matches
  const candidate = list.find(item => {
    const isUnclaimedOrMine = !item.claimedBy || item.claimedBy === cleanId;
    const isRecent = (now - (item.timestamp || 0)) <= maxAgeMs;
    const amountMatches = item.amount >= (numAmount - 0.15);
    return isUnclaimedOrMine && isRecent && amountMatches;
  });

  if (!candidate) {
    return { found: false };
  }

  let days = 7;
  let planLabel = '7 ថ្ងៃ (១ សប្តាហ៍)';
  if (candidate.amount >= 20.0) {
    days = 365;
    planLabel = '365 ថ្ងៃ (១ ឆ្នាំ)';
  } else if (candidate.amount >= 5.0) {
    days = 30;
    planLabel = '30 ថ្ងៃ (១ ខែ)';
  } else if (candidate.amount >= 1.0) {
    days = 7;
    planLabel = '7 ថ្ងៃ (១ សប្តាហ៍)';
  } else {
    days = 3;
    planLabel = '3 ថ្ងៃ (តេស្ត)';
  }

  // Authorize device
  const authRes = authorizeDevice({
    deviceId: cleanId,
    days: days,
    telegramUser: candidate.payer,
    customLabel: planLabel
  });

  // Mark candidate as claimed
  candidate.claimedBy = cleanId;
  candidate.claimedAt = new Date().toISOString();
  candidate.key = authRes.key;
  candidate.days = days;
  candidate.label = planLabel;

  try {
    fs.writeFileSync(UNCLAIMED_PAYMENTS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (e) {}

  // Mark transaction deduplicated
  if (candidate.trxId) {
    markTrxProcessed(candidate.trxId, { amount: candidate.amount, payer: candidate.payer, deviceId: cleanId });
  }

  return {
    found: true,
    payment: candidate,
    authRes
  };
}

function registerPendingCheckout({ deviceId, plan, amount }) {
  const cleanId = String(deviceId || getDeviceId()).trim().toUpperCase();
  const cleanPlan = String(plan || '1_week').trim();
  const cleanAmount = parseFloat(amount || '1.50') || 1.50;
  const now = Date.now();

  let list = [];
  if (fs.existsSync(PENDING_CHECKOUTS_FILE)) {
    try {
      list = JSON.parse(fs.readFileSync(PENDING_CHECKOUTS_FILE, 'utf-8')) || [];
    } catch (e) { list = []; }
  }

  list = list.filter(item => (now - (item.timestamp || 0) < 3600000) && item.deviceId !== cleanId);

  const entry = {
    deviceId: cleanId,
    plan: cleanPlan,
    amount: cleanAmount,
    timestamp: now,
    status: 'pending'
  };

  list.unshift(entry);
  try {
    fs.writeFileSync(PENDING_CHECKOUTS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (e) {}

  return { success: true, entry };
}

function isTrxAlreadyProcessed(trxId) {
  if (!trxId) return false;
  if (!fs.existsSync(PROCESSED_TRX_FILE)) return false;
  try {
    const list = JSON.parse(fs.readFileSync(PROCESSED_TRX_FILE, 'utf-8')) || [];
    return list.some(item => item.trxId === String(trxId));
  } catch (e) {
    return false;
  }
}

function markTrxProcessed(trxId, details = {}) {
  if (!trxId) return;
  let list = [];
  if (fs.existsSync(PROCESSED_TRX_FILE)) {
    try {
      list = JSON.parse(fs.readFileSync(PROCESSED_TRX_FILE, 'utf-8')) || [];
    } catch (e) { list = []; }
  }
  list.unshift({ trxId: String(trxId), processedAt: new Date().toISOString(), ...details });
  if (list.length > 500) list = list.slice(0, 500);
  try {
    fs.writeFileSync(PROCESSED_TRX_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (e) {}
}

function fulfillPayWayPayment({ amount, payer = '', trxId = '', deviceId = null }) {
  const numAmount = parseFloat(amount || '0') || 0;
  let days = 7;
  let planLabel = '7 ថ្ងៃ (១ សប្តាហ៍)';

  if (numAmount >= 20.0) {
    days = 365;
    planLabel = '365 ថ្ងៃ (១ ឆ្នាំ)';
  } else if (numAmount >= 5.0) {
    days = 30;
    planLabel = '30 ថ្ងៃ (១ ខែ)';
  } else if (numAmount >= 1.0) {
    days = 7;
    planLabel = '7 ថ្ងៃ (១ សប្តាហ៍)';
  } else {
    // For test amounts (e.g. $0.10)
    days = 3;
    planLabel = '3 ថ្ងៃ (តេស្តសាកល្បង)';
  }

  const now = Date.now();
  let targetDeviceId = deviceId ? String(deviceId).trim().toUpperCase() : null;

  // 1. Check pending checkouts within the last 45 minutes
  if (!targetDeviceId && fs.existsSync(PENDING_CHECKOUTS_FILE)) {
    try {
      let list = JSON.parse(fs.readFileSync(PENDING_CHECKOUTS_FILE, 'utf-8')) || [];
      const candidate = list.find(item => item.status === 'pending' && (now - (item.timestamp || 0) < 2700000));
      if (candidate) {
        targetDeviceId = candidate.deviceId;
        candidate.status = 'fulfilled';
        candidate.trxId = trxId;
        candidate.payer = payer;
        candidate.fulfilledAt = new Date().toISOString();
        fs.writeFileSync(PENDING_CHECKOUTS_FILE, JSON.stringify(list, null, 2), 'utf-8');
      }
    } catch (e) {}
  }

  // 2. If no pending checkout, check recent pending payments in payments.json
  if (!targetDeviceId && fs.existsSync(PAYMENTS_FILE)) {
    try {
      let payments = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf-8')) || [];
      const pendingPay = payments.find(p => p.status === 'pending' && (now - new Date(p.createdAt).getTime() < 2700000));
      if (pendingPay) {
        targetDeviceId = pendingPay.deviceId;
        pendingPay.status = 'approved';
        pendingPay.trxId = trxId;
        pendingPay.approvedAt = new Date().toISOString();
        fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(payments, null, 2), 'utf-8');
      }
    } catch (e) {}
  }

  // 3. Fallback: check most recently active unactivated device in devices_tracker.json
  if (!targetDeviceId && fs.existsSync(DEVICES_TRACKER_FILE)) {
    try {
      const list = JSON.parse(fs.readFileSync(DEVICES_TRACKER_FILE, 'utf-8')) || [];
      const unact = list.filter(d => !d.status || d.status === 'unactivated' || d.status.includes('expired') || d.status.includes('ផុតកំណត់'));
      unact.sort((a, b) => (new Date(b.lastSeen || 0).getTime() - new Date(a.lastSeen || 0).getTime()));
      if (unact.length && (now - new Date(unact[0].lastSeen || 0).getTime() < 1800000)) {
        targetDeviceId = unact[0].deviceId;
      }
    } catch (e) {}
  }

  // 4. Safe fallback: current machine
  if (!targetDeviceId) {
    targetDeviceId = getDeviceId();
  }

  // Authorize the device
  const authRes = authorizeDevice({
    deviceId: targetDeviceId,
    days: days,
    telegramUser: payer
  });

  return {
    success: true,
    autoActivated: true,
    deviceId: targetDeviceId,
    key: authRes.key,
    days: days,
    label: planLabel,
    payer: payer,
    trxId: trxId,
    amount: numAmount
  };
}

function getPaymentRequests() {
  if (!fs.existsSync(PAYMENTS_FILE)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf-8')) || [];
    // Only return confirmed/verified payments from Telegram bot or auto-buy
    return list.filter(p => p.status === 'verified' || p.status === 'approved' || p.status === 'fulfilled' || p.verified === true || p.autoActivated === true);
  } catch (e) { return []; }
}

function getTelegramConfig() {
  const defaults = {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '8928655174:AAGpYf-8kHhPCRRBcj21bvJ-sGXtxk5tlUE',
    chatId: process.env.TELEGRAM_CHAT_ID || '925539914',
    cloudSyncUrl: process.env.LICENSE_CLOUD_SYNC_URL || 'https://ps-download-bot-irhw.onrender.com',
    adminTelegram: '@Thpisal33',
    qrImageUrl: '/qr_payment.png'
  };
  if (fs.existsSync(TELEGRAM_CONFIG_FILE)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(TELEGRAM_CONFIG_FILE, 'utf-8')) || {};
      return {
        ...defaults,
        ...cfg,
        cloudSyncUrl: (cfg.cloudSyncUrl && cfg.cloudSyncUrl.trim()) || defaults.cloudSyncUrl
      };
    } catch (e) {}
  }
  return defaults;
}

function saveTelegramConfig({ botToken, chatId, cloudSyncUrl, adminTelegram, qrImageUrl }) {
  const current = getTelegramConfig();
  const updated = {
    botToken: (botToken !== undefined ? botToken : current.botToken).trim(),
    chatId: (chatId !== undefined ? chatId : current.chatId).trim(),
    cloudSyncUrl: (cloudSyncUrl !== undefined ? cloudSyncUrl : current.cloudSyncUrl).trim(),
    adminTelegram: (adminTelegram !== undefined ? adminTelegram : current.adminTelegram).trim(),
    qrImageUrl: (qrImageUrl !== undefined ? qrImageUrl : current.qrImageUrl).trim()
  };
  try {
    fs.writeFileSync(TELEGRAM_CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    return { success: true, config: updated };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ==========================================
// CLI Tool for Developer to Generate Keys
// Usage: node src/license.js <DeviceID> [days]
// ==========================================
if (require.main === module) {
  const args = process.argv.slice(2);
  const targetId = args[0] || getDeviceId();
  const days = parseInt(args[1] || '0', 10);

  console.log('\n========================================================');
  console.log('  🔐 HONGGUO DOWNLOADER - LICENSE KEY GENERATOR');
  console.log('========================================================');
  console.log(`  Device ID:    ${targetId}`);
  console.log(`  Type:         ${days > 0 ? `${days} Days` : 'Lifetime VIP (ពេញមួយជីវិត)'}`);
  
  const generatedKey = generateLicenseKey(targetId, days);
  console.log(`  License Key:  ${generatedKey}`);
  console.log('========================================================');
  console.log(`  👉 ផ្ញើ License Key នេះទៅកាន់អតិថិជនរបស់អ្នក: ${generatedKey}\n`);
}

module.exports = {
  getDeviceId,
  generateLicenseKey,
  generateUniversalKey,
  verifyLicenseKey,
  getLicenseStatus,
  activateLicense,
  deactivateLicense,
  getGeneratedKeysList,
  recordDeviceTracking,
  getTrackedDevices,
  authorizeDevice,
  checkAutoActivation,
  sendTelegramAlert,
  getTelegramConfig,
  saveTelegramConfig,
  resolveGeoLocation,
  recordFailedAttempt,
  recordPaymentNotification,
  getPaymentRequests,
  registerPendingCheckout,
  fulfillPayWayPayment,
  isTrxAlreadyProcessed,
  markTrxProcessed,
  resetDeviceFails,
  getCrackSuspectsList,
  clearFailedAttemptsHistory,
  clearPaymentRequests,
  getSystemVaultPaths,
  recoverLicenseFromVaults,
  setDeviceCustomName,
  getTrackedDevicesWithLicenseInfo,
  adjustDeviceDays,
  revokeDeviceLicense,
  transferDeviceLicense,
  getAuthorizedDevicesMap,
  recordUnclaimedPayment,
  getUnclaimedPayments,
  findAndClaimRecentPayment,
  MASTER_KEYS
};

