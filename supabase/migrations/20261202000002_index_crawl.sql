-- Curated course-index crawl: the official pages that list an institution's courses, and a review step
-- for courses the model only suggested.

create table public.institution_indexes (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  url text not null check (url ~ '^https?://'),
  kind text not null default 'programs',
  -- Off until a person has checked that the URL is the institution's own course list.
  active boolean not null default false,
  content_hash text,
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (institution_id, url)
);
create index institution_indexes_due_idx on public.institution_indexes (last_checked_at nulls first) where active;

alter table public.institution_indexes enable row level security;
revoke insert, update, delete on public.institution_indexes from anon, authenticated;
revoke select on public.institution_indexes from anon;
create policy "admins read" on public.institution_indexes for select to authenticated using (public.is_admin());
grant select, insert, update on public.institution_indexes to ingest_worker;
create policy "worker" on public.institution_indexes for all to ingest_worker using (true) with check (true);

-- Courses the model suggested: hidden until an admin decides.
alter table public.programs
  add column suggestion_status text check (suggestion_status in ('pending', 'approved', 'rejected'));
create index programs_pending_suggestions_idx on public.programs (created_at) where suggestion_status = 'pending';
create policy "admins read all programs" on public.programs for select to authenticated using (public.is_admin());

create function public.review_suggested_course(p_program uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  update public.programs
  set suggestion_status = case when p_approve then 'approved' else 'rejected' end,
      published = p_approve,
      updated_at = now()
  where id = p_program and suggestion_status = 'pending';
  if not found then
    raise exception 'not a pending suggestion' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.review_suggested_course(uuid, boolean) from public, anon;
grant execute on function public.review_suggested_course(uuid, boolean) to authenticated;
