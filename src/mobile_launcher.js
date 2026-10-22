/**
 * PS DOWNLOAD - Mobile Server Launcher & Process Guardian
 * Safely manages local port binding, detects existing instances, and provides clean console UI.
 */

const http = require('http');
const { execSync } = require('child_process');
const { startServer, getLocalIp } = require('./server.js');
const { PORT, HOST } = require('./config.js');

async function main() {
  console.clear();
  console.log('==============================================================');
  console.log('       PS DOWNLOAD - Mobile Web App Server Pro (v3.3.0)       ');
  console.log('==============================================================\n');

  const localIp = getLocalIp();

  // 1. Check if server is already running on port 1994
  const isRunning = await checkServerRunning(PORT);

  if (isRunning) {
    console.log(`[OK] ម៉ាស៊ីន Server កំពុងដំណើរការស្រាប់លើកុំព្យូទ័រ (Port ${PORT})!`);
    console.log('[OK] មិនបាច់បើកជាន់គ្នាទេ ព្រោះប្រព័ន្ធដំណើរការរួចរាល់ហើយ។\n');
    console.log('📱 សូមបើកកម្មវិធី Browser លើទូរសព្ទដៃ (Chrome / Safari) រួចចូល Link៖\n');
    console.log(`       http://${localIp}:${PORT}/m\n`);
    console.log('==============================================================');
    console.log('💡 គន្លឹះ៖ លោកអ្នកអាចចុច "Add to Home Screen" ដើម្បីដំឡើងជា App លើទូរសព្ទ');
    console.log('==============================================================\n');
    console.log('ចុច Ctrl+C ដើម្បីចាកចេញ...');
    return;
  }

  // 2. Free port 1994 if held by a hung/dead process on Windows
  if (process.platform === 'win32') {
    try {
      execSync(`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' });
    } catch (_) {}
  }

  // 3. Start server
  console.log('[INFO] កំពុងចាប់ផ្តើម Server សម្រាប់ទូរសព្ទដៃ...\n');
  try {
    await startServer(PORT, '0.0.0.0');
    console.log('\n==============================================================');
    console.log('📱 សូមបើកកម្មវិធី Browser លើទូរសព្ទដៃ (Chrome / Safari) រួចចូល Link៖\n');
    console.log(`       http://${localIp}:${PORT}/m\n`);
    console.log('==============================================================');
    console.log('💡 គន្លឹះ៖ លោកអ្នកអាចចុច "Add to Home Screen" ដើម្បីដំឡើងជា App លើទូរសព្ទ');
    console.log('==============================================================\n');
    console.log('ទុកផ្ទាំងនេះចំហរ ឬបង្រួមតូច (Minimize) ខណៈពេលកំពុងប្រើលើទូរសព្ទ។\n');
  } catch (err) {
    console.error('[Error] មិនអាចចាប់ផ្តើម Server បានឡើយ:', err.message);
  }
}

function checkServerRunning(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/ping`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(false);
    });
  });
}

main();
