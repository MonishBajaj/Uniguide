-- On-demand enrichment: a student asks for universities, the worker fetches the facts of ~10
-- courses from official pages while the app shows progress. Students start jobs only through
-- start_enrichment(); only the ingest worker moves them along.

create type public.enrichment_status as enum ('queued', 'running', 'done', 'failed');

create table public.enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.enrichment_status not null default 'queued',
  stage text not null default 'optimizing_profile'
    check (stage in ('optimizing_profile', 'selecting_universities', 'fetching_details', 'done')),
  -- Target countries, levels and fields only: the worker role cannot read profiles.
  profile_snapshot jsonb not null default '{}',
  -- True only when the student switched on AI features; without it nothing goes to Gemini.
  allow_fallback boolean not null default false,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz
);
create index enrichment_jobs_user_idx on public.enrichment_jobs (user_id, created_at desc);
create index enrichment_jobs_active_idx on public.enrichment_jobs (status, heartbeat_at)
  where status in ('queued', 'running');

create table public.enrichment_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.enrichment_jobs (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'waiting', 'running', 'extracted', 'skipped_fresh', 'failed')),
  detail text,
  started_at timestamptz,
  finished_at timestamptz,
  unique (job_id, program_id)
);
-- Two students asking for the same course must not fetch its pages twice.
create unique index enrichment_items_one_running on public.enrichment_items (program_id) where status = 'running';

alter table public.enrichment_jobs enable row level security;
alter table public.enrichment_items enable row level security;

revoke insert, update, delete on public.enrichment_jobs, public.enrichment_items from anon, authenticated;
revoke select on public.enrichment_jobs, public.enrichment_items from anon;

create policy "owner reads" on public.enrichment_jobs for select to authenticated
  using (user_id = (select auth.uid()));
create policy "owner reads" on public.enrichment_items for select to authenticated
  using (exists (select 1 from public.enrichment_jobs j where j.id = job_id and j.user_id = (select auth.uid())));

grant select, update on public.enrichment_jobs to ingest_worker;
grant select, insert, update on public.enrichment_items to ingest_worker;
create policy "worker" on public.enrichment_jobs for all to ingest_worker using (true) with check (true);
create policy "worker" on public.enrichment_items for all to ingest_worker using (true) with check (true);

create function public.start_enrichment(p_program_ids uuid[], p_profile jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_job uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  -- An empty list is fine: with an empty catalog the worker finds the courses itself.
  if p_program_ids is null or cardinality(p_program_ids) > 12 then
    raise exception 'bad_program_list' using errcode = '22023';
  end if;

  select id into v_job from public.enrichment_jobs
  where user_id = v_uid and status in ('queued', 'running')
  order by created_at desc limit 1;
  if v_job is not null then
    return v_job;
  end if;

  if (select count(*) from public.enrichment_jobs where user_id = v_uid and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'rate_limited';
  end if;

  insert into public.enrichment_jobs (user_id, profile_snapshot, allow_fallback)
  values (
    v_uid,
    jsonb_build_object(
      'target_countries', coalesce(p_profile -> 'target_countries', '[]'::jsonb),
      'target_levels', coalesce(p_profile -> 'target_levels', '[]'::jsonb),
      'target_fields', coalesce(p_profile -> 'target_fields', '[]'::jsonb)
    ),
    public.has_consent(v_uid, 'ai_processing')
  ) returning id into v_job;

  insert into public.enrichment_items (job_id, program_id)
  select v_job, p.id from public.programs p where p.id = any (p_program_ids);
  return v_job;
end;
$$;
revoke execute on function public.start_enrichment(uuid[], jsonb) from public, anon;
grant execute on function public.start_enrichment(uuid[], jsonb) to authenticated;
