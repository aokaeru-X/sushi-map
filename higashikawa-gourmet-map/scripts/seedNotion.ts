/**
 * data/seed-shops.json を Notion データベースに投入する。
 *
 *   npm run seed:notion -- --dry-run     # 投入内容の確認のみ
 *   npm run seed:notion                  # 実際に作成する（Status=published）
 *   npm run seed:notion -- --status draft # draft で作成する
 *
 * 既に同じ Name_JA のページがある場合はスキップするので、再実行しても重複しない。
 */
import { Client, isFullPage } from '@notionhq/client';
import { getSeedShops } from '../lib/seedShops';
import type { Shop, ShopStatus } from '../types/shop';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const dryRun = process.argv.includes('--dry-run');
const status = (arg('status') ?? 'published') as ShopStatus;

function shopToProperties(shop: Shop): Record<string, unknown> {
  const text = (value: string | undefined) =>
    value ? { rich_text: [{ text: { content: value.slice(0, 2000) } }] } : undefined;

  const properties: Record<string, unknown> = {
    Name_JA: { title: [{ text: { content: shop.name.ja.slice(0, 2000) } }] },
    Status: { select: { name: status } },
    Category: { select: { name: shop.category } },
    Lat: { number: shop.location.lat },
    Lng: { number: shop.location.lng },
  };

  const optional: Record<string, unknown | undefined> = {
    Name_EN: text(shop.name.en),
    Name_ZHTW: text(shop.name.zhTW),
    Address_JA: text(shop.location.address.ja),
    BusinessHours_JA: text(shop.businessHours.ja),
    ClosedDays_JA: text(shop.closedDays.ja),
    Tel: text(shop.tel),
    Description_JA: text(shop.description?.ja),
    InstagramHandle: text(shop.socialLinks.instagramHandle),
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value) properties[key] = value;
  }

  if (shop.features.length > 0) {
    properties.Features = {
      multi_select: shop.features.map((name) => ({ name })),
    };
  }
  if (shop.sourceUrls[0]) properties.SourceURLs = { url: shop.sourceUrls[0] };

  return properties;
}

async function fetchExistingNames(notion: Client, databaseId: string): Promise<Set<string>> {
  const names = new Set<string>();
  let cursor: string | undefined;

  do {
    const response = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const page of response.results) {
      if (!isFullPage(page)) continue;
      const prop = page.properties.Name_JA;
      if (prop?.type === 'title') {
        const name = prop.title.map((t) => t.plain_text).join('').trim();
        if (name) names.add(name);
      }
    }
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return names;
}

async function main() {
  const shops = getSeedShops();
  console.log(`シードデータ: ${shops.length} 件 / Status=${status}`);

  if (dryRun) {
    for (const shop of shops) {
      console.log(
        `- ${shop.name.ja} (${shop.category}) ${shop.location.address.ja} ${shop.tel ?? ''}`,
      );
    }
    console.log('--dry-run のため Notion への書き込みは行いません。');
    return;
  }

  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!apiKey || !databaseId) {
    throw new Error('NOTION_API_KEY と NOTION_DATABASE_ID を設定してください。');
  }

  const notion = new Client({ auth: apiKey });
  const existing = await fetchExistingNames(notion, databaseId);
  console.log(`既存ページ: ${existing.size} 件`);

  let created = 0;
  let skipped = 0;

  for (const shop of shops) {
    if (existing.has(shop.name.ja)) {
      skipped += 1;
      continue;
    }
    await notion.pages.create({
      parent: { database_id: databaseId },
      properties: shopToProperties(shop) as never,
    });
    created += 1;
    console.log(`created: ${shop.name.ja}`);
    // Notion API のレート制限（約 3 req/s）に配慮する
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  console.log(`完了: 作成 ${created} 件 / スキップ ${skipped} 件`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
