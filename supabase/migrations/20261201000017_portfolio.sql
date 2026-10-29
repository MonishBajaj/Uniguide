-- 6.4 Portfolio builder: a private Storage bucket with one folder per student, and an ordered list
-- of items (uploaded files or links). Counselors the student shares with can view it; parents cannot.
-- Files are PNG, JPEG or PDF up to 10 MB. Sharing outside the app is a 7-day signed link.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolios', 'portfolios', false, 10485760, array['image/png', 'image/jpeg', 'application/pdf'])
on conflict (id) do nothing;

-- The owner is the first folder of the object's path; anything else owns nothing.
create function public.portfolio_owner(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end;
$$;

create policy "portfolio read" on storage.objects for select to authenticated using (
  bucket_id = 'portfolios'
  and (public.portfolio_owner(name) = (select auth.uid()) or public.counselor_can_see(public.portfolio_owner(name)))
);
create policy "portfolio upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'portfolios' and public.portfolio_owner(name) = (select auth.uid()) and public.can_process_personal_data((select auth.uid()))
);
create policy "portfolio delete" on storage.objects for delete to authenticated using (
  bucket_id = 'portfolios' and public.portfolio_owner(name) = (select auth.uid())
);

create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  description text check (length(description) <= 1000),
  kind text not null check (kind in ('file', 'link')),
  path text unique,                      -- portfolios/<user_id>/... for files
  mime text check (mime in ('image/png', 'image/jpeg', 'application/pdf')),
  url text check (url ~ '^https://'),    -- for links
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  check ((kind = 'file') = (path is not null and mime is not null)),
  check ((kind = 'link') = (url is not null)),
  check (path is null or public.portfolio_owner(path) = user_id)
);
create index portfolio_items_user_idx on public.portfolio_items (user_id, sort, created_at);

alter table public.portfolio_items enable row level security;
revoke all on public.portfolio_items from anon;
create policy "own rows" on public.portfolio_items for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id));
create policy "counselors read shared" on public.portfolio_items for select to authenticated using (public.counselor_can_see(user_id));

revoke all on function public.portfolio_owner from public, anon;
grant execute on function public.portfolio_owner to authenticated;
