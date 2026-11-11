// Supabase Edge Function「chat」の入口。
// 中身は handler.ts にある（テストしやすいように分けている）。
import { createHandler } from './handler.ts';

const handle = createHandler({ env: Deno.env });

Deno.serve(handle);
