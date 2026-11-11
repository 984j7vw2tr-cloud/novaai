/**
 * 料金プラン（subscriptions テーブル）の読み書き。サーバー専用の鍵で行う（利用者は書き換えられない）。
 * Stripe のサブスクリプションの「今の状態」を取りに行き、そのまま保存する（知らせの順番が前後しても正しくなる）。
 */
import type { Env } from './auth.ts';
import { lookupKey, type Plan, type Stripe } from './stripe.ts';

export type SubscriptionRow = {
  user_id: string;
  plan: 'free' | Plan;
  status: string;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  cancel_at_period_end: boolean;
};

/** 有料プランとして扱う状態 */
export const PAID_STATUSES = ['active', 'trialing'];
/** まだ請求が続く可能性がある状態（アカウント削除のときに解約する） */
export const BILLABLE_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
];

export function createDb(env: Env, doFetch: typeof fetch) {
  const base = env.get('SUPABASE_URL')?.replace(/\/$/, '');
  const key = env.get('SUPABASE_SERVICE_ROLE_KEY');
  const headers = {
    apikey: key ?? '',
    Authorization: `Bearer ${key ?? ''}`,
    'Content-Type': 'application/json',
  };
  const ok = Boolean(base && key);

  async function select(filter: string): Promise<SubscriptionRow | null> {
    const res = await doFetch(
      `${base}/rest/v1/subscriptions?select=user_id,plan,status,current_period_end,stripe_customer_id,stripe_subscription_id,cancel_at_period_end&${filter}&limit=1`,
      { headers, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) throw new Error(`subscriptions select HTTP ${res.status}`);
    return ((await res.json()) as SubscriptionRow[])[0] ?? null;
  }

  return {
    ok,
    byUser: (userId: string) => select(`user_id=eq.${encodeURIComponent(userId)}`),
    byCustomer: (customerId: string) =>
      select(`stripe_customer_id=eq.${encodeURIComponent(customerId)}`),
    /** 1人1行。あれば書き換え、なければ作る */
    async upsert(row: Partial<SubscriptionRow> & { user_id: string }) {
      const res = await doFetch(`${base}/rest/v1/subscriptions?on_conflict=user_id`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`subscriptions upsert HTTP ${res.status} ${await res.text()}`);
    },
  };
}

export type Db = ReturnType<typeof createDb>;

type StripeSubscription = {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: {
    data: {
      current_period_end?: number;
      price?: { lookup_key?: string | null; metadata?: Record<string, string> };
    }[];
  };
};

/** Stripe のサブスクリプションから、どのプランか読み取る */
export function planOf(sub: StripeSubscription): Plan | null {
  const item = sub.items?.data?.[0];
  const key = item?.price?.lookup_key;
  if (key === lookupKey('plus')) return 'plus';
  if (key === lookupKey('pro')) return 'pro';
  const meta = item?.price?.metadata?.plan ?? sub.metadata?.plan;
  return meta === 'plus' || meta === 'pro' ? meta : null;
}

/**
 * Stripe のサブスクリプションの今の状態を、subscriptions テーブルに写す。
 * 返り値：書き込んだ行（対象の利用者がわからなかったときは null）
 */
export async function syncSubscription(
  stripe: Stripe,
  db: Db,
  subscriptionId: string,
  hintUserId?: string | null,
): Promise<SubscriptionRow | null> {
  const sub = await stripe.request<StripeSubscription>(
    'GET',
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
  // だれのものか：申し込み時に付けた user_id → 決済の知らせのヒント → お客様IDから探す
  let userId = sub.metadata?.user_id || hintUserId || null;
  if (!userId) userId = (await db.byCustomer(sub.customer))?.user_id ?? null;
  if (!userId) {
    console.error(`[billing] cannot find user for subscription ${sub.id}`);
    return null;
  }

  const existing = await db.byUser(userId);
  // 古いサブスクリプションの「終了」の知らせで、新しい有効なプランを消さない
  if (
    existing?.stripe_subscription_id &&
    existing.stripe_subscription_id !== sub.id &&
    PAID_STATUSES.includes(existing.status) &&
    !PAID_STATUSES.includes(sub.status)
  ) {
    console.log(
      JSON.stringify({ event: 'billing_skip_old', user_id: userId, subscription: sub.id }),
    );
    return existing;
  }

  const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  const plan = planOf(sub);
  const row: SubscriptionRow = {
    user_id: userId,
    plan: plan ?? 'free',
    status: sub.status,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
  };
  await db.upsert(row);
  console.log(
    JSON.stringify({ event: 'billing_sync', user_id: userId, plan: row.plan, status: row.status }),
  );
  return row;
}
