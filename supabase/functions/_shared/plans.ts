/**
 * プランごとの上限。chat（利用制限）と billing（料金画面）で同じ値を使う。
 * - チャット：直近24時間に質問できる回数（PLUS は無制限）
 * - 写真・ファイル：直近24時間に添付できる数（PLUS は無制限）
 * 無制限は Infinity（画面に送るときは null になる）。
 */
import type { Env } from './auth.ts';

export type Plan = 'free' | 'plus' | 'pro';

/** PRO は販売終了（以前の契約があれば PLUS と同じ扱い） */
export const DEFAULT_LIMITS: Record<Plan, number> = { free: 10, plus: Infinity, pro: Infinity };
export const DEFAULT_ATTACHMENT_LIMITS: Record<Plan, number> = {
  free: 3,
  plus: Infinity,
  pro: Infinity,
};

function read(env: Env, name: string, fallback: number) {
  const raw = env.get(name);
  if (raw === undefined || raw === '') return fallback;
  if (raw.toLowerCase() === 'unlimited') return Infinity;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** 環境変数 QUOTA_FREE / QUOTA_PLUS で変えられる（"unlimited" で無制限） */
export const limitFor = (plan: Plan, env: Env) =>
  read(env, `QUOTA_${plan.toUpperCase()}`, DEFAULT_LIMITS[plan]);

/** 環境変数 ATTACH_LIMIT_FREE / ATTACH_LIMIT_PLUS で変えられる */
export const attachmentLimitFor = (plan: Plan, env: Env) =>
  read(env, `ATTACH_LIMIT_${plan.toUpperCase()}`, DEFAULT_ATTACHMENT_LIMITS[plan]);

/** 画面に送る形（無制限は null） */
export const finiteOrNull = (n: number) => (Number.isFinite(n) ? n : null);
