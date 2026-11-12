/** 画像生成の1日（直近24時間）の上限：無料2枚・PLUS 30枚。環境変数 IMAGE_LIMIT_FREE / IMAGE_LIMIT_PLUS で変えられる */
import type { Env } from './auth.ts';
import type { Plan } from './plans.ts';

export const DEFAULT_IMAGE_LIMITS: Record<Plan, number> = { free: 2, plus: 30, pro: 30 };

export function imageLimitFor(plan: Plan, env: Env): number {
  const raw = env.get(`IMAGE_LIMIT_${plan.toUpperCase()}`);
  const n = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_IMAGE_LIMITS[plan];
}
