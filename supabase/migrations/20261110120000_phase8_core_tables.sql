-- PHASE 8：ユーザー情報・会話・メッセージ・料金プラン・使用量の表
--
-- 安全のルール（RLS）：
-- - どの表も「自分の行しか見られない」。他人の会話は見えない・書けない。
-- - 料金プラン（subscriptions）と使用量（usage_events）は、利用者は見るだけ。
--   書き込みはサーバー（service role）だけが行う（利用者が数字をごまかせないように）。
--
-- auth.uid() は (select auth.uid()) と書く：行ごとに計算せず1回で済むので速い（Supabase推奨）。

-- ============================================================
-- profiles：プロフィール（ログインのアカウント1つにつき1行）
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text check (char_length(display_name) <= 50),
  preferred_language text check (char_length(preferred_language) <= 16),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- 新しく登録した人のプロフィールを自動で作る
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    left(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 50)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- すでに登録済みの人の分も作っておく
insert into public.profiles (id, email, display_name)
select id, email, left(nullif(trim(raw_user_meta_data ->> 'display_name'), ''), 50)
from auth.users
on conflict (id) do nothing;

-- ============================================================
-- conversations：会話（チャット1つ分）
-- ============================================================
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text check (char_length(title) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_updated_idx on public.conversations (user_id, updated_at desc);

alter table public.conversations enable row level security;

create policy "conversations: read own" on public.conversations
  for select to authenticated using (user_id = (select auth.uid()));
create policy "conversations: insert own" on public.conversations
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "conversations: update own" on public.conversations
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "conversations: delete own" on public.conversations
  for delete to authenticated using (user_id = (select auth.uid()));

-- ============================================================
-- messages：会話の中の1つ1つの発言
-- ============================================================
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  -- 持ち主（RLSで素早く判定するため、会話の持ち主と同じIDを入れる）
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 100000),
  language text check (char_length(language) <= 16),
  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

create policy "messages: read own" on public.messages
  for select to authenticated using (user_id = (select auth.uid()));
-- 自分の会話にだけ書き込める（他人の会話IDを指定しても入らない）
create policy "messages: insert own" on public.messages
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );
create policy "messages: delete own" on public.messages
  for delete to authenticated using (user_id = (select auth.uid()));

-- メッセージが増えたら、会話の「最終更新」を新しくする（履歴の並び順に使う）
create function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- ============================================================
-- subscriptions：料金プラン（PHASE 12で決済とつなぐ。書き込みはサーバーのみ）
-- ============================================================
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'plus', 'pro')),
  status text not null default 'active',
  current_period_end timestamptz
);

alter table public.subscriptions enable row level security;

create policy "subscriptions: read own" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

-- ============================================================
-- usage_events：AIの使用量（トークン数）。書き込みはサーバーのみ
-- ============================================================
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  -- 途中で止めた回答（トークン数がわからないことがある）
  aborted boolean not null default false,
  created_at timestamptz not null default now()
);

create index usage_events_user_created_idx on public.usage_events (user_id, created_at desc);

alter table public.usage_events enable row level security;

create policy "usage_events: read own" on public.usage_events
  for select to authenticated using (user_id = (select auth.uid()));

-- ============================================================
-- 権限：ログインしていない人（anon）は、どの表にも触れない
-- ============================================================
revoke all on public.profiles, public.conversations, public.messages,
  public.subscriptions, public.usage_events from anon;
-- 利用者が書き換えてはいけない表は、読み取りだけ許す
revoke insert, update, delete on public.subscriptions, public.usage_events from authenticated;
-- プロフィールのIDやメールは書き換えさせない（表示名と言語だけ）
revoke update on public.profiles from authenticated;
grant update (display_name, preferred_language) on public.profiles to authenticated;
-- 会話は題名だけ書き換えられる（持ち主は変えられない）
revoke update on public.conversations from authenticated;
grant update (title) on public.conversations to authenticated;
