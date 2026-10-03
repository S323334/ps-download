/**
 * Advanced Drama Title Adapter & Translator
 * Produces natural, captivating, dramatic titles in Khmer and English.
 * Eliminates awkward machine-translated literalisms and Chinese characters.
 */

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config.js');

const CACHE_FILE = path.join(DATA_DIR, 'translations_cache.json');

// In-memory cache
const _CACHE = new Map();

// Load persistent cache
try {
  if (fs.existsSync(CACHE_FILE)) {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    for (const [k, v] of Object.entries(data)) {
      _CACHE.set(k, v);
    }
  }
} catch (e) {
  console.warn('[Translator] Failed to load cache:', e.message);
}

function persistCache() {
  try {
    const obj = {};
    for (const [k, v] of _CACHE.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {}
}

// Convert Chinese numerals to Arabic numbers
function chineseToArabicNum(numStr) {
  const map = {
    '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
    '六': '6', '七': '7', '八': '8', '九': '9', '十': '10',
    '十一': '11', '十二': '12', '十三': '13', '十四': '14', '十五': '15',
    '十六': '16', '十七': '17', '十八': '18', '十九': '19', '二十': '20'
  };
  return map[numStr] || numStr;
}

// Category translation mappings
const CATEGORY_MAP = {
  km: {
    '玄幻': 'ទេពអប្សរ',
    '修真': 'យុទ្ធសិល្ប៍ទេព',
    '修仙': 'ហាត់ក្លាយជាទេព',
    '逆袭': 'ផ្លាស់ប្តូរវាសនា',
    '逆袭翻身': 'ផ្លាស់ប្តូរវាសនា',
    '萌宝': 'កូនតូចឆ្លាតវៃ',
    '都市': 'ទីក្រុងទំនើប',
    '豪门': 'គ្រួសារអភិជន',
    '异能': 'សមត្ថភាពពិសេស',
    '穿越': 'ឆ្លងភព',
    '爱情': 'ស្នេហាបុរាណ',
    '古风爱情': 'ស្នេហាបុរាណ',
    '都市爱情': 'ស្នេហាទីក្រុង',
    '女性成长': 'នារីរឹងមាំ',
    '成长': 'ការតស៊ូ',
    '多重身份': 'អត្តសញ្ញាណសម្ងាត់',
    '战神': 'ស្ដេចសឹក',
    '神医': 'គ្រូពេទ្យទេព',
    '仙医': 'គ្រូពេទ្យទេព',
    '总裁': 'លោកប្រធាន',
    '霸总': 'លោកប្រធានផ្តាច់ការ',
    '甜宠': 'ស្នេហាផ្អែមល្ហែម',
    '虐恋': 'ស្នេហាកម្សត់',
    '复仇': 'ការសងសឹក',
    '虐渣': 'កម្ចាត់មនុស្សអាក្រក់',
    '重生': 'ចាប់ជាតិថ្មី',
    '短剧': 'រឿងខ្លី',
    '古装': 'បុរាណ',
    '悬疑': 'អាថ៌កំបាំង',
    '科幻': 'វិទ្យាសាស្ត្រ',
    '喜剧': 'កំប្លែង',
    '动作': 'វាយប្រហារ',
    '家庭': 'គ្រួសារ',
    '家庭伦理': 'ជីវិតគ្រួសារ',
    '脑洞': 'គំនិតច្នៃប្រឌិត',
    '玄幻脑洞': 'ពិភពទេពអប្សរ',
    '系统': 'ប្រព័ន្ធពិសេស',
    '剧情': 'រឿងភាគ',
    '暗恋成真': 'ស្នេហាសម្ងាត់',
    '日久生情': 'ស្នេហាយូរអង្វែង',
    '故人重逢': 'ជួបស្នេហាចាស់'
  },
  en: {
    '玄幻': 'Fantasy',
    '修真': 'Cultivation',
    '修仙': 'Immortality',
    '逆袭': 'Counterattack',
    '逆袭翻身': 'Comeback',
    '萌宝': 'Cute Baby',
    '都市': 'Urban',
    '豪门': 'Billionaire',
    '异能': 'Superpower',
    '穿越': 'Time Travel',
    '爱情': 'Romance',
    '古风爱情': 'Period Romance',
    '都市爱情': 'Urban Romance',
    '女性成长': 'Female Growth',
    '成长': 'Growth',
    '多重身份': 'Secret Identity',
    '战神': 'God of War',
    '神医': 'Miracle Doctor',
    '仙医': 'Divine Doctor',
    '总裁': 'CEO',
    '霸总': 'Dominant CEO',
    '甜宠': 'Sweet Love',
    '虐恋': 'Melodrama',
    '复仇': 'Revenge',
    '虐渣': 'Slapping Scumbags',
    '重生': 'Rebirth',
    '短剧': 'Short Drama',
    '古装': 'Historical',
    '悬疑': 'Mystery',
    '科幻': 'Sci-Fi',
    '喜剧': 'Comedy',
    '动作': 'Action',
    '家庭': 'Family',
    '家庭伦理': 'Family Drama',
    '脑洞': 'Fantasy Twist',
    '玄幻脑洞': 'Magical Fantasy',
    '系统': 'System Powers',
    '剧情': 'Drama',
    '暗恋成真': 'Secret Crush',
    '日久生情': 'Love Over Time',
    '故人重逢': 'Reunion'
  }
};

// Curated high-impact short drama title replacements
const SPECIFIC_TITLES = {
  '聚宝仙盆之杂灵根才是真BOSS第十二季': {
    km: 'ឆ្នាំងទិព្វវិសេស៖ កំពូលស្ដេចមេធំឫសទេព (វគ្គ ១២)',
    en: 'The Real Boss: Hybrid Spiritual Roots (Season 12)'
  },
  '聚宝仙盆之杂灵根才真BOSS第十二季': {
    km: 'ឆ្នាំងទិព្វវិសេស៖ កំពូលស្ដេចមេធំឫសទេព (វគ្គ ១២)',
    en: 'The Real Boss: Hybrid Spiritual Roots (Season 12)'
  },
  '绿意萌熹：蛙系萌娃闹翻忧郁老爸': {
    km: 'កូនស្រីតូចគួរឱ្យស្រលាញ់ ផ្លាស់ប្តូរជីវិតប៉ាៗ',
    en: 'Cute Baby Flips Grumpy Dad’s World'
  },
  '乡下来的掌上明珠': {
    km: 'គ្រាប់ពេជ្រសំណព្វចិត្តមកពីជនបទ',
    en: 'The Beloved Countryside Heiress'
  },
  '谁让这个文盲修仙的第四季': {
    km: 'អ្នកណាឱ្យមនុស្សសាមញ្ញក្លាយជាទេព (វគ្គ ៤)',
    en: 'Who Let This Ordinary Guy Cultivate Immortality? (Season 4)'
  },
  '难道这个文盲修仙的': {
    km: 'មនុស្សសាមញ្ញក្លាយជាទេព',
    en: 'The Ordinary Guy Cultivates Immortality'
  },
  '二嫁有喜': {
    km: 'ស្នេហាពិតនៃអាពាហ៍ពិពាហ៍លើកទី២',
    en: 'Blessed Romance in Second Marriage'
  },
  '二嫁喜事': {
    km: 'អាពាហ៍ពិពាហ៍លើកទី២ ជួបស្នេហាពិត',
    en: 'Second Marriage: Finding True Love'
  },
  '东北话事人': {
    km: 'មេធំកំពូលអ្នកលេងភូមិភាគឦសាន',
    en: 'The Big Boss of the Northeast'
  },
  '家有五女，穿越来的他连夜搞事业啦': {
    km: 'ឆ្លងភពមកជួបកូនស្រីទាំង៥៖ ដំណើរបង្កើតអាណាចក្រមុខជំនួញ',
    en: 'Transmigrated Father of Five Daughters: Building My Empire'
  },
  '换亲后，我被渣男小叔宠上天，连夜搞事业啦': {
    km: 'ក្រោយប្តូរគូដណ្តឹង៖ ពូថ្លៃស្រលាញ់ស្ទើរលេប ក្លាយជានារីជោគជ័យ',
    en: 'Substitute Bride: Spoiled by the Uncle, Dominating Business'
  },
  '凡人百世书第七季': {
    km: 'គម្ពីរមនុស្សសាមញ្ញរយជាតិ (វគ្គ ៧)',
    en: 'Chronicles of Mortal Lifetimes (Season 7)'
  },
  '蒙冤二十五年，归来举世皆惊': {
    km: 'ជាប់ទោសអយុត្តិធម៌ ២៥ ឆ្នាំ វិលត្រលប់កក្រើកលោក',
    en: 'Wronged for 25 Years: The Shocking Return'
  },
  '东北婆婆，笑护全家': {
    km: 'ម៉ែធ្មេញចិត្តល្អ ការពារគ្រួសារដោយក្ដីស្រលាញ់',
    en: 'Kind Mother-in-Law: Protecting the Family with Love'
  },
  '我的婆婆，我罩着': {
    km: 'កូនប្រសារការពារម៉ែធ្មេញ',
    en: 'I Will Protect My Mother-in-Law'
  },
  '女儿受辱，妈妈归来掀翻全场': {
    km: 'កូនស្រីត្រូវគេមើលងាយ ម្តាយវិលត្រលប់មកសងសឹកកក្រើកឆាក',
    en: 'Daughter Humiliated: Mother Returns for Sweet Revenge'
  },
  '盛律师的离婚前规则': {
    km: 'លក្ខខណ្ឌមុនលែងលះរបស់មេធាវីកំពូល',
    en: 'Top Lawyer Sheng: Rules Before Divorce'
  },
  '亿万斯年': {
    km: 'ស្នេហាមហាសេដ្ឋីរាប់ពាន់ឆ្នាំ',
    en: 'Billionaire Love Across the Years'
  },
  '盛总，太太只留孩子不留您': {
    km: 'លោកប្រធានសេង៖ ភរិយាយកតែកូន មិនត្រូវការលោកឡើយ',
    en: 'CEO Sheng: Madam Keeps the Kids, Leaves You Behind'
  },
  'Hello继承者': {
    km: 'ជំរាបសួរអ្នកស្នងមរតក',
    en: 'Hello Heir'
  },
  '一梦青玄，团宠小师妹一剑毁天灭地第六季': {
    km: 'ក្ដីស្រមៃឈីងស្វៀន៖ សំណព្វចិត្តបងៗ ដាវទេពកក្រើកមេឃដី (វគ្គ ៦)',
    en: 'Beloved Little Sister: Sword Shakes Heaven & Earth (Season 6)'
  },
  '废物垫底皇子，反倒成为千古一帝': {
    km: 'ព្រះរាជបុត្រដែលគេមើលងាយ ក្លាយជាមហាអធិរាជរាប់ពាន់ឆ្នាំ',
    en: 'The Underestimated Prince Becomes the Eternal Emperor'
  },
  '贵妃将我赎身钱送乞丐，重生后我夺回一切': {
    km: 'ព្រះស្នំយកប្រាក់លោះខ្ញុំឱ្យស្មូម កើតជាថ្មីខ្ញុំដណ្តើមយកគ្រប់យ៉ាងមកវិញ',
    en: 'Betrayed by the Consort: Reborn to Reclaim Everything'
  },
  '重生！丑小鸭逆袭成了万人迷第二季': {
    km: 'ចាប់ជាតិថ្មី! ពីកូនទាអាក្រក់មើល ក្លាយជាស្រីស្អាតសំណព្វចិត្តគ្រប់គ្នា (វគ្គ ២)',
    en: 'Reborn: Ugly Duckling Transforms Into Queen of Hearts (Season 2)'
  }
};

// Patterns for dynamic Short Drama translation
const PATTERNS_KM = [
  // Seasons
  { match: /第(\d+|[一二三四五六七八九十]+)季/g, rep: (m, p) => ` (វគ្គ ${chineseToArabicNum(p)})` },
  // Common Short Drama Tropes
  { match: /聚宝仙盆之杂灵根才[是真]+BOSS/g, rep: 'ឆ្នាំងទិព្វវិសេស៖ កំពូលស្ដេចមេធំឫសទេព' },
  { match: /聚宝仙盆/g, rep: 'ឆ្នាំងទិព្វវិសេស' },
  { match: /杂灵根/g, rep: 'ឫសទេព' },
  { match: /绿意萌[熹蠢][：:]蛙系萌娃闹翻忧郁老爸/g, rep: 'កូនស្រីតូចគួរឱ្យស្រលាញ់ ផ្លាស់ប្តូរជីវិតប៉ាៗ' },
  { match: /乡下来的掌上明珠/g, rep: 'គ្រាប់ពេជ្រសំណព្វចិត្តមកពីជនបទ' },
  { match: /掌上明珠/g, rep: 'គ្រាប់ពេជ្រសំណព្វចិត្ត' },
  { match: /谁让这个文盲修仙的/g, rep: 'អ្នកណាឱ្យមនុស្សសាមញ្ញក្លាយជាទេព' },
  { match: /文盲修仙/g, rep: 'មនុស្សសាមញ្ញក្លាយជាទេព' },
  { match: /二嫁有喜/g, rep: 'ស្នេហាពិតនៃអាពាហ៍ពិពាហ៍លើកទី២' },
  { match: /二嫁喜事/g, rep: 'អាពាហ៍ពិពាហ៍លើកទី២ ជួបស្នេហាពិត' },
  { match: /二嫁/g, rep: 'អាពាហ៍ពិពាហ៍លើកទី២' },
  { match: /东北话事人/g, rep: 'មេធំកំពូលអ្នកលេងភូមិភាគឦសាន' },
  { match: /话事人/g, rep: 'មេធំកំពូលអ្នកលេង' },
  { match: /无敌神医下山/g, rep: 'កំពូលគ្រូពេទ្យទេពចុះភ្នំ' },
  { match: /神医下山/g, rep: 'គ្រូពេទ្យទេពចុះភ្នំ' },
  { match: /神医/g, rep: 'គ្រូពេទ្យទេព' },
  { match: /仙医/g, rep: 'គ្រូពេទ្យទេព' },
  { match: /战神归来[：:]龙王殿/g, rep: 'ស្ដេចសឹកវិលត្រលប់៖ វិមានស្ដេចនាគ' },
  { match: /战神归来/g, rep: 'ស្ដេចសឹកវិលត្រលប់' },
  { match: /战神/g, rep: 'ស្ដេចសឹក' },
  { match: /龙王殿/g, rep: 'វិមានស្ដេចនាគ' },
  { match: /龙王/g, rep: 'ស្ដេចនាគ' },
  { match: /替嫁娇妻[：:]亿万总裁宠上天/g, rep: 'កូនក្រមុំជំនួសស្នេហ៍៖ លោកប្រធានមហាសេដ្ឋីស្រលាញ់ស្ទើរលេប' },
  { match: /替嫁娇妻/g, rep: 'កូនក្រមុំជំនួសស្នេហ៍' },
  { match: /替嫁/g, rep: 'កូនក្រមុំជំនួស' },
  { match: /亿万总裁宠上天/g, rep: 'លោកប្រធានមហាសេដ្ឋីស្រលាញ់ស្ទើរលេប' },
  { match: /总裁宠上天/g, rep: 'លោកប្រធានស្រលាញ់ស្ទើរលេប' },
  { match: /宠上天/g, rep: 'ស្រលាញ់ស្ទើរលេប' },
  { match: /夫人离婚后轰动全城/g, rep: 'ជំទាវកក្រើកពេញទីក្រុងក្រោយលែងលះ' },
  { match: /离婚后轰动全城/g, rep: 'កក្រើកពេញទីក្រុងក្រោយលែងលះ' },
  { match: /轰动全城/g, rep: 'កក្រើកពេញទីក្រុង' },
  { match: /惊艳全城/g, rep: 'អស្ចារ្យកក្រើកទីក្រុង' },
  { match: /离婚后/g, rep: 'ក្រោយពេលលែងលះ' },
  { match: /假千金/g, rep: 'កូនស្រីក្លែងក្លាយ' },
  { match: /真千金/g, rep: 'កូនស្រីពិតប្រាកដ' },
  { match: /真假千金/g, rep: 'កូនស្រីពិតកូនស្រីក្លែងក្លាយ' },
  { match: /千金/g, rep: 'កូនស្រីអភិជន' },
  { match: /闪婚/g, rep: 'រៀបការបន្ទាន់' },
  { match: /赘婿/g, rep: 'កូនប្រសារក្លាហាន' },
  { match: /狂婿/g, rep: 'កូនប្រសារកំពូលអ្នកក្លាហាន' },
  { match: /首富/g, rep: 'មហាសេដ្ឋីកំពូល' },
  { match: /大佬/g, rep: 'មេធំកំពូល' },
  { match: /萌宝助攻/g, rep: 'កូនតូចជួយស្នេហ៍' },
  { match: /萌娃/g, rep: 'កូនតូចឆ្លាតវៃ' },
  { match: /萌宝/g, rep: 'កូនតូចសំណព្វចិត្ត' },
  { match: /团宠小师妹/g, rep: 'សំណព្វចិត្តបងៗ' },
  { match: /团宠/g, rep: 'សំណព្វចិត្តគ្រប់គ្នា' },
  { match: /逆袭/g, rep: 'ផ្លាស់ប្តូរវាសនា' },
  { match: /重生/g, rep: 'ចាប់ជាតិថ្មី' },
  { match: /穿越/g, rep: 'ឆ្លងភព' },
  { match: /修仙/g, rep: 'ហាត់ក្លាយជាទេព' },
  { match: /修真/g, rep: 'យុទ្ធសិល្ប៍ទេព' },
  { match: /宗门/g, rep: 'បក្សយុទ្ធសិល្ប៍' },
  { match: /契约娇妻/g, rep: 'ភរិយាកិច្ចសន្យា' },
  { match: /契约/g, rep: 'កិច្ចសន្យា' },
  { match: /虐渣/g, rep: 'កម្ចាត់មនុស្សអាក្រក់' },
  { match: /复仇/g, rep: 'ការសងសឹក' },
  { match: /万人迷/g, rep: 'សំណព្វចិត្តគ្រប់គ្នា' },
  { match: /无敌/g, rep: 'កំពូលឥតគូប្រៀប' },
  { match: /绝世/g, rep: 'កំពូលឥតផ្ទឹម' },
  { match: /霸总/g, rep: 'លោកប្រធានផ្ដាច់ការ' },
  { match: /总裁/g, rep: 'លោកប្រធាន' },
  { match: /夫人/g, rep: 'ជំទាវ' }
];

const PATTERNS_EN = [
  { match: /第(\d+|[一二三四五六七八九十]+)季/g, rep: (m, p) => ` (Season ${chineseToArabicNum(p)})` },
  { match: /聚宝仙盆之杂灵根才[是真]+BOSS/g, rep: 'The Real Boss: Hybrid Spiritual Roots' },
  { match: /聚宝仙盆/g, rep: 'The Magic Treasure Basin' },
  { match: /杂灵根/g, rep: 'Hybrid Spiritual Roots' },
  { match: /绿意萌[熹蠢][：:]蛙系萌娃闹翻忧郁老爸/g, rep: 'Cute Baby Flips Grumpy Dad’s World' },
  { match: /乡下来的掌上明珠/g, rep: 'The Beloved Countryside Heiress' },
  { match: /掌上明珠/g, rep: 'Beloved Heiress' },
  { match: /谁让这个文盲修仙的/g, rep: 'Who Let This Ordinary Guy Cultivate Immortality?' },
  { match: /文盲修仙/g, rep: 'Ordinary Guy Cultivates Immortality' },
  { match: /二嫁有喜/g, rep: 'Blessed Romance in Second Marriage' },
  { match: /二嫁喜事/g, rep: 'Second Marriage: Finding True Love' },
  { match: /二嫁/g, rep: 'Second Marriage' },
  { match: /东北话事人/g, rep: 'The Big Boss of the Northeast' },
  { match: /话事人/g, rep: 'The Big Boss' },
  { match: /无敌神医下山/g, rep: 'The Invincible Miracle Doctor Descends' },
  { match: /神医下山/g, rep: 'The Miracle Doctor Descends' },
  { match: /神医/g, rep: 'Miracle Doctor' },
  { match: /仙医/g, rep: 'Divine Doctor' },
  { match: /战神归来[：:]龙王殿/g, rep: 'Return of the God of War: Dragon King Palace' },
  { match: /战神归来/g, rep: 'Return of the God of War' },
  { match: /战神/g, rep: 'God of War' },
  { match: /龙王殿/g, rep: 'Dragon King Palace' },
  { match: /替嫁娇妻[：:]亿万总裁宠上天/g, rep: 'Substitute Bride: Pampered by the Billionaire CEO' },
  { match: /替嫁娇妻/g, rep: 'The Substitute Bride' },
  { match: /替嫁/g, rep: 'Substitute Bride' },
  { match: /亿万总裁宠上天/g, rep: 'Pampered by the Billionaire CEO' },
  { match: /宠上天/g, rep: 'Deeply Cherished' },
  { match: /夫人离婚后轰动全城/g, rep: 'Madam Shakes the Entire City After Divorce' },
  { match: /轰动全城/g, rep: 'Shaking the Entire City' },
  { match: /离婚后/g, rep: 'After Divorce' },
  { match: /闪婚/g, rep: 'Flash Marriage' },
  { match: /假千金/g, rep: 'Fake Heiress' },
  { match: /真千金/g, rep: 'True Heiress' },
  { match: /真假千金/g, rep: 'True and Fake Heiress' },
  { match: /千金/g, rep: 'The Heiress' },
  { match: /赘婿/g, rep: 'The Invincible Son-in-Law' },
  { match: /狂婿/g, rep: 'The Fierce Son-in-Law' },
  { match: /首富/g, rep: 'The Richest Tycoon' },
  { match: /大佬/g, rep: 'The Big Boss' },
  { match: /萌宝/g, rep: 'Cute Baby' },
  { match: /萌娃/g, rep: 'Adorable Kid' },
  { match: /团宠/g, rep: 'Beloved by All' },
  { match: /逆袭/g, rep: 'Counterattack' },
  { match: /重生/g, rep: 'Rebirth' },
  { match: /穿越/g, rep: 'Time Travel' },
  { match: /修仙/g, rep: 'Immortal Cultivation' },
  { match: /契约/g, rep: 'Contract' },
  { match: /虐渣/g, rep: 'Slapping the Wicked' },
  { match: /复仇/g, rep: 'Sweet Revenge' },
  { match: /万人迷/g, rep: 'Queen of Hearts' },
  { match: /总裁/g, rep: 'Billionaire CEO' },
  { match: /霸总/g, rep: 'Dominant CEO' },
  { match: /夫人/g, rep: 'Madam' }
];

// Clean Google Translate oddities for Khmer
function polishKhmerTranslation(text) {
  let cleaned = text
    .replace(/\[Full Movie\]/gi, '[ពេញមួយរឿង]')
    .replace(/\(Full Movie\)/gi, '[ពេញមួយរឿង]')
    .replace(/\[Eng\s*Sub[^\]]*\]/gi, '[Eng Sub]')
    .replace(/\(Eng\s*Sub[^\)]*\)/gi, '[Eng Sub]')
    .replace(/Full Chinese Short Movie/gi, 'ភាពយន្តខ្លីចិនពេញមួយរឿង')
    .replace(/Chinese Short Movie/gi, 'ភាពយន្តខ្លីចិន')
    .replace(/Chinese Short Drama(s)?/gi, 'រឿងភាគខ្លីចិន')
    .replace(/Chinese Drama(s)?/gi, 'រឿងភាគចិន')
    .replace(/#Short Drama(s)?/gi, '#រឿងភាគខ្លី')
    .replace(/Short Drama(s)?/gi, 'រឿងភាគខ្លី')
    .replace(/Mini Drama/gi, 'រឿងភាគខ្លី')
    .replace(/Full Movie/gi, 'ពេញមួយរឿង')
    .replace(/ល្ខោនខ្នាតតូច/g, 'រឿងភាគខ្លី')
    .replace(/ផ្លែប៉ោមនៃភ្នែករបស់ខ្ញុំ/g, 'គ្រាប់ពេជ្រសំណព្វចិត្ត')
    .replace(/ផ្លែប៉ោមនៃភ្នែក/g, 'គ្រាប់ពេជ្រសំណព្វចិត្ត')
    .replace(/បៃតង និងគួរឲ្យស្រលាញ់/g, 'កូនស្រីតូចគួរឱ្យស្រលាញ់')
    .replace(/បៃតងមិនគួរឱ្យស្រឡាញ់/g, 'កូនស្រីតូចគួរឱ្យស្រលាញ់')
    .replace(/កូនកង្កែបគួរឲ្យស្រលាញ់/g, 'កូនតូចគួរឱ្យស្រលាញ់')
    .replace(/ធ្លាក់ខ្លួនជាមួយប៉ាដែលបាក់ទឹកចិត្ត/g, 'ផ្លាស់ប្តូរជីវិតប៉ាៗ')
    .replace(/ធ្លាក់មកជាមួយឪពុកដែលគួរឲ្យអាណិត/g, 'ផ្លាស់ប្តូរជីវិតប៉ាៗ')
    .replace(/អ្នកនិយាយភាគឦសាន/g, 'មេធំកំពូលអ្នកលេងភូមិភាគឦសាន')
    .replace(/អ្នកនិយាយ/g, 'មេធំអ្នកលេង')
    .replace(/នាំគាត់ទៅស្ថានសួគ៌/g, 'ស្រលាញ់ស្ទើរលេប')
    .replace(/បណ្ឌិតអព្ភូតហេតុដែលមិនគួរឱ្យជឿ/g, 'កំពូលគ្រូពេទ្យទេព')
    .replace(/បណ្ឌិតអព្ភូតហេតុ/g, 'គ្រូពេទ្យទេព')
    .replace(/អាង Cornucopia/g, 'ឆ្នាំងទិព្វវិសេស')
    .replace(/Treasure Fairy Basin/g, 'ឆ្នាំងទិព្វវិសេស')
    .replace(/ខលណាជាអ្នកបង្កើតកាលវិបូទរបស់អ្នកតាំងដែលមិនចេះអក្សរ/g, 'អ្នកណាឱ្យមនុស្សសាមញ្ញក្លាយជាទេព')
    .replace(/ស្ដៀកកិច្ចសន្យាភាពស្អាវ/g, 'មេធំកំពូលអ្នកលេងភូមិភាគឦសាន')
    .replace(/ការ រៀប ការ ទាំង ពីរ មាន ភាព រីករាយ/g, 'ស្នេហាពិតនៃអាពាហ៍ពិពាហ៍លើកទី២')
    .replace(/ផ្ទះស្នេហ៍នៅតាមបណ្តោយផ្លូវ/g, 'គ្រាប់ពេជ្រសំណព្វចិត្តមកពីជនបទ')
    .replace(/កាម្ងុប/g, '')
    .trim();
  return cleaned;
}

// Clean Google Translate oddities for English
function polishEnglishTranslation(text) {
  let cleaned = text
    .replace(/Northeastern talker/gi, 'The Big Boss of the Northeast')
    .replace(/Talker/gi, 'Big Boss')
    .replace(/Apple of my eye/gi, 'Beloved Heiress')
    .replace(/Falls out with depressed dad/gi, 'Brings Joy to Melancholy Dad')
    .replace(/Green and cute/gi, 'Cute Baby')
    .replace(/Cornucopia Basin/gi, 'Treasure Basin')
    .replace(/Pampers him to heaven/gi, 'Deeply Cherished by Billionaire CEO')
    .replace(/Takes him to heaven/gi, 'Spoiled by Billionaire CEO')
    .trim();
  return cleaned;
}

async function fetchGoogleTranslate(text, targetLang) {
  const clean = (text || '').trim();
  if (!clean) return null;
  const tl = (targetLang === 'zh' || targetLang === 'zh-CN') ? 'zh-CN' : targetLang;

  // 1. Primary: clients5.google.com (fast, robust, bypasses 429)
  try {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${tl}&q=${encodeURIComponent(clean)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data[0] && data[0][0]) {
        const trans = String(data[0][0]).trim();
        if (trans && !/^[\s\p{P}]+$/u.test(trans)) {
          return trans;
        }
      }
    }
  } catch (e) {}

  // 2. Secondary: MyMemory Translated API
  try {
    const fromLang = /[\u4e00-\u9fa5]/.test(clean) ? 'zh' : 'auto';
    const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=${fromLang}|${tl}`;
    const res = await fetch(mmUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      const trans = data && data.responseData && data.responseData.translatedText;
      if (trans && !trans.includes('MYMEMORY WARNING') && !/^[\s\p{P}]+$/u.test(trans)) {
        return trans.trim();
      }
    }
  } catch (e) {}

  // 3. Tertiary: translate.googleapis.com
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(clean)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data && data[0] && Array.isArray(data[0])) {
        const trans = data[0].map(x => x[0]).join('').trim();
        if (trans && !/^[\s\p{P}]+$/u.test(trans)) return trans;
      }
    }
  } catch (e) {}

  return null;
}

/**
 * Translates a drama title into natural, captivating Khmer, English, or Chinese.
 */
async function translateDramaTitle(title, targetLang = 'km') {
  if (!title) return '';
  const lang = (targetLang === 'zh' || targetLang === 'zh-CN') ? 'zh' : ((targetLang === 'en') ? 'en' : 'km');
  const cleanTitle = title.trim();

  // If target is Chinese (zh)
  if (lang === 'zh') {
    // If it is already purely Chinese, return directly
    if (/[\u4e00-\u9fa5]/.test(cleanTitle) && !/[\u1780-\u17ff]/.test(cleanTitle)) {
      return cleanTitle;
    }
    const cacheKey = `zh:${cleanTitle}`;
    if (_CACHE.has(cacheKey)) return _CACHE.get(cacheKey);

    const gt = await fetchGoogleTranslate(cleanTitle, 'zh-CN');
    if (gt) {
      _CACHE.set(cacheKey, gt);
      persistCache();
      return gt;
    }
    return cleanTitle;
  }

  // 1. Direct hit in curated titles
  if (SPECIFIC_TITLES[cleanTitle] && SPECIFIC_TITLES[cleanTitle][lang]) {
    return SPECIFIC_TITLES[cleanTitle][lang];
  }

  // 2. Check persistent cache (reject bad punctuation or placeholder entries)
  const cacheKey = `${lang}:${cleanTitle}`;
  if (_CACHE.has(cacheKey)) {
    const cached = _CACHE.get(cacheKey);
    const isJunk = !cached || 
      /^[\s\p{P}0-9]+$/u.test(cached) || 
      cached.startsWith('，') || cached.startsWith(',') ||
      cached === 'Featured Short Drama' || cached === 'រឿងភាគពិសេស' ||
      (cleanTitle.length >= 8 && cached.length <= 4);
    if (isJunk) {
      _CACHE.delete(cacheKey);
    } else if (lang === 'en' && (/[\u1780-\u17ff]/.test(cached) || /[\u4e00-\u9fa5]/.test(cached))) {
      _CACHE.delete(cacheKey);
    } else if (lang === 'km' && /[\u4e00-\u9fa5]/.test(cached)) {
      _CACHE.delete(cacheKey);
    } else {
      return (lang === 'km') ? polishKhmerTranslation(cached) : ((lang === 'en') ? polishEnglishTranslation(cached) : cached);
    }
  }

  // 3. Try Pattern adaptation
  const patterns = lang === 'en' ? PATTERNS_EN : PATTERNS_KM;
  let adapted = cleanTitle;
  let matchedAny = false;

  for (const p of patterns) {
    if (p.match.test(adapted)) {
      adapted = adapted.replace(p.match, p.rep);
      matchedAny = true;
    }
  }

  // Check if all Chinese characters are resolved
  const hasChinese = /[\u4e00-\u9fa5]/.test(adapted);
  if (!hasChinese && matchedAny) {
    const finalTitle = lang === 'en' ? polishEnglishTranslation(adapted) : polishKhmerTranslation(adapted);
    _CACHE.set(cacheKey, finalTitle);
    persistCache();
    return finalTitle;
  }

  // 4. Fallback to Google Translate with pre/post-polishing
  let gtResult = await fetchGoogleTranslate(cleanTitle, lang);
  if (gtResult) {
    let finalTitle = lang === 'en' ? polishEnglishTranslation(gtResult) : polishKhmerTranslation(gtResult);
    
    // Also apply pattern substitutions to any remaining untranslated tropes
    for (const p of patterns) {
      if (p.match.test(finalTitle)) {
        finalTitle = finalTitle.replace(p.match, p.rep);
      }
    }
    
    _CACHE.set(cacheKey, finalTitle);
    persistCache();
    return finalTitle;
  }

  // 5. Final fallback if offline: clean up matched tokens
  let fallback = adapted.replace(/[\u4e00-\u9fa5]/g, '').trim();
  if (!fallback) {
    fallback = lang === 'en' ? 'Featured Short Drama' : 'រឿងភាគពិសេស';
  }
  _CACHE.set(cacheKey, fallback);
  persistCache();
  return fallback;
}

/**
 * Translates an array of titles in batch.
 */
async function translateBatchTitles(titles, targetLang = 'km') {
  const lang = (targetLang === 'zh' || targetLang === 'zh-CN') ? 'zh' : ((targetLang === 'en') ? 'en' : 'km');
  const result = {};
  const list = titles || [];
  const chunkSize = 5;
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (t) => {
      if (!t) return;
      try {
        result[t] = await translateDramaTitle(t, lang);
      } catch (e) {
        result[t] = t;
      }
    }));
  }
  return result;
}

/**
 * Translates category / tag into Khmer or English (never returns raw Chinese).
 */
function translateCategory(catName, targetLang = 'km') {
  if (!catName) return targetLang === 'en' ? 'Drama' : 'រឿងភាគ';
  const lang = (targetLang === 'en') ? 'en' : 'km';
  const map = CATEGORY_MAP[lang] || CATEGORY_MAP.km;
  
  if (map[catName]) return map[catName];
  
  // Clean punctuation
  const clean = String(catName).trim();
  if (map[clean]) return map[clean];

  for (const [k, v] of Object.entries(map)) {
    if (clean.includes(k)) return v;
  }

  return lang === 'en' ? 'Short Drama' : 'រឿងភាគខ្លី';
}

/**
 * Translates general text (such as synopsis/description) into fluent Khmer or English.
 */
async function translateGeneralText(text, targetLang = 'km') {
  if (!text) return '';
  const lang = (targetLang === 'en') ? 'en' : 'km';
  const clean = text.trim();
  const cacheKey = `synopsis:${lang}:${clean}`;
  if (_CACHE.has(cacheKey)) return _CACHE.get(cacheKey);

  // If short (<= 30 chars), try translateDramaTitle
  if (clean.length <= 30) {
    return translateDramaTitle(clean, lang);
  }

  // Use Google Translate for longer text
  let gt = await fetchGoogleTranslate(clean, lang);
  if (gt) {
    _CACHE.set(cacheKey, gt);
    persistCache();
    return gt;
  }
  return clean;
}

module.exports = {
  translateDramaTitle,
  translateTitle: translateDramaTitle,
  translateBatchTitles,
  translateCategory,
  translateGeneralText,
  CATEGORY_MAP,
  SPECIFIC_TITLES
};
