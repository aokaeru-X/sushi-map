'use client';

import { useState } from 'react';
import type { ExtractedShopData } from '@/types/shop';

interface IngestResponse {
  ok: boolean;
  error?: string;
  dryRun?: boolean;
  provider?: string;
  extracted?: ExtractedShopData;
  notion?: { pageId: string; pageUrl: string; status: string };
}

/**
 * URL インジェストのフォーム。
 * ADMIN_TOKEN はブラウザに保存せず、送信のたびに入力してもらう。
 */
export default function IngestForm() {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<IngestResponse | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setResult(null);

    try {
      const response = await fetch('/api/admin/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ url, dryRun }),
      });
      setResult((await response.json()) as IngestResponse);
    } catch (error) {
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="ingest-form" onSubmit={submit}>
      <label>
        情報元 URL
        <input
          type="url"
          required
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/news/new-cafe"
        />
      </label>

      <label>
        管理トークン（ADMIN_TOKEN）
        <input
          type="password"
          required
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="off"
        />
      </label>

      <label className="ingest-form__checkbox">
        <input
          type="checkbox"
          checked={dryRun}
          onChange={(event) => setDryRun(event.target.checked)}
        />
        抽出結果だけ確認する（Notion に登録しない）
      </label>

      <button type="submit" disabled={pending}>
        {pending ? '抽出中…' : dryRun ? '抽出をテストする' : 'Notion に draft を作成'}
      </button>

      {result && (
        <div className={result.ok ? 'ingest-result is-ok' : 'ingest-result is-error'}>
          {result.ok ? (
            <>
              <p>
                抽出に成功しました（provider: {result.provider}）。
                {result.notion && (
                  <>
                    {' '}
                    <a href={result.notion.pageUrl} target="_blank" rel="noopener noreferrer">
                      Notion のページを開く
                    </a>
                  </>
                )}
              </p>
              <pre>{JSON.stringify(result.extracted, null, 2)}</pre>
            </>
          ) : (
            <p>{result.error}</p>
          )}
        </div>
      )}
    </form>
  );
}
