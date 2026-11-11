-- PHASE 12：決済（Stripe）
-- subscriptions に Stripe の「お客様ID」「サブスクリプションID」などを持たせる。
-- 書き込みは今までどおりサーバー（決済の知らせを受け取る関数）だけ。利用者は自分の行を見るだけ。

alter table public.subscriptions
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text unique,
  add column cancel_at_period_end boolean not null default false,
  add column updated_at timestamptz not null default now();

-- 状態の値を決まったものだけにする（Stripe の状態名と同じ）
alter table public.subscriptions
  add constraint subscriptions_status_check check (
    status in (
      'active', 'trialing', 'past_due', 'canceled', 'unpaid',
      'incomplete', 'incomplete_expired', 'paused'
    )
  );
