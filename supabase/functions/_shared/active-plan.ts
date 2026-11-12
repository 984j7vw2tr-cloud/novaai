/**
 * 今有効なプラン（subscriptions から読む。なければ無料）。
 * 調べられなかったとき（設定不足・通信エラー）は null。
 */
import type { Env } from './auth.ts';
import type { Plan } from './plans.ts';

export async function getActivePlan(
  env: Env,
  doFetch: typeof fetch,
  userId: string,
  now: number,
): Promise<Plan | null> {
  const base = env.get('SUPABASE_URL')?.replace(/\/$/, '');
  const key = env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !key) return null;
  try {
    const res = await doFetch(
      `${base}/rest/v1/subscriptions?select=plan,status,current_period_end&user_id=eq.${userId}&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return null;
    const sub = (
      (await res.json()) as { plan: string; status: string; current_period_end: string | null }[]
    )[0];
    const active =
      sub &&
      ['active', 'trialing'].includes(sub.status) &&
      (!sub.current_period_end || Date.parse(sub.current_period_end) > now);
    return active && (sub.plan === 'plus' || sub.plan === 'pro') ? sub.plan : 'free';
  } catch {
    return null;
  }
}
