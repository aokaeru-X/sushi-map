/**
 * URL インジェスト API。
 *
 *   POST /api/admin/ingest
 *   x-admin-token: <ADMIN_TOKEN>
 *   { "url": "https://..." }
 *
 * ニュース記事や食べログ等の URL を受け取り、LLM で店舗情報を構造化して
 * Notion に Status='draft' で登録する。管理者は Notion 上で内容を確認し、
 * Status を published に変えるだけで公開できる。
 *
 * `dryRun: true` を指定すると Notion への書き込みを行わず抽出結果のみ返す。
 */
import { NextResponse, type NextRequest } from 'next/server';
import { IngestError, extractShopFromUrl, getLlmProvider } from '@/lib/aiExtractor';
import {
  NOTION_CACHE_PROFILE,
  NOTION_SHOPS_TAG,
  createShopDraft,
} from '@/lib/notion';

export const dynamic = 'force-dynamic';
/** LLM 呼び出しを含むため実行時間の上限を延ばす。 */
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;

  const provided =
    request.headers.get('x-admin-token') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';

  if (provided.length !== expected.length) return false;

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(request: NextRequest) {
  if (!process.env.ADMIN_TOKEN) {
    return NextResponse.json(
      { ok: false, error: 'ADMIN_TOKEN が設定されていません。' },
      { status: 500 },
    );
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: '認証に失敗しました。' }, { status: 401 });
  }

  let body: { url?: unknown; dryRun?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'JSON ボディを解釈できませんでした。' },
      { status: 400 },
    );
  }

  if (typeof body.url !== 'string' || body.url.trim() === '') {
    return NextResponse.json(
      { ok: false, error: 'url を文字列で指定してください。' },
      { status: 400 },
    );
  }

  const targetUrl = body.url.trim();
  const dryRun = body.dryRun === true;

  try {
    const extracted = await extractShopFromUrl(targetUrl);

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        provider: getLlmProvider(),
        sourceUrl: targetUrl,
        extracted,
      });
    }

    const { pageId, pageUrl } = await createShopDraft(extracted, targetUrl);

    // draft はサイトに出ないが、published への変更を Notion 側の Webhook
    // 待ちにしないよう、ここでもキャッシュタグを失効させておく
    const { revalidateTag } = await import('next/cache');
    revalidateTag(NOTION_SHOPS_TAG, NOTION_CACHE_PROFILE);

    return NextResponse.json({
      ok: true,
      provider: getLlmProvider(),
      sourceUrl: targetUrl,
      extracted,
      notion: { pageId, pageUrl, status: 'draft' },
    });
  } catch (error) {
    if (error instanceof IngestError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error('[ingest] 予期しないエラー:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, error: `インジェストに失敗しました: ${message}` },
      { status: 500 },
    );
  }
}
