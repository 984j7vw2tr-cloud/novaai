// アカウント削除（account関数）の自動テスト。本物のSupabaseは呼ばない。
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAccountHandler } from './handler.ts';

const ME = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function world(opts: { deleteStatus?: number } = {}) {
  const calls: { url: string; method: string; auth: string | null }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const h = new Headers(init?.headers);
    calls.push({ url: u, method: init?.method ?? 'GET', auth: h.get('authorization') });
    if (u.endsWith('/auth/v1/user')) {
      return h.get('authorization') === 'Bearer good'
        ? new Response(JSON.stringify({ id: ME }))
        : new Response('{}', { status: 401 });
    }
    if (u.includes('/auth/v1/admin/users/')) return new Response('{}', { status: opts.deleteStatus ?? 200 });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const env = {
    get: (k: string) =>
      ({ SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' })[k as 'SUPABASE_URL'],
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
  const del = calls.find((c) => c.method === 'DELETE');
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
  const del = calls.filter((c) => c.method === 'DELETE');
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
