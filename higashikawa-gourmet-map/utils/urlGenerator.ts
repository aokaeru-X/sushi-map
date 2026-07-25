/**
 * 店舗データから SNS / 地図アプリ / 電話のリンクを動的生成する。
 * Notion 側には識別子（Instagram のアカウント名など）だけを入れてもらい、
 * URL の組み立てはすべてこのモジュールに閉じ込める。
 */
import type { Lang, Shop } from '@/types/shop';

export function instagramUrl(handle: string | undefined): string | null {
  if (!handle) return null;
  const clean = handle.trim().replace(/^@/, '');
  if (!/^[\w.]{1,30}$/.test(clean)) return null;
  return `https://www.instagram.com/${clean}/`;
}

/** Google マップの検索リンク。座標が概算の場合は住所＋店名で検索させる。 */
export function googleMapsUrl(shop: Shop): string {
  if (shop.location.precision === 'exact') {
    return `https://www.google.com/maps/search/?api=1&query=${shop.location.lat},${shop.location.lng}`;
  }
  const query = [shop.name.ja, shop.location.address.ja].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Google マップの経路リンク（現在地から店舗へ）。 */
export function googleMapsDirectionsUrl(shop: Shop): string {
  const destination =
    shop.location.precision === 'exact'
      ? `${shop.location.lat},${shop.location.lng}`
      : [shop.name.ja, shop.location.address.ja].filter(Boolean).join(' ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/** iOS / macOS 向け Apple マップリンク。 */
export function appleMapsUrl(shop: Shop): string {
  const params = new URLSearchParams({ q: shop.name.ja });
  if (shop.location.precision === 'exact') {
    params.set('ll', `${shop.location.lat},${shop.location.lng}`);
  } else if (shop.location.address.ja) {
    params.set('address', shop.location.address.ja);
  }
  return `https://maps.apple.com/?${params.toString()}`;
}

export function telUrl(tel: string | undefined): string | null {
  if (!tel) return null;
  const digits = tel.replace(/[^\d+]/g, '');
  return digits.length >= 8 ? `tel:${digits}` : null;
}

/** 店舗詳細への内部リンク（言語プレフィックス付き）。 */
export function shopPath(lang: Lang, shopId: string): string {
  return `/${lang}/shops/${encodeURIComponent(shopId)}`;
}

export function canonicalUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** OS に応じた地図アプリリンクをまとめて返す。 */
export function mapLinks(shop: Shop) {
  return {
    google: googleMapsUrl(shop),
    googleDirections: googleMapsDirectionsUrl(shop),
    apple: appleMapsUrl(shop),
  };
}
