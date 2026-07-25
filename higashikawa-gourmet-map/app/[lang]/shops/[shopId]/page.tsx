import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HTML_LANG, categoryLabel, pick, t } from '@/lib/i18n';
import { getShopById } from '@/lib/notion';
import { isLang, type Lang } from '@/types/shop';
import {
  appleMapsUrl,
  canonicalUrl,
  googleMapsDirectionsUrl,
  googleMapsUrl,
  instagramUrl,
  shopPath,
  telUrl,
} from '@/utils/urlGenerator';

const DEFAULT_HERO = '/images/default-shop.jpg';

async function load(paramsPromise: Promise<{ lang: string; shopId: string }>) {
  const { lang: rawLang, shopId } = await paramsPromise;
  if (!isLang(rawLang)) notFound();
  const shop = await getShopById(decodeURIComponent(shopId));
  return { lang: rawLang as Lang, shop };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; shopId: string }>;
}): Promise<Metadata> {
  const { lang, shop } = await load(params);
  if (!shop) return { title: t('siteTitle', lang) };

  const name = pick(shop.name, lang);
  const description =
    (shop.description ? pick(shop.description, lang) : '') ||
    [pick(shop.location.address, lang), pick(shop.businessHours, lang)]
      .filter(Boolean)
      .join(' / ');

  return {
    title: `${name} | ${t('siteTitle', lang)}`,
    description,
    alternates: { canonical: canonicalUrl(shopPath(lang, shop.id)) },
    openGraph: {
      title: name,
      description,
      locale: HTML_LANG[lang],
      type: 'article',
      images:
        shop.heroImageUrl && shop.heroImageUrl !== DEFAULT_HERO
          ? [{ url: shop.heroImageUrl }]
          : undefined,
    },
  };
}

/** 店舗詳細ページ。SNS 共有と検索流入の受け皿。 */
export default async function ShopPage({
  params,
}: {
  params: Promise<{ lang: string; shopId: string }>;
}) {
  const { lang, shop } = await load(params);
  if (!shop) notFound();

  const hours = pick(shop.businessHours, lang);
  const closed = pick(shop.closedDays, lang);
  const description = shop.description ? pick(shop.description, lang) : '';
  const instagram = instagramUrl(shop.socialLinks.instagramHandle);
  const tel = telUrl(shop.tel);
  const hasHero = Boolean(shop.heroImageUrl) && shop.heroImageUrl !== DEFAULT_HERO;

  return (
    <article className="shop-detail">
      <p className="shop-detail__back">
        <Link href={`/${lang}`}>&larr; {t('backToMap', lang)}</Link>
      </p>

      <p className={`shop-detail__badge shop-detail__badge--${shop.category}`}>
        {categoryLabel(shop.category, lang)}
      </p>
      <h1>{pick(shop.name, lang)}</h1>
      {lang !== 'ja' && pick(shop.name, lang) !== shop.name.ja && (
        <p className="shop-detail__name-sub">{shop.name.ja}</p>
      )}

      {hasHero && (
        // Notion に任意のホストの URL が入り得るため next/image ではなく img を使う
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="shop-detail__hero"
          src={shop.heroImageUrl}
          alt={pick(shop.name, lang)}
          loading="lazy"
          decoding="async"
        />
      )}

      {description && <p className="shop-detail__description">{description}</p>}

      <dl className="shop-detail__meta">
        <dt>{t('address', lang)}</dt>
        <dd>{pick(shop.location.address, lang)}</dd>
        {hours && (
          <>
            <dt>{t('businessHours', lang)}</dt>
            <dd>{hours}</dd>
          </>
        )}
        {closed && (
          <>
            <dt>{t('closedDays', lang)}</dt>
            <dd>{closed}</dd>
          </>
        )}
        {tel && (
          <>
            <dt>{t('tel', lang)}</dt>
            <dd>
              <a href={tel}>{shop.tel}</a>
            </dd>
          </>
        )}
        {shop.features.length > 0 && (
          <>
            <dt>{t('features', lang)}</dt>
            <dd>{shop.features.join(' / ')}</dd>
          </>
        )}
      </dl>

      {shop.location.precision === 'approximate' && (
        <p className="notice notice--warn">{t('approximateNotice', lang)}</p>
      )}

      <p className="shop-detail__links">
        <a href={googleMapsUrl(shop)} target="_blank" rel="noopener noreferrer">
          {t('openInGoogleMaps', lang)}
        </a>
        <a href={googleMapsDirectionsUrl(shop)} target="_blank" rel="noopener noreferrer">
          {t('directions', lang)}
        </a>
        <a href={appleMapsUrl(shop)} target="_blank" rel="noopener noreferrer">
          Apple Maps
        </a>
        {instagram && (
          <a href={instagram} target="_blank" rel="noopener noreferrer">
            {t('instagram', lang)}
          </a>
        )}
      </p>

      {shop.sourceUrls.length > 0 && (
        <p className="shop-detail__sources">
          {t('source', lang)}:{' '}
          {shop.sourceUrls.map((url) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
              {new URL(url).hostname}
            </a>
          ))}
        </p>
      )}
    </article>
  );
}
