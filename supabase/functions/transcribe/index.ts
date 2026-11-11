// Supabase Edge Function「transcribe」の入口（声で入力）。中身は handler.ts。
import { createTranscribeHandler } from './handler.ts';

Deno.serve(createTranscribeHandler({ env: Deno.env }));
