# 東川町グルメMAP — Notion Headless CMS 連携 Web サイト

『東川町グルメMAP Webサイト開発仕様書（Notion API Headless CMS 連携 ＆ AI URL インジェストパイプライン仕様）』
の実装です。非エンジニアが **Notion をスプレッドシート感覚で編集** すると、地図サイトが自動更新されます。

- **CMS 基盤**: Notion Database（Headless）
- **同期方式**: Next.js On-Demand ISR（キャッシュタグ `notion-shops`）
- **自動化**: URL を投げると LLM が店舗情報を抽出し Notion に `draft` 追加

初期データとして、ひがしかわ「道草館」作成『ひがしかわグルメMAP』令和8年7月版（市街地ver. / 郊外ver.）の
**67 店舗**を同梱しています（`data/seed-shops.json`）。

## クイックスタート

```bash
npm install
cp .env.example .env.local     # Notion 未設定でもそのまま動きます
npm run dev                    # http://localhost:3000 → /ja へリダイレクト
```

`NOTION_API_KEY` が未設定の場合は同梱シードデータを表示します（画面上に注記が出ます）。
明示的にシードで動かしたいときは `USE_SEED_DATA=true`。

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバ |
| `npm run build` / `npm start` | 本番ビルド / 起動 |
| `npm run typecheck` | 型チェック |
| `npm run seed:notion -- --dry-run` | シード 67 件の投入内容を確認 |
| `npm run seed:notion` | Notion に 67 件を投入（Name_JA 重複はスキップ） |
| `npm run geocode` | 住所から緯度経度を取得して `data/seed-shops.json` を更新 |
| `npm run geocode -- --notion` | Notion の Lat / Lng を更新 |

## 1. Notion データベースの準備

Notion に「東川町グルメ店舗一覧」データベースを作り、以下のプロパティを用意してインテグレーションを接続します。
名称・型が一致していないプロパティは**空として扱われる**（例外を投げない）ため、部分的な用意でも動きます。

| プロパティ名 | 型 | 説明 |
| --- | --- | --- |
| `Name_JA` | Title | 店舗名（日本語）※必須 |
| `Name_EN` / `Name_ZHTW` | Text | 店舗名（英語 / 繁体字中国語） |
| `Status` | Select | `published` / `draft` / `archived` |
| `Category` | Select | `cafe` `french` `italian` `ramen` `bakery` `gibier` `local_produce` `rice_ball` |
| `Lat` / `Lng` | Number | 緯度・経度（例: 43.6012 / 142.5188） |
| `Address_JA` | Text | 住所（例: 北海道上川郡東川町…） |
| `BusinessHours_JA` | Text | 営業時間（例: 11:00-18:00） |
| `ClosedDays_JA` | Text | 定休日（例: 火曜日・水曜日） |
| `Features` | Multi-select | 湧水使用 / テラス席 / エゾシカ肉 / テイクアウト可 / 駐車場あり / 東川米使用 / 個室あり / 予約推奨 |
| `InstagramHandle` | Text | Instagram アカウント名（`@` なし） |
| `SourceURLs` | Url | 情報取得元 URL |
| `HeroImageUrl` | Url / Files | メイン画像 URL |
| `Tel` | Text | 電話番号（任意・グルメMAP由来） |
| `Description_JA` | Text | 一言紹介（任意） |

`Lat` / `Lng` が空の店舗は町中心の座標で表示し、地図上に概算値である旨を注記します。

## 2. On-Demand ISR（Notion 更新の即時反映）

Notion の更新後、以下を叩くとキャッシュが失効し次のアクセスで最新化されます。

```bash
curl -X POST https://<your-domain>/api/revalidate -H "x-revalidate-secret: $REVALIDATE_SECRET"
# GET も可: /api/revalidate?secret=...
```

Notion の Webhook（またはワークフロー / 定期ポーリング）から呼び出してください。

> **実装メモ**: 仕様書では `fetch(..., { next: { tags: ['notion-shops'] } })` を想定していますが、
> Notion SDK の `databases.query` は **POST** リクエストであり Next.js の fetch キャッシュ（GET のみ対象）に
> 乗りません。そのため `unstable_cache(..., { tags: ['notion-shops'] })` でデータキャッシュ側にタグを付け、
> `revalidateTag('notion-shops', 'max')` で失効させています（`lib/notion.ts`）。
> Webhook が失敗した場合の保険として 1 時間の自動失効も設定済みです。

## 3. URL インジェスト（AI 自動抽出）

```bash
curl -X POST https://<your-domain>/api/admin/ingest \
  -H "content-type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"url":"https://example.com/news/new-cafe","dryRun":true}'
```

1. URL の HTML を取得（`http/https` のみ・内部アドレス拒否・15 秒タイムアウト）
2. script / style / nav などを除去して本文テキストを抽出（最大 12,000 文字）
3. LLM に JSON Schema で拘束した構造化抽出を依頼
4. 結果を `Status = 'draft'` で Notion に登録 → 管理者が Notion 上で確認し `published` に変更

`dryRun: true` なら Notion に書き込まず抽出結果のみ返します。ブラウザから使う場合は `/ja/admin`。

LLM プロバイダは `LLM_PROVIDER` で切り替えます。

| 値 | モデル既定値 | 実装 |
| --- | --- | --- |
| `anthropic`（既定） | `claude-opus-5` | 公式 SDK。構造化出力 + `effort: low`、拒否時は推奨モデルへ自動フォールバック |
| `gemini` | `gemini-2.5-flash` | REST API（`responseJsonSchema`） |

## 4. ディレクトリ構成

仕様書 3.（System Layout）に準拠しています。

```
higashikawa-gourmet-map/
├── app/
│   ├── [lang]/
│   │   ├── layout.tsx            # ルートレイアウト（ja / en / zh-TW）
│   │   ├── page.tsx              # Notion 連携対応メインマップページ
│   │   └── admin/page.tsx        # URL インジェスト画面
│   └── api/
│       ├── revalidate/route.ts   # Notion 更新時のISRキャッシュ破棄API
│       └── admin/ingest/route.ts # URL投入→AI解析→Notion Draft作成API
├── lib/
│   ├── notion.ts                 # Notion SDK クライアント & データ変換関数
│   ├── aiExtractor.ts            # LLM (Claude/Gemini) によるURL本文解析
│   ├── i18n.ts                   # 3 言語辞書とフォールバック
│   └── seedShops.ts              # Notion 未接続時のシードデータ
├── components/                   # 地図・一覧・フォーム（クライアント）
├── types/shop.ts                 # Notion対応TypeScript型定義
├── utils/urlGenerator.ts         # 動的SNS・Mapリンク生成
├── data/seed-shops.json          # グルメMAP 令和8年7月版 67 店舗
├── scripts/                      # Notion 投入 / ジオコーディング
└── proxy.ts                      # 言語プレフィックスへのリダイレクト
```

## 5. 実装上の判断メモ

- **カテゴリの割り当て**: 仕様書の 8 分類にグルメMAP の全 67 店舗を寄せています。
  `ramen` は「麺・定食・カレー・和食」、`gibier` は「焼肉・ジビエ・肉加工」、
  `local_produce` は「豆腐・酒・野菜直売・醸造」として運用しています（UI ラベルは `lib/i18n.ts`）。
- **緯度経度**: グルメMAP は住所のみの掲載で座標が無いため、同梱シードの座標は
  **町丁目・号線からの概算値**（`precision: 'approximate'`）です。ピンは数百 m ずれる可能性があります。
  外部ネットワークに出られる環境で `npm run geocode` を一度実行し、実測値へ置き換えてください
  （国土地理院の住所検索 API → Nominatim の順にフォールバック）。
  概算のままの店舗は Google マップリンクを「座標」ではなく「店名＋住所の検索」にしています。
- **言語**: `zh-TW` は URL セグメントとしてそのまま使用し、`<html lang>` には `zh-Hant-TW` を出力します。
  Notion に訳が無い項目は日本語にフォールバックします。
- **Next.js 16**: `middleware.ts` は非推奨のため `proxy.ts` を使用しています。

## 6. 動作確認済みの範囲

`USE_SEED_DATA=true` の本番ビルドで以下を実機確認しています（Chromium）。

- `/ja` `/en` `/zh-TW` の 3 言語が静的生成され、67 件のピンとカードが描画される
- カテゴリ絞り込み（例: パン・洋菓子 → 15 件）、フリーワード検索（例: 「湧水」→ 5 件）
- カード / ピンのクリックで地図が移動しポップアップが開く
- `POST /api/revalidate`: シークレット不一致 401 / 一致 200（タグ失効）
- `POST /api/admin/ingest`: トークン無し 401 / 内部アドレス 400 / 非 http(s) 400

LLM を実際に呼び出す経路（`ANTHROPIC_API_KEY` が必要）と Notion への読み書きは、
本環境に認証情報が無いため未実行です。
