-- Ad videos live in the same table/bucket; they're mixed into the feed every N regular videos.
alter table public.videos add column if not exists is_ad boolean not null default false;

-- Single-row settings shared by every ad video.
create table if not exists public.ad_settings (
  id int primary key default 1 check (id = 1),
  link_url text,
  link_label text,
  every_n int not null default 5 check (every_n between 1 and 1000),
  updated_at timestamptz not null default now()
);

insert into public.ad_settings (id) values (1) on conflict (id) do nothing;

alter table public.ad_settings enable row level security;

drop policy if exists "ad settings public read" on public.ad_settings;
create policy "ad settings public read" on public.ad_settings
  for select to anon, authenticated using (true);

drop policy if exists "ad settings admin insert" on public.ad_settings;
create policy "ad settings admin insert" on public.ad_settings
  for insert to authenticated with check (public.is_admin());

drop policy if exists "ad settings admin update" on public.ad_settings;
create policy "ad settings admin update" on public.ad_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
