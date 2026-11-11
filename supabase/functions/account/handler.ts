/**
 * アカウントの削除（本人だけが、自分のアカウントを消せる）。
 *
 * POST /functions/v1/account  {"action":"delete"}
 * - ログインの鍵で本人を確認し、その人のアカウントだけを消す（他人のIDは受け付けない）
 * - アカウントを消すと、プロフィール・会話・メッセージ・使用量・プランもすべて消える
 *   （データベースの「親が消えたら子も消す」設定による）
 * - 添付した写真・ファイル（Storage）は先に消す（残っているとアカウントを消せないため）
 */
import { authenticate, type Env, UUID_RE } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/http.ts';

type Deps = { env: Env; fetchImpl?: typeof fetch };

export function createAccountHandler({ env, fetchImpl }: Deps) {
  const doFetch = fetchImpl ?? fetch;

  return async function handle(req: Request): Promise<Response> {
    const cors = corsHeaders(req, env);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json(405, { type: 'error', code: 'invalid_request' });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { type: 'error', code: 'invalid_request' });
    }
    if ((body as { action?: unknown })?.action !== 'delete') {
      return json(400, { type: 'error', code: 'invalid_request' });
    }

    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
    const auth = await authenticate(req, env, doFetch, ip);
    if (auth.kind === 'misconfigured')
      return json(503, { type: 'error', code: 'service_unavailable' });
    if (auth.kind === 'denied' || !UUID_RE.test(auth.userId)) {
      return json(401, { type: 'error', code: 'unauthorized' });
    }

    const base = env.get('SUPABASE_URL')?.replace(/\/$/, '');
    const key = env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!base || !key) {
      console.error('[account] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
      return json(503, { type: 'error', code: 'service_unavailable' });
    }

    try {
      await deleteUserFiles(doFetch, base, key, auth.userId);
    } catch (e) {
      console.error('[account] file cleanup failed', e);
      return json(502, { type: 'error', code: 'upstream_error' });
    }

    try {
      const res = await doFetch(`${base}/auth/v1/admin/users/${auth.userId}`, {
        method: 'DELETE',
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        console.error(`[account] delete failed: HTTP ${res.status}`);
        return json(502, { type: 'error', code: 'upstream_error' });
      }
      console.log(JSON.stringify({ event: 'account_deleted', user_id: auth.userId }));
      return json(200, { type: 'deleted' });
    } catch (e) {
      console.error('[account] delete error', e);
      return json(502, { type: 'error', code: 'upstream_error' });
    }
  };
}

/** 本人のフォルダ（attachments/<ユーザーID>/）のファイルをすべて消す */
export async function deleteUserFiles(
  doFetch: typeof fetch,
  base: string,
  key: string,
  userId: string,
) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  // 一度に最大1000件ずつ。消しきるまでくり返す（念のため回数に上限）
  for (let round = 0; round < 50; round++) {
    const list = await doFetch(`${base}/storage/v1/object/list/attachments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prefix: `${userId}/`, limit: 1000, offset: 0 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!list.ok) throw new Error(`list failed: HTTP ${list.status}`);
    const items = ((await list.json()) as { name?: string }[]).filter((i) => i?.name);
    if (items.length === 0) return;
    const del = await doFetch(`${base}/storage/v1/object/attachments`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ prefixes: items.map((i) => `${userId}/${i.name}`) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!del.ok) throw new Error(`delete failed: HTTP ${del.status}`);
  }
  throw new Error('too many files');
}
