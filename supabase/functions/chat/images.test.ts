// 画像生成（generate_image）の自動テスト。本物の OpenAI・Storage は呼ばない。
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createHandler } from './handler.ts';

const USER = '11111111-1111-4111-8111-111111111111';

const quiet = () => {
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  return () => Object.assign(console, orig);
};

const sse = (chunks: unknown[]) =>
  new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n');

function world(
  opts: { used?: number; plan?: string; imageStatus?: number; imageError?: string } = {},
) {
  const seen = {
    chat: [] as any[],
    image: [] as any[],
    uploads: [] as string[],
    records: [] as any[],
  };
  const env = {
    get: (k: string) =>
      (
        ({
          OPENAI_API_KEY: 'sk-test',
          OPENAI_MODEL: 'test-model',
          SUPABASE_URL: 'https://proj.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'svc',
          MODERATION: 'off',
        }) as Record<string, string>
      )[k],
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: USER });
    if (url.includes('/rest/v1/subscriptions'))
      return Response.json(
        opts.plan ? [{ plan: opts.plan, status: 'active', current_period_end: null }] : [],
      );
    if (url.includes('/rest/v1/usage_events')) {
      if (init?.method === 'POST') return new Response(null, { status: 201 });
      return new Response('[]', { headers: { 'content-range': '*/0' } });
    }
    if (url.includes('/rest/v1/image_generations')) {
      if (init?.method === 'POST') {
        seen.records.push(JSON.parse(String(init.body)));
        return new Response(null, { status: 201 });
      }
      return new Response('[]', { headers: { 'content-range': `*/${opts.used ?? 0}` } });
    }
    if (url.includes('/storage/v1/object/attachments/')) {
      seen.uploads.push(url.split('/attachments/')[1]);
      return Response.json({ Key: 'ok' });
    }
    if (url.endsWith('/images/generations')) {
      seen.image.push(JSON.parse(String(init?.body)));
      if (opts.imageStatus) {
        return Response.json(
          { error: { code: opts.imageError ?? 'server_error', message: 'x' } },
          { status: opts.imageStatus },
        );
      }
      return Response.json({ data: [{ b64_json: btoa('PNGDATA') }] });
    }
    if (url.endsWith('/chat/completions')) {
      const body = JSON.parse(String(init?.body));
      seen.chat.push(body);
      if (seen.chat.length === 1) {
        // 1回目：AIが画像の道具を呼ぶ
        return sse([
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_1',
                      function: { name: 'generate_image', arguments: '{"prompt":"a cat' },
                    },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [{ index: 0, function: { arguments: ' surfing at sunset"}' } }],
                },
              },
            ],
          },
        ]);
      }
      // 2回目：ひと言
      return sse([{ choices: [{ delta: { content: 'ほらよ。' } }] }]);
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const handle = createHandler({ env, fetchImpl });
  const send = async () => {
    const res = await handle(
      new Request('http://localhost/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: 'Bearer t', apikey: 'pk' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: '夕焼けでサーフィンする猫の画像を作って' }],
        }),
      }),
    );
    const lines = (await res.text())
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    return { res, lines };
  };
  return { send, seen };
}

test('画像の道具 → 画像を作って保存し、image を送り、そのあとひと言を返す', async () => {
  const restore = quiet();
  const w = world();
  const { lines } = await w.send();
  restore();
  assert.equal(w.seen.chat[0].tools[0].function.name, 'generate_image');
  assert.equal(w.seen.chat[0].reasoning_effort, 'none');
  assert.equal(w.seen.chat[1].reasoning_effort, 'none');
  assert.equal(w.seen.image[0].prompt, 'a cat surfing at sunset');
  assert.equal(w.seen.image[0].quality, 'medium');
  assert.ok(lines.some((l) => l.type === 'status' && l.status === 'generating_image'));
  const img = lines.find((l) => l.type === 'image');
  assert.equal(img.attachment.kind, 'image');
  assert.match(img.attachment.path, new RegExp(`^${USER}/[0-9a-f-]{36}\\.png$`));
  assert.equal(w.seen.uploads[0], img.attachment.path);
  assert.equal(w.seen.records[0].user_id, USER);
  // 2回目にAIへ結果を渡している
  const second = w.seen.chat[1];
  assert.equal(second.messages.at(-1).role, 'tool');
  assert.deepEqual(second.messages.at(-2).tool_calls[0], {
    id: 'call_1',
    type: 'function',
    function: { name: 'generate_image', arguments: '{"prompt":"a cat surfing at sunset"}' },
  });
  assert.match(second.messages.at(-1).content, /^SUCCESS/);
  assert.equal(second.tools, undefined);
  assert.ok(lines.some((l) => l.type === 'delta' && l.text === 'ほらよ。'));
  assert.equal(lines.at(-1).type, 'done');
});

test('無料プランで今日2枚使い切っていたら作らない（LIMIT_REACHED をAIに伝える）', async () => {
  const restore = quiet();
  const w = world({ used: 2 });
  const { lines } = await w.send();
  restore();
  assert.equal(w.seen.image.length, 0);
  assert.ok(!lines.some((l) => l.type === 'image'));
  assert.match(
    w.seen.chat[1].messages.at(-1).content,
    /^LIMIT_REACHED.*free plan allows 2.*PLUS allows 30/,
  );
});

test('PLUS は 1日30枚まで（29枚なら作れる・30枚なら作らない）', async () => {
  const restore = quiet();
  const ok = world({ used: 29, plan: 'plus' });
  await ok.send();
  const over = world({ used: 30, plan: 'plus' });
  await over.send();
  restore();
  assert.equal(ok.seen.image.length, 1);
  assert.equal(over.seen.image.length, 0);
});

test('安全ルールで断られた → REFUSED をAIに伝える（画像は送らない）', async () => {
  const restore = quiet();
  const w = world({ imageStatus: 400, imageError: 'moderation_blocked' });
  const { lines } = await w.send();
  restore();
  assert.ok(!lines.some((l) => l.type === 'image'));
  assert.match(w.seen.chat[1].messages.at(-1).content, /^REFUSED/);
  assert.equal(w.seen.uploads.length, 0);
});

test('画像を頼んでいない普通の会話には、道具も reasoning_effort も付けない', async () => {
  const { looksLikeImageRequest } = await import('./handler.ts');
  assert.equal(looksLikeImageRequest('1+1は？'), false);
  assert.equal(looksLikeImageRequest('転職するべき？'), false);
  assert.equal(looksLikeImageRequest('猫のイラストを描いて'), true);
  assert.equal(looksLikeImageRequest('draw me a cat'), true);
});
