// 料金プラン（billing・stripe-webhook 関数）の自動テスト。本物の Stripe・データベースは呼ばない。
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { encodeForm, signWebhook, verifyWebhook } from '../_shared/stripe.ts';
import { createWebhookHandler } from '../stripe-webhook/handler.ts';
import { createBillingHandler, returnBase } from './handler.ts';

const ME = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const WHSEC = 'whsec_test';

const quiet = () => {
  const orig = { log: console.log, error: console.error };
  console.log = () => {};
  console.error = () => {};
  return () => Object.assign(console, orig);
};

/** 偽物の Stripe とデータベース */
function world(
  opts: { row?: Record<string, unknown> | null; prices?: any[]; sub?: any; noKey?: boolean } = {},
) {
  let row: any = opts.row === undefined ? null : opts.row;
  const calls: { method: string; url: string; body: string }[] = [];
  const env = {
    get: (k: string) =>
      (
        ({
          SUPABASE_URL: 'https://proj.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'svc',
          STRIPE_SECRET_KEY: opts.noKey ? undefined : 'sk_test_abc',
          STRIPE_WEBHOOK_SECRET: WHSEC,
          SITE_URL: 'https://nayqo.vercel.app',
          ALLOWED_ORIGINS: 'https://nayqo.vercel.app,http://localhost:8081',
        }) as Record<string, string | undefined>
      )[k],
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : '';
    calls.push({ method, url, body });
    const h = new Headers(init?.headers);
    if (url.endsWith('/auth/v1/user')) {
      return h.get('authorization') === 'Bearer good'
        ? Response.json({ id: ME, email: 'me@example.com' })
        : new Response('{}', { status: 401 });
    }
    if (url.includes('/rest/v1/subscriptions')) {
      if (method === 'GET') return Response.json(row ? [row] : []);
      row = { ...(row ?? {}), ...JSON.parse(body) };
      return new Response(null, { status: 201 });
    }
    if (url.includes('/rest/v1/attachment_uses'))
      return Response.json([{ path: 'a' }, { path: 'b' }]);
    if (url.startsWith('https://api.stripe.com/v1/prices?'))
      return Response.json({ data: opts.prices ?? [] });
    if (url === 'https://api.stripe.com/v1/prices') return Response.json({ id: 'price_new' });
    if (url.startsWith('https://api.stripe.com/v1/products/'))
      return Response.json({ id: 'prod_1' });
    if (url === 'https://api.stripe.com/v1/customers') return Response.json({ id: 'cus_new' });
    if (url === 'https://api.stripe.com/v1/checkout/sessions')
      return Response.json({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    if (url === 'https://api.stripe.com/v1/billing_portal/sessions')
      return Response.json({ url: 'https://billing.stripe.com/p/session/test_1' });
    if (url.startsWith('https://api.stripe.com/v1/subscriptions/')) return Response.json(opts.sub);
    if (url.startsWith('https://api.stripe.com/v1/subscriptions?'))
      return Response.json({
        data: opts.sub ? [{ id: opts.sub.id, status: opts.sub.status }] : [],
      });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const billing = createBillingHandler({ env, fetchImpl });
  const webhook = createWebhookHandler({ env, fetchImpl });
  const call = (body: unknown, token = 'good', origin = 'https://nayqo.vercel.app') =>
    billing(
      new Request('http://localhost/billing', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, apikey: 'pk', origin },
        body: JSON.stringify(body),
      }),
    );
  return { calls, call, webhook, env, getRow: () => row };
}

test('Stripe への送り方（入れ子・配列）', () => {
  assert.equal(
    decodeURIComponent(encodeForm({ a: 1, b: { c: 'x' }, items: [{ price: 'p', quantity: 1 }] })),
    'a=1&b[c]=x&items[0][price]=p&items[0][quantity]=1',
  );
});

test('ログインしていない → 401。Stripe は呼ばない', async () => {
  const w = world();
  const res = await w.call({ action: 'checkout', plan: 'plus' }, 'bad');
  assert.equal(res.status, 401);
  assert.ok(!w.calls.some((c) => c.url.includes('stripe.com')));
});

test('status：無料プラン・値段・テストモードを返す', async () => {
  const w = world();
  const res = await w.call({ action: 'status' });
  const body = await res.json();
  assert.equal(body.plan, 'free');
  assert.equal(body.mode, 'test');
  assert.deepEqual(body.prices, { plus: 480 });
  assert.deepEqual(body.pricesWithTax, { plus: 528 });
  assert.deepEqual(body.limits, { free: 10, plus: null });
  assert.deepEqual(body.attachmentLimits, { free: 3, plus: null });
  assert.deepEqual(body.attachments, { limit: 3, used: 2 });
});

test('checkout：お客様を作って覚え、値段（480円/月）を用意して、支払い画面のURLを返す', async () => {
  const restore = quiet();
  const w = world();
  const res = await w.call({ action: 'checkout', plan: 'plus' });
  const body = await res.json();
  restore();
  assert.equal(res.status, 200);
  assert.equal(body.url, 'https://checkout.stripe.com/c/pay/cs_test_1');
  assert.equal(w.getRow().stripe_customer_id, 'cus_new');
  const price = decodeURIComponent(
    w.calls.find((c) => c.url === 'https://api.stripe.com/v1/prices')!.body,
  );
  assert.match(price, /unit_amount=480/);
  assert.match(price, /currency=jpy/);
  assert.match(price, /recurring\[interval\]=month/);
  assert.match(price, /lookup_key=karakuchi_plus_monthly/);
  assert.match(price, /product_data\[tax_code\]=txcd_10103000/);
  assert.match(price, /tax_behavior=exclusive/);
  const session = decodeURIComponent(
    w.calls.find((c) => c.url.endsWith('/checkout/sessions'))!.body,
  );
  assert.match(session, /mode=subscription/);
  assert.match(session, new RegExp(`client_reference_id=${ME}`));
  assert.match(session, /success_url=https:\/\/nayqo\.vercel\.app\/plans\?checkout=success/);
  assert.match(session, new RegExp(`subscription_data\\[metadata\\]\\[user_id\\]=${ME}`));
});

test('PRO は販売終了：申し込めない（400）', async () => {
  const w = world();
  assert.equal((await w.call({ action: 'checkout', plan: 'pro' })).status, 400);
  assert.ok(!w.calls.some((c) => c.url.includes('stripe.com')));
});

test('checkout：同じ値段がすでにあれば作り直さない。値段を変えたら新しく作って目印を移す', async () => {
  const restore = quiet();
  const same = world({
    prices: [
      {
        id: 'price_old',
        unit_amount: 480,
        currency: 'jpy',
        tax_behavior: 'exclusive',
        product: { id: 'prod_1', name: 'NAYQO PLUS', tax_code: 'txcd_10103000' },
      },
    ],
  });
  await same.call({ action: 'checkout', plan: 'plus' });
  assert.ok(!same.calls.some((c) => c.url === 'https://api.stripe.com/v1/prices'));
  assert.ok(!same.calls.some((c) => c.url.includes('/v1/products/')));
  // 税の種類がない古い商品には付け足す
  const noTax = world({
    prices: [
      {
        id: 'price_old',
        unit_amount: 480,
        currency: 'jpy',
        tax_behavior: 'exclusive',
        product: { id: 'prod_1', tax_code: null },
      },
    ],
  });
  await noTax.call({ action: 'checkout', plan: 'plus' });
  // 税の扱いが「税抜」でない古い値段は作り直す
  const unspecified = world({
    prices: [
      {
        id: 'p',
        unit_amount: 480,
        currency: 'jpy',
        tax_behavior: 'unspecified',
        product: { id: 'prod_1', name: 'NAYQO PLUS', tax_code: 'txcd_10103000' },
      },
    ],
  });
  await unspecified.call({ action: 'checkout', plan: 'plus' });
  const re = decodeURIComponent(
    unspecified.calls.find((c) => c.url === 'https://api.stripe.com/v1/prices')!.body,
  );
  assert.match(re, /tax_behavior=exclusive/);
  assert.match(re, /transfer_lookup_key=true/);
  const upd = noTax.calls.find((c) => c.url === 'https://api.stripe.com/v1/products/prod_1');
  assert.equal(decodeURIComponent(upd!.body), 'tax_code=txcd_10103000&name=NAYQO PLUS');
  const changed = world({ prices: [{ id: 'price_old', unit_amount: 980, currency: 'jpy' }] });
  await changed.call({ action: 'checkout', plan: 'plus' });
  restore();
  const body = decodeURIComponent(
    changed.calls.find((c) => c.url === 'https://api.stripe.com/v1/prices')!.body,
  );
  assert.match(body, /transfer_lookup_key=true/);
});

test('すでに Stripe で有料プラン中 → 申し込みではなく管理画面のURL（二重に払わせない）', async () => {
  const w = world({
    row: {
      user_id: ME,
      plan: 'plus',
      status: 'active',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      current_period_end: null,
    },
  });
  const body = await (await w.call({ action: 'checkout', plan: 'plus' })).json();
  assert.equal(body.portal, true);
  assert.ok(!w.calls.some((c) => c.url.endsWith('/checkout/sessions')));
});

test('戻り先は許可したサイトだけ（知らないサイトなら本番のアドレス）', () => {
  const env = world().env;
  const r = (origin: string) => new Request('http://x', { headers: { origin } });
  assert.equal(returnBase(r('http://localhost:8081'), env), 'http://localhost:8081');
  assert.equal(returnBase(r('https://evil.example'), env), 'https://nayqo.vercel.app');
});

test('鍵が未設定 → 503（status は mode=off で答える）', async () => {
  const w = world({ noKey: true });
  assert.equal((await w.call({ action: 'checkout', plan: 'plus' })).status, 503);
  assert.equal((await (await w.call({ action: 'status' })).json()).mode, 'off');
});

// ---- Webhook ----

const sub = (over: Record<string, unknown> = {}) => ({
  id: 'sub_1',
  customer: 'cus_1',
  status: 'active',
  cancel_at_period_end: false,
  metadata: { user_id: ME, plan: 'plus' },
  items: {
    data: [{ current_period_end: 1_900_000_000, price: { lookup_key: 'karakuchi_plus_monthly' } }],
  },
  ...over,
});

async function deliver(w: ReturnType<typeof world>, event: unknown, secret = WHSEC) {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  return w.webhook(
    new Request('http://localhost/stripe-webhook', {
      method: 'POST',
      headers: { 'stripe-signature': await signWebhook(payload, secret, t) },
      body: payload,
    }),
  );
}

test('署名の確認：正しい・偽物・古すぎる', async () => {
  const t = 1_800_000_000;
  const h = await signWebhook('{"a":1}', WHSEC, t);
  assert.equal(await verifyWebhook('{"a":1}', h, WHSEC, t), true);
  assert.equal(await verifyWebhook('{"a":2}', h, WHSEC, t), false);
  assert.equal(await verifyWebhook('{"a":1}', h, 'whsec_other', t), false);
  assert.equal(await verifyWebhook('{"a":1}', h, WHSEC, t + 600), false);
  assert.equal(await verifyWebhook('{"a":1}', null, WHSEC, t), false);
});

test('偽物の知らせ → 400。データベースは書き換えない', async () => {
  const w = world({ sub: sub() });
  const res = await deliver(
    w,
    { id: 'evt', type: 'checkout.session.completed', data: { object: { subscription: 'sub_1' } } },
    'whsec_fake',
  );
  assert.equal(res.status, 400);
  assert.equal(w.getRow(), null);
});

test('支払い完了 → Stripe に状態を聞き直して PLUS を記録（期限つき）', async () => {
  const restore = quiet();
  const w = world({ sub: sub() });
  const res = await deliver(w, {
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { subscription: 'sub_1', client_reference_id: ME } },
  });
  restore();
  assert.equal(res.status, 200);
  const row = w.getRow();
  assert.equal(row.plan, 'plus');
  assert.equal(row.status, 'active');
  assert.equal(row.stripe_subscription_id, 'sub_1');
  assert.equal(row.current_period_end, new Date(1_900_000_000 * 1000).toISOString());
});

test('解約（subscription.deleted）→ 状態が canceled になる（＝無料扱い）', async () => {
  const restore = quiet();
  const w = world({
    row: {
      user_id: ME,
      plan: 'plus',
      status: 'active',
      stripe_subscription_id: 'sub_1',
      stripe_customer_id: 'cus_1',
    },
    sub: sub({ status: 'canceled' }),
  });
  const res = await deliver(w, {
    id: 'evt_2',
    type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_1' } },
  });
  restore();
  assert.equal(res.status, 200);
  assert.equal(w.getRow().status, 'canceled');
});

test('古いサブスクリプションの終了の知らせで、新しい有効なプランを消さない', async () => {
  const restore = quiet();
  const w = world({
    row: {
      user_id: ME,
      plan: 'pro',
      status: 'active',
      stripe_subscription_id: 'sub_new',
      stripe_customer_id: 'cus_1',
    },
    sub: sub({ id: 'sub_old', status: 'canceled' }),
  });
  await deliver(w, {
    id: 'evt_3',
    type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_old' } },
  });
  restore();
  assert.equal(w.getRow().stripe_subscription_id, 'sub_new');
  assert.equal(w.getRow().status, 'active');
});

test('関係ない知らせは何もしないで 200', async () => {
  const w = world({ sub: sub() });
  const res = await deliver(w, { id: 'evt_4', type: 'customer.created', data: { object: {} } });
  assert.equal(res.status, 200);
  assert.ok(!w.calls.some((c) => c.url.includes('stripe.com')));
});

test('予備の確認：知らせが届いていなくても、料金画面を開けば Stripe に聞いて PLUS を反映', async () => {
  const restore = quiet();
  const w = world({
    row: {
      user_id: ME,
      plan: 'free',
      status: 'active',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: null,
    },
    sub: {
      id: 'sub_9',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: false,
      metadata: { user_id: ME },
      items: {
        data: [
          { current_period_end: 1_900_000_000, price: { lookup_key: 'karakuchi_plus_monthly' } },
        ],
      },
    },
  });
  const body = await (await w.call({ action: 'status', sync: true })).json();
  restore();
  assert.equal(body.plan, 'plus');
  assert.equal(w.getRow().stripe_subscription_id, 'sub_9');
  // sync なし（チャット画面など）は Stripe に聞かない
  const w2 = world({
    row: { user_id: ME, plan: 'free', status: 'active', stripe_customer_id: 'cus_1' },
  });
  await w2.call({ action: 'status' });
  assert.ok(!w2.calls.some((c) => c.url.includes('stripe.com')));
});
