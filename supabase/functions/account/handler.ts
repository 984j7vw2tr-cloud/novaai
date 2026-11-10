/**
 * アカウントの削除（本人だけが、自分のアカウントを消せる）。
 *
 * POST /functions/v1/account  {"action":"delete"}
 * - ログインの鍵で本人を確認し、その人のアカウントだけを消す（他人のIDは受け付けない）
 * - アカウントを消すと、プロフィール・会話・メッセージ・使用量・プランもすべて消える
 *   （データベースの「親が消えたら子も消す」設定による）
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
    if (auth.kind === 'misconfigured') return json(503, { type: 'error', code: 'service_unavailable' });
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
