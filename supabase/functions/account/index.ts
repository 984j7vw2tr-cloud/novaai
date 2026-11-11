// Supabase Edge Function「account」の入口（アカウント削除）。中身は handler.ts。
import { createAccountHandler } from './handler.ts';

Deno.serve(createAccountHandler({ env: Deno.env }));
