// 声で入力（transcribe関数）の自動テスト。本物のOpenAIは呼ばない。
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTranscribeHandler, MAX_AUDIO_BYTES } from './handler.ts';

const quiet = () => {
  const orig = { log: console.log, error: console.error };
  console.log = () => {};
  console.error = () => {};
  return () => Object.assign(console, orig);
};

function setup(openai: (form: FormData) => Response, vars: Record<string, string> = {}) {
  const calls: FormData[] = [];
  const all: Record<string, string> = {
    OPENAI_API_KEY: 'sk-test',
    SUPABASE_URL: 'https://proj.supabase.co',
    ...vars,
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) {
      const auth = new Headers(init?.headers).get('authorization');
      return auth === 'Bearer good'
        ? Response.json({ id: 'u1' })
        : new Response('', { status: 401 });
    }
    if (url.endsWith('/audio/transcriptions')) {
      calls.push(init?.body as FormData);
      return openai(init?.body as FormData);
    }
    return new Response('', { status: 500 });
  }) as typeof fetch;
  const handle = createTranscribeHandler({ env: { get: (k) => all[k] }, fetchImpl });
  const send = (body: BodyInit, type = 'audio/webm', token = 'good') =>
    handle(
      new Request('http://localhost/transcribe', {
        method: 'POST',
        headers: { 'content-type': type, authorization: `Bearer ${token}`, apikey: 'pk' },
        body,
      }),
    );
  return { send, calls };
}

test('音声を文字にして返す（モデル・ファイル名を付けて OpenAI に送る）', async () => {
  const restore = quiet();
  const { send, calls } = setup(() => Response.json({ text: ' こんにちは ' }));
  const res = await send(new Uint8Array([1, 2, 3]));
  const body = await res.json();
  restore();
  assert.equal(res.status, 200);
  assert.deepEqual(body, { text: 'こんにちは' });
  assert.equal(calls[0].get('model'), 'gpt-4o-mini-transcribe');
  assert.equal((calls[0].get('file') as File).name, 'voice.webm');
});

test('ログインしていない → 401。OpenAI は呼ばない', async () => {
  const { send, calls } = setup(() => Response.json({ text: 'x' }));
  const res = await send(new Uint8Array([1]), 'audio/webm', 'bad');
  assert.equal(res.status, 401);
  assert.equal(calls.length, 0);
});

test('音声でない・空・大きすぎる → 400/413', async () => {
  const { send, calls } = setup(() => Response.json({ text: 'x' }));
  assert.equal((await send(new Uint8Array([1]), 'image/png')).status, 400);
  assert.equal((await send(new Uint8Array([]))).status, 400);
  assert.equal((await send(new Uint8Array(MAX_AUDIO_BYTES + 1))).status, 413);
  assert.equal(calls.length, 0);
});

test('1分に送りすぎると 429', async () => {
  const { send } = setup(() => Response.json({ text: 'x' }), { TRANSCRIBE_LIMIT_PER_MINUTE: '2' });
  assert.equal((await send(new Uint8Array([1]))).status, 200);
  assert.equal((await send(new Uint8Array([1]))).status, 200);
  assert.equal((await send(new Uint8Array([1]))).status, 429);
});

test('OpenAI のエラー本文はアプリに返さない', async () => {
  const restore = quiet();
  const { send } = setup(() =>
    Response.json({ error: { message: 'secret detail' } }, { status: 400 }),
  );
  const res = await send(new Uint8Array([1]));
  const text = await res.text();
  restore();
  assert.equal(res.status, 502);
  assert.ok(!text.includes('secret detail'));
});
