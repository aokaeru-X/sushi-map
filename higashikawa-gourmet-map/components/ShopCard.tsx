'use client';

import { categoryLabel, pick, t } from '@/lib/i18n';
import type { Lang, Shop } from '@/types/shop';
import {
  googleMapsDirectionsUrl,
  googleMapsUrl,
  instagramUrl,
  telUrl,
} from '@/utils/urlGenerator';

interface Props {
  shop: Shop;
  lang: Lang;
  isSelected: boolean;
  onSelect: () => void;
}

export default function ShopCard({ shop, lang, isSelected, onSelect }: Props) {
  const instagram = instagramUrl(shop.socialLinks.instagramHandle);
  const tel = telUrl(shop.tel);
  const hours = pick(shop.businessHours, lang);
  const closed = pick(shop.closedDays, lang);
  const description = shop.description ? pick(shop.description, lang) : '';

  return (
    <article className={isSelected ? 'shop-card is-selected' : 'shop-card'}>
      <button
        type="button"
        className="shop-card__head"
        onClick={onSelect}
        aria-expanded={isSelected}
      >
        <span className={`shop-card__badge shop-card__badge--${shop.category}`}>
          {categoryLabel(shop.category, lang)}
        </span>
        <span className="shop-card__name">{pick(shop.name, lang)}</span>
        {lang !== 'ja' && shop.name.ja !== pick(shop.name, lang) && (
          <span className="shop-card__name-sub">{shop.name.ja}</span>
        )}
      </button>

      <dl className="shop-card__meta">
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
      </dl>

      {description && <p className="shop-card__description">{description}</p>}

      {shop.features.length > 0 && (
        <ul className="shop-card__features" aria-label={t('features', lang)}>
          {shop.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      )}

      <p className="shop-card__links">
        <a href={googleMapsUrl(shop)} target="_blank" rel="noopener noreferrer">
          {t('openInGoogleMaps', lang)}
        </a>
        <a href={googleMapsDirectionsUrl(shop)} target="_blank" rel="noopener noreferrer">
          {t('directions', lang)}
        </a>
        {instagram && (
          <a href={instagram} target="_blank" rel="noopener noreferrer">
            {t('instagram', lang)}
          </a>
        )}
        {shop.sourceUrls[0] && (
          <a href={shop.sourceUrls[0]} target="_blank" rel="noopener noreferrer">
            {t('source', lang)}
          </a>
        )}
      </p>
    </article>
  );
}
