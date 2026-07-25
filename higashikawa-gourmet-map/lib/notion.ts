/**
 * Notion API クライアントとデータ変換層。
 *
 * - `getPublishedShops()` … Status == 'published' の店舗を取得（Next.js の fetch キャッシュタグ付き）
 * - `createShopDraft()` … URL インジェストの結果を Status == 'draft' で新規作成
 *
 * Notion のプロパティが未設定・型違いでも例外を投げず、フォールバック値を返す
 * （現地スタッフが Notion を直接編集するため、欠損は日常的に発生する前提）。
 */
import { unstable_cache } from 'next/cache';
import { Client, isFullPage } from '@notionhq/client';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import {
  isCategory,
  type Category,
  type ExtractedShopData,
  type Shop,
  type ShopStatus,
} from '@/types/shop';
import { getSeedShops, isSeedMode } from '@/lib/seedShops';

/**
 * On-Demand ISR 用の共通キャッシュタグ。
 * `/api/revalidate` の `revalidateTag(NOTION_SHOPS_TAG, 'max')` で失効させる。
 */
export const NOTION_SHOPS_TAG = 'notion-shops';

/** revalidateTag に渡すキャッシュプロファイル（Next.js 16 で必須）。 */
export const NOTION_CACHE_PROFILE = 'max';

const DEFAULT_HERO_IMAGE = '/images/default-shop.jpg';
/** 東川町役場付近。緯度経度が欠損している店舗の暫定表示位置。 */
const TOWN_CENTER = { lat: 43.6012, lng: 142.5188 } as const;

let cachedClient: Client | null = null;

/**
 * Notion クライアント。環境変数が未設定なら null を返し、呼び出し側で
 * シードデータへのフォールバックを判断させる。
 */
export function getNotionClient(): Client | null {
  if (!process.env.NOTION_API_KEY) return null;
  cachedClient ??= new Client({ auth: process.env.NOTION_API_KEY });
  return cachedClient;
}

/** 書き込み系 API 用。キャッシュを共有しないクライアント。 */
export function getNotionWriteClient(): Client | null {
  if (!process.env.NOTION_API_KEY) return null;
  return new Client({ auth: process.env.NOTION_API_KEY });
}

export function getDatabaseId(): string | null {
  return process.env.NOTION_DATABASE_ID ?? null;
}

// ---------------------------------------------------------------------------
// プロパティ読み出しヘルパー（欠損・型違いに強い）
// ---------------------------------------------------------------------------

type Properties = PageObjectResponse['properties'];

function readTitle(props: Properties, key: string): string {
  const prop = props[key];
  if (prop?.type !== 'title') return '';
  return prop.title.map((t) => t.plain_text).join('').trim();
}

function readText(props: Properties, key: string): string {
  const prop = props[key];
  if (prop?.type === 'rich_text') {
    return prop.rich_text.map((t) => t.plain_text).join('').trim();
  }
  // Notion 上で Text から Url / Phone / Select に変更されていても読めるようにする
  if (prop?.type === 'url') return prop.url?.trim() ?? '';
  if (prop?.type === 'phone_number') return prop.phone_number?.trim() ?? '';
  if (prop?.type === 'select') return prop.select?.name?.trim() ?? '';
  return '';
}

function readNumber(props: Properties, key: string): number | null {
  const prop = props[key];
  if (prop?.type === 'number') return prop.number;
  // 数値プロパティが Text で運用されているケースを救済する
  if (prop?.type === 'rich_text') {
    const raw = readText(props, key);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readSelect(props: Properties, key: string): string {
  const prop = props[key];
  if (prop?.type === 'select') return prop.select?.name?.trim() ?? '';
  if (prop?.type === 'status') return prop.status?.name?.trim() ?? '';
  return '';
}

function readMultiSelect(props: Properties, key: string): string[] {
  const prop = props[key];
  if (prop?.type === 'multi_select') return prop.multi_select.map((o) => o.name);
  return [];
}

function readUrl(props: Properties, key: string): string {
  const prop = props[key];
  if (prop?.type === 'url') return prop.url?.trim() ?? '';
  if (prop?.type === 'files') {
    const file = prop.files[0];
    if (!file) return '';
    // files は external / file の判別共用体。type が optional なためキーで判定する
    if ('external' in file) return file.external.url;
    if ('file' in file) return file.file.url;
    return '';
  }
  return readText(props, key);
}

/** SourceURLs は改行・カンマ・空白区切りの複数 URL を許容する。 */
function readUrlList(props: Properties, key: string): string[] {
  const raw = readUrl(props, key);
  if (!raw) return [];
  return raw
    .split(/[\s,、]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s));
}

function optionalText(value: string): string | undefined {
  return value === '' ? undefined : value;
}

function normalizeStatus(value: string): ShopStatus {
  return value === 'published' || value === 'archived' ? value : 'draft';
}

function normalizeCategory(value: string): Category {
  return isCategory(value) ? value : 'cafe';
}

/** Notion ページ → Shop。プロパティ欠損時はフォールバック値を使う。 */
export function pageToShop(page: PageObjectResponse): Shop {
  const p = page.properties;

  const lat = readNumber(p, 'Lat');
  const lng = readNumber(p, 'Lng');
  const hasCoordinates = lat !== null && lng !== null;

  return {
    id: page.id,
    status: normalizeStatus(readSelect(p, 'Status')),
    name: {
      ja: readTitle(p, 'Name_JA'),
      en: optionalText(readText(p, 'Name_EN')),
      zhTW: optionalText(readText(p, 'Name_ZHTW')),
    },
    category: normalizeCategory(readSelect(p, 'Category')),
    location: {
      lat: hasCoordinates ? lat : TOWN_CENTER.lat,
      lng: hasCoordinates ? lng : TOWN_CENTER.lng,
      address: {
        ja: readText(p, 'Address_JA'),
        en: optionalText(readText(p, 'Address_EN')),
        zhTW: optionalText(readText(p, 'Address_ZHTW')),
      },
      precision: hasCoordinates ? 'exact' : 'approximate',
    },
    businessHours: {
      ja: readText(p, 'BusinessHours_JA'),
      en: optionalText(readText(p, 'BusinessHours_EN')),
    },
    closedDays: {
      ja: readText(p, 'ClosedDays_JA'),
      en: optionalText(readText(p, 'ClosedDays_EN')),
    },
    features: readMultiSelect(p, 'Features'),
    socialLinks: {
      instagramHandle: optionalText(
        readText(p, 'InstagramHandle').replace(/^@/, ''),
      ),
    },
    sourceUrls: readUrlList(p, 'SourceURLs'),
    heroImageUrl: readUrl(p, 'HeroImageUrl') || DEFAULT_HERO_IMAGE,
    tel: optionalText(readText(p, 'Tel')),
    description: {
      ja: readText(p, 'Description_JA'),
      en: optionalText(readText(p, 'Description_EN')),
    },
  };
}

// ---------------------------------------------------------------------------
// 取得
// ---------------------------------------------------------------------------

/**
 * Status == 'published' の店舗一覧を Notion から取得する（キャッシュ無し）。
 *
 * - Notion の 100 件ページネーションを最後まで辿る
 * - 認証情報が無い場合（または USE_SEED_DATA=true）は同梱のシードデータを返す
 * - Notion 側の障害時も地図を白紙にしないため、失敗時はシードデータへ退避する
 */
async function fetchPublishedShops(): Promise<Shop[]> {
  const notion = getNotionClient();
  const databaseId = getDatabaseId();

  if (isSeedMode() || !notion || !databaseId) {
    if (!isSeedMode()) {
      console.warn(
        '[notion] NOTION_API_KEY / NOTION_DATABASE_ID が未設定のため、同梱のシードデータを表示します。',
      );
    }
    return getSeedShops();
  }

  try {
    const shops: Shop[] = [];
    let cursor: string | undefined;

    do {
      const response = await notion.databases.query({
        database_id: databaseId,
        filter: {
          property: 'Status',
          select: { equals: 'published' },
        },
        sorts: [{ property: 'Name_JA', direction: 'ascending' }],
        start_cursor: cursor,
        page_size: 100,
      });

      for (const page of response.results) {
        if (!isFullPage(page)) continue;
        const shop = pageToShop(page);
        // 店名が空のページ（作成直後の空行など）は地図に出さない
        if (shop.name.ja) shops.push(shop);
      }

      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor);

    return shops;
  } catch (error) {
    console.error('[notion] 店舗一覧の取得に失敗しました:', error);
    return getSeedShops();
  }
}

/**
 * 店舗一覧（`notion-shops` タグ付きでキャッシュ）。
 *
 * Notion SDK の `databases.query` は POST リクエストのため Next.js の
 * fetch キャッシュ（GET のみ対象）には乗らない。そこでデータキャッシュ側に
 * タグを付け、Notion 更新時に `revalidateTag(NOTION_SHOPS_TAG, 'max')` で
 * 即時失効させる（On-Demand ISR）。
 */
export const getPublishedShops = unstable_cache(
  fetchPublishedShops,
  ['notion-published-shops'],
  {
    tags: [NOTION_SHOPS_TAG],
    // Webhook が失敗した場合の保険として 1 時間で自動失効させる
    revalidate: 3600,
  },
);

/** 1 店舗だけ取得する（詳細ページ・OG 画像生成用）。 */
export async function getShopById(id: string): Promise<Shop | null> {
  const shops = await getPublishedShops();
  return shops.find((shop) => shop.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// 書き込み（URL インジェスト）
// ---------------------------------------------------------------------------

function richText(value: string) {
  return { rich_text: [{ text: { content: value.slice(0, 2000) } }] };
}

/**
 * 抽出済みデータ → Notion プロパティ。
 * Notion 側に存在しないプロパティを送るとエラーになるため、
 * 値が空のものは送らない。
 */
export function buildNotionProperties(
  data: ExtractedShopData,
  sourceUrl: string,
  status: ShopStatus = 'draft',
): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    Name_JA: { title: [{ text: { content: data.name_ja.slice(0, 2000) } }] },
    Status: { select: { name: status } },
    Category: { select: { name: normalizeCategory(data.category) } },
    SourceURLs: { url: sourceUrl },
  };

  if (data.name_en) properties.Name_EN = richText(data.name_en);
  if (data.address_ja) properties.Address_JA = richText(data.address_ja);
  if (data.business_hours_ja) {
    properties.BusinessHours_JA = richText(data.business_hours_ja);
  }
  if (data.closed_days_ja) properties.ClosedDays_JA = richText(data.closed_days_ja);
  if (data.tel) properties.Tel = richText(data.tel);
  if (data.instagram_handle) {
    properties.InstagramHandle = richText(data.instagram_handle.replace(/^@/, ''));
  }
  if (data.description_ja) properties.Description_JA = richText(data.description_ja);
  if (data.features.length > 0) {
    properties.Features = {
      multi_select: data.features.slice(0, 20).map((name) => ({ name })),
    };
  }

  return properties;
}

/** 抽出結果を Status='draft' として Notion に登録し、ページ URL を返す。 */
export async function createShopDraft(
  data: ExtractedShopData,
  sourceUrl: string,
): Promise<{ pageId: string; pageUrl: string }> {
  const notion = getNotionWriteClient();
  const databaseId = getDatabaseId();

  if (!notion || !databaseId) {
    throw new Error(
      'NOTION_API_KEY と NOTION_DATABASE_ID が未設定のため Notion に登録できません。',
    );
  }

  const page = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: buildNotionProperties(data, sourceUrl, 'draft') as never,
  });

  const pageUrl =
    'url' in page && typeof page.url === 'string'
      ? page.url
      : `https://www.notion.so/${page.id.replace(/-/g, '')}`;

  return { pageId: page.id, pageUrl };
}
