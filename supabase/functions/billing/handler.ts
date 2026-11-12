/**
 * 料金プランの手続き（ログインした本人だけ）。
 *
 * POST /functions/v1/billing
 *   {"action":"status"}                 → 今のプラン・値段・テストモードか
 *   {"action":"checkout","plan":"plus"} → Stripe の支払い画面のURL（すでに有料なら管理画面のURL）
 *   {"action":"portal"}                 → Stripe の管理画面（解約・カード変更）のURL
 *
 * 支払いが済んだかどうかは、ここではなく Stripe からの知らせ（stripe-webhook）で記録する。
 */
import { authenticate, type Env, UUID_RE } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/http.ts';
import {
  createStripe,
  ensurePrice,
  type Plan,
  priceFor,
  StripeError,
  taxRate,
  withTax,
} from '../_shared/stripe.ts';
import { createDb, PAID_STATUSES, syncSubscription } from '../_shared/subscriptions.ts';
import { recentAttachmentPaths } from '../_shared/attachment-uses.ts';
import { attachmentLimitFor, finiteOrNull, limitFor } from '../_shared/plans.ts';

type Deps = { env: Env; fetchImpl?: typeof fetch; now?: () => number };

const DEFAULT_SITE = 'https://nayqo.vercel.app';

/** 支払いのあとに戻ってくる場所。許可したサイトのアドレスだけ使う（よそのサイトに飛ばされないように） */
export function returnBase(req: Request, env: Env): string {
  const site = (env.get('SITE_URL') ?? DEFAULT_SITE).replace(/\/$/, '');
  const allowed = (env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter((s) => s && s !== '*');
  const origin = (req.headers.get('origin') ?? '').replace(/\/$/, '');
  return origin && (origin === site || allowed.includes(origin)) ? origin : site;
}

export function createBillingHandler({ env, fetchImpl, now = Date.now }: Deps) {
  const doFetch = fetchImpl ?? fetch;

  return async function handle(req: Request): Promise<Response> {
    const cors = corsHeaders(req, env);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    const fail = (status: number, code: string) => json(status, { type: 'error', code });

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return fail(405, 'invalid_request');

    let body: { action?: unknown; plan?: unknown; sync?: unknown };
    try {
      body = await req.json();
    } catch {
      return fail(400, 'invalid_request');
    }

    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
    const auth = await authenticate(req, env, doFetch, ip);
    if (auth.kind === 'misconfigured') return fail(503, 'service_unavailable');
    if (auth.kind === 'denied' || !UUID_RE.test(auth.userId)) return fail(401, 'unauthorized');
    const userId = auth.userId;

    const db = createDb(env, doFetch);
    if (!db.ok) return fail(503, 'service_unavailable');
    const stripe = createStripe(env, doFetch);

    try {
      let row = await db.byUser(userId);
      const isPaid = (r: typeof row) =>
        Boolean(r) &&
        r!.plan !== 'free' &&
        PAID_STATUSES.includes(r!.status) &&
        (!r!.current_period_end || Date.parse(r!.current_period_end) > now());
      // 予備の確認：支払い画面から戻ってきたとき（sync=true）、まだ有料になっていなければ
      // Stripe に直接聞いて反映する（Stripe からの知らせが届かなかった・遅れたときのため）
      if (body.sync === true && stripe.configured && row?.stripe_customer_id && !isPaid(row)) {
        const subs = await stripe.request<{ data: { id: string; status: string }[] }>(
          'GET',
          '/v1/subscriptions',
          { customer: row.stripe_customer_id, status: 'all', limit: 5 },
        );
        const live = subs.data.find((x) => PAID_STATUSES.includes(x.status));
        if (live) {
          row = (await syncSubscription(stripe, db, live.id, userId)) ?? row;
          console.log(JSON.stringify({ event: 'billing_fallback_sync', user_id: userId }));
        }
      }
      const paid =
        Boolean(row) &&
        row!.plan !== 'free' &&
        PAID_STATUSES.includes(row!.status) &&
        (!row!.current_period_end || Date.parse(row!.current_period_end) > now());
      const viaStripe = paid && Boolean(row!.stripe_subscription_id);

      if (body.action === 'status') {
        const plan = paid ? row!.plan : 'free';
        const attachLimit = attachmentLimitFor(plan, env);
        // 無料プランなら、今日あと何回写真・ファイルを付けられるか
        const recent = Number.isFinite(attachLimit)
          ? await recentAttachmentPaths(env, doFetch, userId, now())
          : null;
        return json(200, {
          plan,
          status: row?.status ?? null,
          currentPeriodEnd: paid ? row!.current_period_end : null,
          cancelAtPeriodEnd: paid ? Boolean(row!.cancel_at_period_end) : false,
          manageable: Boolean(row?.stripe_customer_id),
          mode: !stripe.configured ? 'off' : stripe.testMode ? 'test' : 'live',
          // 値段は税抜。画面には税込の金額も出す（総額表示）
          prices: { plus: priceFor('plus', env) },
          pricesWithTax: { plus: withTax(priceFor('plus', env), taxRate(env)) },
          // 無制限は null
          limits: {
            free: finiteOrNull(limitFor('free', env)),
            plus: finiteOrNull(limitFor('plus', env)),
          },
          attachmentLimits: {
            free: finiteOrNull(attachmentLimitFor('free', env)),
            plus: finiteOrNull(attachmentLimitFor('plus', env)),
          },
          attachments: {
            limit: finiteOrNull(attachLimit),
            used: recent?.length ?? 0,
          },
        });
      }

      if (!stripe.configured) return fail(503, 'billing_unavailable');
      const base = returnBase(req, env);

      if (body.action === 'portal' || (body.action === 'checkout' && viaStripe)) {
        // すでに Stripe で有料プラン中 → 管理画面で変更・解約してもらう（二重に申し込ませない）
        if (!row?.stripe_customer_id) return fail(400, 'no_customer');
        const session = await stripe.request<{ url: string }>(
          'POST',
          '/v1/billing_portal/sessions',
          {
            customer: row.stripe_customer_id,
            return_url: `${base}/plans`,
          },
        );
        return json(200, { url: session.url, portal: true });
      }

      if (body.action === 'checkout') {
        const plan = body.plan;
        // PRO は販売終了。新しく申し込めるのは PLUS だけ
        if (plan !== 'plus') return fail(400, 'invalid_request');

        // Stripe の「お客様」を用意（初めてならここで作って覚えておく）
        let customerId = row?.stripe_customer_id ?? null;
        if (!customerId) {
          const customer = await stripe.request<{ id: string }>('POST', '/v1/customers', {
            ...(auth.email ? { email: auth.email } : {}),
            metadata: { user_id: userId },
          });
          customerId = customer.id;
          await db.upsert(
            row
              ? { user_id: userId, stripe_customer_id: customerId }
              : { user_id: userId, plan: 'free', status: 'active', stripe_customer_id: customerId },
          );
        }

        const price = await ensurePrice(
          stripe,
          plan as Plan,
          priceFor(plan as Plan, env),
          env.get('STRIPE_TAX_CODE') || undefined,
        );
        const session = await stripe.request<{ url: string }>('POST', '/v1/checkout/sessions', {
          mode: 'subscription',
          customer: customerId,
          client_reference_id: userId,
          line_items: [{ price, quantity: 1 }],
          success_url: `${base}/plans?checkout=success`,
          cancel_url: `${base}/plans?checkout=cancel`,
          locale: 'auto',
          metadata: { user_id: userId, plan },
          subscription_data: { metadata: { user_id: userId, plan } },
        });
        console.log(JSON.stringify({ event: 'billing_checkout', user_id: userId, plan }));
        return json(200, { url: session.url, portal: false });
      }

      return fail(400, 'invalid_request');
    } catch (e) {
      if (e instanceof StripeError) {
        console.error(`[billing] stripe ${e.status} ${e.code ?? ''}: ${e.message}`);
        // 原因調査のため、Stripe のエラーの種類名（例：resource_missing）だけ返す。本文や鍵は返さない
        const reason = /^[a-z0-9_]{1,64}$/.test(e.code ?? '') ? e.code : `http_${e.status}`;
        const param = /^[a-z0-9_\[\]]{1,80}$/.test(e.param ?? '') ? e.param : undefined;
        return json(502, {
          type: 'error',
          code: 'upstream_error',
          reason,
          ...(param ? { param } : {}),
          ...(e.path ? { at: e.path } : {}),
          // テストモードのときだけ、Stripe の説明文も返す（設定の不足を見つけやすくするため。本番では返さない）
          ...(stripe.testMode ? { message: e.message.slice(0, 300) } : {}),
        });
      }
      console.error('[billing] error', e);
      return fail(502, 'upstream_error');
    }
  };
}
