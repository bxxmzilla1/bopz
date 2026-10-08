-- Resetting the "Push devices" counter only records a timestamp; devices are kept so they
-- still receive notifications. The counter shows devices that opened the app since then.
create table if not exists public.admin_settings (
  id int primary key default 1 check (id = 1),
  devices_reset_at timestamptz
);

insert into public.admin_settings (id) values (1) on conflict (id) do nothing;

alter table public.admin_settings enable row level security;

drop policy if exists "admin settings admin read" on public.admin_settings;
create policy "admin settings admin read" on public.admin_settings
  for select to authenticated using (public.is_admin());
