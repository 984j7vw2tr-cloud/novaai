// Supabase Edge Function「voice」の入口（音声会話）。中身は handler.ts。
import { createVoiceHandler } from './handler.ts';

Deno.serve(createVoiceHandler({ env: Deno.env }));
