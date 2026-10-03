alter table public.push_subscriptions
  add column if not exists remind_days_before smallint not null default 0
  check (remind_days_before between 0 and 30);
