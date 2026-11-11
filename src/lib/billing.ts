/**
 * 料金プラン：サーバー（billing 関数）に今のプランを聞く・支払い画面や管理画面のURLをもらう。
 * カード情報はすべて Stripe の画面で入力する（このアプリには一切入らない）。
 */
import { fetch } from 'expo/fetch';

import { getAccessToken } from '@/auth';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/config';

export type PaidPlan = 'plus' | 'pro';
export type PlanId = 'free' | PaidPlan;

export type BillingStatus = {
  plan: PlanId;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Stripe の管理画面を開けるか（一度でも申し込んだことがある） */
  manageable: boolean;
  /** test=テストモード / live=本番 / off=未設定 */
  mode: 'test' | 'live' | 'off';
  prices: Record<PaidPlan, number>;
  limits: Record<PlanId, number>;
};

export class BillingError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'BillingError';
    this.code = code;
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken();
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/billing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new BillingError('network');
  }
  const data = (await res.json().catch(() => ({}))) as { code?: string };
  if (!res.ok) throw new BillingError(data.code ?? 'upstream_error');
  return data as T;
}

export const getBillingStatus = () => call<BillingStatus>({ action: 'status' });

/** 申し込み：Stripe の支払い画面のURL（すでに有料なら管理画面のURL） */
export const startCheckout = (plan: PaidPlan) =>
  call<{ url: string; portal: boolean }>({ action: 'checkout', plan });

/** 管理画面（プラン変更・解約・カード変更）のURL */
export const openPortal = () => call<{ url: string; portal: boolean }>({ action: 'portal' });
