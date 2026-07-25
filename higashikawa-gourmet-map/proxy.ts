import { NextResponse, type NextRequest } from 'next/server';
import { LANGS, type Lang } from '@/types/shop';

const DEFAULT_LANG: Lang = 'ja';

/** Accept-Language から対応言語を推定する。 */
function detectLang(header: string | null): Lang {
  if (!header) return DEFAULT_LANG;
  const accepted = header.toLowerCase();
  if (/zh-tw|zh-hant|zh-hk|zh-mo/.test(accepted)) return 'zh-TW';
  if (/^ja|,ja/.test(accepted)) return 'ja';
  if (/en/.test(accepted)) return 'en';
  return DEFAULT_LANG;
}

/** `/` および言語プレフィックスの無いパスを `/<lang>/...` に振り替える（Next.js 16 の proxy 規約）。 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLangPrefix = LANGS.some(
    (lang) => pathname === `/${lang}` || pathname.startsWith(`/${lang}/`),
  );
  if (hasLangPrefix) return NextResponse.next();

  const lang = detectLang(request.headers.get('accept-language'));
  const url = request.nextUrl.clone();
  url.pathname = `/${lang}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // api / _next と、拡張子付きのパス（icon.svg, robots.txt, sitemap.xml,
  // favicon.ico, /images/*.jpg など）は言語プレフィックスを付けない
  matcher: ['/((?!api|_next|.*\\.).*)'],
};
