-- Adds an optional call-to-action button (link + label) to each video.
alter table public.videos add column if not exists link_url text;
alter table public.videos add column if not exists link_label text;
alter table public.videos drop constraint if exists videos_link_url_check;
alter table public.videos add constraint videos_link_url_check
  check (link_url is null or link_url ~* '^https?://');
