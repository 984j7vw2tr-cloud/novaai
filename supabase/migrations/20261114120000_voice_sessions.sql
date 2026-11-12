-- 音声会話の記録（1日の通話時間の上限を数えるため・費用の把握のため。サーバーだけが書く）
create table public.voice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  model text not null check (char_length(model) <= 80),
  -- この通話で話してよい最大の秒数（始めた時点の残り時間）
  allowed_seconds integer not null check (allowed_seconds >= 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- 実際に話した秒数（終了時にアプリから届く。始めてからの経過時間と残り時間で上限をかける）
  seconds integer check (seconds >= 0)
);
create index voice_sessions_user_started_idx on public.voice_sessions (user_id, started_at desc);
alter table public.voice_sessions enable row level security;
revoke all on public.voice_sessions from anon, authenticated;
