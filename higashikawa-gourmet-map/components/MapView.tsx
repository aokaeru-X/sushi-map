'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { categoryLabel, pick, t } from '@/lib/i18n';
import type { Category, Lang, Shop } from '@/types/shop';
import { googleMapsUrl } from '@/utils/urlGenerator';

const TOWN_CENTER: [number, number] = [43.6012, 142.5188];
const DEFAULT_ZOOM = 13;

/** カテゴリごとのピン色。CSS の chip--* と対応させている。 */
const CATEGORY_COLORS: Record<Category, string> = {
  cafe: '#b5651d',
  french: '#8e4b6e',
  italian: '#2f7d4f',
  ramen: '#c2471f',
  bakery: '#c8981f',
  gibier: '#7a3b2e',
  local_produce: '#3f7a8c',
  rice_ball: '#6b7a2f',
};

function markerIcon(category: Category, isSelected: boolean): L.DivIcon {
  const size = isSelected ? 34 : 26;
  return L.divIcon({
    className: 'shop-marker',
    html: `<span style="--marker-color:${CATEGORY_COLORS[category]};--marker-size:${size}px"${
      isSelected ? ' data-selected="true"' : ''
    }></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface Props {
  shops: Shop[];
  lang: Lang;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function MapView({ shops, lang, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  // 描画ごとに新しい関数が来ても effect を再実行させないための ref
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // 地図の初期化（マウント時のみ）
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: TOWN_CENTER,
      zoom: DEFAULT_ZOOM,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    // クリックで拡大縮小、キーボード操作も有効にしておく
    map.on('click', () => onSelectRef.current(null));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  const shopsKey = useMemo(() => shops.map((shop) => shop.id).join('|'), [shops]);

  // マーカーの再構築（表示対象が変わったとき）
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const marker of markersRef.current.values()) marker.remove();
    markersRef.current.clear();

    for (const shop of shops) {
      const marker = L.marker([shop.location.lat, shop.location.lng], {
        icon: markerIcon(shop.category, shop.id === selectedId),
        title: pick(shop.name, lang),
        keyboard: true,
        alt: pick(shop.name, lang),
      });

      const approximate =
        shop.location.precision === 'approximate'
          ? `<p class="popup__approx">${escapeHtml(t('approximateNotice', lang))}</p>`
          : '';

      marker.bindPopup(
        `<div class="popup">
           <p class="popup__category">${escapeHtml(categoryLabel(shop.category, lang))}</p>
           <h3 class="popup__name">${escapeHtml(pick(shop.name, lang))}</h3>
           <p class="popup__row">${escapeHtml(pick(shop.location.address, lang))}</p>
           ${
             pick(shop.businessHours, lang)
               ? `<p class="popup__row">${escapeHtml(t('businessHours', lang))}: ${escapeHtml(
                   pick(shop.businessHours, lang),
                 )}</p>`
               : ''
           }
           ${
             pick(shop.closedDays, lang)
               ? `<p class="popup__row">${escapeHtml(t('closedDays', lang))}: ${escapeHtml(
                   pick(shop.closedDays, lang),
                 )}</p>`
               : ''
           }
           <p class="popup__row"><a href="${escapeHtml(googleMapsUrl(shop))}" target="_blank" rel="noopener noreferrer">${escapeHtml(
             t('openInGoogleMaps', lang),
           )}</a></p>
           ${approximate}
         </div>`,
      );

      marker.on('click', () => onSelectRef.current(shop.id));
      marker.addTo(map);
      markersRef.current.set(shop.id, marker);
    }

    // 表示中の店舗が収まるように地図をフィットさせる
    if (shops.length > 0) {
      const bounds = L.latLngBounds(
        shops.map((shop) => [shop.location.lat, shop.location.lng] as [number, number]),
      );
      map.fitBounds(bounds.pad(0.15), { maxZoom: 15 });
    } else {
      map.setView(TOWN_CENTER, DEFAULT_ZOOM);
    }
    // selectedId はアイコン更新用の別 effect で扱う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopsKey, lang]);

  // 選択状態のみが変わったとき: アイコン差し替え＋ポップアップ表示
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const shop of shops) {
      const marker = markersRef.current.get(shop.id);
      marker?.setIcon(markerIcon(shop.category, shop.id === selectedId));
    }

    if (!selectedId) return;
    const selected = shops.find((shop) => shop.id === selectedId);
    const marker = selected && markersRef.current.get(selected.id);
    if (selected && marker) {
      map.setView([selected.location.lat, selected.location.lng], 16, { animate: true });
      marker.openPopup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, shopsKey]);

  return <div ref={containerRef} className="map-view" role="application" />;
}
