// アカウント削除（account関数）の自動テスト。本物のSupabaseは呼ばない。
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAccountHandler } from './handler.ts';

const ME = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function world(
  opts: {
    deleteStatus?: number;
    files?: string[];
    listStatus?: number;
    subscription?: Record<string, unknown>;
    stripeStatus?: number;
  } = {},
) {
  const calls: { url: string; method: string; auth: string | null; body?: any }[] = [];
  let files = [...(opts.files ?? [])];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const h = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url: u, method: init?.method ?? 'GET', auth: h.get('authorization'), body });
    if (u.endsWith('/storage/v1/object/list/attachments')) {
      if (opts.listStatus) return new Response('{}', { status: opts.listStatus });
      return Response.json(files.map((name) => ({ name })));
    }
    if (u.endsWith('/storage/v1/object/attachments') && init?.method === 'DELETE') {
      const removed = new Set(body.prefixes as string[]);
      files = files.filter((f) => !removed.has(`${ME}/${f}`));
      return Response.json([]);
    }
    if (u.endsWith('/auth/v1/user')) {
      return h.get('authorization') === 'Bearer good'
        ? new Response(JSON.stringify({ id: ME }))
        : new Response('{}', { status: 401 });
    }
    if (u.includes('/rest/v1/subscriptions'))
      return Response.json(opts.subscription ? [opts.subscription] : []);
    if (u.startsWith('https://api.stripe.com/v1/subscriptions/')) {
      return new Response('{}', { status: opts.stripeStatus ?? 200 });
    }
    if (u.includes('/auth/v1/admin/users/'))
      return new Response('{}', { status: opts.deleteStatus ?? 200 });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const env = {
    get: (k: string) =>
      (
        ({
          SUPABASE_URL: 'https://proj.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'svc',
          STRIPE_SECRET_KEY: 'sk_test_x',
        }) as Record<string, string>
      )[k],
  };
  return { calls, handle: createAccountHandler({ env, fetchImpl }) };
}

const req = (token: string | null, body: unknown = { action: 'delete' }) =>
  new Request('http://localhost/account', {
    method: 'POST',
    headers: { apikey: 'pk', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const quiet = () => {
  const orig = { log: console.log, error: console.error };
  console.log = () => {};
  console.error = () => {};
  return () => Object.assign(console, orig);
};

test('本人の鍵 → 自分のアカウントだけを、サーバー専用の鍵で削除する', async () => {
  const restore = quiet();
  const { calls, handle } = world();
  const res = await handle(req('good'));
  restore();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { type: 'deleted' });
  const del = calls.find((c) => c.method === 'DELETE' && c.url.includes('/admin/users/'));
  assert.equal(del?.url, `https://proj.supabase.co/auth/v1/admin/users/${ME}`);
  assert.equal(del?.auth, 'Bearer svc');
});

test('鍵がない・偽物 → 401。何も消さない', async () => {
  const restore = quiet();
  const { calls, handle } = world();
  const r1 = await handle(req(null));
  const r2 = await handle(req('forged'));
  restore();
  assert.equal(r1.status, 401);
  assert.equal(r2.status, 401);
  assert.ok(!calls.some((c) => c.method === 'DELETE'));
});

test('他人のIDを指定しても無視（消すのは常に本人）。action が違えば 400', async () => {
  const restore = quiet();
  const { calls, handle } = world();
  await handle(req('good', { action: 'delete', userId: '99999999-9999-4999-8999-999999999999' }));
  const bad = await handle(req('good', { action: 'drop_everything' }));
  restore();
  const del = calls.filter((c) => c.method === 'DELETE' && c.url.includes('/admin/users/'));
  assert.equal(del.length, 1);
  assert.ok(del[0].url.endsWith(ME));
  assert.equal(bad.status, 400);
});

test('削除に失敗したら 502（成功したふりをしない）', async () => {
  const restore = quiet();
  const { handle } = world({ deleteStatus: 500 });
  const res = await handle(req('good'));
  restore();
  assert.equal(res.status, 502);
});

test('添付した写真・ファイル（本人のフォルダ）を先に消してから、アカウントを消す', async () => {
  const restore = quiet();
  const { calls, handle } = world({ files: ['a.jpg', 'b.pdf'] });
  const res = await handle(req('good'));
  restore();
  assert.equal(res.status, 200);
  const list = calls.find((c) => c.url.endsWith('/object/list/attachments'));
  assert.equal(list?.body.prefix, `${ME}/`);
  const delFiles = calls.findIndex((c) => c.url.endsWith('/object/attachments'));
  const delUser = calls.findIndex((c) => c.url.includes('/admin/users/'));
  assert.deepEqual(calls[delFiles].body.prefixes, [`${ME}/a.jpg`, `${ME}/b.pdf`]);
  assert.ok(delFiles < delUser);
});

test('写真の削除に失敗したら 502。アカウントは消さない', async () => {
  const restore = quiet();
  const { calls, handle } = world({ files: ['a.jpg'], listStatus: 500 });
  const res = await handle(req('good'));
  restore();
  assert.equal(res.status, 502);
  assert.ok(!calls.some((c) => c.url.includes('/admin/users/')));
});

test('有料プラン中なら、Stripe で解約してからアカウントを消す', async () => {
  const restore = quiet();
  const { calls, handle } = world({
    subscription: {
      user_id: ME,
      plan: 'plus',
      status: 'active',
      stripe_subscription_id: 'sub_123',
    },
  });
  const res = await handle(req('good'));
  restore();
  assert.equal(res.status, 200);
  const cancel = calls.findIndex(
    (c) => c.url === 'https://api.stripe.com/v1/subscriptions/sub_123',
  );
  const delUser = calls.findIndex((c) => c.url.includes('/admin/users/'));
  assert.equal(calls[cancel].method, 'DELETE');
  assert.equal(calls[cancel].auth, 'Bearer sk_test_x');
  assert.ok(cancel < delUser);
});

test('解約に失敗したら 502。アカウントは消さない（請求が続くのを防ぐ）', async () => {
  const restore = quiet();
  const { calls, handle } = world({
    subscription: { user_id: ME, plan: 'pro', status: 'active', stripe_subscription_id: 'sub_9' },
    stripeStatus: 500,
  });
  const res = await handle(req('good'));
  restore();
  assert.equal(res.status, 502);
  assert.ok(!calls.some((c) => c.url.includes('/admin/users/')));
});

test('すでに解約済み・無料なら Stripe は呼ばない', async () => {
  const restore = quiet();
  const { calls, handle } = world({
    subscription: {
      user_id: ME,
      plan: 'plus',
      status: 'canceled',
      stripe_subscription_id: 'sub_1',
    },
  });
  const res = await handle(req('good'));
  restore();
  assert.equal(res.status, 200);
  assert.ok(!calls.some((c) => c.url.includes('api.stripe.com')));
});
