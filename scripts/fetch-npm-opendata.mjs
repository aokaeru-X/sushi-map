#!/usr/bin/env node
/**
 * 國立故宮博物院（台北）Open Data 取込スクリプト
 * ---------------------------------------------------------------------------
 * 本サイトは静的サイト（バックエンドなし）のため、APIキーをブラウザ側に置くと
 * 公開時に第三者へ露出する。そこで通信はこのビルド時スクリプトに閉じ込め、
 * サイトは生成された data/npm-collection.json のみを読む構成にしている。
 *
 * 実行例
 * ---------------------------------------------------------------------------
 *  # A. OpenAPI（要APIキー）から取得
 *  NPM_API_KEY=xxxxx node scripts/fetch-npm-opendata.mjs --mode=api
 *
 *  # エンドポイントを明示する場合
 *  NPM_API_KEY=xxxxx NPM_API_BASE=https://openapiweb.npm.gov.tw \
 *    NPM_API_PATH=/api/v1/collection node scripts/fetch-npm-opendata.mjs --mode=api
 *
 *  # B. Open Data 專區からダウンロードしたデータセットを取り込む（キー不要）
 *  #    https://theme.npm.edu.tw/opendata/ の「文物查詢下載」で入手したファイル
 *  node scripts/fetch-npm-opendata.mjs --mode=file --input=./npm-dataset.xml
 *  node scripts/fetch-npm-opendata.mjs --mode=file --input=./npm-dataset.json
 *
 *  # C. 既存の手動シードを検証するだけ（通信しない）
 *  node scripts/fetch-npm-opendata.mjs --mode=validate
 *
 * 注意
 * ---------------------------------------------------------------------------
 *  - APIキーは絶対にコミットしないこと。.env は .gitignore 済み。
 *  - 画像ライセンス: 低解像度(100万画素)=CC0 / 中解像度(600万画素)=CC BY 4.0。
 *    CC BY を使う場合は「國立故宮博物院」の出所表示が必要。
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT_PATH = path.join(ROOT, "data", "npm-collection.json");

const PORTAL = "https://theme.npm.edu.tw/opendata/";
const LICENSE_NOTE =
  "低解像度画像（100万画素）はCC0、中解像度画像（600万画素）はCC BY 4.0。CC BYの画像を用いる場合は「國立故宮博物院」の出所表示が必要。";

// ---------------------------------------------------------------------------
// 引数
// ---------------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
  })
);
const mode = args.mode || "validate";

// ---------------------------------------------------------------------------
// 本サイトが「台北・国立故宮博物院所蔵」として扱う書跡・金石の一覧。
// ここに載る作品名で Open Data 側を突き合わせる。
// ---------------------------------------------------------------------------
const TARGET_WORKS = [
  { siteId: "s29", workJa: "快雪時晴帖", workZhTw: "快雪時晴帖", artist: "王羲之（伝）", dynasty: "東晉" },
  { siteId: "s29", workJa: "自叙帖", workZhTw: "自敘帖", artist: "懷素", dynasty: "唐" },
  { siteId: "s29", workJa: "書譜", workZhTw: "書譜", artist: "孫過庭", dynasty: "唐" },
  { siteId: "s29", workJa: "寒食帖", workZhTw: "黃州寒食帖", artist: "蘇軾", dynasty: "北宋" },
  { siteId: "s29", workJa: "花気薫人帖", workZhTw: "花氣薰人帖", artist: "黃庭堅", dynasty: "北宋" },
  { siteId: "s29", workJa: "遠宦帖", workZhTw: "遠宦帖", artist: "王羲之（伝）", dynasty: "東晉" },
  { siteId: "s29", workJa: "蜀素帖", workZhTw: "蜀素帖", artist: "米芾", dynasty: "北宋" },
  { siteId: "s29", workJa: "毛公鼎", workZhTw: "毛公鼎", artist: "—", dynasty: "西周" },
  { siteId: "s29", workJa: "散氏盤", workZhTw: "散氏盤", artist: "—", dynasty: "西周" },
  { siteId: "s29", workJa: "祭姪文稿", workZhTw: "祭姪文稿", artist: "顏真卿", dynasty: "唐" },
];

// 検証済みの参照URL（手動シード）。API/データセット取込時は上書きされる。
const MANUAL_LINKS = {
  快雪時晴帖: "https://theme.npm.edu.tw/selection/Article.aspx?sNo=04001001",
};
const COLLECTION_INDEX_URL = "https://theme.npm.edu.tw/selection/Category.aspx?sNo=03000118";

function seedItems() {
  return TARGET_WORKS.map((w) => ({
    siteId: w.siteId,
    workJa: w.workJa,
    workZhTw: w.workZhTw,
    artist: w.artist,
    dynasty: w.dynasty,
    npmId: null,
    imageUrl: null,
    detailUrl: MANUAL_LINKS[w.workJa] || COLLECTION_INDEX_URL,
    license: null,
    provenance: "manual",
  }));
}

// ---------------------------------------------------------------------------
// XML / JSON からのゆるいレコード抽出
// （Node標準にXMLパーサが無いため、データセットの繰り返し要素をタグ抽出で処理する）
// ---------------------------------------------------------------------------
function textOf(block, tags) {
  for (const t of tags) {
    const m = block.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i"));
    if (m) {
      return m[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/<[^>]+>/g, "")
        .trim();
    }
  }
  return null;
}

function parseXmlRecords(xml) {
  // 最も出現回数の多い繰り返し要素をレコード単位とみなす
  const counts = new Map();
  for (const m of xml.matchAll(/<([A-Za-z_][\w.:-]*)[^>]*>/g)) {
    counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  }
  let recTag = null;
  let best = 1;
  for (const [tag, n] of counts) {
    if (n > best) { best = n; recTag = tag; }
  }
  if (!recTag) return [];

  const blocks = [...xml.matchAll(new RegExp(`<${recTag}[^>]*>([\\s\\S]*?)</${recTag}>`, "gi"))];
  return blocks.map((b) => b[1]);
}

function normalizeRecord(block) {
  const title = textOf(block, ["題名", "品名", "名稱", "Title", "title", "文物名稱"]);
  if (!title) return null;
  return {
    title,
    npmId: textOf(block, ["文物統一編號", "統一編號", "編號", "Id", "id", "ID"]),
    artist: textOf(block, ["作者", "Artist", "creator"]),
    dynasty: textOf(block, ["時代", "朝代", "Dynasty", "period"]),
    imageUrl: textOf(block, ["圖檔連結", "圖像連結", "ImageUrl", "image", "圖片網址"]),
    detailUrl: textOf(block, ["典藏連結", "詳細連結", "Url", "url", "連結"]),
    license: textOf(block, ["授權", "授權條款", "License", "license"]),
  };
}

function matchWork(records, work) {
  const wants = [work.workZhTw, work.workJa].filter(Boolean);
  return records.find((r) => r && wants.some((w) => r.title.includes(w))) || null;
}

// ---------------------------------------------------------------------------
// モード実装
// ---------------------------------------------------------------------------
async function fromApi() {
  const key = process.env.NPM_API_KEY;
  if (!key) {
    console.error(
      "[エラー] 環境変数 NPM_API_KEY が未設定です。\n" +
      "  例: NPM_API_KEY=xxxxx node scripts/fetch-npm-opendata.mjs --mode=api\n" +
      "  キーは https://openapiweb.npm.gov.tw/ で申請します。"
    );
    process.exit(1);
  }
  const base = process.env.NPM_API_BASE || "https://openapiweb.npm.gov.tw";
  const apiPath = process.env.NPM_API_PATH;
  if (!apiPath) {
    console.error(
      "[エラー] 環境変数 NPM_API_PATH が未設定です。\n" +
      "  故宮OpenAPIは提供APIごとにパスが異なるため、利用するAPIのパスを指定してください。\n" +
      "  例: NPM_API_PATH=/api/v1/collection\n" +
      "  （利用可能なAPI一覧は https://openapiweb.npm.gov.tw/ の「API說明」を参照）"
    );
    process.exit(1);
  }

  const items = [];
  for (const work of TARGET_WORKS) {
    const url = new URL(apiPath, base);
    url.searchParams.set("keyword", work.workZhTw);
    // 故宮OpenAPIはAPIキー検証を行う。ヘッダ／クエリ双方に載せて互換性を確保する。
    url.searchParams.set("apikey", key);

    let rec = null;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json, text/xml;q=0.9", "X-Api-Key": key, Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        console.warn(`  ! ${work.workJa}: HTTP ${res.status}`);
      } else {
        const body = await res.text();
        const records = body.trim().startsWith("{") || body.trim().startsWith("[")
          ? toArray(JSON.parse(body)).map((o) => normalizeJson(o)).filter(Boolean)
          : parseXmlRecords(body).map(normalizeRecord).filter(Boolean);
        rec = matchWork(records, work);
      }
    } catch (e) {
      console.warn(`  ! ${work.workJa}: ${e.message}`);
    }

    items.push(buildItem(work, rec, rec ? "api" : "manual"));
    console.log(`  ${rec ? "✓" : "·"} ${work.workJa}`);
  }
  return items;
}

function toArray(json) {
  if (Array.isArray(json)) return json;
  for (const k of ["data", "items", "result", "results", "records", "Data"]) {
    if (Array.isArray(json?.[k])) return json[k];
  }
  return json && typeof json === "object" ? [json] : [];
}

function normalizeJson(o) {
  const title = o.題名 || o.品名 || o.名稱 || o.Title || o.title || o.文物名稱;
  if (!title) return null;
  return {
    title: String(title),
    npmId: o.文物統一編號 || o.統一編號 || o.Id || o.id || o.ID || null,
    artist: o.作者 || o.Artist || o.artist || null,
    dynasty: o.時代 || o.朝代 || o.Dynasty || o.dynasty || null,
    imageUrl: o.圖檔連結 || o.圖像連結 || o.ImageUrl || o.imageUrl || null,
    detailUrl: o.典藏連結 || o.Url || o.url || null,
    license: o.授權 || o.授權條款 || o.License || o.license || null,
  };
}

function buildItem(work, rec, provenance) {
  return {
    siteId: work.siteId,
    workJa: work.workJa,
    workZhTw: work.workZhTw,
    artist: rec?.artist || work.artist,
    dynasty: rec?.dynasty || work.dynasty,
    npmId: rec?.npmId || null,
    imageUrl: rec?.imageUrl || null,
    detailUrl: rec?.detailUrl || MANUAL_LINKS[work.workJa] || COLLECTION_INDEX_URL,
    license: rec?.license || null,
    provenance,
  };
}

function fromFile(inputPath) {
  if (!inputPath || inputPath === true) {
    console.error("[エラー] --input=<ファイルパス> を指定してください。");
    process.exit(1);
  }
  const abs = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(abs)) {
    console.error(`[エラー] ファイルが見つかりません: ${abs}`);
    process.exit(1);
  }
  const body = fs.readFileSync(abs, "utf8");
  const records = body.trim().startsWith("{") || body.trim().startsWith("[")
    ? toArray(JSON.parse(body)).map(normalizeJson).filter(Boolean)
    : parseXmlRecords(body).map(normalizeRecord).filter(Boolean);

  console.log(`  データセットから ${records.length} 件のレコードを読み込みました`);
  return TARGET_WORKS.map((work) => {
    const rec = matchWork(records, work);
    console.log(`  ${rec ? "✓" : "·"} ${work.workJa}`);
    return buildItem(work, rec, rec ? "dataset" : "manual");
  });
}

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------
function write(items, sourceLabel) {
  const matched = items.filter((i) => i.provenance !== "manual").length;
  const out = {
    meta: {
      source: "國立故宮博物院 Open Data",
      sourceLabel,
      portal: PORTAL,
      license: LICENSE_NOTE,
      fetchedAt: new Date().toISOString(),
      matched,
      total: items.length,
      note:
        "本ファイルは scripts/fetch-npm-opendata.mjs が生成する。provenance が manual の項目は " +
        "APIやデータセットとの突き合わせが未了で、参照リンクのみを持つ。",
    },
    items,
  };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`\n書き出し: ${path.relative(ROOT, OUT_PATH)}（照合済 ${matched}/${items.length} 件）`);
}

// ---------------------------------------------------------------------------
const main = async () => {
  if (mode === "api") {
    console.log("モード: OpenAPI（APIキー使用）");
    write(await fromApi(), "openapi");
  } else if (mode === "file") {
    console.log("モード: ローカルデータセット取込");
    write(fromFile(args.input), "dataset");
  } else if (mode === "validate") {
    console.log("モード: シード生成のみ（通信なし）");
    write(seedItems(), "manual-seed");
  } else {
    console.error(`不明なモード: ${mode}（api / file / validate のいずれか）`);
    process.exit(1);
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
