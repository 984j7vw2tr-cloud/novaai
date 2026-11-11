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

  return async function handle(req: Request): Promise<Response> {
    const text = (status: number, body: string) => new Response(body, { status });
    if (req.method !== 'POST') return text(405, 'method not allowed');

    const secret = env.get('STRIPE_WEBHOOK_SECRET');
    if (!secret) {
      console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set');
      return text(503, 'not configured');
    }
    const payload = await req.text();
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
      await syncSubscription(stripe, db, id, userId);
      return text(200, 'ok');
    } catch (e) {
      console.error(`[stripe-webhook] ${event.type} ${event.id} failed`, e);
      return text(500, 'sync failed');
    }
  };
}
