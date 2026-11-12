// 音声会話（voice）の自動テスト。本物の OpenAI・データベースは呼ばない。
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createVoiceHandler, secondsUsed } from './handler.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-11-12T12:00:00Z');

const quiet = () => {
  const orig = { log: console.log, error: console.error };
  console.log = () => {};
  console.error = () => {};
  return () => Object.assign(console, orig);
};

type Row = {
  allowed_seconds: number;
  started_at: string;
  ended_at: string | null;
  seconds: number | null;
};

function world(
  opts: { plan?: string; rows?: Row[]; secretStatus?: number; env?: Record<string, string> } = {},
) {
  const seen = { secret: [] as any[], inserted: [] as any[], patched: [] as any[] };
  const vars: Record<string, string> = {
    OPENAI_API_KEY: 'sk-test',
    SUPABASE_URL: 'https://proj.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'svc',
    ...opts.env,
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: USER });
    if (url.includes('/rest/v1/subscriptions'))
      return Response.json(
        opts.plan ? [{ plan: opts.plan, status: 'active', current_period_end: null }] : [],
      );
    if (url.includes('/rest/v1/voice_sessions')) {
      if (init?.method === 'POST') {
        seen.inserted.push(JSON.parse(String(init.body)));
        return Response.json([{ id: SESSION }], { status: 201 });
      }
      if (init?.method === 'PATCH') {
        seen.patched.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(null, { status: 204 });
      }
      if (url.includes(`id=eq.${SESSION}`)) return Response.json(opts.rows ?? []);
      return Response.json(opts.rows ?? []);
    }
    if (url.endsWith('/realtime/client_secrets')) {
      seen.secret.push(JSON.parse(String(init?.body)));
      if (opts.secretStatus)
        return Response.json({ error: { message: 'x' } }, { status: opts.secretStatus });
      return Response.json({ value: 'ek_test', expires_at: 123, session: {} });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const handle = createVoiceHandler({ env: { get: (k) => vars[k] }, fetchImpl, now: () => NOW });
  const post = async (body: unknown) => {
    const res = await handle(
      new Request('http://localhost/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: 'Bearer t', apikey: 'pk' },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, data: await res.json() };
  };
  return { post, seen };
}

const ago = (sec: number) => new Date(NOW - sec * 1000).toISOString();

test('開始：無料は3分。使い捨ての鍵と、残り時間を返す（本物の鍵は返さない）', async () => {
  const restore = quiet();
  const w = world();
  const { status, data } = await w.post({ action: 'start', settings: { uiLanguage: 'ja' } });
  restore();
  assert.equal(status, 200);
  assert.equal(data.clientSecret, 'ek_test');
  assert.equal(data.remainingSeconds, 180);
  assert.equal(data.limitSeconds, 180);
  assert.equal(data.plan, 'free');
  assert.equal(data.sessionId, SESSION);
  assert.ok(!JSON.stringify(data).includes('sk-test'));
  const s = w.seen.secret[0];
  assert.equal(s.expires_after.seconds, 60);
  assert.equal(s.session.type, 'realtime');
  assert.equal(s.session.audio.output.voice, 'cedar');
  assert.match(s.session.instructions, /NAYQO/);
  assert.match(s.session.instructions, /^# VOICE MODE/);
  assert.doesNotMatch(s.session.instructions, /# Creating images/);
  assert.deepEqual(w.seen.inserted[0], {
    user_id: USER,
    model: s.session.model,
    allowed_seconds: 180,
  });
});

test('開始：PLUS は30分。今日使った分を引く（終了の連絡がない通話は経過時間で数える）', async () => {
  const restore = quiet();
  const w = world({
    plan: 'plus',
    rows: [
      { allowed_seconds: 1800, started_at: ago(3600), ended_at: ago(3000), seconds: 600 },
      // 通話中（途中経過で240秒）：240＋30＝270秒使った扱い
      { allowed_seconds: 1200, started_at: ago(300), ended_at: null, seconds: 240 },
    ],
  });
  const { status, data } = await w.post({ action: 'start' });
  restore();
  assert.equal(status, 200);
  assert.equal(data.limitSeconds, 1800);
  assert.equal(data.remainingSeconds, 1800 - 600 - 270);
});

test('開始：上限に達していたら 429 voice_limit（鍵はもらわない）', async () => {
  const restore = quiet();
  const w = world({
    rows: [{ allowed_seconds: 180, started_at: ago(4000), ended_at: ago(3820), seconds: 175 }],
  });
  const { status, data } = await w.post({ action: 'start' });
  restore();
  assert.equal(status, 429);
  assert.equal(data.code, 'voice_limit');
  assert.equal(data.plan, 'free');
  assert.equal(data.limitSeconds, 180);
  assert.equal(w.seen.secret.length, 0);
});

test('開始：上限は環境変数で変えられる', async () => {
  const restore = quiet();
  const w = world({ env: { VOICE_MINUTES_FREE: '0' } });
  const { status } = await w.post({ action: 'start' });
  restore();
  assert.equal(status, 429);
});

test('開始：OpenAI が失敗したら 502（記録しない）', async () => {
  const restore = quiet();
  const w = world({ secretStatus: 500 });
  const { status } = await w.post({ action: 'start' });
  restore();
  assert.equal(status, 502);
  assert.equal(w.seen.inserted.length, 0);
});

test('終了：申告された秒数は、経過時間と残り時間までに抑えて記録する', async () => {
  const restore = quiet();
  const w = world({
    rows: [{ allowed_seconds: 180, started_at: ago(60), ended_at: null, seconds: null }],
  });
  const { status } = await w.post({ action: 'end', sessionId: SESSION, seconds: 9999 });
  restore();
  assert.equal(status, 200);
  assert.equal(w.seen.patched[0].body.seconds, 65); // 経過60秒＋余裕5秒
  assert.match(w.seen.patched[0].url, new RegExp(`user_id=eq.${USER}`));
});

test('途中経過（tick）：秒数だけ記録し、終了にはしない', async () => {
  const restore = quiet();
  const w = world({
    rows: [{ allowed_seconds: 180, started_at: ago(40), ended_at: null, seconds: 20 }],
  });
  const { status } = await w.post({ action: 'tick', sessionId: SESSION, seconds: 40 });
  restore();
  assert.equal(status, 200);
  assert.deepEqual(w.seen.patched[0].body, { seconds: 40 });
});

test('終了：形がおかしければ 400', async () => {
  const restore = quiet();
  const w = world();
  assert.equal((await w.post({ action: 'end', sessionId: 'x', seconds: 1 })).status, 400);
  assert.equal((await w.post({ action: 'end', sessionId: SESSION, seconds: -1 })).status, 400);
  assert.equal((await w.post({ action: 'nope' })).status, 400);
  restore();
});

test('secondsUsed：途中経過・経過時間・残り時間で数える（突然閉じても丸ごと失わない）', () => {
  // 連絡なし：経過時間（最大60秒）
  assert.equal(
    secondsUsed({ allowed_seconds: 100, started_at: ago(50), ended_at: null, seconds: null }, NOW),
    50,
  );
  assert.equal(
    secondsUsed(
      { allowed_seconds: 1800, started_at: ago(900), ended_at: null, seconds: null },
      NOW,
    ),
    60,
  );
  // 途中経過120秒のあと途切れた：120＋30
  assert.equal(
    secondsUsed({ allowed_seconds: 1800, started_at: ago(900), ended_at: null, seconds: 120 }, NOW),
    150,
  );
  // 残り時間まで
  assert.equal(
    secondsUsed({ allowed_seconds: 100, started_at: ago(500), ended_at: null, seconds: 90 }, NOW),
    100,
  );
  assert.equal(
    secondsUsed({ allowed_seconds: 100, started_at: ago(500), ended_at: ago(1), seconds: 30 }, NOW),
    30,
  );
});
