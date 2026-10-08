-- Background videos for the install/landing page. Visitors there aren't signed in, so the
-- app reads this through /api/landing with the service role; only admins touch the table.
create table if not exists public.landing_settings (
  id int primary key default 1 check (id = 1),
  video_ids text[] not null default '{}',
  overlay_opacity real not null default 0.6 check (overlay_opacity between 0 and 1),
  updated_at timestamptz not null default now()
);

insert into public.landing_settings (id) values (1) on conflict (id) do nothing;

alter table public.landing_settings enable row level security;

drop policy if exists "landing settings admin read" on public.landing_settings;
create policy "landing settings admin read" on public.landing_settings
  for select to authenticated using (public.is_admin());

drop policy if exists "landing settings admin insert" on public.landing_settings;
create policy "landing settings admin insert" on public.landing_settings
  for insert to authenticated with check (public.is_admin());

drop policy if exists "landing settings admin update" on public.landing_settings;
create policy "landing settings admin update" on public.landing_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
