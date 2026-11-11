// Supabase Edge Function「billing」の入口（料金プランの手続き）。中身は handler.ts。
import { createBillingHandler } from './handler.ts';

Deno.serve(createBillingHandler({ env: Deno.env }));
