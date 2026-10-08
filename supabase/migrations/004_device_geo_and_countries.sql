-- IP and location of each push device (filled in by the server via ipinfo).
alter table public.push_subscriptions add column if not exists ip text;
alter table public.push_subscriptions add column if not exists city text;
alter table public.push_subscriptions add column if not exists region text;
alter table public.push_subscriptions add column if not exists country text;

-- Countries allowed to use the app. An empty table allows everyone.
create table if not exists public.allowed_countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now()
);

alter table public.allowed_countries enable row level security;

drop policy if exists "allowed countries public read" on public.allowed_countries;
create policy "allowed countries public read" on public.allowed_countries
  for select to anon, authenticated using (true);

drop policy if exists "allowed countries admin insert" on public.allowed_countries;
create policy "allowed countries admin insert" on public.allowed_countries
  for insert to authenticated with check (public.is_admin());

drop policy if exists "allowed countries admin delete" on public.allowed_countries;
create policy "allowed countries admin delete" on public.allowed_countries
  for delete to authenticated using (public.is_admin());
