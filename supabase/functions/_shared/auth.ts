/** ログインの確認（chat・account の両方の関数で使う） */

export type Env = { get(name: string): string | undefined };

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuthResult =
  | { kind: 'ok'; userId: string; email?: string }
  | { kind: 'denied' }
  | { kind: 'misconfigured' };

/**
 * ログインの鍵（Authorization: Bearer ...）を Supabase に確認してもらい、本人のIDを得る。
 * REQUIRE_AUTH=false のときだけ、ログインなしで使える（テスト・開発用）。
 */
export async function authenticate(
  req: Request,
  env: Env,
  doFetch: typeof fetch,
  ip: string,
): Promise<AuthResult> {
  if ((env.get('REQUIRE_AUTH') ?? 'true').toLowerCase() === 'false') {
    return { kind: 'ok', userId: `ip:${ip}` };
  }
  const header = req.headers.get('authorization') ?? '';
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return { kind: 'denied' };

  const supabaseUrl = env.get('SUPABASE_URL');
  // アプリが送ってくる公開キー（なければサーバーの環境変数）を使う
  const apikey = req.headers.get('apikey') ?? env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !apikey) {
    console.error('[auth] SUPABASE_URL or apikey is missing; cannot verify users');
    return { kind: 'misconfigured' };
  }
  try {
    const res = await doFetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { kind: 'denied' };
    const user = await res.json();
    return typeof user?.id === 'string'
      ? {
          kind: 'ok',
          userId: user.id,
          ...(typeof user.email === 'string' ? { email: user.email } : {}),
        }
      : { kind: 'denied' };
  } catch (e) {
    console.error('[auth] auth check failed', e);
    return { kind: 'misconfigured' };
  }
}
