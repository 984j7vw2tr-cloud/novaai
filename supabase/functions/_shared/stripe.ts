/**
 * Stripe（決済）とのやり取り。SDK は使わず、Stripe の API を直接呼ぶ（Deno でも Node のテストでも動くように）。
 * 秘密の鍵（STRIPE_SECRET_KEY）はサーバーの環境変数にだけ置く。アプリには絶対に渡さない。
 */
import type { Env } from './auth.ts';

export type Plan = 'plus' | 'pro';

/** 月額の値段（円・税抜）。環境変数 PRICE_PLUS_JPY / PRICE_PRO_JPY で変えられる */
export const DEFAULT_PRICES_JPY: Record<Plan, number> = { plus: 480, pro: 950 };

export const PLAN_NAMES: Record<Plan, string> = {
  plus: 'Karakuchi AI PLUS',
  pro: 'Karakuchi AI PRO',
};

/** Stripe の中で値段を探すための目印（lookup_key） */
export const lookupKey = (plan: Plan) => `karakuchi_${plan}_monthly`;

/** 消費税率（表示用。環境変数 TAX_RATE で変えられる） */
export function taxRate(env: Env): number {
  const n = Number(env.get('TAX_RATE'));
  return Number.isFinite(n) && n >= 0 && n < 1 ? n : 0.1;
}

/** 税込の金額（円・端数は切り捨て） */
export const withTax = (amount: number, rate: number) => Math.floor(amount * (1 + rate) + 1e-9);

export function priceFor(plan: Plan, env: Env): number {
  const n = Number(env.get(`PRICE_${plan.toUpperCase()}_JPY`));
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_PRICES_JPY[plan];
}

export class StripeError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  /** どの項目が問題だったか（Stripe が返す param。原因調査用） */
  readonly param: string | undefined;
  /** どのAPIで失敗したか（例：POST /v1/prices） */
  path: string | undefined;
  constructor(status: number, code: string | undefined, message: string, param?: string) {
    super(message);
    this.name = 'StripeError';
    this.status = status;
    this.code = code;
    this.param = param;
  }
}

type Params = Record<string, unknown>;

/** { a: { b: 1 }, c: [x, y] } → a[b]=1&c[0]=x&c[1]=y（Stripe の送り方） */
export function encodeForm(params: Params, prefix = ''): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object')
          out.push(encodeForm(item as Params, `${key}[${i}]`));
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === 'object') {
      out.push(encodeForm(v as Params, key));
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out.filter(Boolean).join('&');
}

export function createStripe(env: Env, doFetch: typeof fetch) {
  const key = env.get('STRIPE_SECRET_KEY');
  const base = (env.get('STRIPE_API_BASE') ?? 'https://api.stripe.com').replace(/\/$/, '');

  async function request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, params: Params = {}) {
    if (!key) throw new StripeError(503, 'not_configured', 'STRIPE_SECRET_KEY is not set');
    const query = encodeForm(params);
    const url = method === 'POST' || !query ? `${base}${path}` : `${base}${path}?${query}`;
    const res = await doFetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: method === 'POST' ? query : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new StripeError(
        res.status,
        data?.error?.code ?? data?.error?.type,
        data?.error?.message ?? `HTTP ${res.status}`,
        data?.error?.param,
      );
      err.path = `${method} ${path.replace(/\/(cus|sub|price|prod)_[A-Za-z0-9]+/g, '/:id')}`;
      throw err;
    }
    return data as T;
  }

  return {
    configured: Boolean(key),
    /** テスト用の鍵か（sk_test_ / rk_test_）。画面に「テストモード」と出すため */
    testMode: Boolean(key && /^(sk|rk)_test_/.test(key)),
    request,
  };
}

export type Stripe = ReturnType<typeof createStripe>;

/**
 * プランの値段（Stripe の Price）を用意する。
 * 目印（lookup_key）で探し、なければ作る。値段を変えたときは新しい Price を作って目印を移す。
 */
/**
 * 商品の税の種類（Stripe の tax_code）。Karakuchi AI は個人向けのオンラインサービスなので
 * 「SaaS（個人利用）」。Stripe の Managed Payments（税の計算・納付を Stripe が代行）では必須。
 * 環境変数 STRIPE_TAX_CODE で変えられる。
 */
export const DEFAULT_TAX_CODE = 'txcd_10103000';

export async function ensurePrice(
  stripe: Stripe,
  plan: Plan,
  amount: number,
  taxCode = DEFAULT_TAX_CODE,
): Promise<string> {
  const found = await stripe.request<{
    data: {
      id: string;
      unit_amount: number;
      currency: string;
      tax_behavior?: string | null;
      product: { id: string; tax_code: string | { id: string } | null } | string;
    }[];
  }>('GET', '/v1/prices', {
    'lookup_keys[]': lookupKey(plan),
    active: 'true',
    limit: 1,
    'expand[]': 'data.product',
  });
  const current = found.data[0];
  // 値段は「税抜」（消費税はお客さんの支払い時に上乗せ）。税の扱いが違う古い値段は作り直す
  if (
    current &&
    current.unit_amount === amount &&
    current.currency === 'jpy' &&
    current.tax_behavior === 'exclusive'
  ) {
    // 以前に税の種類なしで作った商品なら、ここで付ける
    const product = typeof current.product === 'object' ? current.product : null;
    const code =
      product && (typeof product.tax_code === 'string' ? product.tax_code : product.tax_code?.id);
    if (product && code !== taxCode) {
      await stripe.request('POST', `/v1/products/${encodeURIComponent(product.id)}`, {
        tax_code: taxCode,
      });
    }
    return current.id;
  }
  const created = await stripe.request<{ id: string }>('POST', '/v1/prices', {
    currency: 'jpy',
    unit_amount: amount,
    tax_behavior: 'exclusive',
    recurring: { interval: 'month' },
    lookup_key: lookupKey(plan),
    transfer_lookup_key: current ? 'true' : undefined,
    product_data: { name: PLAN_NAMES[plan], tax_code: taxCode, metadata: { plan } },
    metadata: { plan },
  });
  return created.id;
}

// ---- 決済の知らせ（Webhook）の確認 ----

const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Stripe から届いた知らせが本物か確かめる（Stripe-Signature ヘッダーの署名を検証）。
 * 偽物・古すぎる（5分以上前）知らせは false。
 */
export async function verifyWebhook(
  payload: string,
  header: string | null,
  secret: string,
  nowSec: number,
  toleranceSec = 300,
): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!Number.isFinite(t) || signatures.length === 0) return false;
  if (Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  return signatures.some((s) => safeEqual(s, expected));
}

/** テスト用：本物と同じ形の署名を作る */
export async function signWebhook(payload: string, secret: string, t: number) {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${payload}`)}`;
}
