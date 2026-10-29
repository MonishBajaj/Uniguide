-- 17.3 Podcast and video, 17.4 Webinars: one list of media the team publishes. Admins add and
-- publish items; everyone reads published ones. Nothing is seeded: the page is empty until the team
-- adds real items.
create table public.media_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('video', 'podcast', 'webinar')),
  title text not null check (length(btrim(title)) between 3 and 140),
  description text check (length(description) <= 1000),
  url text check (url ~ '^https://'),                 -- the recording, or the event page
  starts_at timestamptz,                               -- webinars only
  registration_url text check (registration_url ~ '^https://'),
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  check (kind <> 'webinar' or starts_at is not null),
  check (kind = 'webinar' or url is not null),
  check (kind = 'webinar' or (starts_at is null and registration_url is null))
);
create index media_items_feed_idx on public.media_items (published, kind, coalesce(starts_at, published_at) desc);

-- Stamp the first publication.
create function public.stamp_media_published() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.published and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;
create trigger media_items_published before insert or update on public.media_items
  for each row execute function public.stamp_media_published();

alter table public.media_items enable row level security;
revoke all on public.media_items from anon;
grant select on public.media_items to anon;
create policy "published" on public.media_items for select to anon, authenticated using (published or (select public.is_admin()));
create policy "admins manage" on public.media_items for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
