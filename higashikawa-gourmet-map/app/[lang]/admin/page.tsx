import Link from 'next/link';
import { notFound } from 'next/navigation';
import IngestForm from '@/components/IngestForm';
import { t } from '@/lib/i18n';
import { isLang } from '@/types/shop';

export const metadata = { robots: { index: false, follow: false } };

/**
 * 運用スタッフ向けの URL インジェスト画面。
 * 認証は API 側の ADMIN_TOKEN で行うため、この画面は入力フォームのみを提供する。
 */
export default async function AdminPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  if (!isLang(rawLang)) notFound();
  const lang = rawLang;

  return (
    <div className="admin">
      <h1>{t('adminTitle', lang)}</h1>
      <p className="admin__lead">
        ニュース記事や食べログなどの URL を入力すると、LLM が店名・住所・営業時間などを
        抽出し、Notion に <strong>Status = draft</strong> で登録します。内容を Notion 上で
        確認し、<strong>published</strong> に変更すると地図に反映されます。
      </p>
      <IngestForm />
      <p className="admin__back">
        <Link href={`/${lang}`}>{t('backToMap', lang)}</Link>
      </p>
    </div>
  );
}
