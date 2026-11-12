-- 画像生成の記録（1日の上限を数えるため・費用の把握のため。サーバーだけが書く）
create table public.image_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  path text not null check (char_length(path) <= 200),
  model text not null check (char_length(model) <= 80),
  quality text check (char_length(quality) <= 20),
  size text check (char_length(size) <= 20),
  created_at timestamptz not null default now()
);
create index image_generations_user_created_idx on public.image_generations (user_id, created_at desc);
alter table public.image_generations enable row level security;
revoke all on public.image_generations from anon, authenticated;
