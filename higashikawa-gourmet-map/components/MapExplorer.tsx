'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import ShopCard from '@/components/ShopCard';
import { categoryLabel, pick, t } from '@/lib/i18n';
import { CATEGORIES, type Category, type Lang, type Shop } from '@/types/shop';

// Leaflet は window 依存のため SSR を無効化して読み込む
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <div className="map-view map-view--loading" aria-hidden="true" />,
});

interface Props {
  shops: Shop[];
  lang: Lang;
}

/** 店舗が検索語に一致するか（店名・住所・特徴・紹介文を対象にする）。 */
function matchesQuery(shop: Shop, query: string, lang: Lang): boolean {
  if (!query) return true;
  const haystack = [
    shop.name.ja,
    shop.name.en ?? '',
    shop.name.zhTW ?? '',
    pick(shop.location.address, lang),
    shop.location.address.ja,
    shop.features.join(' '),
    shop.description ? pick(shop.description, lang) : '',
    shop.tel ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export default function MapExplorer({ shops, lang }: Props) {
  const [activeCategories, setActiveCategories] = useState<Set<Category>>(new Set());
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const usedCategories = useMemo(() => {
    const used = new Set(shops.map((shop) => shop.category));
    return CATEGORIES.filter((category) => used.has(category));
  }, [shops]);

  const visibleShops = useMemo(
    () =>
      shops.filter(
        (shop) =>
          (activeCategories.size === 0 || activeCategories.has(shop.category)) &&
          matchesQuery(shop, query.trim(), lang),
      ),
    [shops, activeCategories, query, lang],
  );

  function toggleCategory(category: Category) {
    setActiveCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  const selectedShop = visibleShops.find((shop) => shop.id === selectedId) ?? null;

  return (
    <div className="explorer">
      <div className="explorer__controls">
        <div className="category-filter" role="group" aria-label={t('shopList', lang)}>
          <button
            type="button"
            className={activeCategories.size === 0 ? 'chip is-active' : 'chip'}
            onClick={() => setActiveCategories(new Set())}
            aria-pressed={activeCategories.size === 0}
          >
            {t('allCategories', lang)}
          </button>
          {usedCategories.map((category) => (
            <button
              key={category}
              type="button"
              className={
                activeCategories.has(category)
                  ? `chip chip--${category} is-active`
                  : `chip chip--${category}`
              }
              onClick={() => toggleCategory(category)}
              aria-pressed={activeCategories.has(category)}
            >
              {categoryLabel(category, lang)}
            </button>
          ))}
        </div>

        <div className="explorer__search">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchPlaceholder', lang)}
            aria-label={t('searchPlaceholder', lang)}
          />
          <span className="explorer__count">
            {visibleShops.length}
            {t('shopCount', lang)}
          </span>
        </div>
      </div>

      <div className="explorer__body">
        <div className="explorer__map">
          <MapView
            shops={visibleShops}
            lang={lang}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        <aside className="explorer__list" aria-label={t('shopList', lang)}>
          {visibleShops.length === 0 && <p className="empty">{t('noResults', lang)}</p>}
          <ul>
            {visibleShops.map((shop) => (
              <li key={shop.id}>
                <ShopCard
                  shop={shop}
                  lang={lang}
                  isSelected={shop.id === selectedId}
                  onSelect={() => setSelectedId(shop.id === selectedId ? null : shop.id)}
                />
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {selectedShop && (
        <p className="explorer__selection" aria-live="polite">
          {pick(selectedShop.name, lang)}
        </p>
      )}
    </div>
  );
}
