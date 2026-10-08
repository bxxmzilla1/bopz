-- JPEG thumbnail stored in the videos bucket under thumbs/.
alter table public.videos add column if not exists thumb_path text;
