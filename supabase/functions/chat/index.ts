// Supabase Edge Function「chat」の入口。
// 中身は handler.ts にある（テストしやすいように分けている）。
import { createHandler } from './handler.ts';

// 返事を返したあとも、記憶の保存などを裏で続けられるようにする
const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } })
  .EdgeRuntime;
const handle = createHandler({
  env: Deno.env,
  waitUntil: runtime ? (p) => runtime.waitUntil(p) : undefined,
});

Deno.serve(handle);
