/**
 * Notion データベース「東川町グルメ店舗一覧」に対応する型定義。
 *
 * Notion 側のプロパティ名（Name_JA, Category, Lat ...）との対応は
 * `lib/notion.ts` の `pageToShop()` / `buildNotionProperties()` に集約している。
 */

/** 表示言語。URL の `[lang]` セグメントに対応する。 */
export const LANGS = ['ja', 'en', 'zh-TW'] as const;
export type Lang = (typeof LANGS)[number];

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}

/** Notion の Status プロパティ（select）。 */
export const SHOP_STATUSES = ['published', 'draft', 'archived'] as const;
export type ShopStatus = (typeof SHOP_STATUSES)[number];

/** Notion の Category プロパティ（select）。仕様書 2. のスキーマ定義に準拠。 */
export const CATEGORIES = [
  'cafe',
  'french',
  'italian',
  'ramen',
  'bakery',
  'gibier',
  'local_produce',
  'rice_ball',
] as const;
export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

/**
 * 多言語テキスト。日本語のみ必須で、英語・繁体字中国語は任意。
 * Notion 側で未入力の場合は undefined になり、UI では ja にフォールバックする。
 */
export interface LocalizedText {
  ja: string;
  en?: string;
  zhTW?: string;
}

export interface ShopLocation {
  lat: number;
  lng: number;
  address: LocalizedText;
  /**
   * 緯度経度の精度。`approximate` は住所の町丁目からの概算値で、
   * `scripts/geocode.ts` で実測値に更新できる。
   */
  precision?: 'exact' | 'approximate';
}

export interface SocialLinks {
  /** Instagram のアカウント名（@ なし。例: wednesday_cafe） */
  instagramHandle?: string;
}

export interface Shop {
  /** Notion ページ ID */
  id: string;
  status: ShopStatus;
  name: LocalizedText;
  category: Category;
  location: ShopLocation;
  businessHours: LocalizedText;
  closedDays: LocalizedText;
  /** Notion の Features（multi-select）。例: 湧水使用, テラス席 */
  features: string[];
  socialLinks: SocialLinks;
  /** 情報取得元 URL（ニュース・食べログ等） */
  sourceUrls: string[];
  heroImageUrl: string;
  /** 電話番号（グルメMAP由来。Notion 側では Tel プロパティ） */
  tel?: string;
  /** 一言紹介 */
  description?: LocalizedText;
}

/**
 * URL インジェストで LLM が抽出する構造化データ。
 * `lib/aiExtractor.ts` の JSON Schema と 1:1 で対応させる。
 */
export interface ExtractedShopData {
  name_ja: string;
  name_en?: string | null;
  category: Category;
  address_ja?: string | null;
  business_hours_ja?: string | null;
  closed_days_ja?: string | null;
  tel?: string | null;
  features: string[];
  instagram_handle?: string | null;
  description_ja?: string | null;
  /** 抽出できなかった項目や判断に迷った点のメモ（レビュー用） */
  extraction_notes?: string | null;
}
