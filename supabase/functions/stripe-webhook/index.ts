// Supabase Edge Function「stripe-webhook」の入口（Stripe からの決済の知らせ）。中身は handler.ts。
import { createWebhookHandler } from './handler.ts';

Deno.serve(createWebhookHandler({ env: Deno.env }));
