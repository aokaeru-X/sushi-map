# CLAUDE.md

このファイルは、本リポジトリで作業する Claude Code / AI アシスタント向けのガイドです。

## プロジェクト概要

北宋の文学者・蘇軾（蘇東坡, 1037–1101）の生涯を、赴任・左遷の地として年代順に地図上へマッピングするインタラクティブな**静的 Web ページ**。左の年表、中央の Leaflet 地図、右の詳細パネルの 3 ペイン構成。

- **ビルド不要・依存パッケージなし**（`package.json` も `node_modules` もない）
- バニラ JS（ES5 相当の書き方）+ Leaflet 1.9.4 をローカル同梱
- UI テキスト・データ・ドキュメント・コミットメッセージはすべて**日本語**

## ファイル構成

```
index.html          ページ本体（ヘッダー / サイドバー年表 / 地図 / 詳細パネルの静的骨格）
css/style.css       全スタイル。:root の CSS 変数がデザイントークン
js/app.js           唯一のスクリプト。IIFE + "use strict"。全ロジックがここに集約
data/sushi.json     コンテンツの単一の情報源（地点・出来事・作品・記念地）
vendor/leaflet/     Leaflet 1.9.4 一式（leaflet.js / leaflet.css / images/）
README.md           利用者向け説明
```

## 実行と確認

`file://` 直開きでは `fetch("data/sushi.json")` が CORS で失敗するため、**必ず HTTP サーバー経由**で確認する。

```bash
python3 -m http.server 8000
# http://localhost:8000
```

地図タイルは OpenStreetMap を参照するため、表示にはネットワーク接続が必要（それ以外はすべてローカル完結）。

テスト・リンター・CI は存在しない。動作確認はブラウザでの目視、または以下の最低限のチェックで行う。

```bash
python3 -m json.tool data/sushi.json > /dev/null   # JSON の構文確認
node --check js/app.js                              # 構文確認（実行はしない）
```

## データモデル（`data/sushi.json`）

トップレベルは 4 キー。**`life` と `memorials` のみがアプリから読まれる**。

### `life[]` — 生涯の足跡（現在 16 件、`seq` は 1..16 の連番）

`app.js` が参照する必須フィールド:

| フィールド | 用途 |
| --- | --- |
| `seq` | 番号ピンの数字・年表の並び・`lifeMarkers` / `timelineItems` のキー |
| `title` | 見出し（例: 「黄州左遷」） |
| `era_year` / `western_year` | 元号年 / 西暦（数値）。年表・詳細に併記 |
| `age` | 詳細パネルに「享年」ラベルで表示（※実際は当時の年齢） |
| `location_old` / `location_modern` | 当時の地名 / 現在の行政区 |
| `lat` / `lng` | ピン座標 |
| `note` | 概要文 |
| `highlights[]` | 文字列配列。「この地での出来事」 |
| `works[]` | `{title, year, desc}`。「この地で生まれた代表作」 |

`highlights` と `works` は空配列でもよいが、**キー自体は必ず置く**（`app.js` は存在チェックをしているが、既存データは全件でキーを持つ形に揃っている）。

### `memorials[]` — 現存する記念地（`{title, location_modern, lat, lng, desc}`）

生涯の足跡とは別レイヤー。初期状態は非表示。

### アプリが読まない 2 キー（資料メモとして保持）

- `person` — 人物の基本情報
- `unplaced_works` — 制作地を特定できていない書跡

これらは削除しない。UI に出したくなった場合は `app.js` 側で新たに読む。
同様に `life[1].western_year_label` と CSS の `.popup-link` は現状未使用。

### データを追加・修正するときの注意

- `life` に地点を足す場合は **`seq` を振り直して 1 からの連番を保つ**（経路線は配列順、番号ピンは `seq` を描画するため、ズレると表示が破綻する）。
- 経路の破線（`L.polyline`）は `life` の**配列順**で結ばれる。年代順に並べること。
- 同一座標に複数地点がある場合（杭州の 2 回赴任など）は `jitteredLatLng()` が自動でピンをずらす。データ側で座標を微調整する必要はない。
- 年代・地名は資料により表記ゆれがある。推定を含む記述は `note` / `desc` に「推定」と明記する既存の書き方に合わせる。

## `js/app.js` の構造と規約

上から: 地図初期化 → レイヤー生成 → DOM 参照 → 描画関数群 → `fetch` でデータ読み込み・マーカー生成 → レイヤー切替 / サイドバー開閉のイベント登録。

守るべき規約:

- **全体が IIFE + `"use strict"`**。グローバルを増やさない。
- **`var` と `function` 宣言のみ**。既存コードに `let` / `const` / アロー関数 / テンプレートリテラルは一切ない。ES5 スタイルを維持する。
- **`innerHTML` に入れるデータ由来の文字列は必ず `escapeHtml()` を通す**。数値フィールド（`seq` / `western_year` / `age`）のみ素通し。新しいフィールドを表示するときも同じ扱いにする。
- レイヤーは `lifeLayer`（既定で表示）と `memorialLayer`（既定で非表示）の 2 つ。追加する場合は `index.html` のチェックボックスと `layer-*` の id 規約に合わせる。
- 2 つのレイヤーはマーカークリック時の描画関数が別（`renderLifeDetail` / `renderMemorialDetail`）。

既知の小さな癖（触るときの注意）:

- `focusLife(item, opts)` の `opts` は受け取るだけで未使用。初期化時に `focusLife(data.life[0], {silent:true})` を呼んだ直後に `map.setView(...)` と `hideDetail()` で打ち消しており、実質「1 件目をアクティブ表示だけして全体表示に戻す」動作になっている。
- 初期ビュー `[29.5, 112] / zoom 5` は 2 箇所（4 行目と初期化末尾）にハードコードされている。変更時は両方直す。

## `css/style.css` の規約

- 色・寸法は `:root` の CSS 変数（`--ink` / `--paper` / `--accent` / `--line` / `--header-h` / `--sidebar-w` 等）に集約。**新しい色を直書きせず変数を使うか、変数を追加する**。
- クラス名は BEM 風（`.timeline-item__year`, `.detail-panel__close`, `.app-header__toggle`）。
- 明朝体基調の和文フォントスタックと、生成り色（`--paper`）＋朱色（`--accent`）の配色が全体のトーン。安易に変えない。
- `@media (max-width: 860px)` でサイドバーがオーバーレイ化し、ヘッダーの「年表 ☰」ボタン（`.sidebar.open` のトグル）で開閉する。レイアウトを変えたらこのブレークポイントも確認する。

## 依存関係の方針

- **CDN を導入しない。** Leaflet はオフライン動作のため `vendor/` に同梱している。新しいライブラリが必要な場合も同梱するか、素の JS で書く。
- `vendor/leaflet/` は配布物そのまま。手を入れない（アイコン画像のパスは `leaflet.css` からの相対参照）。

## Git 運用

- コミットメッセージは**日本語**。1 行目に要約、空行を挟んで変更内容の説明（既存コミット `3c45361` を参照）。
- 作業ブランチは指示されたブランチ（例: `claude/...`）で行い、`git push -u origin <branch>` でプッシュする。
- プルリクエストは明示的に依頼された場合のみ作成する。
