import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HTML_LANG, LANG_LABELS, t } from '@/lib/i18n';
import { LANGS, isLang, type Lang } from '@/types/shop';
import { canonicalUrl } from '@/utils/urlGenerator';
import '../globals.css';

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang: Lang = isLang(rawLang) ? rawLang : 'ja';

  return {
    title: t('siteTitle', lang),
    description: t('siteDescription', lang),
    alternates: {
      canonical: canonicalUrl(`/${lang}`),
      languages: Object.fromEntries(
        LANGS.map((l) => [HTML_LANG[l], canonicalUrl(`/${l}`)]),
      ),
    },
    openGraph: {
      title: t('siteTitle', lang),
      description: t('siteDescription', lang),
      locale: HTML_LANG[lang],
      type: 'website',
    },
  };
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  if (!isLang(rawLang)) notFound();
  const lang = rawLang;

  return (
    <html lang={HTML_LANG[lang]}>
      <body>
        <header className="site-header">
          <Link href={`/${lang}`} className="site-header__brand">
            <span className="site-header__title">{t('siteTitle', lang)}</span>
            <span className="site-header__tagline">{t('tagline', lang)}</span>
          </Link>
          <nav className="lang-switcher" aria-label="Language">
            {LANGS.map((candidate) => (
              <Link
                key={candidate}
                href={`/${candidate}`}
                className={
                  candidate === lang ? 'lang-switcher__link is-active' : 'lang-switcher__link'
                }
                hrefLang={HTML_LANG[candidate]}
                aria-current={candidate === lang ? 'page' : undefined}
              >
                {LANG_LABELS[candidate]}
              </Link>
            ))}
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <p>
            出典: ひがしかわ「道草館」作成『ひがしかわグルメMAP』令和8年7月版 /
            データ管理: Notion
          </p>
        </footer>
      </body>
    </html>
  );
}
