-- Stripe からの知らせ（Webhook）の受付記録（運営者の確認用。サーバーだけが書く・利用者は見られない）
create table public.billing_events (
  id bigint generated always as identity primary key,
  event_id text,
  type text,
  result text not null check (char_length(result) <= 200),
  created_at timestamptz not null default now()
);
create index billing_events_created_idx on public.billing_events (created_at desc);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;
