/**
 * 3 言語（日本語・英語・繁体字中国語）の辞書とフォールバック処理。
 * Notion 側に英語・繁体字の訳が入っていない場合は日本語を表示する。
 */
import type { Category, Lang, LocalizedText } from '@/types/shop';

/** LocalizedText から表示言語の値を取り出す。未翻訳なら日本語にフォールバック。 */
export function pick(text: LocalizedText | undefined, lang: Lang): string {
  if (!text) return '';
  if (lang === 'en') return text.en?.trim() || text.ja;
  if (lang === 'zh-TW') return text.zhTW?.trim() || text.ja;
  return text.ja;
}

export const CATEGORY_LABELS: Record<Category, Record<Lang, string>> = {
  cafe: { ja: 'カフェ・喫茶', en: 'Cafe', 'zh-TW': '咖啡廳' },
  french: { ja: 'フレンチ・洋食', en: 'French / Western', 'zh-TW': '法式・西餐' },
  italian: { ja: 'イタリアン・ピッツァ', en: 'Italian / Pizza', 'zh-TW': '義式・披薩' },
  ramen: { ja: '麺・定食・カレー', en: 'Noodles / Set meals', 'zh-TW': '麵食・定食' },
  bakery: { ja: 'パン・洋菓子', en: 'Bakery / Sweets', 'zh-TW': '麵包・甜點' },
  gibier: { ja: '焼肉・ジビエ・肉加工', en: 'Grilled meat / Gibier', 'zh-TW': '燒肉・野味' },
  local_produce: {
    ja: '地場産品・酒・豆腐',
    en: 'Local produce / Sake',
    'zh-TW': '當地物產・酒',
  },
  rice_ball: { ja: 'おむすび', en: 'Rice balls', 'zh-TW': '飯糰' },
};

const DICTIONARY = {
  siteTitle: {
    ja: '東川町グルメMAP',
    en: 'Higashikawa Gourmet Map',
    'zh-TW': '東川町美食地圖',
  },
  siteDescription: {
    ja: '北海道上川郡東川町の飲食店・カフェ・パン屋・地場産品を地図から探せるガイドです。',
    en: 'Find restaurants, cafes, bakeries and local produce in Higashikawa, Hokkaido.',
    'zh-TW': '在地圖上尋找北海道東川町的餐廳、咖啡廳、麵包店與當地物產。',
  },
  tagline: {
    ja: '小さな町だけど、東川には美味しさにこだわり素敵な飲食店がたくさんあるんです。',
    en: 'A small town with a remarkable number of places that care about good food.',
    'zh-TW': '雖是小鎮，東川卻有許多講究美味的好店。',
  },
  shopCount: { ja: '件', en: 'shops', 'zh-TW': '間' },
  allCategories: { ja: 'すべて', en: 'All', 'zh-TW': '全部' },
  searchPlaceholder: {
    ja: '店名・住所・特徴で絞り込む',
    en: 'Filter by name, address or feature',
    'zh-TW': '以店名、地址或特色篩選',
  },
  businessHours: { ja: '営業時間', en: 'Hours', 'zh-TW': '營業時間' },
  closedDays: { ja: '定休日', en: 'Closed', 'zh-TW': '公休日' },
  address: { ja: '住所', en: 'Address', 'zh-TW': '地址' },
  tel: { ja: '電話', en: 'Tel', 'zh-TW': '電話' },
  features: { ja: '特徴', en: 'Features', 'zh-TW': '特色' },
  openInGoogleMaps: { ja: 'Googleマップで開く', en: 'Open in Google Maps', 'zh-TW': '在 Google 地圖開啟' },
  directions: { ja: '経路案内', en: 'Directions', 'zh-TW': '路線導航' },
  instagram: { ja: 'Instagram', en: 'Instagram', 'zh-TW': 'Instagram' },
  source: { ja: '情報元', en: 'Source', 'zh-TW': '資料來源' },
  noResults: {
    ja: '条件に一致する店舗がありません。',
    en: 'No shops match your filters.',
    'zh-TW': '沒有符合條件的店家。',
  },
  approximateNotice: {
    ja: '一部の店舗の地図上の位置は住所からの概算値です。訪問前に住所・営業時間をご確認ください。',
    en: 'Some pin positions are approximated from addresses. Please confirm the address and hours before visiting.',
    'zh-TW': '部分店家的地圖位置為依地址推估。前往前請再確認地址與營業時間。',
  },
  seedNotice: {
    ja: 'Notion 未接続のため、同梱のサンプルデータ（グルメMAP 令和8年7月版）を表示しています。',
    en: 'Notion is not connected — showing the bundled sample dataset.',
    'zh-TW': '尚未連接 Notion，目前顯示內建範例資料。',
  },
  details: { ja: '詳細', en: 'Details', 'zh-TW': '詳細資訊' },
  backToMap: { ja: '地図に戻る', en: 'Back to map', 'zh-TW': '返回地圖' },
  shopList: { ja: '店舗一覧', en: 'Shops', 'zh-TW': '店家列表' },
  adminTitle: { ja: 'URL インジェスト', en: 'URL ingestion', 'zh-TW': 'URL 匯入' },
} as const;

export type DictionaryKey = keyof typeof DICTIONARY;

export function t(key: DictionaryKey, lang: Lang): string {
  return DICTIONARY[key][lang];
}

export function categoryLabel(category: Category, lang: Lang): string {
  return CATEGORY_LABELS[category][lang];
}

/** <html lang> に入れる BCP-47 タグ。 */
export const HTML_LANG: Record<Lang, string> = {
  ja: 'ja',
  en: 'en',
  'zh-TW': 'zh-Hant-TW',
};

export const LANG_LABELS: Record<Lang, string> = {
  ja: '日本語',
  en: 'English',
  'zh-TW': '繁體中文',
};
