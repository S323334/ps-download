# Rules & Guidelines for Antigravity

## 1. Absolute Rule on Bot Isolation (ដាច់ខាតកុំប៉ះពាល់ដល់ Telegram Bot)
- **ពេលធ្វើកម្មវិធី (Desktop App)**: មិនត្រូវប៉ះពាល់, កែប្រែ, ឬប៉ះដល់ប្រព័ន្ធ Bot ជាដាច់ខាត (ដាច់ខាតកុំប៉ះពាល់ដល់ Bot files ដូចជា `src/telegram_bot.js`, `src/bot_service.js`, `run_bot_24h.bat`...) លុះត្រាតែអ្នកប្រើប្រាស់ (User) បញ្ជាឱ្យធ្វើ ឬកែប្រែ Bot ដោយផ្ទាល់។
- **ផ្តោតលើកម្មវិធីតែមួយគត់**: រាល់ការស្នើសុំទាក់ទងនឹង App (Web UI, Electron, Downloader, Library, etc.) គឺធ្វើតែលើ App ប៉ុណ្ណោះ មិនត្រូវប៉ះដល់ Bot ឡើយ។

---

## 2. 24/7 Cloud Architecture & Never-Sleep Setup (ប្រព័ន្ធ Bot ២៤ ម៉ោងលើ Cloud)
- **GitHub Repository**: `https://github.com/S323334/ps-download` (Branch: `main`)
- **Render Cloud Service**: `https://ps-download-bot-irhw.onrender.com`
- **ការការពារកុំឱ្យ Render ចូល Sleep (Never-Sleep Double Backup)**:
  1. **UptimeRobot**: បានភ្ជាប់ជាមួយ `https://ps-download-bot-irhw.onrender.com` (Ping រៀងរាល់ ៥ នាទីម្តង)
  2. **cron-job.org**: Job ឈ្មោះ `PS Bot 24H` ភ្ជាប់ជាមួយ `https://ps-download-bot-irhw.onrender.com` (Ping រៀងរាល់ ១ នាទីម្តង)
- **គោលបំណង**: ធានាឱ្យ Telegram Bot ដំណើរការ ២៤/៧ ជាប់រហូត ឆ្លើយតប និង Auto-Unlock ជូនភ្ញៀវបានជានិច្ច ទោះបីកុំព្យូទ័ររបស់ Admin បិទ ឬដាច់ភ្លើងក៏ដោយ។

---

## 3. License System & Custom Name Behavior (ចំណុចត្រូវចងចាំអំពី License និងឈ្មោះភ្ញៀវ)
- **ការកែឈ្មោះក្នុង Key Admin (`admin.html`)**:
  - ពេល Admin ប្តូរឈ្មោះភ្ញៀវក្នុង Key Admin ឈ្មោះនោះរក្សាទុកក្នុង `data/authorized_devices.json` និង `data/devices_tracker.json` លើកុំព្យូទ័រ Admin ប៉ុណ្ណោះ។
  - កូដ License Key (ឧ. `D007-7BDE-34DE-41B5`) ផ្ទុកតែសុពលភាពថ្ងៃ មិនផ្ទុកអក្សរឈ្មោះទេ ដូច្នេះម៉ាស៊ីនភ្ញៀវដែលនៅឆ្ងាយមិនស្គាល់ឈ្មោះនេះទេ លុះត្រាតែមាន Cloud Sync។
  - ក្នុងកម្មវិធី App ឈ្មោះ `👤 ឈ្មោះ...` បង្ហាញតែនៅលើ **ប៊ូតុង Sidebar Footer ខាងឆ្វេង** នៅពេល License នៅមានសុពលភាព (Active) ប៉ុណ្ណោះ។ នៅលើ Popup ផ្ទៀងផ្ទាត់ License មិនមានកន្លែងបង្ហាញឈ្មោះភ្ញៀវឡើយ។

---

## 4. ប្រវត្តិប្រតិបត្តិការភ្ញៀវ (Customer Purchase History - 10/1/2026)
- **កុំព្យូទ័រភ្ញៀវ**: `DESKTOP-OVCUM5I (CHANTHA)` នៅ Nonthaburi, Thailand
- **Device ID**: `HG-D801-31FE-A516`
- **កញ្ចប់ទិញ**: $1.50 (១ សប្តាហ៍ / ៧ ថ្ងៃ) តាម ABA KHQR ម៉ោង 16:33
- **License Key ដែលបានបង្កើតជូន**: `D007-7BDE-34DE-41B5` (សុពលភាពដល់ 2026-10-08)

---

## 5. Auto-Update & Customer Distribution Architecture (ប្រព័ន្ធ Auto-Update និងការចែកចាយកម្មវិធី)
- **GitHub Repository សម្រាប់ Update**: `https://github.com/S323334/ps-download` (Branch: `main`)
- **វិធីដំណើរការ Update សម្រាប់ភ្ញៀវចាស់ (ដូចជា CHANTHA)**:
  - ភ្ញៀវចាស់**មិនបាច់ទាញយក File ថ្មីឡើយ**។ គាត់គ្រាន់តែបើកកម្មវិធីចាស់ រួចចុច `⚙️ ការកំណត់` -> `🔄 Update`។
  - ប្រព័ន្ធ Updater នឹងទាញយកកូដថ្មីពី GitHub `main` មកជំនួសក្នុង `resources/app/` ដោយស្វ័យប្រវត្តិ។
  - **ការរក្សាទុក License**: ឯកសារ `data/license.json` ត្រូវបានការពារមិនឱ្យសរសេរជាន់ពីលើឡើយ ដូច្នេះ License Key របស់ភ្ញៀវនៅតែ Active ដដែល ១០០% មិនបាត់បង់ទេ។
  - ពេលកែប្រែ App រួច ត្រូវកែ Version (ឧ. `3.2.2`) ក្នុង `package.json`, `src/config.js`, `web/index.html` និងចម្លងចូល `Upload_To_GitHub/` ជានិច្ច មុននឹង Push ឡើង GitHub។
- **ការផ្ញើជូនភ្ញៀវថ្មី (New Customers)**:
  - ប្រើ File Portable ZIP ដែលបានវេចខ្ចប់ស្រាប់ក្នុង `dist/` (ឧ. `dist/PS_DOWNLOAD_v3.2.2_Portable.zip` ~163 MB) ដាក់លើ Google Drive ឬ Telegram ដើម្បីផ្ញើ Link ឱ្យភ្ញៀវថ្មី។

---

## 6. Download Folder & Performance Architecture (ទីតាំង Folder និងកម្លាំងម៉ាស៊ីន)
- **ប៊ូតុង Folder ក្នុង Sidebar**: ស្ថិតនៅខាងក្រោម `📚 បណ្ណាល័យ` (`#sidebarFolderSection`)។ គ្រប់ការទាញយកទាំងអស់ (Hongguo, HaoSou, MVFFM, YouTube, PIN Watchlist) ត្រូវរក្សាទុកចូលក្នុង Folder ដែលបានជ្រើសរើសនេះ។
- **ដំណើរការលើ Core i3**: កម្មវិធីស៊ី RAM ត្រឹម ~500 MB និង CPU ត្រឹម 3% - 5% ដំណើរការបានរលូន ១០០% លើកុំព្យូទ័រ Core i3 (RAM 4GB/8GB) ដោយសារប្រើបច្ចេកវិទ្យា Direct Stream Copy មិនស៊ីកម្លាំង CPU ក្នុងការ Re-encode វីដេអូឡើយ។
- **MVFFM Network Architecture**: ត្រូវរក្សាការប្រើប្រាស់ `family: 4` (IPv4) និង Keep-Alive Agent ក្នុង `src/mvffm_downloader.js` ជានិច្ច ដើម្បីការពារបញ្ហា Windows IPv6 stall ដែលបង្កជា Error 408 (Request Timeout)។

