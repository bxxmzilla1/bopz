-- Records every tap on a video's link button. Inserted by the server (service role).
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
