import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pick } from '../lib/i18n';
import { getSeedShops } from '../lib/seedShops';
import { CATEGORIES, LANGS, type Shop } from '../types/shop';
import {
  appleMapsUrl,
  googleMapsDirectionsUrl,
  googleMapsUrl,
  instagramUrl,
  telUrl,
} from '../utils/urlGenerator';

function shop(overrides: Partial<Shop> = {}): Shop {
  return {
    id: 'x',
    status: 'published',
    name: { ja: 'テストカフェ' },
    category: 'cafe',
    location: {
      lat: 43.6,
      lng: 142.51,
      address: { ja: '北海道上川郡東川町東町1丁目1-1' },
      precision: 'exact',
    },
    businessHours: { ja: '' },
    closedDays: { ja: '' },
    features: [],
    socialLinks: {},
    sourceUrls: [],
    heroImageUrl: '/images/default-shop.jpg',
    ...overrides,
  };
}

describe('instagramUrl', () => {
  it('アカウント名から URL を組む（@ 付きも許容）', () => {
    assert.equal(instagramUrl('wednesday_cafe'), 'https://www.instagram.com/wednesday_cafe/');
    assert.equal(instagramUrl('@wednesday_cafe'), 'https://www.instagram.com/wednesday_cafe/');
  });

  it('未設定・不正な値は null', () => {
    for (const value of [undefined, '', 'has space', 'a/b', 'x'.repeat(31)]) {
      assert.equal(instagramUrl(value), null, String(value));
    }
  });
});

describe('googleMapsUrl', () => {
  it('座標が実測値なら座標で開く', () => {
    assert.equal(
      googleMapsUrl(shop()),
      'https://www.google.com/maps/search/?api=1&query=43.6,142.51',
    );
  });

  it('座標が概算値なら店名＋住所の検索にする', () => {
    const url = googleMapsUrl(
      shop({
        location: { ...shop().location, precision: 'approximate' },
      }),
    );
    assert.doesNotMatch(url, /43\.6,142\.51/);
    assert.match(url, /query=/);
    assert.match(decodeURIComponent(url), /テストカフェ 北海道上川郡東川町東町1丁目1-1/);
  });

  it('経路案内も同じ規則に従う', () => {
    assert.match(googleMapsDirectionsUrl(shop()), /destination=43\.6%2C142\.51/);
    const approx = googleMapsDirectionsUrl(
      shop({ location: { ...shop().location, precision: 'approximate' } }),
    );
    assert.match(decodeURIComponent(approx), /テストカフェ/);
  });

  it('Apple マップは実測値なら ll、概算値なら address を渡す', () => {
    assert.match(appleMapsUrl(shop()), /ll=43\.6%2C142\.51/);
    const approx = appleMapsUrl(
      shop({ location: { ...shop().location, precision: 'approximate' } }),
    );
    assert.match(approx, /address=/);
    assert.doesNotMatch(approx, /ll=/);
  });
});

describe('telUrl', () => {
  it('区切り文字を除いて tel: にする', () => {
    assert.equal(telUrl('0166-82-3244'), 'tel:0166823244');
    assert.equal(telUrl('090 5988 0230'), 'tel:09059880230');
  });

  it('短すぎる値・未設定は null', () => {
    assert.equal(telUrl(undefined), null);
    assert.equal(telUrl('123'), null);
  });
});

describe('i18n pick', () => {
  it('訳が無ければ日本語にフォールバックする', () => {
    const text = { ja: '和名', en: 'English' };
    assert.equal(pick(text, 'ja'), '和名');
    assert.equal(pick(text, 'en'), 'English');
    assert.equal(pick(text, 'zh-TW'), '和名');
    assert.equal(pick({ ja: '和名', en: '   ' }, 'en'), '和名');
    assert.equal(pick(undefined, 'en'), '');
  });
});

describe('シードデータ（グルメMAP 令和8年7月版）', () => {
  const shops = getSeedShops();

  it('67 店舗を読み込める', () => {
    assert.equal(shops.length, 67);
  });

  it('全店舗が必須項目とスキーマ準拠のカテゴリを持つ', () => {
    for (const s of shops) {
      assert.ok(s.id, 'id');
      assert.ok(s.name.ja, `name.ja (${s.id})`);
      assert.equal(s.status, 'published');
      assert.ok(CATEGORIES.includes(s.category), `category=${s.category} (${s.name.ja})`);
      assert.match(s.location.address.ja, /^北海道上川郡東川町/);
      assert.ok(Number.isFinite(s.location.lat) && Number.isFinite(s.location.lng));
      assert.ok(Array.isArray(s.features));
    }
  });

  it('id が重複していない', () => {
    assert.equal(new Set(shops.map((s) => s.id)).size, shops.length);
  });

  it('座標が東川町周辺の範囲に収まっている', () => {
    for (const s of shops) {
      assert.ok(s.location.lat > 43.4 && s.location.lat < 43.8, `lat ${s.name.ja}`);
      assert.ok(s.location.lng > 142.3 && s.location.lng < 142.7, `lng ${s.name.ja}`);
    }
  });

  it('座標はすべて概算値として明示されている', () => {
    // geocode スクリプト実行前は approximate であることを保証する
    assert.ok(shops.every((s) => s.location.precision === 'approximate'));
  });

  it('電話番号は市外局番または携帯の形式', () => {
    for (const s of shops) {
      if (!s.tel) continue;
      assert.match(s.tel, /^0\d{1,3}-\d{2,4}-\d{4}$/, `${s.name.ja}: ${s.tel}`);
    }
  });

  it('全言語で表示名を解決できる', () => {
    for (const s of shops) {
      for (const lang of LANGS) {
        assert.ok(pick(s.name, lang).length > 0);
      }
    }
  });
});
