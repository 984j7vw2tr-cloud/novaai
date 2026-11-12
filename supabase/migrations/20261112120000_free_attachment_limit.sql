-- 無料プランの「写真・ファイルは1日3回まで」を数えるための記録（サーバーだけが書く）
-- 同じファイルを何度送っても（再生成など）1回と数えるため、ファイルの場所ごとに1行
create table public.attachment_uses (
  user_id uuid not null references auth.users (id) on delete cascade,
  path text not null check (char_length(path) <= 200),
  created_at timestamptz not null default now(),
  primary key (user_id, path)
);

create index attachment_uses_user_created_idx on public.attachment_uses (user_id, created_at desc);

alter table public.attachment_uses enable row level security;
-- ポリシーなし＋権限なし：利用者は読み書きできない（サーバー専用）
revoke all on public.attachment_uses from anon, authenticated;
