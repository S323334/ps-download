        // ==========================================
        // ==========================================
        // MULTI-LANGUAGE SYSTEM (Default: Chinese zh, Persists user choice)
        // ==========================================
        window.currentLang = localStorage.getItem('hongguo_app_lang');
        if (!window.currentLang || (window.currentLang !== 'zh' && window.currentLang !== 'km' && window.currentLang !== 'en' && window.currentLang !== 'original')) {
            window.currentLang = 'zh'; // Default is Chinese
        }
        var currentLang = window.currentLang;

        // Clean legacy machine translations if not yet migrated
        try {
            if (!localStorage.getItem('hg_trans_v3_clean')) {
                Object.keys(localStorage).forEach(k => {
                    if (k.startsWith('hg_trans_') && !k.startsWith('hg_trans_v3_')) {
                        localStorage.removeItem(k);
                    }
                });
                localStorage.setItem('hg_trans_v3_clean', '1');
            }
        } catch (e) {}

        const _CLIENT_TITLE_CACHE = new Map();
        let _pendingTransSet = new Set();
        let _transBatchTimer = null;

        window.I18N_DICT = {
            zh: {
                searchPlaceholder: "输入短剧片名搜索，或粘贴链接/ID提取...",
                btnFetch: "⚡ Fetch",
                btnSearch: "🔍 按片名搜索",
                libraryBtn: "📚 本地剧库",
                downloadsBtn: "⬇️ 下载列表",
                tabHot: "🔥 热门短剧",
                tabReal: "🎭 真实故事",
                tabComic: "🎨 漫改短剧",
                tabAI: "🤖 AI短剧",
                tabStarred: "⭐ 我的收藏",
                tabLibrary: "📁 本地剧库",
                trendingTitle: "🔥 热门短剧推荐",
                realDramaTitle: "🎭 真实故事短剧",
                comicDramaTitle: "🎨 漫改动画短剧",
                aiDramaTitle: "🤖 AI生成短剧",
                starredTitle: "⭐ 我的收藏剧集",
                libraryTitle: "📁 本地已下载短剧 (Offline Library)",
                searchResultsTitle: "🔍 搜索结果: ",
                cardPlay: "▶ 播放",
                cardDownload: "📥 下载",
                cardEps: "集",
                cardCompleted: "完结",
                cardOngoing: "连载中",
                playerSelectAll: "☑️ 全选",
                playerDeselectAll: "☒ 取消全选",
                playerDownloadSelected: "下载选中集数",
                tagDownloaded: "✓ 已下载",
                changeFolderBtn: "📁 更改目录",
                logBtn: "📜 下载日志",
                pdlTitle: "📥 下载进度与实时日志",
                pdlSeries: "短剧:",
                pdlEpisodes: "集数:",
                pdlStatus: "状态:",
                alertLinkInSearch: "⚠️ 这是剧集链接/ID，无法按片名搜索！请点击【⚡ Fetch 提取】按钮！",
                alertTitleInFetch: "⚠️ 这是短剧名称！请点击【🔍 按片名搜索 (Search Title)】按钮！",
                ctxPaste: "粘贴链接",
                ctxCut: "剪切",
                ctxCopy: "复制",
                ctxClear: "清空",
                // Episode Drawer & Batch Controls
                rangeLabel: "选集:",
                rangeDash: "至",
                rangeApply: "🎯 应用选集",
                drawerSubTitle: "完整剧集列表",
                drawerAutoNext: "自动下一集",
                streamBackText: "返回浏览",
                streamQueueText: "📥 + 加入队列",
                streamDownloadEpText: "⬇️ 下载本集",
                streamPrevEpText: "⏮ 上一集",
                streamNextEpText: "下一集 ⏭",
                watchlistBtnText: "追剧",
                streamShareText: "🔗 分享",
                // YouTube Downloader
                ytBadgeText: "⚡ yt-dlp & FFmpeg 4K 超清高速引擎",
                ytHeroSubtitle: "以最高画质下载 YouTube 视频 (支持 4K、1440p、1080p60 及 320kbps MP3 无损音质)",
                ytUrlPlaceholder: "粘贴 YouTube 视频链接 (例如 https://www.youtube.com/watch?v=... 或 Shorts)",
                ytClearBtnTitle: "清空",
                ytPasteBtnLabel: "Paste URL",
                ytAnalyzeBtnText: "⚡ 解析视频",
                ytHintLabel: "支持格式:",
                ytHintWatch: "🎬 普通视频 (Watch)",
                ytHintShorts: "⚡ YouTube Shorts",
                ytHintLink: "🔗 youtu.be 短链接",
                ytHintMusic: "🎵 YouTube Music",
                ytQualitySelectTitle: "🎯 选择分辨率与画质:",
                ytQualityTipBest: "🌟 自动最高画质 (4K/1080p)",
                ytQualityTip2160: "🌟 4K Ultra HD (3840×2160)",
                ytQualityTip1440: "💎 2K Quad HD (2560×1440)",
                ytQualityTip1080: "🎬 Full HD (1920×1080)",
                ytQualityTip720: "📺 HD (1280×720)",
                ytQualityTip480: "📱 SD 标清 (854×480)",
                ytQualityTipAudio: "🎵 MP3 纯音频 (320kbps)",
                ytQualityBest: "🌟 最高画质 (Auto)",
                ytQuality2160: "🌟 4K Ultra HD (2160p)",
                ytQuality1440: "💎 2K Quad HD (1440p)",
                ytQuality1080: "🎬 Full HD (1080p)",
                ytQuality720: "📺 HD (720p)",
                ytQuality480: "📱 SD (480p)",
                ytQualityAudio: "🎵 MP3 纯音频 (320kbps)",
                ytOutputDirLabel: "📁 保存位置:",
                ytChangeFolderBtnText: "📁 更改目录",
                ytDownloadBtnText: "📥 立即开始下载",
                ytOpenFolderBtnText: "📂 打开目录",
                ytTasksHeaderTitle: "📋 YouTube 下载列表",
                ytClearFinishedBtnText: "🗑️ 清除已完成",
                ytOpenTasksFolderBtnText: "📂 打开 YouTube 目录",
                ytEmptyTasksTitle: "暂无进行中的下载任务",
                ytEmptyTasksSub: "在上方粘贴 YouTube 链接并点击“解析视频”即可开始下载",
                ytStatusDownloading: "⬇️ 下载中",
                ytStatusMerging: "🔄 正在合并音视频 (FFmpeg)",
                ytStatusCompleted: "✅ 已完成",
                ytStatusCanceled: "⛔ 已取消",
                ytStatusFailed: "❌ 失败",
                ytTaskCancel: "✕ 取消",
                ytTaskOpenFile: "📂 打开文件",
                ytTaskEta: "⏱️ 剩余: ",
                ytDownloadingActive: "下载中",
                ytViews: "次观看",
                ytDateRecent: "📅 近期发布",
                ytAnalyzing: "正在解析...",
                ytToastPasted: "已粘贴！",
                ytToastPressCtrlV: "请按 Ctrl+V 粘贴链接",
                ytToastInvalidUrl: "请输入有效的 YouTube 链接 (例如 watch, shorts, youtu.be)！",
                ytToastAnalyzed: "视频解析成功！请选择分辨率后开始下载",
                ytToastAnalyzeFirst: "请先解析视频！",
                ytToastStarted: "🚀 已开始下载",
                ytToastCanceled: "已取消下载！",
                ytToastCancelError: "取消任务失败",
                ytToastCleared: "已清空已完成的任务！",
                ytToastFolderOpened: "已在资源管理器中打开 YouTube 目录！",
                ytToastFolderError: "无法打开目录",
                ytToastFolderSelected: "已更新 YouTube 保存目录！",
                // Downloads Drawer & Unified Library
                dlDrawerTitle: "下载管理与本地库",
                drawerTabActiveText: "正在下载",
                drawerTabLibText: "本地剧库",
                drawerTabMemText: "下载记忆",
                btnCleanLibText: "清理",
                btnClearMemText: "清空记忆",
                drawerActiveEmptyText: "暂无正在进行的下载任务",
                drawerActiveEmptySub: "短剧或 YouTube 视频下载将自动在此实时显示",
                drawerHgTitle: "🎬 网站短剧下载",
                drawerYtTitle: "▶️ YouTube 视频下载",
                drawerLibSummaryTitle: "已下载资源统计",
                drawerLibRefreshBtn: "刷新",
                drawerLibStatHgLabel: "短剧",
                drawerLibStatYtLabel: "YouTube",
                drawerLibStatDiskLabel: "占用空间",
                drawerBtnOpenHgFolder: "短剧保存目录",
                drawerBtnOpenYtFolder: "YouTube 目录",
                drawerLibHgSectionTitle: "🎬 已下载本地短剧",
                drawerLibYtSectionTitle: "▶️ 已下载 YouTube 视频",
                dlLiveSpeedLabel: "当前速度:",
                dlDonePrefix: "已完成:",
                dlFailedTitle: "⚠️ 失败集数:",
                dlLogsTitle: "活动日志:",
                dlOpenFolderBtnText: "📁 打开目录",
                dlRetryBtnText: "🔄 重试",
                dlCancelBtnText: "取消全部",
                // Settings Modal
                settingsModalTitle: "⚙️ 系统设置",
                settingsOutDirLabel: "视频下载保存目录:",
                settingsBrowseBtnText: "更改...",
                settingsThreadsLabel: "多任务同时下载线程数:",
                settingsCancelBtnText: "取消",
                settingsSaveBtnText: "保存设置",
                settingsUpdateTitle: "软件更新 (Software Update)",
                settingsCheckAgainText: "重新检查",
                settingsOneClickUpdateText: "点击此处立即更新软件 (Update Now)",
                // HaoSou (1DFX) Short Drama Platform
                hsTabLabel: "HAOSOU",
                hsHeroSubtitle: "海量免费短剧 在线播放与高速下载 (1080p 全高清)",
                hsOpenSiteLabel: "访问官方网站 (1dfx.com) ↗",
                hsDramaPlaceholder: "搜索短剧片名或粘贴链接 (https://dj.1dfx.com/v/newlist.php?book_id=... 或 ID)",
                hsPasteBtnLabel: "粘贴链接",
                hsSearchBtnText: "🔍 搜索 / 解析",
                hsSectionHotTitle: "热门短剧推荐",
                hsSectionSearchTitle: "搜索结果: ",
                hsBackToRecsText: "← 返回热门推荐",
                hsDownloadBtnText: "下载全集 (Download All)",
                hsTasksHeaderTitle: "好搜短剧下载列表",
                hsClearFinishedBtnText: "清理已完成",
                hsOpenFolderBtnText: "打开好搜目录",
                hsCatAll: "全部 (All)",
                hsCatModern: "现代都市 (Modern)",
                hsCatCeo: "霸总豪门 (CEO)",
                hsCatAction: "战神逆袭 (Action)",
                hsCatRebirth: "重生神豪 (Rebirth)",
                hsCatRomance: "甜宠虐恋 (Romance)",
                hsCatHist: "古装穿越 (Historical)",
                hsLoadMoreText: "加载更多精彩短剧 (Load More)"
            },
            km: {
                searchPlaceholder: "វាយឈ្មោះរឿងដើម្បីស្វែងរក ឬ បិទភ្ជាប់ Link ដើម្បី Fetch...",
                btnFetch: "⚡ Fetch",
                btnSearch: "🔍 ស្វែងរកតាមឈ្មោះ",
                libraryBtn: "📚 បណ្ណាល័យ",
                downloadsBtn: "⬇️ ទាញយក",
                tabHot: "🔥 ពេញនិយម",
                tabReal: "🎭 រឿងសម្ដែងពិត",
                tabComic: "🎨 គំនូរជីវចល",
                tabAI: "🤖 រឿង AI",
                tabStarred: "⭐ រឿងបានផ្កាយ",
                tabLibrary: "📁 បណ្ណាល័យ",
                trendingTitle: "🔥 កំពុងពេញនិយម",
                realDramaTitle: "🎭 រឿងសម្តែងពិត",
                comicDramaTitle: "🎨 រឿងគំនូរជីវចល",
                aiDramaTitle: "🤖 រឿងបង្កើតដោយ AI",
                starredTitle: "⭐ រឿងបានដាក់ផ្កាយ / Pin ទុកមើល",
                libraryTitle: "📁 បណ្ណាល័យរឿងដែលបានទាញយក (Offline Library)",
                searchResultsTitle: "🔍 លទ្ធផលស្វែងរក: ",
                cardPlay: "▶ មើល",
                cardDownload: "📥 ទាញយក",
                cardEps: "ភាគ",
                cardCompleted: "ចប់",
                cardOngoing: "កំពុងផ្សាយ",
                playerSelectAll: "☑️ ជ្រើសទាំងអស់",
                playerDeselectAll: "☒ ដោះជ្រើសទាំងអស់",
                playerDownloadSelected: "ទាញយកភាគដែលបានជ្រើស",
                tagDownloaded: "✓ បានដោន",
                changeFolderBtn: "📁 ផ្លាស់ប្តូរ Folder",
                logBtn: "📜 Log ដំណើរការ",
                pdlTitle: "📥 ដំណើរការទាញយក & Log",
                pdlSeries: "រឿង:",
                pdlEpisodes: "ភាគ:",
                pdlStatus: "ស្ថានភាព:",
                alertLinkInSearch: "⚠️ នេះជា Link/ID! មិនអាចស្វែងរកបានទេ។ សូមចុចប៊ូតុង【⚡ Fetch】!",
                alertTitleInFetch: "⚠️ នេះជាឈ្មោះរឿង! សូមចុចប៊ូតុង【🔍 ស្វែងរកតាមឈ្មោះ (Search Title)】!",
                ctxPaste: "ផាសលីង",
                ctxCut: "កាត់",
                ctxCopy: "ចម្លង",
                ctxClear: "សម្អាត",
                // Episode Drawer & Batch Controls
                rangeLabel: "រើសភាគ:",
                rangeDash: "ដល់",
                rangeApply: "🎯 ចាប់ផ្ដើមគ្រីស",
                drawerSubTitle: "បញ្ជីភាគទាំងអស់",
                drawerAutoNext: "ស្វ័យប្រវត្តិ",
                streamBackText: "ត្រឡប់ក្រោយ",
                streamQueueText: "📥 + ដាក់ក្នុងបញ្ជី",
                streamDownloadEpText: "⬇️ ទាញយកភាគនេះ",
                streamPrevEpText: "⏮ ភាគមុន",
                streamNextEpText: "ភាគបន្ទាប់ ⏭",
                watchlistBtnText: "បញ្ជីចង់មើល",
                streamShareText: "🔗 ចែករំលែក",
                // YouTube Downloader
                ytBadgeText: "⚡ yt-dlp & FFmpeg 4K Ultra HD ដំណើរការល្បឿនលឿន",
                ytHeroSubtitle: "ទាញយកវីដេអូ YouTube គុណភាពខ្ពស់បំផុត (4K, 1440p, 1080p60 & MP3 320kbps) ដោយមិនបាត់បង់គុណភាព",
                ytUrlPlaceholder: "បិទភ្ជាប់លីង YouTube (ឧទាហរណ៍ https://www.youtube.com/watch?v=... ឬ Shorts)",
                ytClearBtnTitle: "សម្អាត",
                ytPasteBtnLabel: "Paste URL",
                ytAnalyzeBtnText: "⚡ វិភាគវីដេអូ",
                ytHintLabel: "គាំទ្រ:",
                ytHintWatch: "🎬 វីដេអូទូទៅ (Watch)",
                ytHintShorts: "⚡ YouTube Shorts",
                ytHintLink: "🔗 youtu.be Link",
                ytHintMusic: "🎵 YouTube Music",
                ytQualitySelectTitle: "🎯 ជ្រើសរើសកម្រិតច្បាស់:",
                ytQualityTipBest: "🌟 ច្បាស់បំផុតស្វ័យប្រវត្តិ (Max Quality 4K/1080p)",
                ytQualityTip2160: "🌟 4K Ultra HD (3840×2160)",
                ytQualityTip1440: "💎 2K Quad HD (2560×1440)",
                ytQualityTip1080: "🎬 Full HD (1920×1080)",
                ytQualityTip720: "📺 HD (1280×720)",
                ytQualityTip480: "📱 SD (854×480)",
                ytQualityTipAudio: "🎵 សំឡេង MP3 (320kbps)",
                ytQualityBest: "🌟 កម្រិតច្បាស់បំផុត (Auto)",
                ytQuality2160: "🌟 4K Ultra HD (2160p)",
                ytQuality1440: "💎 2K Quad HD (1440p)",
                ytQuality1080: "🎬 Full HD (1080p)",
                ytQuality720: "📺 HD (720p)",
                ytQuality480: "📱 SD (480p)",
                ytQualityAudio: "🎵 សំឡេង MP3 (320kbps)",
                ytOutputDirLabel: "📁 រក្សាទុកនៅ:",
                ytChangeFolderBtnText: "📁 ប្ដូរ Folder",
                ytDownloadBtnText: "📥 ចាប់ផ្ដើមទាញយកឥឡូវនេះ",
                ytOpenFolderBtnText: "📂 បើក Folder",
                ytTasksHeaderTitle: "📋 បញ្ជីទាញយក YouTube",
                ytClearFinishedBtnText: "🗑️ សម្អាតដែលចប់",
                ytOpenTasksFolderBtnText: "📂 បើក Folder YouTube",
                ytEmptyTasksTitle: "មិនទាន់មានវីដេអូកំពុងទាញយកនៅឡើយទេ",
                ytEmptyTasksSub: "បិទភ្ជាប់លីង YouTube ខាងលើ រួចចុច \"វិភាគវីដេអូ\" ដើម្បីចាប់ផ្ដើមទាញយក",
                ytStatusDownloading: "⬇️ កំពុងទាញយក",
                ytStatusMerging: "🔄 កំពុងបញ្ចូលសំឡេង (FFmpeg)",
                ytStatusCompleted: "✅ រួចរាល់",
                ytStatusCanceled: "⛔ បានបោះបង់",
                ytStatusFailed: "❌ បរាជ័យ",
                ytTaskCancel: "✕ បោះបង់",
                ytTaskOpenFile: "📂 បើក File",
                ytTaskEta: "⏱️ នៅសល់: ",
                ytDownloadingActive: "កំពុងដោន",
                ytViews: "ដង",
                ytDateRecent: "📅 ថ្មីៗនេះ",
                ytAnalyzing: "កំពុងវិភាគ...",
                ytToastPasted: "បានបិទភ្ជាប់!",
                ytToastPressCtrlV: "សូមចុច Ctrl+V ដើម្បីបិទភ្ជាប់",
                ytToastInvalidUrl: "សូមបញ្ចូល Link YouTube ដែលត្រឹមត្រូវ (e.g. watch, shorts, youtu.be)!",
                ytToastAnalyzed: "បានវិភាគវីដេអូរួចរាល់! ជ្រើសរើសកម្រិតច្បាស់ដើម្បីទាញយក",
                ytToastAnalyzeFirst: "សូមវិភាគវីដេអូជាមុនសិន!",
                ytToastStarted: "🚀 បានចាប់ផ្ដើមទាញយក",
                ytToastCanceled: "បានបោះបង់ការទាញយក!",
                ytToastCancelError: "កំហុសពេលបោះបង់",
                ytToastCleared: "បានសម្អាតបញ្ជីរួចរាល់!",
                ytToastFolderOpened: "បានបើក Folder YouTube ក្នុង Explorer!",
                ytToastFolderError: "មិនអាចបើក Folder បានទេ",
                ytToastFolderSelected: "បានជ្រើសរើស Folder ថ្មី!",
                // Downloads Drawer & Unified Library
                dlDrawerTitle: "គ្រប់គ្រងការទាញយក & បណ្ណាល័យ",
                drawerTabActiveText: "កំពុងដំណើរការ",
                drawerTabLibText: "បណ្ណាល័យ",
                drawerTabMemText: "ទាញយក (អង្គចងចាំ)",
                btnCleanLibText: "សម្អាត",
                btnClearMemText: "ឃ្លាសម្អាតប្រវត្តិ",
                drawerActiveEmptyText: "មិនមានវីដេអូកំពុងដំណើរការទាញយកទេ",
                drawerActiveEmptySub: "រឿងភាគ ឬ វីដេអូ YouTube ដែលកំពុងដោន នឹងបង្ហាញទីនេះដោយស្វ័យប្រវត្តិ",
                drawerHgTitle: "🎬 រឿងភាគពី Website (Hongguo)",
                drawerYtTitle: "▶️ វីដេអូ YouTube",
                drawerLibSummaryTitle: "សរុបឯកសារបានដោន",
                drawerLibRefreshBtn: "ផ្ទុកឡើងវិញ",
                drawerLibStatHgLabel: "រឿងភាគ",
                drawerLibStatYtLabel: "YouTube",
                drawerLibStatDiskLabel: "ទំហំផ្ទុក",
                drawerBtnOpenHgFolder: "Folder រឿងភាគ",
                drawerBtnOpenYtFolder: "Folder YouTube",
                drawerLibHgSectionTitle: "🎬 រឿងភាគដែលបានទាញយក",
                drawerLibYtSectionTitle: "▶️ វីដេអូ YouTube ដែលបានទាញយក",
                dlLiveSpeedLabel: "ល្បឿនបច្ចុប្បន្ន:",
                dlDonePrefix: "បានបញ្ចប់:",
                dlFailedTitle: "⚠️ ភាគដែលបរាជ័យ:",
                dlLogsTitle: "កំណត់ហេតុសកម្មភាព:",
                dlOpenFolderBtnText: "📁 បើក Folder",
                dlRetryBtnText: "🔄 Retry",
                dlCancelBtnText: "បោះបង់ទាំងអស់",
                // Settings Modal
                settingsModalTitle: "⚙️ ការកំណត់ប្រព័ន្ធ",
                settingsOutDirLabel: "ទីតាំងរក្សាទុកវីដេអូ:",
                settingsBrowseBtnText: "ផ្លាស់ប្ដូរ...",
                settingsThreadsLabel: "ចំនួន Threads ទាញយកស្របគ្នា:",
                settingsCancelBtnText: "បោះបង់",
                settingsSaveBtnText: "រក្សាទុក",
                settingsUpdateTitle: "ធ្វើបច្ចុប្បន្នភាពកម្មវិធី (Software Update)",
                settingsCheckAgainText: "ពិនិត្យមើលឡើងវិញ",
                settingsOneClickUpdateText: "ចុចត្រង់នេះដើម្បី Update យកមុខងារថ្មីឥឡូវនេះ (Update Now)",
                // HaoSou (1DFX) Short Drama Platform
                hsTabLabel: "HAOSOU",
                hsHeroSubtitle: "រឿងភាគខ្លីចិនរាប់ម៉ឺនរឿង មើលនិងទាញយកឥតគិតថ្លៃ (10,000+ Free Short Dramas, Full HD 1080p)",
                hsOpenSiteLabel: "ចូលទៅកាន់វេបសាយផ្ទាល់ (1dfx.com) ↗",
                hsDramaPlaceholder: "ស្វែងរករឿងភាគខ្លី (Chinese Drama) ឬបិទភ្ជាប់លីង (https://dj.1dfx.com/v/newlist.php?book_id=... ឬ ID)",
                hsPasteBtnLabel: "Paste URL",
                hsSearchBtnText: "🔍 ស្វែងរក / វិភាគ",
                hsSectionHotTitle: "រឿងភាគពេញនិយម (Hot Recommendations)",
                hsSectionSearchTitle: "លទ្ធផលស្វែងរក: ",
                hsBackToRecsText: "← ត្រឡប់ទៅរឿងពេញនិយម",
                hsDownloadBtnText: "ទាញយកភាគទាំងអស់ (Download All)",
                hsTasksHeaderTitle: "បញ្ជីទាញយក HaoSou (Downloads)",
                hsClearFinishedBtnText: "សម្អាតដែលចប់",
                hsOpenFolderBtnText: "បើក Folder",
                hsCatAll: "ទាំងអស់ (All)",
                hsCatModern: "ទីក្រុង (Modern)",
                hsCatCeo: "អភិជន (CEO)",
                hsCatAction: "វាយបក (Action)",
                hsCatRebirth: "កើតជាថ្មី (Rebirth)",
                hsCatRomance: "ស្នេហា (Romance)",
                hsCatHist: "បុរាណ (Historical)",
                hsLoadMoreText: "ផ្ទុកបន្ថែមរឿងភាគច្រើនទៀត (Load More Dramas)"
            },
            en: {
                searchPlaceholder: "Enter drama title to search, or paste link/ID to fetch...",
                btnFetch: "⚡ Fetch",
                btnSearch: "🔍 Search Title",
                libraryBtn: "📚 Library",
                downloadsBtn: "⬇️ Downloads",
                tabHot: "🔥 Trending",
                tabReal: "🎭 Real Drama",
                tabComic: "🎨 Comic Drama",
                tabAI: "🤖 AI Drama",
                tabStarred: "⭐ Starred",
                tabLibrary: "📁 Library",
                trendingTitle: "🔥 Trending Short Dramas",
                realDramaTitle: "🎭 Live Action Real Dramas",
                comicDramaTitle: "🎨 Comic & Anime Short Dramas",
                aiDramaTitle: "🤖 AI Generated Short Dramas",
                starredTitle: "⭐ Starred & Pinned Dramas",
                libraryTitle: "📁 Downloaded Offline Library",
                searchResultsTitle: "🔍 Search Results: ",
                cardPlay: "▶ Play",
                cardDownload: "📥 Download",
                cardEps: "EPs",
                cardCompleted: "Completed",
                cardOngoing: "Ongoing",
                playerSelectAll: "☑️ Select All",
                playerDeselectAll: "☒ Deselect All",
                playerDownloadSelected: "Download Selected",
                tagDownloaded: "✓ Saved",
                changeFolderBtn: "📁 Change Folder",
                logBtn: "📜 Download Logs",
                pdlTitle: "📥 Download Progress & Logs",
                pdlSeries: "Series:",
                pdlEpisodes: "Episodes:",
                pdlStatus: "Status:",
                alertLinkInSearch: "⚠️ This is a Link/ID! Cannot search title. Please click [⚡ Fetch]!",
                alertTitleInFetch: "⚠️ This is a drama title! Please click [🔍 Search Title]!",
                ctxPaste: "Paste Link",
                ctxCut: "Cut",
                ctxCopy: "Copy",
                ctxClear: "Clear",
                // Episode Drawer & Batch Controls
                rangeLabel: "Episodes:",
                rangeDash: "to",
                rangeApply: "🎯 Select Range",
                drawerSubTitle: "Complete Episode List",
                drawerAutoNext: "Auto-Next",
                streamBackText: "Back to Browse",
                streamQueueText: "📥 + Queue Series",
                streamDownloadEpText: "⬇️ Download Ep",
                streamPrevEpText: "⏮ Prev Ep",
                streamNextEpText: "Next Ep ⏭",
                watchlistBtnText: "Watchlist",
                streamShareText: "🔗 Share",
                // YouTube Downloader
                ytBadgeText: "⚡ yt-dlp & FFmpeg 4K Ultra HD Engine",
                ytHeroSubtitle: "Download YouTube videos in maximum resolution (4K, 1440p, 1080p60 & 320kbps MP3 audio) seamlessly",
                ytUrlPlaceholder: "Paste YouTube link (e.g. https://www.youtube.com/watch?v=... or Shorts)",
                ytClearBtnTitle: "Clear",
                ytPasteBtnLabel: "Paste URL",
                ytAnalyzeBtnText: "⚡ Fetch Video",
                ytHintLabel: "Supports:",
                ytHintWatch: "🎬 Regular Videos (Watch)",
                ytHintShorts: "⚡ YouTube Shorts",
                ytHintLink: "🔗 youtu.be Shortlinks",
                ytHintMusic: "🎵 YouTube Music",
                ytQualitySelectTitle: "🎯 Select Resolution & Quality:",
                ytQualityTipBest: "🌟 Best Quality Auto (Max Quality 4K/1080p)",
                ytQualityTip2160: "🌟 4K Ultra HD (3840×2160)",
                ytQualityTip1440: "💎 2K Quad HD (2560×1440)",
                ytQualityTip1080: "🎬 Full HD (1920×1080)",
                ytQualityTip720: "📺 HD (1280×720)",
                ytQualityTip480: "📱 SD (854×480)",
                ytQualityTipAudio: "🎵 MP3 Audio (320kbps)",
                ytQualityBest: "🌟 Max Quality (Auto)",
                ytQuality2160: "🌟 4K Ultra HD (2160p)",
                ytQuality1440: "💎 2K Quad HD (1440p)",
                ytQuality1080: "🎬 Full HD (1080p)",
                ytQuality720: "📺 HD (720p)",
                ytQuality480: "📱 SD (480p)",
                ytQualityAudio: "🎵 MP3 Audio (320kbps)",
                ytOutputDirLabel: "📁 Save to:",
                ytChangeFolderBtnText: "📁 Change Folder",
                ytDownloadBtnText: "📥 Download Now",
                ytOpenFolderBtnText: "📂 Open Folder",
                ytTasksHeaderTitle: "📋 YouTube Downloads",
                ytClearFinishedBtnText: "🗑️ Clear Finished",
                ytOpenTasksFolderBtnText: "📂 Open YouTube Folder",
                ytEmptyTasksTitle: "No downloads in queue",
                ytEmptyTasksSub: "Paste a YouTube link above and click \"Fetch Video\" to start downloading",
                ytStatusDownloading: "⬇️ Downloading",
                ytStatusMerging: "🔄 Merging Audio (FFmpeg)",
                ytStatusCompleted: "✅ Completed",
                ytStatusCanceled: "⛔ Canceled",
                ytStatusFailed: "❌ Failed",
                ytTaskCancel: "✕ Cancel",
                ytTaskOpenFile: "📂 Open File",
                ytTaskEta: "⏱️ ETA: ",
                ytDownloadingActive: "downloading",
                ytViews: "views",
                ytDateRecent: "📅 Recent",
                ytAnalyzing: "Analyzing...",
                ytToastPasted: "Pasted!",
                ytToastPressCtrlV: "Please press Ctrl+V to paste link",
                ytToastInvalidUrl: "Please enter a valid YouTube link (e.g. watch, shorts, youtu.be)!",
                ytToastAnalyzed: "Video analyzed! Select resolution to download",
                ytToastAnalyzeFirst: "Please analyze a video first!",
                ytToastStarted: "🚀 Download started",
                ytToastCanceled: "Download canceled!",
                ytToastCancelError: "Error canceling download",
                ytToastCleared: "Cleared finished downloads!",
                ytToastFolderOpened: "Opened YouTube folder in Explorer!",
                ytToastFolderError: "Cannot open folder",
                ytToastFolderSelected: "Updated YouTube download folder!",
                // Downloads Drawer & Unified Library
                dlDrawerTitle: "Downloads & Library Manager",
                drawerTabActiveText: "In Progress",
                drawerTabLibText: "Offline Library",
                drawerTabMemText: "Downloads (Memory)",
                btnCleanLibText: "Clean",
                btnClearMemText: "Clear History",
                drawerActiveEmptyText: "No active downloads in progress",
                drawerActiveEmptySub: "Dramas or YouTube videos currently downloading will appear here automatically",
                drawerHgTitle: "🎬 Website Drama Downloads",
                drawerYtTitle: "▶️ YouTube Downloads",
                drawerLibSummaryTitle: "Downloaded Library Stats",
                drawerLibRefreshBtn: "Refresh",
                drawerLibStatHgLabel: "Dramas",
                drawerLibStatYtLabel: "YouTube",
                drawerLibStatDiskLabel: "Disk Space",
                drawerBtnOpenHgFolder: "Drama Folder",
                drawerBtnOpenYtFolder: "YouTube Folder",
                drawerLibHgSectionTitle: "🎬 Downloaded Drama Series",
                drawerLibYtSectionTitle: "▶️ Downloaded YouTube Videos",
                dlLiveSpeedLabel: "Current Speed:",
                dlDonePrefix: "Completed:",
                dlFailedTitle: "⚠️ Failed Episodes:",
                dlLogsTitle: "Activity Logs:",
                dlOpenFolderBtnText: "📁 Open Folder",
                dlRetryBtnText: "🔄 Retry",
                dlCancelBtnText: "Cancel All",
                // Settings Modal
                settingsModalTitle: "⚙️ System Settings",
                settingsOutDirLabel: "Download Output Directory:",
                settingsBrowseBtnText: "Browse...",
                settingsThreadsLabel: "Concurrent Download Threads:",
                settingsCancelBtnText: "Cancel",
                settingsSaveBtnText: "Save Settings",
                settingsUpdateTitle: "Software Update",
                settingsCheckAgainText: "Check Again",
                settingsOneClickUpdateText: "Click Here to Update App Now (Update Now)",
                // HaoSou (1DFX) Short Drama Platform
                hsTabLabel: "HAOSOU",
                hsHeroSubtitle: "Tens of thousands of free Chinese short dramas - Watch & Download in Full HD 1080p",
                hsOpenSiteLabel: "Open Official Website (1dfx.com) ↗",
                hsDramaPlaceholder: "Search Chinese drama or paste link (https://dj.1dfx.com/v/newlist.php?book_id=... or ID)",
                hsPasteBtnLabel: "Paste URL",
                hsSearchBtnText: "🔍 Search / Analyze",
                hsSectionHotTitle: "Hot Recommendations",
                hsSectionSearchTitle: "Search Results: ",
                hsBackToRecsText: "← Back to Recommendations",
                hsDownloadBtnText: "Download All Episodes",
                hsTasksHeaderTitle: "HaoSou Download Tasks",
                hsClearFinishedBtnText: "Clear Finished",
                hsOpenFolderBtnText: "Open Folder",
                hsCatAll: "All (全部)",
                hsCatModern: "Modern (都市)",
                hsCatCeo: "Billionaire CEO (总裁)",
                hsCatAction: "Action (战神)",
                hsCatRebirth: "Rebirth (重生)",
                hsCatRomance: "Romance (甜宠)",
                hsCatHist: "Historical (古装)",
                hsLoadMoreText: "Load More Dramas"
            }
        };
        window.I18N_DICT.original = Object.assign({}, window.I18N_DICT.en);
        var I18N_DICT = window.I18N_DICT;

        function getYtQualityLabel(qualityId, height) {
            const dict = I18N_DICT[currentLang] || I18N_DICT['zh'];
            if (qualityId === 'best') return dict.ytQualityBest;
            if (qualityId === '2160') return dict.ytQuality2160;
            if (qualityId === '1440') return dict.ytQuality1440;
            if (qualityId === '1080') return dict.ytQuality1080;
            if (qualityId === '720') return dict.ytQuality720;
            if (qualityId === '480') return dict.ytQuality480;
            if (qualityId === 'audio') return dict.ytQualityAudio;
            return height ? `${height}p` : qualityId;
        }

        function getYtQualityTip(qualityId) {
            const dict = I18N_DICT[currentLang] || I18N_DICT['zh'];
            if (qualityId === 'best') return dict.ytQualityTipBest;
            if (qualityId === '2160') return dict.ytQualityTip2160;
            if (qualityId === '1440') return dict.ytQualityTip1440;
            if (qualityId === '1080') return dict.ytQualityTip1080;
            if (qualityId === '720') return dict.ytQualityTip720;
            if (qualityId === '480') return dict.ytQualityTip480;
            if (qualityId === 'audio') return dict.ytQualityTipAudio;
            return dict.ytQualitySelectTitle;
        }

        const CATEGORY_MAP_CLIENT = {
            km: {
                '玄幻': 'ទេពអប្សរ', '修真': 'យុទ្ធសិល្ប៍ទេព', '修仙': 'ហាត់ក្លាយជាទេព',
                '逆袭': 'ផ្លាស់ប្តូរវាសនា', '逆袭翻身': 'ផ្លាស់ប្តូរវាសនា', '萌宝': 'កូនតូចឆ្លាតវៃ',
                '都市': 'ទីក្រុងទំនើប', '豪门': 'គ្រួសារអភិជន', '异能': 'សមត្ថភាពពិសេស',
                '穿越': 'ឆ្លងភព', '恋爱': 'ស្នេហា', '爱情': 'ស្នេហា', '古风爱情': 'ស្នេហាបុរាណ',
                '都市爱情': 'ស្នេហាទីក្រុង', '女性成长': 'នារីរឹងមាំ', '成长': 'ការតស៊ូ',
                '多重身份': 'អត្តសញ្ញាណសម្ងាត់', '战神': 'ស្ដេចសឹក', '神医': 'គ្រូពេទ្យទេព',
                '仙医': 'គ្រូពេទ្យទេព', '总裁': 'លោកប្រធាន', '霸总': 'លោកប្រធានផ្តាច់ការ',
                '甜宠': 'ស្នេហាផ្អែមល្ហែម', '虐恋': 'ស្នេហាកម្សត់', '复仇': 'ការសងសឹក',
                '虐渣': 'កម្ចាត់មនុស្សអាក្រក់', '重生': 'ចាប់ជាតិថ្មី', '短剧': 'រឿងខ្លី',
                '古装': 'បុរាណ', '悬疑': 'អាថ៌កំបាំង', '科幻': 'វិទ្យាសាស្ត្រ',
                '喜剧': 'កំប្លែង', '动作': 'វាយប្រហារ', '家庭': 'គ្រួសារ',
                '家庭伦理': 'ជីវិតគ្រួសារ', '脑洞': 'គំនិតច្នៃប្រឌិត', '玄幻脑洞': 'ពិភពទេពអប្សរ',
                '系统': 'ប្រព័ន្ធពិសេស', '剧情': 'រឿងភាគ', '现代': 'សម័យថ្មី',
                '情感': 'មនោសញ្ចេតនា', '都市情感': 'មនោសញ្ចេតនាទីក្រុង', '古风': 'បុរាណ',
                '民国': 'សម័យសាធារណរដ្ឋ', '职场': 'កន្លែងធ្វើការ', '惊悚': 'រន្ធត់'
            },
            en: {
                '玄幻': 'Fantasy', '修真': 'Cultivation', '修仙': 'Immortality',
                '逆袭': 'Counterattack', '逆袭翻身': 'Comeback', '萌宝': 'Cute Baby',
                '都市': 'Urban', '豪门': 'Billionaire', '异能': 'Superpower',
                '穿越': 'Time Travel', '恋爱': 'Romance', '爱情': 'Romance', '古风爱情': 'Period Romance',
                '都市爱情': 'Urban Romance', '女性成长': 'Female Growth', '成长': 'Growth',
                '多重身份': 'Secret Identity', '战神': 'God of War', '神医': 'Miracle Doctor',
                '仙医': 'Divine Doctor', '总裁': 'CEO', '霸总': 'Dominant CEO',
                '甜宠': 'Sweet Love', '虐恋': 'Melodrama', '复仇': 'Revenge',
                '虐渣': 'Slapping Scumbags', '重生': 'Rebirth', '短剧': 'Short Drama',
                '古装': 'Historical', '悬疑': 'Mystery', '科幻': 'Sci-Fi',
                '喜剧': 'Comedy', '动作': 'Action', '家庭': 'Family',
                '家庭伦理': 'Family Drama', '脑洞': 'Fantasy Twist', '玄幻脑洞': 'Magical Fantasy',
                '系统': 'System Powers', '剧情': 'Drama', '现代': 'Modern',
                '情感': 'Emotional', '都市情感': 'Urban Emotion', '古风': 'Historical',
                '民国': 'Republican Era', '职场': 'Workplace', '惊悚': 'Thriller'
            }
        };

        function getDisplayCategory(rawCat) {
            if (!rawCat) return (currentLang === 'en' || currentLang === 'original') ? 'Short Drama' : (currentLang === 'zh' ? '短剧' : 'រឿងភាគខ្លី');
            const cat = Array.isArray(rawCat) ? rawCat[0] : String(rawCat);
            if (!cat) return (currentLang === 'en' || currentLang === 'original') ? 'Short Drama' : (currentLang === 'zh' ? '短剧' : 'រឿងភាគខ្លី');
            if (currentLang === 'zh' || currentLang === 'original') return cat; // Return original Chinese category in original or zh mode
            const map = CATEGORY_MAP_CLIENT[currentLang] || CATEGORY_MAP_CLIENT.km;
            if (map[cat]) return map[cat];
            for (const [k, v] of Object.entries(map)) {
                if (cat.includes(k)) return v;
            }
            return currentLang === 'en' ? 'Drama' : 'រឿងភាគ';
        }

        function getSectionTitle(cat) {
            const dict = I18N_DICT[currentLang] || I18N_DICT['zh'];
            if (cat === 'all') return dict.trendingTitle;
            if (cat === 'real-drama') return dict.realDramaTitle;
            if (cat === 'comic-drama') return dict.comicDramaTitle;
            if (cat === 'ai-drama') return dict.aiDramaTitle;
            if (cat === 'starred') return dict.starredTitle;
            if (cat === 'library') return dict.libraryTitle;
            return dict.trendingTitle;
        }

        function changeLanguage(lang) {
            if (!lang || (lang !== 'zh' && lang !== 'km' && lang !== 'en' && lang !== 'original')) return;
            currentLang = lang;
            try {
                localStorage.setItem('hongguo_app_lang', lang);
            } catch (e) {}

            const sel = document.getElementById('langSelect');
            if (sel && sel.value !== lang) sel.value = lang;

            applyLanguageUI();
            applyDramaTitlesTranslation();
            if (currentCategory === 'library') {
                renderLibraryView();
            } else if (currentCategory === 'starred') {
                renderStarredDramasView();
            } else if (allDramas && allDramas.length) {
                renderDramaGrid(allDramas);
            }
            if (typeof currentSeries !== 'undefined' && currentSeries && currentSeries.series_id) {
                populateStreamDetails(currentSeries);
            }
            // Re-render YouTube view if active
            if (typeof currentYtVideo !== 'undefined' && currentYtVideo) {
                renderYouTubeVideoCard(currentYtVideo);
            }
            if (typeof fetchYouTubeTasks === 'function') {
                fetchYouTubeTasks();
            }
            // Re-render HaoSou view if loaded or active
            if (typeof _lastHaoSouItems !== 'undefined' && _lastHaoSouItems && _lastHaoSouItems.length) {
                renderHaoSouCards(_lastHaoSouItems);
            }
            if (typeof currentHsDrama !== 'undefined' && currentHsDrama && currentHsDrama.title) {
                renderHaoSouDetail(currentHsDrama);
            }
            // Re-render MVFFM view if loaded or active
            if (typeof _allMvItems !== 'undefined' && _allMvItems && _allMvItems.length) {
                renderMvffmCards(_allMvItems.slice(0, _mvRenderLimit || 24));
            }
            if (typeof currentMvDrama !== 'undefined' && currentMvDrama && currentMvDrama.title) {
                renderMvffmDetail(currentMvDrama);
            }
            // Re-render Starred view if active
            if (typeof renderGlobalStarredGrid === 'function') {
                renderGlobalStarredGrid();
            }
            updateVisibleTitlesOnPage();
        }

        function initLanguage() {
            currentLang = localStorage.getItem('hongguo_app_lang') || 'zh';
            if (currentLang !== 'zh' && currentLang !== 'km' && currentLang !== 'en' && currentLang !== 'original') currentLang = 'zh';
            const sel = document.getElementById('langSelect');
            if (sel) sel.value = currentLang;
            applyLanguageUI();
        }

        function updateLibraryCountBadge(count) {
            const badge = document.getElementById('libraryCountBadge');
            if (badge) {
                if (count > 0) {
                    badge.innerText = count;
                    badge.style.display = 'inline-block';
                } else {
                    badge.style.display = 'none';
                }
            }
        }

        function applyLanguageUI() {
            const dict = I18N_DICT[currentLang] || I18N_DICT['zh'];

            // 1. Search Box & Actions
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.placeholder = dict.searchPlaceholder;
            const btnFetch = document.getElementById('btnFetchLink');
            if (btnFetch) btnFetch.innerText = dict.btnFetch;
            const btnSearch = document.getElementById('btnSearchTitle');
            if (btnSearch) btnSearch.innerText = dict.btnSearch;
            const hgPasteBtnLabel = document.getElementById('hgPasteBtnLabel');
            if (hgPasteBtnLabel) hgPasteBtnLabel.innerText = dict.ctxPaste || 'Paste URL';

            // 2. Header Buttons
            const btnStar = document.getElementById('btnHeaderStarred');
            if (btnStar) {
                const starBadge = document.getElementById('globalStarredBadge');
                const badgeDisp = starBadge && starBadge.style.display ? starBadge.style.display : 'none';
                const badgeVal = starBadge ? starBadge.innerText : '0';
                btnStar.innerHTML = `<span>⭐</span> <span id="headerStarredText">PIN</span> <span class="badge" id="globalStarredBadge" style="display:${badgeDisp}; margin-left:4px;">${badgeVal}</span>`;
            }

            const btnLib = document.getElementById('btnHeaderLibrary');
            if (btnLib) {
                const libBadge = document.getElementById('libraryCountBadge');
                const badgeDisp = libBadge && libBadge.style.display ? libBadge.style.display : 'none';
                const badgeVal = libBadge ? libBadge.innerText : '0';
                const dlBadge = document.getElementById('activeDlCount');
                const dlDisp = dlBadge && dlBadge.style.display ? dlBadge.style.display : 'none';
                const dlVal = dlBadge ? dlBadge.innerText : '0';
                btnLib.innerHTML = `<span>📚</span> <span id="headerLibraryText">${dict.libraryBtn.replace('📚 ', '')}</span> <span class="badge" id="libraryCountBadge" style="display:${badgeDisp}; margin-left:4px;">${badgeVal}</span> <span class="badge" id="activeDlCount" style="display:${dlDisp}; background:#0ea5e9; margin-left:4px;">${dlVal}</span>`;
            }

            // 2b. Sidebar Download Folder Widget
            const sfTitle = document.getElementById('sidebarFolderTitle');
            const sfOpenText = document.getElementById('sidebarFolderOpenText');
            const sfHint = document.getElementById('sidebarFolderChangeHint');
            const sfAction = document.getElementById('sidebarFolderActionLabel');
            if (currentLang === 'zh') {
                if (sfTitle) sfTitle.innerText = '下载保存目录 (FOLDER)';
                if (sfOpenText) sfOpenText.innerText = '打开';
                if (sfHint) sfHint.innerText = '点击更换保存目录';
                if (sfAction) sfAction.innerText = '选择';
            } else if (currentLang === 'en') {
                if (sfTitle) sfTitle.innerText = 'DOWNLOAD FOLDER';
                if (sfOpenText) sfOpenText.innerText = 'Open';
                if (sfHint) sfHint.innerText = 'Click to change folder';
                if (sfAction) sfAction.innerText = 'Select';
            } else {
                if (sfTitle) sfTitle.innerText = 'ថតផ្ទុកវីដេអូ (FOLDER)';
                if (sfOpenText) sfOpenText.innerText = 'បើក';
                if (sfHint) sfHint.innerText = 'ចុចដើម្បីរើស Folder ថ្មី';
                if (sfAction) sfAction.innerText = 'រើស';
            }

            // 3. Category Tabs
            const tabAll = document.querySelector('.tab-btn[data-cat="all"]');
            if (tabAll) tabAll.innerText = dict.tabHot;
            const tabReal = document.querySelector('.tab-btn[data-cat="real-drama"]');
            if (tabReal) tabReal.innerText = dict.tabReal;
            const tabComic = document.querySelector('.tab-btn[data-cat="comic-drama"]');
            if (tabComic) tabComic.innerText = dict.tabComic;
            const tabAI = document.querySelector('.tab-btn[data-cat="ai-drama"]');
            if (tabAI) tabAI.innerText = dict.tabAI;

            const tabStarred = document.getElementById('tabStarred');
            if (tabStarred) {
                const badge = document.getElementById('starredCountBadge');
                const badgeDisp = badge && badge.style.display ? badge.style.display : 'none';
                const badgeVal = badge ? badge.innerText : '0';
                tabStarred.innerHTML = `${dict.tabStarred} <span class="badge" id="starredCountBadge" style="display:${badgeDisp}; margin-left:4px;">${badgeVal}</span>`;
            }

            // 3b. Drawer & Unified Library Translations
            const tabActiveText = document.getElementById('drawerTabActiveText');
            if (tabActiveText) tabActiveText.innerText = dict.drawerTabActiveText || 'កំពុងដំណើរការ';
            const tabLibText = document.getElementById('drawerTabLibText');
            if (tabLibText) tabLibText.innerText = dict.drawerTabLibText || 'បណ្ណាល័យ';
            const tabMemText = document.getElementById('drawerTabMemText');
            if (tabMemText) tabMemText.innerText = dict.drawerTabMemText || 'ទាញយក (អង្គចងចាំ)';
            const btnCleanLibText = document.getElementById('btnCleanLibText');
            if (btnCleanLibText) btnCleanLibText.innerText = dict.btnCleanLibText || 'សម្អាត';
            const btnClearMemText = document.getElementById('btnClearMemText');
            if (btnClearMemText) btnClearMemText.innerText = dict.btnClearMemText || 'ឃ្លាសម្អាតប្រវត្តិ';
            const hgSecTitle = document.getElementById('drawerHgTitle');
            if (hgSecTitle) hgSecTitle.innerText = dict.drawerHgTitle || '🎬 រឿងភាគពី Website (Hongguo)';
            const ytSecTitle = document.getElementById('drawerYtTitle');
            if (ytSecTitle) ytSecTitle.innerText = dict.drawerYtTitle || '▶️ វីដេអូ YouTube';
            const emptyActText = document.getElementById('drawerActiveEmptyText');
            if (emptyActText) emptyActText.innerText = dict.drawerActiveEmptyText || 'មិនមានវីដេអូកំពុងដំណើរការទាញយកទេ';
            const libSumTitle = document.getElementById('drawerLibSummaryTitle');
            if (libSumTitle) libSumTitle.innerText = dict.drawerLibSummaryTitle || 'ស្ថិតិបណ្ណាល័យរឿងដែលបានទាញយក';
            const libRefBtn = document.getElementById('drawerLibRefreshBtn');
            if (libRefBtn) libRefBtn.innerText = dict.drawerLibRefreshBtn || 'ផ្ទុកឡើងវិញ';
            const statHgLbl = document.getElementById('drawerLibStatHgLabel');
            if (statHgLbl) statHgLbl.innerText = dict.drawerLibStatHgLabel || 'រឿងភាគ';
            const statYtLbl = document.getElementById('drawerLibStatYtLabel');
            if (statYtLbl) statYtLbl.innerText = dict.drawerLibStatYtLabel || 'YouTube';
            const statDiskLbl = document.getElementById('drawerLibStatDiskLabel');
            if (statDiskLbl) statDiskLbl.innerText = dict.drawerLibStatDiskLabel || 'ទំហំផ្ទុក';
            const btnOpenHgF = document.getElementById('drawerBtnOpenHgFolder');
            if (btnOpenHgF) btnOpenHgF.innerText = dict.drawerBtnOpenHgFolder || 'Folder រឿងភាគ';
            const btnOpenYtF = document.getElementById('drawerBtnOpenYtFolder');
            if (btnOpenYtF) btnOpenYtF.innerText = dict.drawerBtnOpenYtFolder || 'Folder YouTube';
            const libHgSecT = document.getElementById('drawerLibHgSectionTitle');
            if (libHgSecT) libHgSecT.innerText = dict.drawerLibHgSectionTitle || '🎬 រឿងភាគដែលបានទាញយក';
            const libYtSecT = document.getElementById('drawerLibYtSectionTitle');
            if (libYtSecT) libYtSecT.innerText = dict.drawerLibYtSectionTitle || '▶️ វីដេអូ YouTube ដែលបានទាញយក';

            // 4. Section Header Title
            const secTitle = document.getElementById('sectionTitle');
            if (secTitle) {
                if (currentQuery) {
                    secTitle.innerText = `${dict.searchResultsTitle}"${currentQuery}"`;
                } else {
                    secTitle.innerText = getSectionTitle(currentCategory);
                }
            }

            // 5. Action buttons on cards
            document.querySelectorAll('.card-btn-play').forEach(b => { b.innerText = dict.cardPlay; });
            document.querySelectorAll('.card-btn-dl').forEach(b => { b.innerText = dict.cardDownload; });
            document.querySelectorAll('.btn-card-play').forEach(b => {
                b.innerHTML = `<span>▶</span> ${dict.cardPlay.replace('▶ ', '')}`;
            });
            document.querySelectorAll('.btn-card:not(.btn-card-play)').forEach(b => {
                b.innerHTML = `<span>📥</span> ${dict.cardDownload.replace('📥 ', '')}`;
            });

            // 6. Batch Download Controls in Drawer
            const checkAllText = document.getElementById('checkAllText');
            if (checkAllText && currentEpisodes && currentEpisodes.length) {
                const allSelected = currentEpisodes.every(e => selectedEpisodes.has(e.index));
                checkAllText.innerText = allSelected ? dict.playerDeselectAll : dict.playerSelectAll;
            }
            const btnBatchDlText = document.getElementById('btnBatchDlText');
            if (btnBatchDlText) btnBatchDlText.innerText = dict.playerDownloadSelected;
            const rangeTextLabel = document.getElementById('rangeTextLabel');
            if (rangeTextLabel) rangeTextLabel.innerText = dict.rangeLabel;
            const rangeDashText = document.getElementById('rangeDashText');
            if (rangeDashText) rangeDashText.innerText = dict.rangeDash;
            const btnRangeApplyText = document.getElementById('btnRangeApplyText');
            if (btnRangeApplyText) btnRangeApplyText.innerText = dict.rangeApply;

            document.querySelectorAll('.ep-subtag.tag-downloaded').forEach(t => {
                t.innerText = dict.tagDownloaded;
            });

            // Sync topbar 1-click language switcher buttons
            document.querySelectorAll('.topbar-lang-btn').forEach(btn => {
                if (btn.getAttribute('data-lang') === currentLang) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            // 7. Player Header & Log Panel Controls
            const streamFolderBtn = document.getElementById('streamFolderBtnText');
            if (streamFolderBtn && (!streamFolderBtn.dataset.hasCustomPath)) {
                streamFolderBtn.innerText = dict.changeFolderBtn;
            }
            const streamLogBtn = document.getElementById('streamLogBtnText');
            if (streamLogBtn) streamLogBtn.innerText = dict.logBtn;
            const pdlTitle = document.getElementById('pdlTitleText');
            if (pdlTitle) pdlTitle.innerText = dict.pdlTitle;
            const pdlSeriesLbl = document.getElementById('pdlSeriesLabel');
            if (pdlSeriesLbl) pdlSeriesLbl.innerText = dict.pdlSeries;
            const pdlEpsLbl = document.getElementById('pdlEpsLabel');
            if (pdlEpsLbl) pdlEpsLbl.innerText = dict.pdlEpisodes;
            const pdlStatLbl = document.getElementById('pdlStatusLabel');
            if (pdlStatLbl) pdlStatLbl.innerText = dict.pdlStatus;

            // 8. Search Context Menu
            const ctxPaste = document.getElementById('ctxPasteLabel');
            if (ctxPaste) ctxPaste.innerText = dict.ctxPaste;
            const ctxCut = document.getElementById('ctxCutLabel');
            if (ctxCut) ctxCut.innerText = dict.ctxCut;
            const ctxCopy = document.getElementById('ctxCopyLabel');
            if (ctxCopy) ctxCopy.innerText = dict.ctxCopy;
            const ctxClear = document.getElementById('ctxClearLabel');
            if (ctxClear) ctxClear.innerText = dict.ctxClear;

            // 9. Drawer Head Labels
            const drawerSub = document.getElementById('drawerSubTitle');
            if (drawerSub) drawerSub.innerText = dict.drawerSubTitle;
            const drawerAutoNext = document.getElementById('drawerAutoNextLabel');
            if (drawerAutoNext) drawerAutoNext.innerText = dict.drawerAutoNext;

            // 10. Stream Back & Action Buttons
            const streamBackText = document.getElementById('btnStreamBackText');
            if (streamBackText) streamBackText.innerText = dict.streamBackText;
            const btnQueueText = document.getElementById('btnStreamQueueText');
            if (btnQueueText) btnQueueText.innerText = dict.streamQueueText;
            const btnDlEpText = document.getElementById('btnStreamDownloadEpText');
            if (btnDlEpText) btnDlEpText.innerText = dict.streamDownloadEpText;
            const btnPrevText = document.getElementById('btnStreamPrevEpText');
            if (btnPrevText) btnPrevText.innerText = dict.streamPrevEpText;
            const btnNextText = document.getElementById('btnStreamNextEpText');
            if (btnNextText) btnNextText.innerText = dict.streamNextEpText;
            const watchlistText = document.getElementById('watchlistBtnText');
            if (watchlistText) watchlistText.innerText = dict.watchlistBtnText;
            const shareText = document.getElementById('btnStreamShareText');
            if (shareText) shareText.innerText = dict.streamShareText;

            // 11. YouTube View UI Elements
            const ytBadge = document.getElementById('ytHeroBadgeText');
            if (ytBadge) ytBadge.textContent = dict.ytBadgeText;
            const ytSub = document.getElementById('ytHeroSubtitle');
            if (ytSub) ytSub.textContent = dict.ytHeroSubtitle;
            const ytInp = document.getElementById('ytUrlInput');
            if (ytInp) ytInp.placeholder = dict.ytUrlPlaceholder;
            const ytClearBtn = document.getElementById('ytClearBtn');
            if (ytClearBtn) ytClearBtn.title = dict.ytClearBtnTitle;
            const ytPasteLbl = document.getElementById('ytPasteBtnLabel');
            if (ytPasteLbl) ytPasteLbl.textContent = dict.ytPasteBtnLabel;
            const ytAnalyzeBtn = document.getElementById('ytAnalyzeBtnText');
            if (ytAnalyzeBtn) ytAnalyzeBtn.textContent = dict.ytAnalyzeBtnText;

            const ytHintLbl = document.getElementById('ytHintLabel');
            if (ytHintLbl) ytHintLbl.textContent = dict.ytHintLabel;
            const ytHW = document.getElementById('ytHintWatch');
            if (ytHW) ytHW.textContent = dict.ytHintWatch;
            const ytHS = document.getElementById('ytHintShorts');
            if (ytHS) ytHS.textContent = dict.ytHintShorts;
            const ytHL = document.getElementById('ytHintLink');
            if (ytHL) ytHL.textContent = dict.ytHintLink;
            const ytHM = document.getElementById('ytHintMusic');
            if (ytHM) ytHM.textContent = dict.ytHintMusic;

            const ytQualityTitle = document.getElementById('ytQualitySelectTitle');
            if (ytQualityTitle) ytQualityTitle.textContent = dict.ytQualitySelectTitle;
            const ytQualityTip = document.getElementById('ytQualityTip');
            if (ytQualityTip) ytQualityTip.textContent = getYtQualityTip(selectedYtQuality || 'best');

            const ytOutLbl = document.getElementById('ytOutputDirLabel');
            if (ytOutLbl) ytOutLbl.textContent = dict.ytOutputDirLabel;
            const ytChgFld = document.getElementById('ytChangeFolderBtnText');
            if (ytChgFld) ytChgFld.textContent = dict.ytChangeFolderBtnText;
            const ytDlBtn = document.getElementById('ytDownloadBtnText');
            if (ytDlBtn) ytDlBtn.textContent = dict.ytDownloadBtnText;
            const ytOpFld = document.getElementById('ytOpenFolderBtnText');
            if (ytOpFld) ytOpFld.textContent = dict.ytOpenFolderBtnText;

            const ytTasksTitle = document.getElementById('ytTasksHeaderTitle');
            if (ytTasksTitle) ytTasksTitle.textContent = dict.ytTasksHeaderTitle;
            const ytClrFin = document.getElementById('ytClearFinishedBtnText');
            if (ytClrFin) ytClrFin.textContent = dict.ytClearFinishedBtnText;
            const ytOpTasksFld = document.getElementById('ytOpenTasksFolderBtnText');
            if (ytOpTasksFld) ytOpTasksFld.textContent = dict.ytOpenTasksFolderBtnText;
            const ytEmptyTitle = document.getElementById('ytEmptyTasksTitle');
            if (ytEmptyTitle) ytEmptyTitle.textContent = dict.ytEmptyTasksTitle;
            const ytEmptySub = document.getElementById('ytEmptyTasksSub');
            if (ytEmptySub) ytEmptySub.textContent = dict.ytEmptyTasksSub;

            // Update visible quality chips if rendered
            const qualityChips = document.querySelectorAll('.yt-quality-chip');
            qualityChips.forEach(chip => {
                const qId = chip.dataset.qualityId;
                const qHeight = chip.dataset.qualityHeight;
                if (qId) {
                    const labelSpan = chip.querySelector('span:not(.yt-chip-res-tag)');
                    if (labelSpan) {
                        labelSpan.textContent = getYtQualityLabel(qId, qHeight);
                    }
                }
            });

            // 12. Downloads Drawer & Modals
            const dlDrawerTitle = document.getElementById('dlDrawerTitle');
            if (dlDrawerTitle) dlDrawerTitle.innerText = dict.dlDrawerTitle;
            const dlLiveSpeedLabel = document.getElementById('dlLiveSpeedLabel');
            if (dlLiveSpeedLabel) dlLiveSpeedLabel.innerText = dict.dlLiveSpeedLabel;
            const dlDoneUnit = document.getElementById('dlDoneUnit');
            if (dlDoneUnit) dlDoneUnit.innerText = dict.cardEps;
            const dlFailedTitle = document.getElementById('dlFailedTitle');
            if (dlFailedTitle) dlFailedTitle.innerText = dict.dlFailedTitle;
            const dlLogsTitle = document.getElementById('dlLogsTitle');
            if (dlLogsTitle) dlLogsTitle.innerText = dict.dlLogsTitle;
            const dlOpenFld = document.getElementById('dlOpenFolderBtnText');
            if (dlOpenFld) dlOpenFld.innerText = dict.dlOpenFolderBtnText;
            const dlRetry = document.getElementById('dlRetryBtnText');
            if (dlRetry) dlRetry.innerText = dict.dlRetryBtnText;
            const dlCancel = document.getElementById('dlCancelBtnText');
            if (dlCancel) dlCancel.innerText = dict.dlCancelBtnText;

            // 13. Settings Modal
            const setModalTitle = document.getElementById('settingsModalTitle');
            if (setModalTitle) setModalTitle.innerText = dict.settingsModalTitle;
            const setOutLbl = document.getElementById('settingsOutDirLabel');
            if (setOutLbl) setOutLbl.innerText = dict.settingsOutDirLabel;
            const setBrwBtn = document.getElementById('settingsBrowseBtnText');
            if (setBrwBtn) setBrwBtn.innerText = dict.settingsBrowseBtnText;
            const setThrLbl = document.getElementById('settingsThreadsLabel');
            if (setThrLbl) setThrLbl.innerText = dict.settingsThreadsLabel;
            const setCancel = document.getElementById('settingsCancelBtnText');
            if (setCancel) setCancel.innerText = dict.settingsCancelBtnText;
            const setSave = document.getElementById('settingsSaveBtnText');
            if (setSave) setSave.innerText = dict.settingsSaveBtnText;
            const setUpdateTitle = document.getElementById('settingsUpdateTitle');
            if (setUpdateTitle) setUpdateTitle.innerText = dict.settingsUpdateTitle || 'ធ្វើបច្ចុប្បន្នភាពកម្មវិធី (Software Update)';
            const btnUpAction = document.getElementById('btnUpdateActionText');
            if (btnUpAction && (!window._latestUpdateData || !window._latestUpdateData.has_update)) {
                btnUpAction.innerText = 'Update';
            }

            // 14. HaoSou (1DFX) Platform UI
            const hsTabLbl = document.getElementById('hsTabLabel');
            if (hsTabLbl) hsTabLbl.textContent = dict.hsTabLabel || '好搜短剧';
            const hsHeroSub = document.getElementById('hsHeroSubtitle');
            if (hsHeroSub) hsHeroSub.textContent = dict.hsHeroSubtitle || '';
            const hsOpenSite = document.getElementById('hsOpenSiteLabel');
            if (hsOpenSite) hsOpenSite.textContent = dict.hsOpenSiteLabel || 'ចូលទៅកាន់វេបសាយផ្ទាល់ (1dfx.com) ↗';
            const hsDramaInp = document.getElementById('hsDramaInput');
            if (hsDramaInp) hsDramaInp.placeholder = dict.hsDramaPlaceholder || '';
            const hsPasteLbl = document.getElementById('hsPasteBtnLabel');
            if (hsPasteLbl) hsPasteLbl.textContent = dict.hsPasteBtnLabel || 'Paste URL';
            const hsSearchBtn = document.getElementById('hsSearchBtnText');
            if (hsSearchBtn) hsSearchBtn.textContent = dict.hsSearchBtnText || '🔍 ស្វែងរក / វិភាគ';
            const hsBackRecs = document.getElementById('btnHsBackToRecsText');
            if (hsBackRecs) hsBackRecs.textContent = dict.hsBackToRecsText || '← ត្រឡប់ទៅរឿងពេញនិយម';
            const hsDlBtn = document.getElementById('hsDownloadBtnText');
            if (hsDlBtn) hsDlBtn.textContent = dict.hsDownloadBtnText || 'ទាញយកភាគទាំងអស់ (Download All)';
            const hsTasksTitle = document.getElementById('hsTasksHeaderTitle');
            if (hsTasksTitle) hsTasksTitle.textContent = dict.hsTasksHeaderTitle || 'បញ្ជីទាញយក HaoSou (Downloads)';
            const hsClrFin = document.getElementById('hsClearFinishedBtnText');
            if (hsClrFin) hsClrFin.textContent = dict.hsClearFinishedBtnText || 'សម្អាតដែលចប់';
            const hsOpFld = document.getElementById('hsOpenFolderBtnText');
            if (hsOpFld) hsOpFld.textContent = dict.hsOpenFolderBtnText || 'បើក Folder';

            // 14b. HaoSou Category Chips & Load More
            const elCatAll = document.getElementById('hsCatAll');
            if (elCatAll) elCatAll.textContent = dict.hsCatAll || 'ទាំងអស់ (All)';
            const elCatModern = document.getElementById('hsCatModern');
            if (elCatModern) elCatModern.textContent = dict.hsCatModern || 'ទីក្រុង (Modern)';
            const elCatCeo = document.getElementById('hsCatCeo');
            if (elCatCeo) elCatCeo.textContent = dict.hsCatCeo || 'អភិជន (CEO)';
            const elCatAction = document.getElementById('hsCatAction');
            if (elCatAction) elCatAction.textContent = dict.hsCatAction || 'វាយបក (Action)';
            const elCatRebirth = document.getElementById('hsCatRebirth');
            if (elCatRebirth) elCatRebirth.textContent = dict.hsCatRebirth || 'កើតជាថ្មី (Rebirth)';
            const elCatRomance = document.getElementById('hsCatRomance');
            if (elCatRomance) elCatRomance.textContent = dict.hsCatRomance || 'ស្នេហា (Romance)';
            const elCatHist = document.getElementById('hsCatHist');
            if (elCatHist) elCatHist.textContent = dict.hsCatHist || 'បុរាណ (Historical)';
            const elLoadMore = document.getElementById('hsLoadMoreText');
            if (elLoadMore) elLoadMore.textContent = dict.hsLoadMoreText || 'ផ្ទុកបន្ថែមរឿងភាគច្រើនទៀត (Load More Dramas)';
        }


        function getDisplayTitle(originalTitle) {
            if (!originalTitle) return '';
            if (currentLang === 'original') return originalTitle;
            if (currentLang === 'zh' && /^[\u4e00-\u9fa5\s0-9\p{P}]+$/u.test(originalTitle)) {
                return originalTitle;
            }
            if (currentLang === 'km' && /^[\u1780-\u17ff\s0-9\p{P}]+$/u.test(originalTitle)) {
                return originalTitle;
            }
            const cacheKey = `${currentLang}:${originalTitle}`;
            if (_CLIENT_TITLE_CACHE.has(cacheKey)) {
                return _CLIENT_TITLE_CACHE.get(cacheKey);
            }
            try {
                const local = localStorage.getItem(`hg_trans_v3_${currentLang}_${originalTitle}`);
                if (local) {
                    _CLIENT_TITLE_CACHE.set(cacheKey, local);
                    return local;
                }
            } catch (e) {}
            return originalTitle;
        }

        function queueTitleTranslation(originalTitle) {
            if (!originalTitle || currentLang === 'original') return;
            if (currentLang === 'zh' && /^[\u4e00-\u9fa5\s0-9\p{P}]+$/u.test(originalTitle)) return;
            if (currentLang === 'km' && /^[\u1780-\u17ff\s0-9\p{P}]+$/u.test(originalTitle)) return;

            const cacheKey = `${currentLang}:${originalTitle}`;
            if (_CLIENT_TITLE_CACHE.has(cacheKey)) return;
            try {
                const local = localStorage.getItem(`hg_trans_v3_${currentLang}_${originalTitle}`);
                if (local) {
                    _CLIENT_TITLE_CACHE.set(cacheKey, local);
                    return;
                }
            } catch (e) {}

            _pendingTransSet.add(originalTitle);
            if (_transBatchTimer) clearTimeout(_transBatchTimer);
            _transBatchTimer = setTimeout(flushPendingTranslations, 150);
        }

        async function flushPendingTranslations() {
            if (!_pendingTransSet.size) return;
            const targetLang = currentLang;
            const titles = Array.from(_pendingTransSet).slice(0, 30);
            _pendingTransSet.clear();

            try {
                const res = await fetch('/api/translate/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ texts: titles, to: targetLang })
                });
                if (!res.ok) return;
                const data = await res.json();
                const translations = data.translations || {};

                for (const [orig, trans] of Object.entries(translations)) {
                    if (trans) {
                        const cacheKey = `${targetLang}:${orig}`;
                        _CLIENT_TITLE_CACHE.set(cacheKey, trans);
                        try {
                            localStorage.setItem(`hg_trans_v3_${targetLang}_${orig}`, trans);
                        } catch (e) {}
                    }
                }
                if (currentLang === targetLang) {
                    updateVisibleTitlesOnPage();
                }
            } catch (e) {
                console.warn('Batch translation error:', e);
            }
        }

        function updateVisibleTitlesOnPage() {
            // Update Hongguo card titles
            document.querySelectorAll('.card-title[data-original-title]').forEach(el => {
                const orig = el.getAttribute('data-original-title');
                if (!orig) return;
                const display = getDisplayTitle(orig);
                el.innerText = display;
                el.setAttribute('title', display);
            });

            // Update MVFFM card titles
            document.querySelectorAll('.mv-card-title[data-original-title]').forEach(el => {
                const orig = el.getAttribute('data-original-title');
                if (!orig) return;
                const display = getDisplayTitle(orig);
                el.innerText = display;
                el.setAttribute('title', display);
            });

            // Update HaoSou card titles
            document.querySelectorAll('.hs-card-title[data-original-title]').forEach(el => {
                const orig = el.getAttribute('data-original-title');
                if (!orig) return;
                const display = getDisplayTitle(orig);
                el.innerText = display;
                el.setAttribute('title', display);
            });

            // Update Starred card titles
            document.querySelectorAll('.starred-card-title[data-original-title]').forEach(el => {
                const orig = el.getAttribute('data-original-title');
                if (!orig) return;
                const display = getDisplayTitle(orig);
                el.innerText = display;
                el.setAttribute('title', display);
            });

            // Update modal detail titles
            if (currentDetailSeries && currentDetailSeries.title) {
                const orig = currentDetailSeries.title;
                const display = getDisplayTitle(orig);
                const mDrama = document.getElementById('modalDramaTitle');
                if (mDrama) mDrama.innerText = display;
                const mTitle = document.getElementById('modalTitleText');
                if (mTitle) mTitle.innerText = display;
            }

            // Update player header titles
            if (currentSeries && currentSeries.title) {
                const orig = currentSeries.title;
                const display = getDisplayTitle(orig);
                const dt = document.getElementById('detailTitle');
                if (dt) dt.innerText = display;
                const mt = document.getElementById('modalTopTitle');
                if (mt) mt.innerText = display;
            }

            // Update MVFFM detail card title if displayed
            if (typeof currentMvDrama !== 'undefined' && currentMvDrama && currentMvDrama.title) {
                const mvTitleEl = document.getElementById('mvCardTitle');
                if (mvTitleEl) {
                    const disp = currentLang === 'original' ? currentMvDrama.title : getDisplayTitle(currentMvDrama.title);
                    mvTitleEl.textContent = disp;
                }
            }

            // Update YouTube card title if displayed
            if (typeof currentYtVideo !== 'undefined' && currentYtVideo && currentYtVideo.title) {
                const ytTitleEl = document.getElementById('ytCardTitle');
                if (ytTitleEl) {
                    const disp = currentLang === 'original' ? currentYtVideo.title : getDisplayTitle(currentYtVideo.title);
                    ytTitleEl.textContent = disp;
                }
            }

            // Update HaoSou detail card title if displayed
            if (typeof currentHsDrama !== 'undefined' && currentHsDrama && currentHsDrama.title) {
                const hsTitleEl = document.getElementById('hsCardTitle');
                if (hsTitleEl) {
                    const disp = currentLang === 'original' ? currentHsDrama.title : getDisplayTitle(currentHsDrama.title);
                    hsTitleEl.textContent = disp;
                }
            }

            // Update active YouTube task titles if displayed
            document.querySelectorAll('.yt-task-title[data-original-title]').forEach(el => {
                const orig = el.getAttribute('data-original-title');
                if (!orig) return;
                const display = currentLang === 'original' ? orig : getDisplayTitle(orig);
                el.innerText = display;
                el.setAttribute('title', display);
            });
        }

        function applyDramaTitlesTranslation() {
            const titleSelectors = '.card-title[data-original-title], .mv-card-title[data-original-title], .hs-card-title[data-original-title], .starred-card-title[data-original-title]';
            if (currentLang === 'original') {
                document.querySelectorAll(titleSelectors).forEach(el => {
                    const orig = el.getAttribute('data-original-title');
                    if (orig) {
                        el.innerText = orig;
                        el.setAttribute('title', orig);
                    }
                });
                const mDrama = document.getElementById('modalDramaTitle');
                if (mDrama && currentDetailSeries && currentDetailSeries.title) mDrama.innerText = currentDetailSeries.title;
                const mTitle = document.getElementById('modalTitleText');
                if (mTitle && currentDetailSeries && currentDetailSeries.title) mTitle.innerText = currentDetailSeries.title;
                const pTitle = document.getElementById('playerDramaTitle');
                if (pTitle && currentSeries && currentSeries.title) pTitle.innerText = currentSeries.title;
                const dt = document.getElementById('detailTitle');
                if (dt && currentSeries && currentSeries.title) dt.innerText = currentSeries.title;
                const mt = document.getElementById('modalTopTitle');
                if (mt && currentSeries && currentSeries.title) mt.innerText = currentSeries.title;
                if (typeof currentMvDrama !== 'undefined' && currentMvDrama && currentMvDrama.title) {
                    const mvTitleEl = document.getElementById('mvCardTitle');
                    if (mvTitleEl) mvTitleEl.textContent = currentMvDrama.title;
                }
                if (typeof currentYtVideo !== 'undefined' && currentYtVideo && currentYtVideo.title) {
                    const ytTitleEl = document.getElementById('ytCardTitle');
                    if (ytTitleEl) ytTitleEl.textContent = currentYtVideo.title;
                }
                if (typeof currentHsDrama !== 'undefined' && currentHsDrama && currentHsDrama.title) {
                    const hsTitleEl = document.getElementById('hsCardTitle');
                    if (hsTitleEl) hsTitleEl.textContent = currentHsDrama.title;
                }
                document.querySelectorAll('.yt-task-title[data-original-title]').forEach(el => {
                    const orig = el.getAttribute('data-original-title');
                    if (orig) {
                        el.innerText = orig;
                        el.setAttribute('title', orig);
                    }
                });
                return;
            }

            document.querySelectorAll(titleSelectors).forEach(el => {
                const orig = el.getAttribute('data-original-title');
                if (orig) {
                    const cached = getDisplayTitle(orig);
                    if (cached !== orig) {
                        el.innerText = cached;
                        el.setAttribute('title', cached);
                    } else {
                        queueTitleTranslation(orig);
                    }
                }
            });

            if (currentDetailSeries && currentDetailSeries.title) {
                queueTitleTranslation(currentDetailSeries.title);
            }
            if (currentSeries && currentSeries.title) {
                queueTitleTranslation(currentSeries.title);
            }
            if (typeof currentMvDrama !== 'undefined' && currentMvDrama && currentMvDrama.title) {
                const mvTitleEl = document.getElementById('mvCardTitle');
                if (mvTitleEl) {
                    const cached = getDisplayTitle(currentMvDrama.title);
                    if (cached !== currentMvDrama.title) {
                        mvTitleEl.textContent = cached;
                    } else {
                        queueTitleTranslation(currentMvDrama.title);
                    }
                }
            }
            if (typeof currentYtVideo !== 'undefined' && currentYtVideo && currentYtVideo.title) {
                const ytTitleEl = document.getElementById('ytCardTitle');
                if (ytTitleEl) {
                    const cached = getDisplayTitle(currentYtVideo.title);
                    if (cached !== currentYtVideo.title) {
                        ytTitleEl.textContent = cached;
                    } else {
                        queueTitleTranslation(currentYtVideo.title);
                    }
                }
            }
            if (typeof currentHsDrama !== 'undefined' && currentHsDrama && currentHsDrama.title) {
                const hsTitleEl = document.getElementById('hsCardTitle');
                if (hsTitleEl) {
                    const cached = getDisplayTitle(currentHsDrama.title);
                    if (cached !== currentHsDrama.title) {
                        hsTitleEl.textContent = cached;
                    } else {
                        queueTitleTranslation(currentHsDrama.title);
                    }
                }
            }
            document.querySelectorAll('.yt-task-title[data-original-title]').forEach(el => {
                const orig = el.getAttribute('data-original-title');
                if (orig) {
                    const cached = getDisplayTitle(orig);
                    if (cached !== orig) {
                        el.innerText = cached;
                        el.setAttribute('title', cached);
                    } else {
                        queueTitleTranslation(orig);
                    }
                }
            });
        }

        window.getDisplayTitle = getDisplayTitle;
        window.getDisplayCategory = getDisplayCategory;
        window.getSectionTitle = getSectionTitle;
        window.changeLanguage = changeLanguage;
        window.applyLanguageUI = applyLanguageUI;
        window.initLanguage = initLanguage;
        window.queueTitleTranslation = queueTitleTranslation;
        window.applyDramaTitlesTranslation = applyDramaTitlesTranslation;
