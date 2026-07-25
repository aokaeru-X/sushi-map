/**
 * 住所から緯度経度を取得して座標の精度を上げるスクリプト。
 *
 *   npm run geocode                 # data/seed-shops.json を更新
 *   npm run geocode -- --notion     # Notion の Lat/Lng を更新
 *   npm run geocode -- --force      # precision=exact の店舗も再取得する
 *
 * シードデータの座標は町丁目・号線からの概算値（precision: 'approximate'）なので、
 * 外部ネットワークに出られる環境で一度実行して実測値に置き換えることを推奨する。
 *
 * ジオコーダは国土地理院の住所検索 API を既定とし、見つからない場合は
 * OpenStreetMap Nominatim にフォールバックする（いずれも利用規約に従い 1 req/s 以下）。
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client, isFullPage } from '@notionhq/client';
import type { Shop } from '../types/shop';

const SEED_PATH = path.join(process.cwd(), 'data', 'seed-shops.json');
const USER_AGENT = 'HigashikawaGourmetMap/1.0 (geocode script)';
const REQUEST_INTERVAL_MS = 1100;

const useNotion = process.argv.includes('--notion');
const force = process.argv.includes('--force');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 建物名・部屋番号など、ジオコーダが苦手な接尾辞を落とす。 */
function normalizeAddress(address: string): string {
  return address
    .replace(/\s*[（(].*?[)）]/g, '')
    .replace(/\s+(?:せんとぴゅあ|HK|LESS|レンガ村).*$/u, '')
    .replace(/\s+\d+階.*$/u, '')
    .trim();
}

async function geocodeGsi(address: string): Promise<[number, number] | null> {
  const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address)}`;
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) return null;

  const results = (await response.json()) as {
    geometry?: { coordinates?: [number, number] };
  }[];
  const coordinates = results[0]?.geometry?.coordinates;
  // GSI は [lng, lat] の順で返す
  return coordinates ? [coordinates[1], coordinates[0]] : null;
}

async function geocodeNominatim(address: string): Promise<[number, number] | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=jp&q=${encodeURIComponent(
    address,
  )}`;
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) return null;

  const results = (await response.json()) as { lat?: string; lon?: string }[];
  const hit = results[0];
  if (!hit?.lat || !hit?.lon) return null;
  return [Number(hit.lat), Number(hit.lon)];
}

async function geocode(address: string): Promise<[number, number] | null> {
  const query = normalizeAddress(address);
  if (!query) return null;

  try {
    const gsi = await geocodeGsi(query);
    if (gsi) return gsi;
  } catch (error) {
    console.warn(`  GSI 失敗: ${(error as Error).message}`);
  }

  await sleep(REQUEST_INTERVAL_MS);

  try {
    return await geocodeNominatim(query);
  } catch (error) {
    console.warn(`  Nominatim 失敗: ${(error as Error).message}`);
    return null;
  }
}

async function updateSeedFile() {
  const shops = JSON.parse(await readFile(SEED_PATH, 'utf8')) as Shop[];
  let updated = 0;

  for (const shop of shops) {
    if (!force && shop.location.precision === 'exact') continue;

    const coordinates = await geocode(shop.location.address.ja);
    if (coordinates) {
      shop.location.lat = Number(coordinates[0].toFixed(6));
      shop.location.lng = Number(coordinates[1].toFixed(6));
      shop.location.precision = 'exact';
      updated += 1;
      console.log(`ok   ${shop.name.ja} -> ${coordinates[0]}, ${coordinates[1]}`);
    } else {
      console.log(`miss ${shop.name.ja} (${shop.location.address.ja})`);
    }
    await sleep(REQUEST_INTERVAL_MS);
  }

  await writeFile(SEED_PATH, `${JSON.stringify(shops, null, 2)}\n`, 'utf8');
  console.log(`data/seed-shops.json を更新しました（${updated}/${shops.length} 件）。`);
}

async function updateNotion() {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!apiKey || !databaseId) {
    throw new Error('NOTION_API_KEY と NOTION_DATABASE_ID を設定してください。');
  }

  const notion = new Client({ auth: apiKey });
  let cursor: string | undefined;
  let updated = 0;

  do {
    const response = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const page of response.results) {
      if (!isFullPage(page)) continue;

      const nameProp = page.properties.Name_JA;
      const addressProp = page.properties.Address_JA;
      const latProp = page.properties.Lat;

      const name =
        nameProp?.type === 'title'
          ? nameProp.title.map((t) => t.plain_text).join('')
          : '(no name)';
      const address =
        addressProp?.type === 'rich_text'
          ? addressProp.rich_text.map((t) => t.plain_text).join('')
          : '';
      const hasLat = latProp?.type === 'number' && latProp.number !== null;

      if (!address || (hasLat && !force)) continue;

      const coordinates = await geocode(address);
      if (coordinates) {
        await notion.pages.update({
          page_id: page.id,
          properties: {
            Lat: { number: Number(coordinates[0].toFixed(6)) },
            Lng: { number: Number(coordinates[1].toFixed(6)) },
          } as never,
        });
        updated += 1;
        console.log(`ok   ${name} -> ${coordinates[0]}, ${coordinates[1]}`);
      } else {
        console.log(`miss ${name} (${address})`);
      }
      await sleep(REQUEST_INTERVAL_MS);
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  console.log(`Notion の Lat/Lng を ${updated} 件更新しました。`);
}

(useNotion ? updateNotion() : updateSeedFile()).catch((error) => {
  console.error(error);
  process.exit(1);
});
