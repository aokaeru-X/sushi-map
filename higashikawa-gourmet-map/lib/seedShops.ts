/**
 * Notion 未接続時に使うシードデータ。
 *
 * 出典: ひがしかわ「道草館」作成『ひがしかわグルメMAP』令和8年7月版
 *       （市街地ver. / 郊外ver.）
 *
 * 緯度経度は町丁目・号線からの概算値（`precision: 'approximate'`）で、
 * `npm run geocode` で実測値に更新できる。
 */
import seed from '@/data/seed-shops.json' with { type: 'json' };
import type { Shop } from '@/types/shop';

/** Notion 認証情報があっても、あえてシードデータで動かしたい場合に使う。 */
export function isSeedMode(): boolean {
  return process.env.USE_SEED_DATA === 'true';
}

export function getSeedShops(): Shop[] {
  return seed as Shop[];
}
