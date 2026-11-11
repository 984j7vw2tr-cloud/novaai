-- PHASE 9：利用制限と料金の把握

-- OpenAIの「キャッシュ割引」が効いた入力トークン数（料金計算を正確にするため）
alter table public.usage_events
  add column cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0);

-- ============================================================
-- model_prices：モデルごとの料金（100万トークンあたりの米ドル）
-- 値は運営者が OpenAI の公式料金表を見て入れる。利用者からは見えない。
-- ============================================================
create table public.model_prices (
  model text primary key,
  input_usd_per_mtok numeric(12, 6) not null check (input_usd_per_mtok >= 0),
  cached_input_usd_per_mtok numeric(12, 6) not null default 0 check (cached_input_usd_per_mtok >= 0),
  output_usd_per_mtok numeric(12, 6) not null check (output_usd_per_mtok >= 0),
  updated_at timestamptz not null default now()
);

alter table public.model_prices enable row level security;
-- ポリシーなし＋権限なし：利用者（anon / authenticated）は読めない
revoke all on public.model_prices from anon, authenticated;

-- ============================================================
-- usage_daily_costs：日ごとの使用量と推定料金（運営者用。利用者からは見えない）
-- 料金が未登録のモデルは cost_usd が空（null）になる
-- ============================================================
create view public.usage_daily_costs
with (security_invoker = true) as
select
  date_trunc('day', u.created_at)::date as day,
  u.model,
  count(*) as requests,
  count(distinct u.user_id) as users,
  sum(u.input_tokens) as input_tokens,
  sum(u.cached_input_tokens) as cached_input_tokens,
  sum(u.output_tokens) as output_tokens,
  round(
    sum(
      (u.input_tokens - u.cached_input_tokens) * p.input_usd_per_mtok
      + u.cached_input_tokens * p.cached_input_usd_per_mtok
      + u.output_tokens * p.output_usd_per_mtok
    ) / 1000000.0,
    4
  ) as cost_usd
from public.usage_events u
left join public.model_prices p on p.model = u.model
group by 1, 2;

revoke all on public.usage_daily_costs from anon, authenticated;

-- 利用制限のチェック（直近24時間の回数）を速くするための索引は、
-- PHASE 8 の usage_events_user_created_idx (user_id, created_at desc) を使う
