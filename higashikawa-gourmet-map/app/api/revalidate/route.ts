/**
 * On-Demand ISR: Notion 更新時にキャッシュを失効させるエンドポイント。
 *
 * Notion の Webhook（またはワークフロー / 定期ポーリング）から呼び出す:
 *
 *   POST /api/revalidate
 *   x-revalidate-secret: <REVALIDATE_SECRET>
 *
 * GET でも同じ処理を行う（Notion 側で POST を送れない場合の保険）:
 *
 *   GET /api/revalidate?secret=<REVALIDATE_SECRET>
 */
import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { NOTION_CACHE_PROFILE, NOTION_SHOPS_TAG } from '@/lib/notion';

export const dynamic = 'force-dynamic';

/** 秘密トークンを一定時間比較で検証する。 */
function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) return false;

  const provided =
    request.headers.get('x-revalidate-secret') ??
    request.nextUrl.searchParams.get('secret') ??
    // Notion Webhook が Authorization ヘッダしか使えない場合に対応
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';

  if (provided.length !== expected.length) return false;

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}

async function handle(request: NextRequest) {
  if (!process.env.REVALIDATE_SECRET) {
    return NextResponse.json(
      { revalidated: false, error: 'REVALIDATE_SECRET is not configured.' },
      { status: 500 },
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json(
      { revalidated: false, error: 'Invalid secret.' },
      { status: 401 },
    );
  }

  revalidateTag(NOTION_SHOPS_TAG, NOTION_CACHE_PROFILE);

  return NextResponse.json({
    revalidated: true,
    tag: NOTION_SHOPS_TAG,
    now: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}
