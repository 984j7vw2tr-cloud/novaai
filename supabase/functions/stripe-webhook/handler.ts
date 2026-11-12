/**
 * Stripe からの知らせ（Webhook）を受け取り、料金プランを記録する。
 * - 署名を確かめて、本物の知らせだけを受け付ける（STRIPE_WEBHOOK_SECRET）。
 * - 知らせの中身はそのまま信じず、Stripe にサブスクリプションの今の状態を聞き直してから保存する。
 * - 失敗したら 500 を返す（Stripe があとで送り直してくれる）。
 */
import type { Env } from '../_shared/auth.ts';
import { createStripe, verifyWebhook } from '../_shared/stripe.ts';
import { createDb, syncSubscription } from '../_shared/subscriptions.ts';

type Deps = { env: Env; fetchImpl?: typeof fetch; now?: () => number };

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

/** 知らせから「どのサブスクリプションか」を取り出す */
export function subscriptionIdOf(event: StripeEvent): { id: string | null; userId: string | null } {
  const o = event.data.object as Record<string, any>;
  if (event.type === 'checkout.session.completed') {
    return {
      id: typeof o.subscription === 'string' ? o.subscription : null,
      userId: o.client_reference_id ?? null,
    };
  }
  if (event.type.startsWith('customer.subscription.')) return { id: o.id ?? null, userId: null };
  if (event.type.startsWith('invoice.')) {
    const id = o.subscription ?? o.parent?.subscription_details?.subscription ?? null;
    return { id: typeof id === 'string' ? id : null, userId: null };
  }
  return { id: null, userId: null };
}

export const HANDLED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
];

export function createWebhookHandler({ env, fetchImpl, now = Date.now }: Deps) {
  const doFetch = fetchImpl ?? fetch;

  /** 受け付けた結果を billing_events に残す（運営者の確認用。失敗しても止めない） */
  const audit = async (eventId: string | null, type: string | null, result: string) => {
    const base = env.get('SUPABASE_URL')?.replace(/\/$/, '');
    const key = env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!base || !key) return;
    try {
      await doFetch(`${base}/rest/v1/billing_events`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          event_id: eventId?.slice(0, 100) ?? null,
          type: type?.slice(0, 100) ?? null,
          result: result.slice(0, 200),
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // 記録できなくても続ける
    }
  };

  return async function handle(req: Request): Promise<Response> {
    const plain = (status: number, body: string) => new Response(body, { status });
    // 返事と一緒に受付記録も残す
    let evId: string | null = null;
    let evType: string | null = null;
    const text = async (status: number, body: string) => {
      await audit(evId, evType, `${status} ${body}`);
      return plain(status, body);
    };
    if (req.method !== 'POST') return plain(405, 'method not allowed');

    const secret = env.get('STRIPE_WEBHOOK_SECRET');
    if (!secret) {
      console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set');
      return text(503, 'not configured');
    }
    const payload = await req.text();
    // 記録用に、種類だけ先に読んでおく（署名を確かめるまでは中身を信じない）
    try {
      const peek = JSON.parse(payload);
      evId = typeof peek?.id === 'string' ? peek.id : null;
      evType = typeof peek?.type === 'string' ? peek.type : null;
    } catch {
      // JSONでない
    }
    const valid = await verifyWebhook(
      payload,
      req.headers.get('stripe-signature'),
      secret,
      Math.floor(now() / 1000),
    );
    if (!valid) return text(400, 'invalid signature');

    let event: StripeEvent;
    try {
      event = JSON.parse(payload);
    } catch {
      return text(400, 'invalid payload');
    }
    if (!HANDLED_EVENTS.includes(event.type)) return text(200, 'ignored');

    const { id, userId } = subscriptionIdOf(event);
    if (!id) return text(200, 'no subscription');

    const stripe = createStripe(env, doFetch);
    const db = createDb(env, doFetch);
    if (!stripe.configured || !db.ok) {
      console.error('[stripe-webhook] STRIPE_SECRET_KEY or Supabase settings missing');
      return text(503, 'not configured');
    }
    try {
      const row = await syncSubscription(stripe, db, id, userId);
      return text(200, row ? `ok ${row.plan} ${row.status}` : 'ok (user not found)');
    } catch (e) {
      console.error(`[stripe-webhook] ${event.type} ${event.id} failed`, e);
      return text(500, `sync failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
}
