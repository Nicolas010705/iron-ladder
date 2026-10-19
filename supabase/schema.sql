-- Iron Ladder: Tabellen für Konto & Sync. Jede Zeile gehört genau einem Konto.
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.workouts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists public.food_days (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day text not null,
  entries jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.profiles  enable row level security;
alter table public.workouts  enable row level security;
alter table public.food_days enable row level security;

drop policy if exists "eigene Daten" on public.profiles;
drop policy if exists "eigene Daten" on public.workouts;
drop policy if exists "eigene Daten" on public.food_days;
create policy "eigene Daten" on public.profiles  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "eigene Daten" on public.workouts  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "eigene Daten" on public.food_days for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.profiles, public.workouts, public.food_days to authenticated;
