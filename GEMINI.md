# PS DOWNLOAD - Permanent Project Memory & Context (ខួរក្បាលចងចាំគម្រោង)

> ឯកសារនេះជាការចងចាំអចិន្ត្រៃយ៍ (Permanent Memory) របស់គម្រោង PS DOWNLOAD។ រាល់ពេលបើក Chat ថ្មី បិទបើកកុំព្យូទ័រ ឬដាច់ភ្លើង គ្រាន់តែអ្នកប្រើប្រាស់និយាយថា **"សួស្ដី"** AI នឹងអានឯកសារនេះភ្លាមៗ ដើម្បីដឹងពីបរិបទគម្រោង និងការងារដែលត្រូវបន្ត។

---

## 1. ព័ត៌មានទូទៅនៃគម្រោង (Project Overview)
* **ឈ្មោះកម្មវិធី:** PS DOWNLOAD (កំណែទម្រង់ v3.2.0)
* **ម្ចាស់ / Developer / Admin:** បង ពិសាល (`@Thpisal33`, Telegram Chat ID: `925539914`)
* **ភាសាប្រើប្រាស់ចម្បង:** ភាសាខ្មែរ (Khmer), ចិន (Chinese), អង់គ្លេស (English)
* **បច្ចេកវិទ្យា:** Electron Desktop App + Node.js Server (Port: `1994`) + Vanilla JS Frontend

---

## 2. ផ្ទាំងមុខងារសំខាន់ៗ (Platforms Supported)
1. **HONGGUO DRAMA:**
   * ស្វែងរកតាមចំណងជើងរឿង (Drama Title) ឬ Fetch តាម Link / Series ID
   * ការចុច **`📋 ផាសលីង` (Paste URL)** ឬ `Ctrl + V`: គ្រាន់តែបិទភ្ជាប់អក្សរចូល ហើយ**នៅស្ងៀម (Stay Still)** មិនដំណើរការស្វ័យប្រវត្តិនោះទេ ដើម្បីឱ្យអ្នកប្រើប្រាស់មានសិទ្ធិជ្រើសរើសចុច **【🔍 ស្វែងរកតាមឈ្មោះ】** (សម្រាប់ឈ្មោះរឿង) ឬ **【⚡ Fetch】** (សម្រាប់ Link/ID)។
2. **HAOSOU DRAMA:** ស្វែងរក និងទាញយករឿងភាគពីប្រភព HaoSou
3. **MVFFM DRAMA:** ស្វែងរក និងទាញយករឿងភាគពីប្រភព MVFFM
4. **YOUTUBE DOWNLOADER:** ទាញយកវីដេអូ YouTube កម្រិតរហូតដល់ 4K
5. **UNIFIED LIBRARY & PIN (STARRED):** បណ្ណាល័យគ្រប់គ្រងរឿងដែលបានទាញយករួច និងរឿងដែលបានដាក់ផ្កាយ (Bookmark)
6. **ADMIN PANEL (KEYGEN & TRACKER):**
   * ផ្ទាំងគ្រប់គ្រង Admin បង្កើត Key ជូនភ្ញៀវដោយផ្ទាល់លើកុំព្យូទ័រ (តាមប៊ូតុង `🔑 Admin` ក្នុង Sidebar ឬតាម Shortcut `🔑 PS DOWNLOAD - ADMIN KEYGEN.bat`)
   * បិទភ្ជាប់ Device ID របស់ភ្ញៀវ រួចជ្រើសរើសថ្ងៃ ហើយចុច **Generate Key** ឬ **Auto-Authorize** ភ្លាមៗ

---

## 3. ប្រព័ន្ធ License & Telegram Bot 24/7 (Security & Automation)
* **Hardware ID:** ភ្ជាប់ជាមួយ Device ID (ឧ. `HG-DBC0-79F8-FD0C`) ការពារការចម្លងកម្មវិធីទៅម៉ាស៊ីនផ្សេង
* **ប្រព័ន្ធកាត់សុពលភាព (Real-Time Countdown):** គណនាពេលវេលាពិតប្រាកដ ២៤/៧ ដោយផ្អែកលើកាលបរិច្ឆេទ `expires_at` និងបង្ហាញនាឡិកាវិនាទីរត់តក់ៗផ្ទាល់ភ្នែក
* **Telegram Bot 24/7 (`src/telegram_bot.js`):**
  * Admin Bot Polling រត់ស្វ័យប្រវត្តិ
  * ផ្ទៀងផ្ទាត់ការបាញ់លុយ ABA KHQR ស្វ័យប្រវត្ត និងបើកសោរ (Auto-Activate) ជូនភ្ញៀវភ្លាមៗ
  * មុខងារបញ្ជា Admin តាម Telegram: `/start`, `/keygen`, `/add`, `/online`, `/stats`

---

## 4. ស្ថានភាពការងារចុងក្រោយ (Current State & Recent Progress)
* **បានបញ្ចប់:**
  * កែសម្រួលប្រព័ន្ធ Paste ក្នុង Hongguo ឱ្យនៅស្ងៀមដូច `Ctrl + V` មិន Auto-Search ផ្ដេសផ្ដាស។
  * បែងចែកប៊ូតុងចុចដាច់ស្រេច៖ ឈ្មោះរឿងចុច【🔍 ស្វែងរកតាមឈ្មោះ】, Link ចុច【⚡ Fetch】 បើច្រឡំចុចខុសមានសារប្រាប់ត្រឹមត្រូវ។
  * កែសម្រួលផ្ទាំង Badge License ខាងក្រោមឱ្យបង្ហាញ ២ ជួរស្អាត (`👤 បង ពិសាល (Admin)` និង `⏳ នៅសល់ 6 ថ្ងៃ ...`) ដោយមិនកំបាំងលេខវិនាទីទៀតឡើយ។
  * បង្កើតប៊ូតុង `🔑 Admin` ផ្ទាល់នៅលើ Sidebar នៃកម្មវិធី ដើម្បីបើកផ្ទាំងបង្កើត Key លើកុំព្យូទ័រភ្លាមៗ។
  * រៀបចំ Folder `Upload_To_GitHub/` កំណែទម្រង់ v3.2.0 រួចរាល់ ដើម្បីត្រៀមឱ្យភ្ញៀវចាស់ Update និងបង្កើត Installer ថ្មីជូនភ្ញៀវថ្មី។
* **គោលការណ៍ឆ្លើយតបជាមួយ Admin:**
  * ឆ្លើយតបជាភាសាខ្មែរ រួសរាយ រហ័ស និងចំគោលដៅ។
  * រាល់ពេលកែសម្រួលកូដ ត្រូវរក្សាភាពស៊ីសង្វាក់គ្នារវាង `web/`, `src/` និង `Upload_To_GitHub/`។
