-- HomeCleaner cloud storage. Run this migration in the Supabase SQL Editor.

create table if not exists public.appliances (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  category text not null,
  last_cleaned date not null,
  interval_days integer not null check (interval_days between 1 and 730),
  records jsonb not null default '[]'::jsonb check (jsonb_typeof(records) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appliances_user_id_idx
  on public.appliances(user_id);

alter table public.appliances enable row level security;

drop policy if exists "Users can read own appliances" on public.appliances;
create policy "Users can read own appliances"
  on public.appliances for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can add own appliances" on public.appliances;
create policy "Users can add own appliances"
  on public.appliances for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own appliances" on public.appliances;
create policy "Users can update own appliances"
  on public.appliances for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own appliances" on public.appliances;
create policy "Users can delete own appliances"
  on public.appliances for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.appliances to authenticated;

-- Reserved for the background Web Push stage.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  timezone text not null default 'Europe/Moscow',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can manage own push subscriptions" on public.push_subscriptions;
create policy "Users can manage own push subscriptions"
  on public.push_subscriptions for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.push_subscriptions to authenticated;
