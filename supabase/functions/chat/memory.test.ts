// NAYQOの記憶と宿題の自動テスト。本物の OpenAI・データベースは呼ばない。
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createHandler } from './handler.ts';
import {
  applyMemoryChanges,
  dueTask,
  type MemoryItem,
  memoryPrompt,
  REMIND_INTERVAL_MS,
} from '../_shared/memory.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const NOW = Date.parse('2026-11-13T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const DAY = 86400000;

const quiet = () => {
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  return () => Object.assign(console, orig);
};

const item = (p: Partial<MemoryItem>): MemoryItem => ({
  id: crypto.randomUUID(),
  kind: 'fact',
  content: 'x',
  due_at: null,
  status: 'open',
  reminded_at: null,
  created_at: iso(NOW - 10 * DAY),
  ...p,
});

test('dueTask：期限切れで、最近聞いていない宿題のうち一番古いもの', () => {
  const a = item({ kind: 'task', content: 'A', due_at: iso(NOW - 3 * DAY) });
  const b = item({ kind: 'task', content: 'B', due_at: iso(NOW - 5 * DAY) });
  const notYet = item({ kind: 'task', content: 'C', due_at: iso(NOW + DAY) });
  const askedRecently = item({
    kind: 'task',
    content: 'D',
    due_at: iso(NOW - 9 * DAY),
    reminded_at: iso(NOW - 3600000),
  });
  assert.equal(dueTask([a, b, notYet, askedRecently], NOW)?.content, 'B');
  // 前に聞いてから時間が経っていれば、また聞く
  const askedLongAgo = { ...askedRecently, reminded_at: iso(NOW - REMIND_INTERVAL_MS - 1) };
  assert.equal(dueTask([a, b, askedLongAgo], NOW)?.content, 'D');
  assert.equal(dueTask([notYet], NOW), null);
});

test('memoryPrompt：覚えていること・目標・宿題。宿題の確認は会話の最初だけ', () => {
  const items = [
    item({ kind: 'fact', content: '名前はタカシ' }),
    item({ kind: 'goal', content: 'TOEIC 800点を取りたい' }),
    item({ kind: 'task', content: '毎朝英単語を20個覚える', due_at: iso(NOW - DAY) }),
  ];
  const first = memoryPrompt(items, NOW, { firstMessage: true });
  assert.match(first.text, /# Homework coach/);
  assert.match(first.text, /- 名前はタカシ/);
  assert.match(first.text, /- Goal: TOEIC 800点を取りたい/);
  assert.match(first.text, /- Homework: 毎朝英単語を20個覚える \(deadline 2026-11-12 — passed\)/);
  assert.match(first.text, /# Homework check/);
  assert.equal(first.remind?.content, '毎朝英単語を20個覚える');
  const later = memoryPrompt(items, NOW, { firstMessage: false });
  assert.doesNotMatch(later.text, /# Homework check/);
  assert.equal(later.remind, null);
  // 何も覚えていなくても、コーチのルールは入る
  assert.match(memoryPrompt([], NOW, { firstMessage: true }).text, /# Homework coach/);
});

function db() {
  const seen = { inserts: [] as any[], patches: [] as any[], deletes: [] as string[] };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'POST') seen.inserts.push(...JSON.parse(String(init.body)));
    if (init?.method === 'PATCH') seen.patches.push({ url, body: JSON.parse(String(init.body)) });
    if (init?.method === 'DELETE') seen.deletes.push(url);
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  const env = {
    get: (k: string) =>
      ({ SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' })[k],
  };
  return { seen, fetchImpl, env };
}

test('applyMemoryChanges：追加（重複なし・最大5件・宿題に期限）・完了・削除（宿題は消さない）', async () => {
  const fact = item({ kind: 'fact', content: '大学2年生' });
  const task = item({ kind: 'task', content: '求人を5件見る', due_at: iso(NOW - DAY) });
  const d = db();
  const r = await applyMemoryChanges(
    d.env,
    d.fetchImpl,
    USER,
    [fact, task],
    {
      add: [
        { kind: 'fact', content: '大学2年生', due_in_days: null }, // 重複
        { kind: 'fact', content: '大学3年生', due_in_days: null },
        { kind: 'task', content: '毎日30分英語を勉強する', due_in_days: 3 },
        { kind: 'goal', content: '外資系に就職したい', due_in_days: null },
        { kind: 'goal', content: '5件目', due_in_days: null },
        { kind: 'goal', content: '6件目は入らない', due_in_days: null },
      ],
      complete: [
        { id: task.id, status: 'done' },
        { id: 'unknown-id', status: 'done' },
      ],
      remove: [fact.id, task.id],
    },
    NOW,
  );
  assert.deepEqual(r, { added: 4, completed: 1, removed: 1 });
  assert.deepEqual(
    d.seen.inserts.map((x) => [x.kind, x.content, x.due_at]),
    [
      ['fact', '大学3年生', null],
      ['task', '毎日30分英語を勉強する', iso(NOW + 3 * DAY)],
      ['goal', '外資系に就職したい', null],
      ['goal', '5件目', null],
    ],
  );
  assert.equal(d.seen.patches[0].body.status, 'done');
  assert.match(d.seen.patches[0].url, new RegExp(`id=eq.${task.id}&user_id=eq.${USER}`));
  assert.equal(d.seen.deletes.length, 1);
  assert.match(d.seen.deletes[0], new RegExp(`id=eq.${fact.id}`));
});

test('applyMemoryChanges：宿題が多すぎるときは増やさない', async () => {
  const many = Array.from({ length: 20 }, (_, i) =>
    item({ kind: 'task', content: `t${i}`, due_at: iso(NOW + DAY) }),
  );
  const d = db();
  const r = await applyMemoryChanges(
    d.env,
    d.fetchImpl,
    USER,
    many,
    { add: [{ kind: 'task', content: 'new', due_in_days: 1 }], complete: [], remove: [] },
    NOW,
  );
  assert.equal(r.added, 0);
});

// ---- チャットとのつながり ----

const sse = (chunks: unknown[]) =>
  new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n');

function world(opts: { items?: MemoryItem[]; enabled?: boolean } = {}) {
  const seen = {
    chat: [] as any[],
    extract: [] as any[],
    memoryReads: 0,
    inserts: [] as any[],
    patches: [] as any[],
  };
  const vars: Record<string, string> = {
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL: 'test-model',
    OPENAI_API: 'chat',
    SUPABASE_URL: 'https://proj.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'svc',
    MODERATION: 'off',
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: USER });
    if (url.includes('/rest/v1/subscriptions')) return Response.json([]);
    if (url.includes('/rest/v1/usage_events')) {
      if (init?.method === 'POST') return new Response(null, { status: 201 });
      return new Response('[]', { headers: { 'content-range': '*/0' } });
    }
    if (url.includes('/rest/v1/profiles'))
      return Response.json([{ memory_enabled: opts.enabled ?? true }]);
    if (url.includes('/rest/v1/memories')) {
      if (init?.method === 'POST') {
        seen.inserts.push(...JSON.parse(String(init.body)));
        return new Response(null, { status: 201 });
      }
      if (init?.method === 'PATCH') {
        seen.patches.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(null, { status: 204 });
      }
      seen.memoryReads++;
      return Response.json(opts.items ?? []);
    }
    if (url.endsWith('/responses')) {
      seen.extract.push(JSON.parse(String(init?.body)));
      return Response.json({
        output_text: JSON.stringify({
          add: [{ kind: 'task', content: '3日以内に求人を5件見る', due_in_days: 3 }],
          complete: [],
          remove: [],
        }),
      });
    }
    if (url.endsWith('/chat/completions')) {
      seen.chat.push(JSON.parse(String(init?.body)));
      return sse([
        { choices: [{ delta: { content: '3日以内に求人を5件見ろ。次来たら報告な。' } }] },
      ]);
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const pending: Promise<unknown>[] = [];
  const handle = createHandler({
    env: { get: (k) => vars[k] },
    fetchImpl,
    now: () => NOW,
    waitUntil: (p) => pending.push(p),
  });
  const send = async (body: Record<string, unknown>) => {
    const res = await handle(
      new Request('http://localhost/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: 'Bearer t', apikey: 'pk' },
        body: JSON.stringify(body),
      }),
    );
    const text = await res.text();
    await Promise.all(pending);
    return text;
  };
  return { send, seen };
}

test('チャット：記憶を指示文に入れ、期限の来た宿題を聞かせ、答えたあと宿題を保存する', async () => {
  const restore = quiet();
  const task = item({ kind: 'task', content: '毎朝英単語を20個覚える', due_at: iso(NOW - DAY) });
  const w = world({ items: [item({ kind: 'fact', content: '名前はタカシ' }), task] });
  await w.send({ messages: [{ role: 'user', content: '就活がうまくいかない' }] });
  restore();
  const system = w.seen.chat[0].messages[0].content as string;
  assert.match(system, /- 名前はタカシ/);
  assert.match(system, /# Homework check/);
  assert.match(system, /毎朝英単語を20個覚える/);
  // 聞いた時刻を記録
  assert.ok(w.seen.patches.some((p) => p.body.reminded_at && p.url.includes(task.id)));
  // 答えたあと：抜き出し → 保存
  assert.equal(w.seen.extract.length, 1);
  const extractInput = w.seen.extract[0].input[1].content as string;
  assert.match(extractInput, /USER: 就活がうまくいかない/);
  assert.match(extractInput, /NAYQO: 3日以内に求人を5件見ろ/);
  assert.equal(w.seen.inserts[0].content, '3日以内に求人を5件見る');
  assert.equal(w.seen.inserts[0].user_id, USER);
});

test('チャット：会話の2通目以降は宿題を聞かない', async () => {
  const restore = quiet();
  const task = item({ kind: 'task', content: '毎朝英単語を20個覚える', due_at: iso(NOW - DAY) });
  const w = world({ items: [task] });
  await w.send({
    messages: [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ],
  });
  restore();
  assert.doesNotMatch(w.seen.chat[0].messages[0].content, /# Homework check/);
  assert.ok(!w.seen.patches.some((p) => p.body.reminded_at));
});

test('チャット：一時チャットでは記憶を読まない・保存しない', async () => {
  const restore = quiet();
  const w = world({ items: [item({ kind: 'fact', content: '名前はタカシ' })] });
  await w.send({ messages: [{ role: 'user', content: '就活がうまくいかない' }], temporary: true });
  restore();
  assert.equal(w.seen.memoryReads, 0);
  assert.equal(w.seen.extract.length, 0);
  assert.doesNotMatch(w.seen.chat[0].messages[0].content, /Homework coach/);
});

test('チャット：記憶がオフなら読まない・保存しない', async () => {
  const restore = quiet();
  const w = world({ enabled: false, items: [item({ kind: 'fact', content: '名前はタカシ' })] });
  await w.send({ messages: [{ role: 'user', content: '就活がうまくいかない' }] });
  restore();
  assert.doesNotMatch(w.seen.chat[0].messages[0].content, /名前はタカシ|Homework coach/);
  assert.equal(w.seen.extract.length, 0);
});
