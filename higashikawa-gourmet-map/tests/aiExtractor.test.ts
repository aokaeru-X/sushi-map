import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  IngestError,
  assertSafeUrl,
  extractMainContentText,
  normalizeExtracted,
} from '../lib/aiExtractor';

describe('assertSafeUrl', () => {
  it('http/https を許可する', () => {
    assert.equal(assertSafeUrl('https://example.com/a').hostname, 'example.com');
    assert.equal(assertSafeUrl('http://example.com').protocol, 'http:');
  });

  it('http/https 以外を拒否する', () => {
    for (const url of ['ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)']) {
      assert.throws(() => assertSafeUrl(url), IngestError, url);
    }
  });

  it('内部アドレスを拒否する（SSRF 対策）', () => {
    const blocked = [
      'http://localhost/',
      'http://127.0.0.1:3000/',
      'http://10.0.0.5/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://172.16.0.1/',
      'http://172.31.255.255/',
      'http://api.internal/',
    ];
    for (const url of blocked) {
      assert.throws(() => assertSafeUrl(url), IngestError, url);
    }
  });

  it('プライベート範囲に隣接する公開アドレスは許可する', () => {
    // 172.32.x.x は private 範囲外
    assert.ok(assertSafeUrl('http://172.32.0.1/'));
    assert.ok(assertSafeUrl('http://11.0.0.1/'));
  });

  it('URL として壊れている入力を拒否する', () => {
    assert.throws(() => assertSafeUrl('not a url'), IngestError);
  });
});

describe('extractMainContentText', () => {
  it('script / style / nav を除去して本文だけ返す', () => {
    const html = `
      <html><head><title>新しいカフェ | 東川ニュース</title>
      <meta name="description" content="東川町にカフェがオープン">
      <style>.a{color:red}</style></head>
      <body>
        <nav>ホーム ニュース</nav>
        <script>console.log('tracking')</script>
        <p>店名は「テストカフェ」です。</p>
        <div>営業時間 11:00-18:00</div>
        <footer>&copy; 2026</footer>
      </body></html>`;
    const text = extractMainContentText(html);

    assert.match(text, /新しいカフェ/);
    assert.match(text, /東川町にカフェがオープン/);
    assert.match(text, /テストカフェ/);
    assert.match(text, /11:00-18:00/);
    assert.doesNotMatch(text, /color:red/);
    assert.doesNotMatch(text, /tracking/);
    assert.doesNotMatch(text, /ホーム ニュース/);
    assert.doesNotMatch(text, /<[a-z]/i);
  });

  it('ブロック要素を改行に変換する', () => {
    const text = extractMainContentText('<p>一行目</p><p>二行目</p><br>三行目');
    assert.deepEqual(text.split('\n').slice(-3), ['一行目', '二行目', '三行目']);
  });

  it('HTML エンティティを復号する', () => {
    const text = extractMainContentText('<p>&yen;1,200&nbsp;/&#x30C6;&#12473;&#12488;</p>');
    assert.match(text, /¥1,200/);
    assert.match(text, /テスト/);
  });

  it('12,000 文字で打ち切る', () => {
    const text = extractMainContentText(`<p>${'あ'.repeat(20_000)}</p>`);
    assert.ok(text.length <= 12_000, `length=${text.length}`);
  });
});

describe('normalizeExtracted', () => {
  const base = {
    name_ja: 'テストカフェ',
    category: 'cafe',
    features: [],
  };

  it('店名が無ければ IngestError（422）', () => {
    for (const raw of [{}, { name_ja: '' }, { name_ja: '   ' }, { name_ja: null }]) {
      assert.throws(
        () => normalizeExtracted(raw),
        (error: unknown) => error instanceof IngestError && error.status === 422,
      );
    }
  });

  it('オブジェクト以外を拒否する', () => {
    for (const raw of [null, 'text', 42, undefined]) {
      assert.throws(() => normalizeExtracted(raw), IngestError);
    }
  });

  it('未知のカテゴリは cafe に丸める', () => {
    assert.equal(normalizeExtracted({ ...base, category: 'yakiniku' }).category, 'cafe');
    assert.equal(normalizeExtracted({ ...base, category: 'bakery' }).category, 'bakery');
  });

  it('既知の Features だけを通し重複を除く', () => {
    const result = normalizeExtracted({
      ...base,
      features: ['湧水使用', '湧水使用', 'カウンター席', 'テラス席', 42, null],
    });
    assert.deepEqual(result.features, ['湧水使用', 'テラス席']);
  });

  it('空文字・"null" 文字列を null にする', () => {
    const result = normalizeExtracted({ ...base, address_ja: '', tel: 'null', name_en: '  ' });
    assert.equal(result.address_ja, null);
    assert.equal(result.tel, null);
    assert.equal(result.name_en, null);
  });

  it('Instagram の @ を除去する', () => {
    assert.equal(
      normalizeExtracted({ ...base, instagram_handle: '@wednesday_cafe' }).instagram_handle,
      'wednesday_cafe',
    );
  });

  it('features が配列でなければ空配列にする', () => {
    assert.deepEqual(normalizeExtracted({ ...base, features: 'テラス席' }).features, []);
  });
});
