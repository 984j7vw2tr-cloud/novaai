// ウェブ検索（OpenAI Responses API）の自動テスト。本物の OpenAI は呼ばない。
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createHandler } from './handler.ts';
import { createOpenAIResponsesProvider, toInput } from './providers/openai-responses.ts';
import { ProviderError } from './providers/types.ts';

const quiet = () => {
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  return () => Object.assign(console, orig);
};

const sse = (events: unknown[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''));

const SEARCH_EVENTS = [
  { type: 'response.created' },
  { type: 'response.web_search_call.in_progress' },
  { type: 'response.web_search_call.searching' },
  { type: 'response.output_item.done', item: { type: 'web_search_call', status: 'completed' } },
  { type: 'response.web_search_call.in_progress' },
  { type: 'response.output_item.done', item: { type: 'web_search_call', status: 'completed' } },
  { type: 'response.output_text.delta', delta: '東京は晴れ、' },
  {
    type: 'response.output_text.annotation.added',
    annotation: { type: 'url_citation', url: 'https://weather.example/tokyo', title: '天気' },
  },
  { type: 'response.output_text.delta', delta: '最高17℃だ。' },
  {
    type: 'response.completed',
    response: {
      usage: { input_tokens: 900, output_tokens: 80, input_tokens_details: { cached_tokens: 500 } },
    },
  },
];

test('Responses API：検索・情報元・文章・使用量を共通の形にして返す', async () => {
  let body: any;
  const provider = createOpenAIResponsesProvider({
    apiKey: 'sk-test',
    fetchImpl: (async (url: string, init: RequestInit) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      body = JSON.parse(String(init.body));
      return sse(SEARCH_EVENTS);
    }) as typeof fetch,
  });
  const events = [];
  for await (const ev of provider.stream({
    model: 'm',
    messages: [{ role: 'user', content: '東京の天気' }],
    maxOutputTokens: 4000,
    signal: new AbortController().signal,
    webSearch: true,
    tools: [{ name: 'generate_image', description: 'd', parameters: { type: 'object' } }],
  })) {
    events.push(ev);
  }
  assert.equal(body.store, false);
  assert.equal(body.stream, true);
  assert.equal(body.max_output_tokens, 4000);
  assert.deepEqual(body.tools[0], { type: 'web_search' });
  assert.equal(body.tools[1].type, 'function');
  assert.equal(body.tools[1].name, 'generate_image');
  assert.equal(body.reasoning, undefined);
  assert.deepEqual(events, [
    { type: 'status', status: 'searching' }, // 検索開始は1度だけ
    { type: 'search_done' },
    { type: 'search_done' },
    { type: 'delta', text: '東京は晴れ、' },
    { type: 'source', url: 'https://weather.example/tokyo', title: '天気' },
    { type: 'delta', text: '最高17℃だ。' },
    { type: 'usage', inputTokens: 900, outputTokens: 80, cachedInputTokens: 500 },
  ]);
});

test('Responses API：道具の呼び出しを tool_call として返す', async () => {
  const provider = createOpenAIResponsesProvider({
    apiKey: 'sk-test',
    fetchImpl: (async () =>
      sse([
        {
          type: 'response.output_item.done',
          item: {
            type: 'function_call',
            call_id: 'call_9',
            name: 'generate_image',
            arguments: '{"prompt":"a cat"}',
          },
        },
        { type: 'response.completed', response: { usage: null } },
      ])) as unknown as typeof fetch,
  });
  const events = [];
  for await (const ev of provider.stream({
    model: 'm',
    messages: [{ role: 'user', content: '猫の画像' }],
    maxOutputTokens: 100,
    signal: new AbortController().signal,
  })) {
    events.push(ev);
  }
  assert.deepEqual(events, [
    {
      type: 'tool_call',
      call: { id: 'call_9', name: 'generate_image', arguments: '{"prompt":"a cat"}' },
    },
  ]);
});

test('Responses API：エラーは ProviderError（HTTPエラー・途中の失敗）', async () => {
  const failing = createOpenAIResponsesProvider({
    apiKey: 'sk-test',
    fetchImpl: (async () =>
      Response.json(
        { error: { code: 'rate_limit_exceeded', message: 'slow down' } },
        { status: 429 },
      )) as unknown as typeof fetch,
  });
  await assert.rejects(
    async () => {
      for await (const _ of failing.stream({
        model: 'm',
        messages: [{ role: 'user', content: 'x' }],
        maxOutputTokens: 10,
        signal: new AbortController().signal,
      }));
    },
    (e) => e instanceof ProviderError && e.status === 429 && e.code === 'rate_limit_exceeded',
  );
  const midway = createOpenAIResponsesProvider({
    apiKey: 'sk-test',
    fetchImpl: (async () =>
      sse([
        { type: 'response.output_text.delta', delta: 'a' },
        { type: 'response.failed', response: { error: { code: 'server_error', message: 'x' } } },
      ])) as unknown as typeof fetch,
  });
  await assert.rejects(async () => {
    for await (const _ of midway.stream({
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
      maxOutputTokens: 10,
      signal: new AbortController().signal,
    }));
  }, ProviderError);
});

test('Responses API：会話の形の変換（写真・ファイル・道具の結果）', () => {
  const input = toInput([
    { role: 'system', content: 'sys' },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'これ見て' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
        { type: 'file', file: { filename: 'a.pdf', file_data: 'data:application/pdf;base64,BBB' } },
      ],
    },
    { role: 'assistant', content: 'ふむ' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'c1', name: 'generate_image', arguments: '{}' }],
    },
    { role: 'tool', tool_call_id: 'c1', content: 'SUCCESS' },
  ]);
  assert.deepEqual(input, [
    { role: 'system', content: 'sys' },
    {
      role: 'user',
      content: [
        { type: 'input_text', text: 'これ見て' },
        { type: 'input_image', image_url: 'data:image/png;base64,AAA' },
        { type: 'input_file', filename: 'a.pdf', file_data: 'data:application/pdf;base64,BBB' },
      ],
    },
    { role: 'assistant', content: 'ふむ' },
    { type: 'function_call', call_id: 'c1', name: 'generate_image', arguments: '{}' },
    { type: 'function_call_output', call_id: 'c1', output: 'SUCCESS' },
  ]);
});

function world(env: Record<string, string> = {}) {
  const seen: any[] = [];
  const vars: Record<string, string> = {
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL: 'test-model',
    MODERATION: 'off',
    REQUIRE_AUTH: 'false',
    SUPABASE_URL: 'https://proj.supabase.co',
    ...env,
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/responses')) {
      seen.push(JSON.parse(String(init?.body)));
      return sse(SEARCH_EVENTS);
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const handle = createHandler({ env: { get: (k) => vars[k] }, fetchImpl });
  const send = async () => {
    const res = await handle(
      new Request('http://localhost/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: '今日の東京の天気は？' }] }),
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

test('チャット：標準は Responses API。検索と画像の道具を渡し、検索中をアプリに知らせる', async () => {
  const restore = quiet();
  const w = world();
  const { res, lines } = await w.send();
  restore();
  assert.equal(res.status, 200);
  const req = w.seen[0];
  assert.deepEqual(req.tools[0], { type: 'web_search' });
  assert.equal(req.tools[1].name, 'generate_image');
  // 深く考えるのは切らない
  assert.equal(req.reasoning, undefined);
  assert.match(req.input[0].content, /# Web search/);
  assert.match(req.input[0].content, /Today's date is \d{4}-\d{2}-\d{2}/);
  assert.deepEqual(lines[0], { type: 'status', status: 'searching' });
  assert.equal(
    lines
      .filter((l) => l.type === 'delta')
      .map((l) => l.text)
      .join(''),
    '東京は晴れ、最高17℃だ。',
  );
  assert.deepEqual(lines[lines.length - 1], { type: 'done' });
  // 情報元・検索完了はアプリには送らない（本文の中にリンクがある）
  assert.ok(!lines.some((l) => l.type === 'source' || l.type === 'search_done'));
});

test('チャット：WEB_SEARCH=off なら検索を渡さない', async () => {
  const restore = quiet();
  const w = world({ WEB_SEARCH: 'off' });
  await w.send();
  restore();
  assert.ok(!w.seen[0].tools.some((t: any) => t.type === 'web_search'));
  assert.doesNotMatch(w.seen[0].input[0].content, /# Web search/);
});

test('チャット：自傷の可能性があるときは検索しない', async () => {
  const restore = quiet();
  const vars: Record<string, string> = {
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL: 'test-model',
    REQUIRE_AUTH: 'false',
    SUPABASE_URL: 'https://proj.supabase.co',
  };
  const seen: any[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/moderations')) {
      return Response.json({
        results: [{ flagged: true, categories: { 'self-harm': true }, category_scores: {} }],
      });
    }
    if (url.endsWith('/responses')) {
      seen.push(JSON.parse(String(init?.body)));
      return sse(SEARCH_EVENTS);
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const handle = createHandler({ env: { get: (k) => vars[k] }, fetchImpl });
  await (
    await handle(
      new Request('http://localhost/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'もう死にたい' }] }),
      }),
    )
  ).text();
  restore();
  assert.ok(!(seen[0].tools ?? []).some((t: any) => t.type === 'web_search'));
});
