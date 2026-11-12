/** プランごとの1日（直近24時間）の回数の上限。chat（利用制限）と billing（料金画面）で同じ値を使う */
import type { Env } from './auth.ts';

export type Plan = 'free' | 'plus' | 'pro';

export const DEFAULT_LIMITS: Record<Plan, number> = { free: 10, plus: 200, pro: 1000 };

/** 環境変数 QUOTA_FREE / QUOTA_PLUS / QUOTA_PRO で変えられる */
export function limitFor(plan: Plan, env: Env): number {
  const raw = env.get(`QUOTA_${plan.toUpperCase()}`);
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_LIMITS[plan];
}
