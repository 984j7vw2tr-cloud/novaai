/**
 * 料金プラン：サーバー（billing 関数）に今のプランを聞く・支払い画面や管理画面のURLをもらう。
 * カード情報はすべて Stripe の画面で入力する（このアプリには一切入らない）。
 */
import { fetch } from 'expo/fetch';

import { getAccessToken } from '@/auth';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/config';

/** 販売しているのは PLUS だけ（PRO は販売終了。以前の契約は PLUS と同じ扱い） */
export type PaidPlan = 'plus';
export type PlanId = 'free' | 'plus' | 'pro';

export type BillingStatus = {
  plan: PlanId;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Stripe の管理画面を開けるか（一度でも申し込んだことがある） */
  manageable: boolean;
  /** test=テストモード / live=本番 / off=未設定 */
  mode: 'test' | 'live' | 'off';
  /** 税抜の値段（円） */
  prices: Record<PaidPlan, number>;
  /** 税込の値段（円・総額表示用） */
  pricesWithTax: Record<PaidPlan, number>;
  /** 1日に質問できる回数（null＝無制限） */
  limits: Record<'free' | 'plus', number | null>;
  /** 1日に添付できる写真・ファイルの数（null＝無制限） */
  attachmentLimits: Record<'free' | 'plus', number | null>;
  /** 1日に作れる画像の枚数 */
  imageLimits?: Record<'free' | 'plus', number>;
  /** 今の自分の、今日の添付の状況 */
  attachments: { limit: number | null; used: number };
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

/** sync=true：Stripe にも直接確認して反映する（料金プラン画面を開いたとき・支払いから戻ったとき） */
export const getBillingStatus = (sync = false) =>
  call<BillingStatus>({ action: 'status', ...(sync ? { sync: true } : {}) });

/** 申し込み：Stripe の支払い画面のURL（すでに有料なら管理画面のURL） */
export const startCheckout = (plan: PaidPlan) =>
  call<{ url: string; portal: boolean }>({ action: 'checkout', plan });

/** 管理画面（プラン変更・解約・カード変更）のURL */
export const openPortal = () => call<{ url: string; portal: boolean }>({ action: 'portal' });
