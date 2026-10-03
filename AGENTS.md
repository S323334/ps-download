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
  - ពេលកែប្រែ App រួច ត្រូវកែ Version (ឧ. `3.2.3`) ក្នុង `package.json`, `src/config.js`, `web/index.html` និងចម្លងចូល `Upload_To_GitHub/` ជានិច្ច មុននឹង Push ឡើង GitHub។
- **ការផ្ញើជូនភ្ញៀវថ្មី (New Customers)**:
  - ប្រើ File Portable ZIP ដែលបានវេចខ្ចប់ស្រាប់ក្នុង `dist/` (ឧ. `dist/PS_DOWNLOAD_v3.2.3_Portable.zip` ~163 MB) ដាក់លើ Google Drive ឬ Telegram ដើម្បីផ្ញើ Link ឱ្យភ្ញៀវថ្មី។

---

## 6. Download Folder & Performance Architecture (ទីតាំង Folder និងកម្លាំងម៉ាស៊ីន)
- **ប៊ូតុង Folder ក្នុង Sidebar**: ស្ថិតនៅខាងក្រោម `📚 បណ្ណាល័យ` (`#sidebarFolderSection`)។ គ្រប់ការទាញយកទាំងអស់ (Hongguo, HaoSou, MVFFM, YouTube, PIN Watchlist) ត្រូវរក្សាទុកចូលក្នុង Folder ដែលបានជ្រើសរើសនេះ។
- **ដំណើរការលើ Core i3**: កម្មវិធីស៊ី RAM ត្រឹម ~500 MB និង CPU ត្រឹម 3% - 5% ដំណើរការបានរលូន ១០០% លើកុំព្យូទ័រ Core i3 (RAM 4GB/8GB) ដោយសារប្រើបច្ចេកវិទ្យា Direct Stream Copy មិនស៊ីកម្លាំង CPU ក្នុងការ Re-encode វីដេអូឡើយ។
- **MVFFM Network Architecture**: ត្រូវរក្សាការប្រើប្រាស់ `family: 4` (IPv4) និង Keep-Alive Agent ក្នុង `src/mvffm_downloader.js` ជានិច្ច ដើម្បីការពារបញ្ហា Windows IPv6 stall ដែលបង្កជា Error 408 (Request Timeout)។

---

## 7. Next Update Roadmap (កិច្ចការត្រូវធ្វើពេល Update លើកក្រោយ)
- **លុបប្រអប់ Debug Info ក្នុង Settings (`web/index.html`)**:
  - នៅពេលឡើង Version ថ្មីបន្ទាប់ (ឧ. `v3.2.3`) ត្រូវលុបប្រអប់អក្សរ ៣ ជួរនៅបាតក្រោមនៃផ្ទាំង Settings (`• Application: PS DOWNLOAD V3`, `• Data Source: https://hongguoduanju.com/ (SSR Scraper)`, `• Video Stream: Direct unencrypted MP4 CDN...`) ចេញឱ្យស្អាត។
  - **គោលបំណង**: ការពារកុំឱ្យទម្លាយឈ្មោះ Website (`hongguoduanju.com`) និងបច្ចេកទេសទាញយក (`SSR Scraper`) ទៅកាន់ភ្ញៀវ ឬអ្នកដទៃ ដើម្បីរក្សាការសម្ងាត់ និងភាព Professional របស់កម្មវិធី។

---

## 8. Customer-Facing Release Notes & Description Rule (ក្បួនសរសេរ Description ជូនភ្ញៀវអាន)
- **ដាច់ខាតកុំសរសេរបែបបច្ចេកទេស Admin អានម្នាក់ឯង** (មិនត្រូវសរសេរថា "កែ code នេះ, បន្ថែម Keygen នោះ, កែ API..." ឡើយ)៖
  - រាល់ពេលសរសេរ **Release Notes / Description** នៅលើ GitHub និងសារប្រកាសក្នុង Telegram ត្រូវតែសរសេរជា **ភាសាអតិថិជន (Customer-Facing Language)** ផ្ដោតលើផលប្រយោជន៍ និងភាពងាយស្រួលរបស់ភ្ញៀវជាចម្បង ៖
    1. **ពាក្យស្វាគមន៍ & អរគុណភ្ញៀវ** យ៉ាងរាក់ទាក់ និងមានលក្ខណៈ Professional។
    2. **អត្ថប្រយោជន៍ថ្មីៗសម្រាប់ភ្ញៀវ (What's New)** ៖ ល្បឿនទាញយក Full HD លឿនជាងមុន, កម្មវិធីរលូនមិនគាំង, ស៊ីកម្លាំងកុំព្យូទ័រ (CPU/RAM) តិចបំផុត, និងធានាសុវត្ថិភាព License Key ១០០% មិនបាត់បង់ថ្ងៃឡើយពេល Update។
    3. **ការណែនាំពីរបៀប Update ងាយៗសម្រាប់ភ្ញៀវចាស់** ៖ បើកកម្មវិធី -> ចុច `⚙️ ការកំណត់` -> ចុច `🔄 Update` (៥ វិនាទីរួចរាល់)។
    4. **ការណែនាំពីរបៀបដំឡើងសម្រាប់ភ្ញៀវថ្មី** ៖ ទាញយក File `.zip` -> Extract All -> បើក `PS DOWNLOAD.exe` -> ផ្ញើ Device ID មក Admin។
    5. **ជំនួយ និងសេវាកម្មអតិថិជន ២៤/៧** ៖ ភ្ជាប់ Telegram Admin (`@Thpisal33`)។

---

## 9. Key Admin Unified Architecture (ប្រព័ន្ធ Key Admin រួមបញ្ចូលគ្នា V2.0 + V3)
- **ទម្រង់ All-In-One**: រៀបចំផ្ទាំង Key Generator នៅខាងលើ + Instructions Box នៅខាងស្តាំ + របារស្ថិតិ (Total & Online) និងតារាង User នៅខាងក្រោមលើផ្ទាំងតែមួយ មិនបាច់ប្តូរ Tab ឡើយ។
- **រក្សាទុកមុខងារចាស់ V2.0 ទាំងស្រុង ១០០% មិនឱ្យបាត់បង់** ៖
  - ប្រអប់លេខកូដម៉ាស៊ីន (HWID) + ប៊ូតុង Paste។
  - ធីក Universal (កូដប្រើបានគ្រប់ម៉ាស៊ីន) + Claim Window (1h, 12h, 24h, 48h, 72h, 168h)។
  - ឈ្មោះអតិថិជន (Customer Name) + Telegram Username។
  - ចំនួនថ្ងៃ (Duration Presets) ៖ 1, 3, 7, 14, 30, 60, 90, 180, 365, Lifetime + វាយថ្ងៃផ្ទាល់ខ្លួន។
  - ប្រអប់ការណែនាំ (Instructions Box) ៖ ជំហាន ១-៥ + គន្លឹះ Right-Click Menu។
  - **Menu ចុចស្តាំ (Right-Click Context Menu) លើតារាងភ្ញៀវ** ៖
    - `⏱️ កំណត់ / បន្ថែមថ្ងៃ (Set Days)`
    - `👤 កែឈ្មោះភ្ញៀវ (Set Name)`
    - `👑 Set Lifetime (ពេញមួយជីវិត)`
    - `🔒 Lock (0 Days / ចាក់សោដកហូត)`
    - `📋 ចម្លង Device ID`
    - `🔑 ចម្លង License Key`
    - `🔄 ផ្ទេរ License ទៅម៉ាស៊ីនថ្មី`
  - **ការគាំទ្រកូដចាស់ (Backward Compatibility)** ៖ ទទួលស្គាល់កូដចាស់ MD5 ពី KeyGen V2.0 (`PS_MEDIA_SECURE_KEY_2026`) និងដកស្រង់ឈ្មោះ Base64 ពីកន្ទុយ Key (`KEY:b64(name)`) ដោយស្វ័យប្រវត្តិ។
- **មុខងារថ្មី V3 បន្ថែមពីលើ** ៖
  - ⚡ បើកសិទ្ធិអូតូ (Auto Authorize 1-Click) មិនបាច់ផ្ញើ Key ទៅវិញទៅមក។
  - 💬 ប៊ូតុងចម្លងសារ Telegram ប្រាប់ភ្ញៀវស្រេចៗ។
  - 🚨 តាមដានអ្នកលួច Crack (Anti-Crack Tracker & Google Maps)។
  - 💰 សារជូនដំណឹងការបង់ប្រាក់ KHQR & Telegram Bot Alerts។
  - ☁️ Cloud Sync ២៤/៧ ជាមួយ Render Cloud។


