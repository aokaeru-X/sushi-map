import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { buildNotionProperties, pageToShop } from '../lib/notion';
import type { ExtractedShopData } from '../types/shop';

/** テスト用の Notion プロパティ生成ヘルパー */
const title = (text: string) => ({
  id: 'title',
  type: 'title' as const,
  title: [{ plain_text: text }],
});
const richText = (text: string) => ({
  id: 'rt',
  type: 'rich_text' as const,
  rich_text: [{ plain_text: text }],
});
const number = (value: number | null) => ({ id: 'n', type: 'number' as const, number: value });
const select = (name: string | null) => ({
  id: 's',
  type: 'select' as const,
  select: name === null ? null : { name },
});

function page(properties: Record<string, unknown>): PageObjectResponse {
  return { id: 'page-1', properties } as unknown as PageObjectResponse;
}

describe('pageToShop', () => {
  it('揃ったプロパティを Shop に変換する', () => {
    const shop = pageToShop(
      page({
        Name_JA: title('てん月庵'),
        Name_EN: richText('tengetsuan'),
        Name_ZHTW: richText('天月庵'),
        Status: select('published'),
        Category: select('bakery'),
        Lat: number(43.598),
        Lng: number(142.5162),
        Address_JA: richText('北海道上川郡東川町南町1丁目1-3'),
        BusinessHours_JA: richText('8:30-19:30'),
        ClosedDays_JA: richText('第1.2.3.5水'),
        Features: {
          id: 'f',
          type: 'multi_select',
          multi_select: [{ name: '東川米使用' }, { name: '駐車場あり' }],
        },
        InstagramHandle: richText('@tengetsuan'),
        SourceURLs: { id: 'u', type: 'url', url: 'https://example.com/a' },
        HeroImageUrl: { id: 'h', type: 'url', url: 'https://example.com/hero.jpg' },
        Tel: richText('0166-82-3004'),
      }),
    );

    assert.equal(shop.name.ja, 'てん月庵');
    assert.equal(shop.name.en, 'tengetsuan');
    assert.equal(shop.name.zhTW, '天月庵');
    assert.equal(shop.status, 'published');
    assert.equal(shop.category, 'bakery');
    assert.equal(shop.location.lat, 43.598);
    assert.equal(shop.location.precision, 'exact');
    assert.deepEqual(shop.features, ['東川米使用', '駐車場あり']);
    // @ は保存側でも表示側でも付けない
    assert.equal(shop.socialLinks.instagramHandle, 'tengetsuan');
    assert.deepEqual(shop.sourceUrls, ['https://example.com/a']);
    assert.equal(shop.heroImageUrl, 'https://example.com/hero.jpg');
    assert.equal(shop.tel, '0166-82-3004');
  });

  it('プロパティが空でも例外を投げずフォールバックする', () => {
    const shop = pageToShop(page({ Name_JA: title('名前だけの店') }));

    assert.equal(shop.name.ja, '名前だけの店');
    assert.equal(shop.name.en, undefined);
    assert.equal(shop.status, 'draft'); // 不明な Status は draft 扱い
    assert.equal(shop.category, 'cafe'); // 不明な Category は cafe 扱い
    assert.equal(shop.location.precision, 'approximate');
    assert.equal(shop.location.lat, 43.6012); // 町中心にフォールバック
    assert.deepEqual(shop.features, []);
    assert.equal(shop.heroImageUrl, '/images/default-shop.jpg');
    assert.equal(shop.tel, undefined);
  });

  it('未知の Status / Category を安全な既定値に丸める', () => {
    const shop = pageToShop(
      page({
        Name_JA: title('x'),
        Status: select('公開中'),
        Category: select('yakiniku'),
      }),
    );
    assert.equal(shop.status, 'draft');
    assert.equal(shop.category, 'cafe');
  });

  it('archived / published はそのまま維持する', () => {
    for (const status of ['published', 'archived'] as const) {
      assert.equal(
        pageToShop(page({ Name_JA: title('x'), Status: select(status) })).status,
        status,
      );
    }
  });

  it('Number プロパティが Text で運用されていても数値として読む', () => {
    const shop = pageToShop(
      page({
        Name_JA: title('x'),
        Lat: richText('43.5993'),
        Lng: richText('142.5192'),
      }),
    );
    assert.equal(shop.location.lat, 43.5993);
    assert.equal(shop.location.precision, 'exact');
  });

  it('数値として解釈できない Text は座標なし扱いにする', () => {
    const shop = pageToShop(
      page({ Name_JA: title('x'), Lat: richText('未調査'), Lng: richText('') }),
    );
    assert.equal(shop.location.precision, 'approximate');
  });

  it('Text プロパティが Url / Phone に変更されていても読める', () => {
    const shop = pageToShop(
      page({
        Name_JA: title('x'),
        Tel: { id: 'p', type: 'phone_number', phone_number: '0166-82-2543' },
      }),
    );
    assert.equal(shop.tel, '0166-82-2543');
  });

  it('HeroImageUrl が Files 型でも URL を取り出す', () => {
    const external = pageToShop(
      page({
        Name_JA: title('x'),
        HeroImageUrl: {
          id: 'h',
          type: 'files',
          files: [{ name: 'a.jpg', external: { url: 'https://cdn.example/a.jpg' } }],
        },
      }),
    );
    assert.equal(external.heroImageUrl, 'https://cdn.example/a.jpg');

    const uploaded = pageToShop(
      page({
        Name_JA: title('x'),
        HeroImageUrl: {
          id: 'h',
          type: 'files',
          files: [{ name: 'b.jpg', file: { url: 'https://s3.example/b.jpg', expiry_time: '' } }],
        },
      }),
    );
    assert.equal(uploaded.heroImageUrl, 'https://s3.example/b.jpg');
  });

  it('SourceURLs の複数 URL を分割し、URL でない値は捨てる', () => {
    const shop = pageToShop(
      page({
        Name_JA: title('x'),
        SourceURLs: richText('https://a.example/1、https://b.example/2 メモ'),
      }),
    );
    assert.deepEqual(shop.sourceUrls, ['https://a.example/1', 'https://b.example/2']);
  });
});

describe('buildNotionProperties', () => {
  const extracted: ExtractedShopData = {
    name_ja: 'テストカフェ',
    name_en: 'Test Cafe',
    category: 'cafe',
    address_ja: '北海道上川郡東川町東町1丁目1-1',
    business_hours_ja: '11:00-17:00',
    closed_days_ja: '水',
    tel: '0166-00-0000',
    features: ['湧水使用'],
    instagram_handle: '@test_cafe',
    description_ja: '説明',
    extraction_notes: null,
  };

  it('draft として必須プロパティを組み立てる', () => {
    const props = buildNotionProperties(extracted, 'https://example.com/news') as Record<
      string,
      { select?: { name: string }; url?: string }
    >;
    assert.equal(props.Status.select?.name, 'draft');
    assert.equal(props.Category.select?.name, 'cafe');
    assert.equal(props.SourceURLs.url, 'https://example.com/news');
    assert.ok(props.Name_JA);
    assert.ok(props.Features);
  });

  it('空の項目はプロパティ自体を送らない', () => {
    const props = buildNotionProperties(
      {
        ...extracted,
        name_en: null,
        address_ja: null,
        tel: null,
        features: [],
        instagram_handle: null,
        description_ja: null,
      },
      'https://example.com/news',
    );
    for (const key of ['Name_EN', 'Address_JA', 'Tel', 'Features', 'InstagramHandle']) {
      assert.equal(key in props, false, `${key} は送らない`);
    }
  });

  it('status を明示すれば published でも作れる', () => {
    const props = buildNotionProperties(extracted, 'https://x.example', 'published') as Record<
      string,
      { select?: { name: string } }
    >;
    assert.equal(props.Status.select?.name, 'published');
  });

  it('Instagram の @ を除いて保存する', () => {
    const props = buildNotionProperties(extracted, 'https://x.example') as Record<
      string,
      { rich_text?: { text: { content: string } }[] }
    >;
    assert.equal(props.InstagramHandle.rich_text?.[0].text.content, 'test_cafe');
  });
});
