-- Bopz schema. Run this once in the Supabase SQL editor.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Videos
-- ---------------------------------------------------------------------------
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  title text,
  description text,
  storage_path text not null unique,
  likes_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists videos_created_at_idx on public.videos (created_at desc);

-- JPEG thumbnail stored in the videos bucket under thumbs/.
alter table public.videos add column if not exists thumb_path text;

-- Optional call-to-action button shown on the video.
alter table public.videos add column if not exists link_url text;
alter table public.videos add column if not exists link_label text;
alter table public.videos drop constraint if exists videos_link_url_check;
alter table public.videos add constraint videos_link_url_check
  check (link_url is null or link_url ~* '^https?://');

-- ---------------------------------------------------------------------------
-- Likes (hearts)
-- ---------------------------------------------------------------------------
create table if not exists public.likes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create index if not exists likes_video_id_idx on public.likes (video_id);

create or replace function public.sync_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.videos set likes_count = likes_count + 1 where id = new.video_id;
  elsif tg_op = 'DELETE' then
    update public.videos set likes_count = greatest(likes_count - 1, 0) where id = old.video_id;
  end if;
  return null;
end;
$$;

drop trigger if exists likes_count_trigger on public.likes;
create trigger likes_count_trigger
after insert or delete on public.likes
for each row execute function public.sync_likes_count();

-- ---------------------------------------------------------------------------
-- Web push subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Notification log (written by the server with the service role key)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  url text,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Link button clicks (written by the server with the service role key)
-- ---------------------------------------------------------------------------
create table if not exists public.link_clicks (
  id bigint generated always as identity primary key,
  video_id uuid references public.videos (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.link_clicks enable row level security;

drop policy if exists "link clicks admin read" on public.link_clicks;
create policy "link clicks admin read" on public.link_clicks
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Push device location (filled in by the server via ipinfo)
-- ---------------------------------------------------------------------------
alter table public.push_subscriptions add column if not exists ip text;
alter table public.push_subscriptions add column if not exists city text;
alter table public.push_subscriptions add column if not exists region text;
alter table public.push_subscriptions add column if not exists country text;

-- ---------------------------------------------------------------------------
-- Countries allowed to use the app. An empty table allows everyone.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.admins enable row level security;
alter table public.videos enable row level security;
alter table public.likes enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "admins read self" on public.admins;
create policy "admins read self" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- Only signed-in users (anonymous accounts included) can see videos.
drop policy if exists "videos read" on public.videos;
create policy "videos read" on public.videos
  for select to authenticated using (true);

drop policy if exists "videos admin insert" on public.videos;
create policy "videos admin insert" on public.videos
  for insert to authenticated with check (public.is_admin());

drop policy if exists "videos admin update" on public.videos;
create policy "videos admin update" on public.videos
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "videos admin delete" on public.videos;
create policy "videos admin delete" on public.videos
  for delete to authenticated using (public.is_admin());

drop policy if exists "likes read own" on public.likes;
create policy "likes read own" on public.likes
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "likes insert own" on public.likes;
create policy "likes insert own" on public.likes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "likes delete own" on public.likes;
create policy "likes delete own" on public.likes
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "push read own or admin" on public.push_subscriptions;
create policy "push read own or admin" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "push insert own" on public.push_subscriptions;
create policy "push insert own" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "push update own" on public.push_subscriptions;
create policy "push update own" on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "push delete own" on public.push_subscriptions;
create policy "push delete own" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "notifications admin read" on public.notifications;
create policy "notifications admin read" on public.notifications
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage: private "videos" bucket. Signed-in users read, admins write.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do nothing;

drop policy if exists "videos bucket read" on storage.objects;
create policy "videos bucket read" on storage.objects
  for select to authenticated using (bucket_id = 'videos');

drop policy if exists "videos bucket admin insert" on storage.objects;
create policy "videos bucket admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'videos' and public.is_admin());

drop policy if exists "videos bucket admin update" on storage.objects;
create policy "videos bucket admin update" on storage.objects
  for update to authenticated using (bucket_id = 'videos' and public.is_admin());

drop policy if exists "videos bucket admin delete" on storage.objects;
create policy "videos bucket admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'videos' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Admin settings: resetting the device counter only records a timestamp.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_settings (
  id int primary key default 1 check (id = 1),
  devices_reset_at timestamptz
);

insert into public.admin_settings (id) values (1) on conflict (id) do nothing;

alter table public.admin_settings enable row level security;

drop policy if exists "admin settings admin read" on public.admin_settings;
create policy "admin settings admin read" on public.admin_settings
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Landing page background: read by /api/landing with the service role.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Ads: ad videos are mixed into the feed every N regular videos.
-- ---------------------------------------------------------------------------
alter table public.videos add column if not exists is_ad boolean not null default false;

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
