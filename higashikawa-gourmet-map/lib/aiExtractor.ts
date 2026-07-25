/**
 * URL インジェスト用の AI 抽出パイプライン。
 *
 *   URL → HTML 取得 → 本文テキスト抽出 → LLM で構造化 JSON → Notion draft
 *
 * LLM は Anthropic（既定）と Gemini を選択できる（`LLM_PROVIDER` 環境変数）。
 * 出力は JSON Schema で拘束しているため、パース失敗はほぼ起きない前提だが、
 * 念のためスキーマ整形（`normalizeExtracted()`）を通してから Notion に渡す。
 */
import Anthropic from '@anthropic-ai/sdk';
import { CATEGORIES, isCategory, type ExtractedShopData } from '@/types/shop';

/** LLM に渡す本文の最大文字数（食べログ等の長いページを切り詰める）。 */
const MAX_CONTENT_CHARS = 12_000;
/** HTML 取得のタイムアウト（ミリ秒）。 */
const FETCH_TIMEOUT_MS = 15_000;

/** Notion の Features（multi-select）で運用している選択肢。 */
export const KNOWN_FEATURES = [
  '湧水使用',
  'テラス席',
  'エゾシカ肉',
  'テイクアウト可',
  '駐車場あり',
  '東川米使用',
  '個室あり',
  '予約推奨',
] as const;

const SYSTEM_PROMPT = `あなたは北海道上川郡東川町の飲食店情報を整理する編集アシスタントです。
与えられた Web ページの本文から、1 店舗分のメタデータを抽出してください。

規則:
- 本文に書かれていない情報は推測せず null（features は空配列）にする。
- category は次から最も近いものを 1 つ選ぶ: ${CATEGORIES.join(' | ')}
  （カフェ/喫茶=cafe, フレンチ=french, イタリアン/ピッツァ=italian,
   ラーメン/そば/うどん/定食=ramen, パン/ベーカリー/菓子=bakery,
   ジビエ/エゾシカ/焼肉=gibier, 農産物直売/豆腐/加工品=local_produce,
   おむすび/おにぎり=rice_ball）
- address_ja は「北海道上川郡東川町」から始まる形に正規化する。
  本文が「東町1丁目1-1」のような町内表記のみの場合も町名を補う。
- business_hours_ja / closed_days_ja は本文の表記をほぼそのまま残す（例: 11:00-18:00 / 火曜日・水曜日）。
- tel は半角ハイフン区切り（例: 0166-82-3244）。
- features は次の選択肢に一致するものだけを列挙する: ${KNOWN_FEATURES.join(', ')}
- instagram_handle は @ を除いたアカウント名のみ。
- description_ja は 120 字以内の紹介文。
- 判断に迷った点や本文から読み取れなかった項目は extraction_notes に日本語で残す。`;

/** Anthropic / Gemini 共通で使う JSON Schema。 */
const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    name_ja: { type: 'string', description: '店舗名（日本語）' },
    name_en: { type: ['string', 'null'], description: '店舗名（英語表記があれば）' },
    category: { type: 'string', enum: [...CATEGORIES] },
    address_ja: { type: ['string', 'null'] },
    business_hours_ja: { type: ['string', 'null'] },
    closed_days_ja: { type: ['string', 'null'] },
    tel: { type: ['string', 'null'] },
    features: { type: 'array', items: { type: 'string' } },
    instagram_handle: { type: ['string', 'null'] },
    description_ja: { type: ['string', 'null'] },
    extraction_notes: { type: ['string', 'null'] },
  },
  required: [
    'name_ja',
    'name_en',
    'category',
    'address_ja',
    'business_hours_ja',
    'closed_days_ja',
    'tel',
    'features',
    'instagram_handle',
    'description_ja',
    'extraction_notes',
  ],
  additionalProperties: false,
} as const;

export class IngestError extends Error {
  constructor(
    message: string,
    readonly status: number = 500,
  ) {
    super(message);
    this.name = 'IngestError';
  }
}

// ---------------------------------------------------------------------------
// 1. HTML 取得と本文抽出
// ---------------------------------------------------------------------------

/** SSRF 対策: http(s) のみ許可し、内部アドレスを拒否する。 */
export function assertSafeUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new IngestError('URL の形式が正しくありません。', 400);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new IngestError('http/https の URL のみ対応しています。', 400);
  }

  const host = url.hostname.toLowerCase();
  const isPrivate =
    host === 'localhost' ||
    host === '[::1]' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    /^(?:127|10)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(host);

  if (isPrivate) {
    throw new IngestError('内部ネットワークの URL は指定できません。', 400);
  }

  return url;
}

export async function fetchHtml(targetUrl: string): Promise<string> {
  const url = assertSafeUrl(targetUrl);

  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      'User-Agent': 'HigashikawaGourmetMapBot/1.0 (+https://higashikawa-gourmet.example)',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja,en;q=0.8',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new IngestError(
      `ページを取得できませんでした（HTTP ${response.status}）。`,
      response.status === 404 ? 400 : 502,
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType && !/text\/html|application\/xhtml|text\/plain/.test(contentType)) {
    throw new IngestError(
      `HTML ページではありません（Content-Type: ${contentType}）。`,
      400,
    );
  }

  return response.text();
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  yen: '¥',
  middot: '・',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      return HTML_ENTITIES[name.toLowerCase()] ?? match;
    });
}

/**
 * 軽量な本文テキスト抽出。DOM パーサを持ち込まずに
 * script/style/nav などのノイズを落としてからタグを除去する。
 */
export function extractMainContentText(html: string): string {
  const withoutNoise = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ');

  // meta description / og:description は営業情報の要約が入っていることが多い
  const metaDescriptions = [
    ...withoutNoise.matchAll(
      /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/gi,
    ),
  ].map((match) => match[1]);

  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(withoutNoise)?.[1] ?? '';

  // <br> / </p> / </div> などブロック境界を改行に変換してから残りのタグを除去
  const body = withoutNoise
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|dd|dt)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  const text = decodeEntities([title, ...metaDescriptions, body].join('\n'))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

  return text.slice(0, MAX_CONTENT_CHARS);
}

// ---------------------------------------------------------------------------
// 2. LLM 呼び出し
// ---------------------------------------------------------------------------

export type LlmProvider = 'anthropic' | 'gemini';

export function getLlmProvider(): LlmProvider {
  return process.env.LLM_PROVIDER === 'gemini' ? 'gemini' : 'anthropic';
}

let anthropicClient: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new IngestError('ANTHROPIC_API_KEY が設定されていません。', 500);
  }
  anthropicClient ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

async function callAnthropic(systemPrompt: string, content: string): Promise<string> {
  const client = getAnthropic();

  const response = await client.beta.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    output_config: {
      // 抽出タスクは単純なので低 effort で十分（コストとレイテンシを抑える）
      effort: 'low',
      format: { type: 'json_schema', schema: EXTRACTION_SCHEMA as never },
    },
    // 安全性分類器による拒否時に、同一リクエストを推奨フォールバックモデルで再実行する
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [
      {
        role: 'user',
        content: `以下は飲食店の紹介ページの本文です。店舗情報を抽出してください。\n\n---\n${content}\n---`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new IngestError(
      'LLM がこのページの処理を拒否しました。別の情報源を指定してください。',
      422,
    );
  }
  if (response.stop_reason === 'max_tokens') {
    throw new IngestError('LLM の出力が途中で打ち切られました。', 502);
  }

  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  if (!text.trim()) {
    throw new IngestError('LLM から空の応答が返りました。', 502);
  }
  return text;
}

async function callGemini(systemPrompt: string, content: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new IngestError('GEMINI_API_KEY が設定されていません。', 500);
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `以下は飲食店の紹介ページの本文です。店舗情報を抽出してください。\n\n---\n${content}\n---`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: EXTRACTION_SCHEMA,
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new IngestError(
      `Gemini API エラー（HTTP ${response.status}）: ${body.slice(0, 300)}`,
      502,
    );
  }

  const json = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text =
    json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';

  if (!text.trim()) {
    throw new IngestError('Gemini から空の応答が返りました。', 502);
  }
  return text;
}

/** systemPrompt + 本文を LLM に渡し、JSON 文字列を得る。 */
export async function callLlmJson(
  systemPrompt: string,
  content: string,
): Promise<string> {
  return getLlmProvider() === 'gemini'
    ? callGemini(systemPrompt, content)
    : callAnthropic(systemPrompt, content);
}

// ---------------------------------------------------------------------------
// 3. 正規化
// ---------------------------------------------------------------------------

function toOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' || trimmed === 'null' ? null : trimmed;
}

/** LLM 出力を ExtractedShopData に整える。想定外の値は捨てる。 */
export function normalizeExtracted(raw: unknown): ExtractedShopData {
  if (typeof raw !== 'object' || raw === null) {
    throw new IngestError('LLM の応答を解釈できませんでした。', 502);
  }
  const record = raw as Record<string, unknown>;

  const nameJa = toOptionalString(record.name_ja);
  if (!nameJa) {
    throw new IngestError(
      'ページから店舗名を抽出できませんでした。店舗紹介ページの URL を指定してください。',
      422,
    );
  }

  const categoryRaw = toOptionalString(record.category) ?? '';
  const features = Array.isArray(record.features)
    ? [
        ...new Set(
          record.features
            .map((f) => toOptionalString(f))
            .filter((f): f is string => f !== null)
            // Notion の multi-select を汚さないよう既知の選択肢のみ通す
            .filter((f) => (KNOWN_FEATURES as readonly string[]).includes(f)),
        ),
      ]
    : [];

  return {
    name_ja: nameJa,
    name_en: toOptionalString(record.name_en),
    category: isCategory(categoryRaw) ? categoryRaw : 'cafe',
    address_ja: toOptionalString(record.address_ja),
    business_hours_ja: toOptionalString(record.business_hours_ja),
    closed_days_ja: toOptionalString(record.closed_days_ja),
    tel: toOptionalString(record.tel),
    features,
    instagram_handle: toOptionalString(record.instagram_handle)?.replace(/^@/, '') ?? null,
    description_ja: toOptionalString(record.description_ja),
    extraction_notes: toOptionalString(record.extraction_notes),
  };
}

/** URL から店舗情報を抽出する（Notion への書き込みは行わない）。 */
export async function extractShopFromUrl(targetUrl: string): Promise<ExtractedShopData> {
  const html = await fetchHtml(targetUrl);
  const cleanText = extractMainContentText(html);

  if (cleanText.length < 40) {
    throw new IngestError(
      'ページから十分な本文を取得できませんでした（JavaScript 描画のみのページの可能性があります）。',
      422,
    );
  }

  const json = await callLlmJson(SYSTEM_PROMPT, cleanText);

  let parsed: unknown;
  try {
    // JSON Schema 拘束時も念のためコードフェンスを剥がす
    parsed = JSON.parse(json.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
  } catch {
    throw new IngestError('LLM の応答が JSON として解釈できませんでした。', 502);
  }

  return normalizeExtracted(parsed);
}
