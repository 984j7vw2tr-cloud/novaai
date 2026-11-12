/**
 * 音声会話の1日（直近24時間）の上限：無料3分・PLUS 30分。
 * 環境変数 VOICE_MINUTES_FREE / VOICE_MINUTES_PLUS で変えられる（分）。
 */
import type { Env } from './auth.ts';
import type { Plan } from './plans.ts';

export const DEFAULT_VOICE_MINUTES: Record<Plan, number> = { free: 3, plus: 30, pro: 30 };

export function voiceMinutesFor(plan: Plan, env: Env): number {
  const raw = env.get(`VOICE_MINUTES_${plan.toUpperCase()}`);
  const n = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_VOICE_MINUTES[plan];
}
