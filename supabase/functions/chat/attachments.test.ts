// 写真・ファイルの添付（＋ボタン）の自動テスト。本物のOpenAI・Storageは呼ばない。
// 実行：npm run test:server
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseAttachments, toBase64 } from './attachments.ts';
import { createHandler, toProviderMessages, validateMessages } from './handler.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const FILE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const img = (owner = USER, ext = 'jpg') => ({
  kind: 'image',
  path: `${owner}/${FILE_ID}.${ext}`,
  name: `photo.${ext}`,
  mime: 'image/jpeg',
});

const quiet = () => {
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  return () => Object.assign(console, orig);
};

function setup(files: Record<string, Uint8Array> = {}, uses: string[] | null = null) {
  const seen = {
    openai: [] as any[],
    storage: [] as string[],
    moderation: [] as any[],
    recorded: [] as any[],
  };
  const env = {
    get: (k: string) =>
      (
        ({
          OPENAI_API_KEY: 'sk-test',
          OPENAI_MODEL: 'test-model',
          SUPABASE_URL: 'https://proj.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'service-key',
          MODERATION: 'on',
        }) as Record<string, string>
      )[k],
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: USER });
    if (uses && url.includes('/rest/v1/subscriptions')) return Response.json([]);
    if (uses && url.includes('/rest/v1/usage_events')) {
      return new Response('[]', { headers: { 'content-range': '*/0' } });
    }
    if (uses && url.includes('/rest/v1/attachment_uses')) {
      if (init?.method === 'POST') {
        seen.recorded.push(...JSON.parse(String(init.body)));
        return new Response(null, { status: 201 });
      }
      return Response.json(uses.map((path) => ({ path })));
    }
    if (url.includes('/storage/v1/object/attachments/')) {
      const path = url.split('/storage/v1/object/attachments/')[1];
      seen.storage.push(path);
      const body = files[path];
      return body ? new Response(body) : new Response('not found', { status: 404 });
    }
    if (url.endsWith('/moderations')) {
      seen.moderation.push(JSON.parse(String(init?.body)));
      return Response.json({ results: [{ flagged: false, categories: {} }] });
    }
    if (url.endsWith('/chat/completions')) {
      seen.openai.push(JSON.parse(String(init?.body)));
      const enc = new TextEncoder();
      return new Response(
        enc.encode(
          `data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })}\n\ndata: [DONE]\n\n`,
        ),
      );
    }
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
  const handle = createHandler({ env, fetchImpl });
  const send = (messages: unknown) =>
    handle(
      new Request('http://localhost/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: 'Bearer t', apikey: 'pk' },
        body: JSON.stringify({ messages }),
      }),
    );
  return { send, seen };
}

test('添付の形チェック：おかしな場所・種類・数は受け付けない', () => {
  assert.deepEqual(parseAttachments(undefined), []);
  assert.equal(parseAttachments([img()])?.length, 1);
  assert.equal(parseAttachments([{ ...img(), path: '../etc/passwd' }]), null);
  assert.equal(parseAttachments([{ ...img(), path: `${USER}/x.exe` }]), null);
  assert.equal(parseAttachments([{ ...img(), mime: 'application/pdf' }]), null); // 写真なのにPDF
  assert.equal(parseAttachments([{ ...img(), kind: 'video' }]), null);
  assert.equal(parseAttachments([img(), img(), img(), img(), img()]), null); // 5つ以上
});

test('写真だけの発言（文章なし）はOK。何もない発言はNG。AIの発言に付けられるのは画像だけ', () => {
  assert.equal(
    validateMessages({ messages: [{ role: 'user', content: '', attachments: [img()] }] }).ok,
    true,
  );
  assert.equal(
    validateMessages({ messages: [{ role: 'user', content: ' ', attachments: [] }] }).ok,
    false,
  );
  assert.equal(
    validateMessages({
      messages: [
        { role: 'assistant', content: 'a', attachments: [img()] },
        { role: 'user', content: 'b' },
      ],
    }).ok,
    true,
  );
  assert.equal(
    validateMessages({
      messages: [
        {
          role: 'assistant',
          content: 'a',
          attachments: [
            {
              kind: 'file',
              path: `${USER}/${FILE_ID}.pdf`,
              name: 'a.pdf',
              mime: 'application/pdf',
            },
          ],
        },
        { role: 'user', content: 'b' },
      ],
    }).ok,
    false,
  );
});

test('写真はAIに画像として渡し、安全チェックにも写真を含める', async () => {
  const restore = quiet();
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const { send, seen } = setup({ [`${USER}/${FILE_ID}.jpg`]: bytes });
  const res = await send([{ role: 'user', content: 'これ何？', attachments: [img()] }]);
  await res.text();
  restore();
  assert.equal(res.status, 200);
  const last = seen.openai[0].messages.at(-1);
  assert.deepEqual(last.content[0], { type: 'text', text: 'これ何？' });
  assert.deepEqual(last.content[1], {
    type: 'image_url',
    image_url: { url: `data:image/jpeg;base64,${toBase64(bytes)}` },
  });
  assert.equal(seen.moderation[0].input[1].type, 'image_url');
});

test('他人のフォルダのファイルは 400。Storage にもAIにも触らない', async () => {
  const restore = quiet();
  const { send, seen } = setup();
  const res = await send([{ role: 'user', content: 'x', attachments: [img(OTHER)] }]);
  restore();
  assert.equal(res.status, 400);
  assert.equal(seen.storage.length, 0);
  assert.equal(seen.openai.length, 0);
});

test('ファイルが見つからない → 400（attachment_unavailable）。AIは呼ばない', async () => {
  const restore = quiet();
  const { send, seen } = setup();
  const res = await send([{ role: 'user', content: 'x', attachments: [img()] }]);
  const body = await res.json();
  restore();
  assert.equal(res.status, 400);
  assert.equal(body.reason, 'attachment_unavailable');
  assert.equal(seen.openai.length, 0);
});

test('PDF はファイルとして、テキストは本文として渡す。古い発言の添付は名前だけ', async () => {
  const pdf = {
    kind: 'file',
    path: `${USER}/${FILE_ID}.pdf`,
    name: 'doc.pdf',
    mime: 'application/pdf',
  } as const;
  const txt = {
    kind: 'file',
    path: `${USER}/${FILE_ID}.txt`,
    name: 'memo.txt',
    mime: 'text/plain',
  } as const;
  const old = { ...img(), name: 'old.jpg' } as const;
  const files: Record<string, Uint8Array> = {
    [pdf.path]: new Uint8Array([37, 80, 68, 70]),
    [txt.path]: new TextEncoder().encode('メモの中身'),
  };
  const downloaded: string[] = [];
  const out = await toProviderMessages(
    [
      { role: 'user', content: '古い写真', attachments: [old as any] },
      { role: 'assistant', content: 'ok', attachments: [] },
      { role: 'user', content: 'PDF', attachments: [pdf as any] },
      { role: 'assistant', content: 'ok', attachments: [] },
      { role: 'user', content: '', attachments: [txt as any] },
    ],
    async (p) => {
      downloaded.push(p);
      return files[p];
    },
  );
  assert.deepEqual(downloaded.sort(), [pdf.path, txt.path].sort()); // 古い写真は取り出さない
  assert.match(out[0].content as string, /old\.jpg/);
  const pdfPart = (out[2].content as any[])[1];
  assert.equal(pdfPart.type, 'file');
  assert.equal(pdfPart.file.filename, 'doc.pdf');
  assert.match(pdfPart.file.file_data, /^data:application\/pdf;base64,/);
  const txtPart = (out[4].content as any[])[0];
  assert.equal(txtPart.type, 'text');
  assert.match(txtPart.text, /memo\.txt[\s\S]*メモの中身/);
});

const ID2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const imgAt = (id: string) => ({ ...img(), path: `${USER}/${id}.jpg` });

test('無料プラン：写真・ファイルは1日3つまで。超えたら 429 attachment_limit（AIは呼ばない）', async () => {
  const restore = quiet();
  const bytes = new Uint8Array([1]);
  const files = {
    [imgAt(FILE_ID).path]: bytes,
    [imgAt(ID2).path]: bytes,
    [imgAt(ID3).path]: bytes,
  };
  // すでに2つ使っている → 新しく2つ付けると4つ目でオーバー
  const over = setup(files, ['x/1.jpg', 'x/2.jpg']);
  const res = await over.send([
    { role: 'user', content: 'x', attachments: [imgAt(ID2), imgAt(ID3)] },
  ]);
  const body = await res.json();
  assert.equal(res.status, 429);
  assert.equal(body.code, 'attachment_limit');
  assert.equal(body.limit, 3);
  assert.equal(over.seen.openai.length, 0);
  // 2つ使用済み＋1つ → ちょうど3つでOK。新しく使った分を記録する
  const ok = setup(files, ['x/1.jpg', 'x/2.jpg']);
  const r2 = await ok.send([{ role: 'user', content: 'x', attachments: [imgAt(ID2)] }]);
  await r2.text();
  assert.equal(r2.status, 200);
  assert.deepEqual(ok.seen.recorded, [{ user_id: USER, path: imgAt(ID2).path }]);
  // 同じファイルをもう一度送る（再生成など）は数えない
  const again = setup(files, ['x/1.jpg', 'x/2.jpg', imgAt(ID2).path]);
  const r3 = await again.send([{ role: 'user', content: 'x', attachments: [imgAt(ID2)] }]);
  await r3.text();
  restore();
  assert.equal(r3.status, 200);
  assert.equal(again.seen.recorded.length, 0);
});
