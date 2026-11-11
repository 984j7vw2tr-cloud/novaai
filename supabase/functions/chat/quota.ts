/**
 * 利用制限：プランごとに「直近24時間で何回まで質問できるか」を決めて数える。
 * - 回数は usage_events（サーバーが記録した使用量）から数える。利用者はごまかせない。
 * - プランは subscriptions から読む（なければ無料プラン）。
 * - 上限は環境変数で変えられる（QUOTA_FREE / QUOTA_PLUS / QUOTA_PRO）。
 */
import type { Env } from '../_shared/auth.ts';

export type Plan = 'free' | 'plus' | 'pro';

export const DEFAULT_LIMITS: Record<Plan, number> = { free: 10, plus: 200, pro: 1000 };

const WINDOW_MS = 24 * 60 * 60 * 1000;

export type QuotaStatus = {
  plan: Plan;
  limit: number;
  /** 直近24時間に使った回数（今回の質問は含まない） */
  used: number;
  /** 上限に達しているとき、次に使えるようになる時刻（ISO形式） */
  resetAt: string | null;
};

export function limitFor(plan: Plan, env: Env): number {
  const raw = env.get(`QUOTA_${plan.toUpperCase()}`);
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_LIMITS[plan];
}

/**
 * 今の利用状況を調べる。調べられなかったとき（設定不足・通信エラー）は null。
 * null のときは止めずに通す（障害で全員が使えなくなるのを防ぐ。1分あたりの制限は別にかかる）。
 */
export async function getQuotaStatus(
  env: Env,
  doFetch: typeof fetch,
  userId: string,
  now: number,
): Promise<QuotaStatus | null> {
  const base = env.get('SUPABASE_URL')?.replace(/\/$/, '');
  const key = env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !key) {
    console.error('[quota] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing; quota not enforced');
    return null;
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    // 1) プラン（有効期限内のものだけ）
    const subRes = await doFetch(
      `${base}/rest/v1/subscriptions?select=plan,status,current_period_end&user_id=eq.${userId}&limit=1`,
      { headers, signal: AbortSignal.timeout(5000) },
    );
    if (!subRes.ok) throw new Error(`subscriptions HTTP ${subRes.status}`);
    const sub = (
      (await subRes.json()) as { plan: string; status: string; current_period_end: string | null }[]
    )[0];
    const active =
      sub &&
      ['active', 'trialing'].includes(sub.status) &&
      (!sub.current_period_end || Date.parse(sub.current_period_end) > now);
    const plan: Plan = active && (sub.plan === 'plus' || sub.plan === 'pro') ? sub.plan : 'free';
    const limit = limitFor(plan, env);

    // 2) 直近24時間の回数（いちばん古い1件と、全体の件数）
    const since = new Date(now - WINDOW_MS).toISOString();
    const useRes = await doFetch(
      `${base}/rest/v1/usage_events?select=created_at&user_id=eq.${userId}` +
        `&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc&limit=1`,
      { headers: { ...headers, Prefer: 'count=exact' }, signal: AbortSignal.timeout(5000) },
    );
    if (!useRes.ok) throw new Error(`usage_events HTTP ${useRes.status}`);
    // 件数は Content-Range ヘッダー（例："0-0/7"、0件なら "*/0"）に入っている
    const total = Number((useRes.headers.get('content-range') ?? '').split('/')[1]);
    const used = Number.isFinite(total) ? total : 0;
    const oldest = ((await useRes.json()) as { created_at: string }[])[0]?.created_at;
    const resetAt =
      used >= limit && oldest ? new Date(Date.parse(oldest) + WINDOW_MS).toISOString() : null;

    return { plan, limit, used, resetAt };
  } catch (e) {
    console.error('[quota] check failed; quota not enforced', e);
    return null;
  }
}
