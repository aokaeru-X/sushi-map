import type { MetadataRoute } from 'next';
import { getPublishedShops } from '@/lib/notion';
import { LANGS } from '@/types/shop';
import { canonicalUrl, shopPath } from '@/utils/urlGenerator';

/** 3 言語 × （トップ + 店舗詳細）のサイトマップ。 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const shops = await getPublishedShops();
  const now = new Date();

  const top = LANGS.map((lang) => ({
    url: canonicalUrl(`/${lang}`),
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 1,
  }));

  const details = LANGS.flatMap((lang) =>
    shops.map((shop) => ({
      url: canonicalUrl(shopPath(lang, shop.id)),
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  );

  return [...top, ...details];
}
