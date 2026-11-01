-- Complete matches (docs/superpowers/specs/2026-11-01-complete-matches-design.md): a search is an ordered queue of
-- universities. The worker tries them in order, keeps those whose courses end with a deadline, a cost and a
-- requirement, skips the rest and moves on. Students start jobs only through start_enrichment().

alter table public.enrichment_jobs
  add column target_complete integer not null default 10,
  add column max_tries integer not null default 30,
  add column tried integer not null default 0,
  add column kept integer not null default 0;

create table public.enrichment_candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.enrichment_jobs (id) on delete cascade,
  position integer not null check (position >= 1),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running', 'kept', 'skipped')),
  reason text,
  courses integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  unique (job_id, position),
  unique (job_id, institution_id)
);

alter table public.enrichment_items
  add column candidate_id uuid references public.enrichment_candidates (id) on delete set null;
alter table public.enrichment_items drop constraint enrichment_items_status_check;
alter table public.enrichment_items add constraint enrichment_items_status_check
  check (status in ('pending', 'waiting', 'running', 'extracted', 'skipped_fresh', 'failed', 'incomplete'));

alter table public.enrichment_candidates enable row level security;
revoke insert, update, delete on public.enrichment_candidates from anon, authenticated;
revoke select on public.enrichment_candidates from anon;
create policy "owner reads" on public.enrichment_candidates for select to authenticated
  using (exists (select 1 from public.enrichment_jobs j where j.id = job_id and j.user_id = (select auth.uid())));
grant select, update on public.enrichment_candidates to ingest_worker;
create policy "worker" on public.enrichment_candidates for all to ingest_worker using (true) with check (true);

-- What the worker learned about finding a university's course pages, so a dead end is not tried again for a week.
create table public.institution_discovery (
  institution_id uuid primary key references public.institutions (id) on delete cascade,
  status text not null check (status in ('found', 'none', 'blocked')),
  reason text,
  index_url text,
  checked_at timestamptz not null default now()
);
alter table public.institution_discovery enable row level security;
revoke all on public.institution_discovery from anon, authenticated;
grant select, insert, update on public.institution_discovery to ingest_worker;
create policy "worker" on public.institution_discovery for all to ingest_worker using (true) with check (true);

-- Complete: the current intake has a published application (or priority) deadline, a published tuition cost and a
-- published requirement. Unverified facts count.
create function public.course_is_complete(p_program_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.program_cycles c
    where c.program_id = p_program_id and c.is_current
      and exists (select 1 from public.deadlines d where d.cycle_id = c.id and d.published and d.kind in ('application', 'priority'))
      and exists (select 1 from public.cost_items k where k.cycle_id = c.id and k.published and k.kind = 'tuition')
      and exists (select 1 from public.requirements r where r.cycle_id = c.id and r.published)
  );
$$;

-- The old version took course ids chosen up front. This one takes universities, in the order to try them.
drop function public.start_enrichment(uuid[]);
create function public.start_enrichment(p_institution_ids uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_job uuid;
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if p_institution_ids is null or cardinality(p_institution_ids) > 30 then
    raise exception 'bad_program_list' using errcode = '22023';
  end if;

  -- One start at a time per student, so parallel calls cannot get past the checks below together.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select id into v_job from public.enrichment_jobs
  where user_id = v_uid and status in ('queued', 'running')
  order by created_at desc limit 1;
  if v_job is not null then
    return v_job;
  end if;

  if (select count(*) from public.enrichment_jobs where user_id = v_uid and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'rate_limited';
  end if;

  -- The targets come from the stored profile, never from the caller, so they cannot be made up.
  select * into v_profile from public.profiles where user_id = v_uid;
  insert into public.enrichment_jobs (user_id, profile_snapshot, allow_fallback)
  values (
    v_uid,
    jsonb_build_object(
      'target_countries', to_jsonb(coalesce(v_profile.target_countries, '{}')),
      'target_levels', to_jsonb(coalesce(v_profile.target_levels, '{}')),
      'target_fields', to_jsonb(coalesce(v_profile.target_fields, '{}'))
    ),
    public.has_consent(v_uid, 'ai_processing')
  ) returning id into v_job;

  -- Known universities only, each once, in the order given.
  with wanted as (
    select distinct on (t.id) t.id, t.ord
    from unnest(p_institution_ids) with ordinality as t(id, ord)
    join public.institutions i on i.id = t.id
    order by t.id, t.ord
  )
  insert into public.enrichment_candidates (job_id, position, institution_id)
  select v_job, (row_number() over (order by ord))::integer, id from wanted;
  return v_job;
end;
$$;
revoke execute on function public.start_enrichment(uuid[]) from public, anon;
grant execute on function public.start_enrichment(uuid[]) to authenticated;
