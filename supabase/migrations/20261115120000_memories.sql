-- NAYQOの記憶と宿題
-- memories：NAYQOが覚えたこと（その人のこと・目標・宿題）
--   kind = 'fact'（その人のこと）／'goal'（目標）／'task'（宿題：やると言ったこと）
--   宿題には期限（due_at）と状態（status）がある
-- 書き込むのはサーバーだけ。本人は「見る」「消す」だけできる（設定の「NAYQOの記憶」画面）
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('fact', 'goal', 'task')),
  content text not null check (char_length(content) between 1 and 300),
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'done', 'failed', 'dropped')),
  -- 最後に「宿題どうなった？」と聞いた時刻（同じ日に何度も聞かないため）
  reminded_at timestamptz,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memories_user_idx on public.memories (user_id, kind, status, created_at desc);
alter table public.memories enable row level security;
revoke all on public.memories from anon, authenticated;
grant select, delete on public.memories to authenticated;
create policy "memories: read own" on public.memories
  for select to authenticated using (user_id = (select auth.uid()));
create policy "memories: delete own" on public.memories
  for delete to authenticated using (user_id = (select auth.uid()));

-- 記憶のオン・オフ（設定）。オフなら覚えない・使わない
alter table public.profiles add column memory_enabled boolean not null default true;
grant update (memory_enabled) on public.profiles to authenticated;
