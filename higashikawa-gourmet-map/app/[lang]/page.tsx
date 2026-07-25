import { notFound } from 'next/navigation';
import MapExplorer from '@/components/MapExplorer';
import { t } from '@/lib/i18n';
import { getPublishedShops } from '@/lib/notion';
import { isSeedMode } from '@/lib/seedShops';
import { isLang } from '@/types/shop';

/**
 * 地図メインページ。
 *
 * `getPublishedShops()` は Notion SDK に差し込んだ fetch 経由で
 * `notion-shops` タグ付きでキャッシュされる。Notion 側の更新は
 * `/api/revalidate` の `revalidateTag('notion-shops')` で即時反映される。
 */
export default async function MapPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: rawLang } = await params;
  if (!isLang(rawLang)) notFound();
  const lang = rawLang;

  const shops = await getPublishedShops();
  const hasApproximate = shops.some(
    (shop) => shop.location.precision === 'approximate',
  );
  const usingSeed = isSeedMode() || !process.env.NOTION_API_KEY;

  return (
    <>
      {(usingSeed || hasApproximate) && (
        <div className="notices">
          {usingSeed && <p className="notice notice--info">{t('seedNotice', lang)}</p>}
          {hasApproximate && (
            <p className="notice notice--warn">{t('approximateNotice', lang)}</p>
          )}
        </div>
      )}
      <MapExplorer shops={shops} lang={lang} />
    </>
  );
}
