-- Journey engine (journey system M1). The engine itself is TypeScript (packages/journey); the database
-- gives it one snapshot of everything it reads and stores what it returns.
--   journey_snapshot     everything the engine reads, as one JSON document (camelCase, like JourneyInput)
--   save_journey_state   stores the result and appends journey_events (stage entered, step done)
--   journey_due_users    recently active students, for the daily recompute
-- The signed-in student calls these for themselves. The daily recompute has no session: it sends a
-- token whose SHA-256 hash is in journey_config, like record_payment and payment_config.

alter table public.profiles
  add column entry_path text check (entry_path in ('exploring', 'knows', 'applying', 'offers'));
-- The onboarding entry question (M2) saves the answer; it only decides where the student starts.
grant update (entry_path) on public.profiles to authenticated;

-- Which country rule a checklist item came from, so the engine can tell when a rule's step is done (plan D7).
alter table public.checklist_items
  add column country_rule_id uuid references public.country_rules (id) on delete set null;

create table public.journey_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stage smallint not null check (stage between 1 and 7),
  stage_progress jsonb not null default '{}',
  steps jsonb not null default '[]',
  completed jsonb not null default '[]',
  stalled boolean not null default false,
  engine_version text not null,
  computed_at timestamptz not null default now()
);
alter table public.journey_state enable row level security;
revoke all on public.journey_state from anon, authenticated;
grant select on public.journey_state to authenticated;
create policy "own" on public.journey_state for select to authenticated using (user_id = auth.uid());
-- Journey emails (M4) read the stored result instead of recomputing it.
grant select on public.journey_state to notifier;
create policy "notifier" on public.journey_state for select to notifier using (true);

-- Snoozed, dismissed, or marked done by the student (for steps whose completion can't be seen, plan D8).
create table public.journey_step_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  step_id text not null check (step_id ~ '^S[1-7]\.[0-9]{2}(-check)?(:[A-Za-z0-9:_-]+)?$' and length(step_id) <= 200),
  state text not null check (state in ('snoozed', 'dismissed', 'done')),
  until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, step_id),
  check (state <> 'snoozed' or until is not null)
);
alter table public.journey_step_state enable row level security;
revoke all on public.journey_step_state from anon;
create policy "own read" on public.journey_step_state for select to authenticated using (user_id = auth.uid());
create policy "own insert" on public.journey_step_state for insert to authenticated
  with check (user_id = auth.uid() and public.can_process_personal_data(auth.uid()));
create policy "own update" on public.journey_step_state for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_process_personal_data(auth.uid()));
create policy "own delete" on public.journey_step_state for delete to authenticated using (user_id = auth.uid());

-- Append-only history: when the student entered a stage and when a step's done check turned true (spec 4.6).
create table public.journey_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('stage_entered', 'step_done')),
  stage smallint check (stage between 1 and 7),
  catalogue_id text,
  step_id text,
  created_at timestamptz not null default now(),
  check ((kind = 'stage_entered') = (stage is not null)),
  check ((kind = 'step_done') = (step_id is not null))
);
create index journey_events_user_idx on public.journey_events (user_id, created_at desc);
alter table public.journey_events enable row level security;
revoke all on public.journey_events from anon, authenticated;
grant select on public.journey_events to authenticated;
create policy "own" on public.journey_events for select to authenticated using (user_id = auth.uid());

create table public.journey_config (
  id boolean primary key default true check (id),
  cron_token_hash text not null
);
alter table public.journey_config enable row level security;
revoke all on public.journey_config from anon, authenticated;

-- The student the call is about: the signed-in student, or with a valid recompute token, p_user.
create function public.journey_subject(p_user uuid, p_token text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hash text;
begin
  if p_token is not null then
    select cron_token_hash into v_hash from public.journey_config;
    if v_hash is null or encode(extensions.digest(p_token, 'sha256'), 'hex') <> v_hash or p_user is null then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    return p_user;
  end if;
  if auth.uid() is null or (p_user is not null and p_user <> auth.uid()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;
revoke all on function public.journey_subject from public, anon, authenticated;

-- The applicant categories whose requirements and deadlines apply (as applicantCategories in packages/matching).
create function public.journey_categories(p_residence text, p_destination text) returns public.applicant_category[]
language sql immutable set search_path = '' as $$
  select array_remove(array[
    'all'::public.applicant_category,
    case when p_residence = p_destination then 'domestic'::public.applicant_category else 'international' end,
    case when p_residence = p_destination and p_destination = 'GB' then 'uk_home'::public.applicant_category end,
    case when p_residence = any (array['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV',
                                        'LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO'])
          and p_destination = any (array['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV',
                                         'LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO'])
         then 'eu_eea'::public.applicant_category end
  ], null);
$$;

-- Everything the engine reads for one student. Only published facts; facts keep their status.
create function public.journey_snapshot(p_user uuid default null, p_token text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := public.journey_subject(p_user, p_token);
  v_residence text;
  v_latest_run public.match_runs;
begin
  select residence_country into v_residence from public.profiles where user_id = v_uid;
  if not found then
    raise exception 'No profile' using errcode = 'P0002';
  end if;
  select * into v_latest_run from public.match_runs where user_id = v_uid order by created_at desc limit 1;

  return jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'displayName', p.display_name,
        'residenceCountry', p.residence_country,
        'consentState', p.consent_state,
        'homeQualification', p.home_qualification,
        'gradeValue', p.grade_value,
        'gradeText', p.grade_text,
        'gradeScale', p.grade_scale,
        'budgetAmount', p.budget_amount,
        'budgetCurrency', p.budget_currency,
        'targetLevels', to_jsonb(p.target_levels),
        'targetCountries', to_jsonb(p.target_countries),
        'targetFields', to_jsonb(p.target_fields),
        'intakeYear', p.intake_year,
        'researchInterests', p.research_interests,
        'entryPath', p.entry_path)
      from public.profiles p where p.user_id = v_uid),
    'tracks', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'targetLevels', to_jsonb(t.target_levels),
        'targetCountries', to_jsonb(t.target_countries), 'targetFields', to_jsonb(t.target_fields)) order by t.created_at)
      from public.tracks t where t.user_id = v_uid), '[]'),
    'testScores', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'exam', s.exam, 'examVersion', s.exam_version, 'total', s.total,
        'takenOn', s.taken_on) order by s.created_at)
      from public.test_scores s where s.user_id = v_uid), '[]'),
    'shortlist', coalesce((
      select jsonb_agg(jsonb_build_object(
        'program', jsonb_build_object('id', pr.id, 'slug', pr.slug, 'title', pr.title, 'institution', i.name,
          'country', i.country, 'level', pr.level),
        'createdAt', s.created_at) order by s.created_at)
      from public.shortlists s
      join public.programs pr on pr.id = s.program_id
      join public.institutions i on i.id = pr.institution_id
      where s.user_id = v_uid), '[]'),
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'status', a.status,
        'decision', a.decision,
        'trackId', a.track_id,
        'offerAcceptedAt', a.offer_accepted_at,
        'depositDueAt', a.deposit_due_at,
        'awardedAid', a.awarded_aid,
        'portalCheckedAt', a.portal_checked_at,
        'createdAt', a.created_at,
        'program', jsonb_build_object('id', pr.id, 'slug', pr.slug, 'title', pr.title, 'institution', i.name,
          'country', i.country, 'level', pr.level),
        'cycle', jsonb_build_object('id', c.id, 'label', c.label, 'startsOn', c.starts_on),
        'requirements', coalesce((
          select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'exam', r.exam, 'testPolicy', r.test_policy,
            'countRequired', r.count_required, 'status', r.status) order by r.created_at)
          from public.requirements r
          where r.cycle_id = c.id and r.published
            and r.applicant_category = any (public.journey_categories(v_residence, i.country))), '[]'),
        'deadlines', coalesce((
          select jsonb_agg(jsonb_build_object('id', d.id, 'dueAt', d.due_at, 'timezone', d.timezone,
            'precision', d.precision, 'status', d.status) order by d.due_at)
          from public.deadlines d
          where d.cycle_id = c.id and d.published and d.kind in ('application', 'priority')
            and d.applicant_category = any (public.journey_categories(v_residence, i.country))), '[]'),
        'checklist', coalesce((
          select jsonb_agg(jsonb_build_object('id', ci.id, 'title', ci.title, 'done', ci.done, 'dueAt', ci.due_at,
            'kind', ci.kind, 'link', ci.link, 'countryRuleId', ci.country_rule_id) order by ci.sort, ci.created_at)
          from public.checklist_items ci where ci.application_id = a.id), '[]'),
        'documents', coalesce((
          select jsonb_agg(jsonb_build_object('id', doc.id, 'kind', doc.kind, 'question', doc.question,
            'versions', (select count(*) from public.document_versions v where v.document_id = doc.id),
            'reviews', (select count(*) from public.reviews rv join public.document_versions v on v.id = rv.version_id
                        where v.document_id = doc.id)) order by doc.created_at)
          from public.documents doc where doc.application_id = a.id), '[]'),
        'letters', coalesce((
          select jsonb_agg(jsonb_build_object('id', rr.id, 'recommenderId', rr.recommender_id, 'recommenderName', rc.name,
            'status', rr.status, 'dueOn', rr.due_on) order by rr.created_at)
          from public.recommendation_requests rr join public.recommenders rc on rc.id = rr.recommender_id
          where rr.application_id = a.id), '[]'),
        'scoresSent', coalesce((
          select jsonb_agg(distinct ts.exam)
          from public.score_reports sr join public.test_scores ts on ts.id = sr.test_score_id
          where sr.application_id = a.id), '[]'),
        'costCount', (select count(*) from public.application_costs ac where ac.application_id = a.id),
        'outcomeShared', exists (select 1 from public.outcomes o where o.application_id = a.id)
      ) order by a.created_at)
      from public.applications a
      join public.program_cycles c on c.id = a.cycle_id
      join public.programs pr on pr.id = c.program_id
      join public.institutions i on i.id = pr.institution_id
      where a.user_id = v_uid), '[]'),
    'recommenders', coalesce((
      select jsonb_agg(jsonb_build_object('id', rc.id, 'name', rc.name) order by rc.created_at)
      from public.recommenders rc where rc.user_id = v_uid), '[]'),
    -- Rules for every destination the student is considering or applying to.
    'countryRules', coalesce((
      select jsonb_agg(jsonb_build_object('id', cr.id, 'destination', cr.destination, 'kind', cr.kind, 'title', cr.title,
        'link', cr.link, 'status', cr.status, 'appliesTo', to_jsonb(cr.applies_to)) order by cr.destination, cr.created_at)
      from public.country_rules cr
      where cr.published and cr.destination in (
        select unnest(p.target_countries) from public.profiles p where p.user_id = v_uid
        union select unnest(t.target_countries) from public.tracks t where t.user_id = v_uid
        union select i.country from public.applications a
          join public.program_cycles c on c.id = a.cycle_id
          join public.programs pr on pr.id = c.program_id
          join public.institutions i on i.id = pr.institution_id
          where a.user_id = v_uid)), '[]'),
    'departureTasks', coalesce((
      select jsonb_agg(jsonb_build_object('applicationId', dt.application_id, 'taskKey', dt.task_key))
      from public.departure_tasks dt where dt.user_id = v_uid), '[]'),
    'matchRuns', jsonb_build_object(
      'latestAt', v_latest_run.created_at,
      'feasibleCount', (select count(*) from jsonb_array_elements(v_latest_run.results) e
                        where not coalesce((e ->> 'excluded')::boolean, false))),
    'enrichment', jsonb_build_object('lastFinishedAt', (
      select max(finished_at) from public.enrichment_jobs where user_id = v_uid and status = 'done')),
    'stepState', coalesce((
      select jsonb_agg(jsonb_build_object('stepId', ss.step_id, 'state', ss.state, 'until', ss.until))
      from public.journey_step_state ss where ss.user_id = v_uid), '[]'),
    'parentLinked', exists (select 1 from public.parent_links pl where pl.student_id = v_uid and pl.revoked_at is null),
    'aiConsent', public.has_consent(v_uid, 'ai_processing'),
    'decisionMatrixSaved', exists (select 1 from public.decision_matrices dm where dm.user_id = v_uid),
    'cvEntries', (select count(*) from public.cv_entries cv where cv.user_id = v_uid),
    'portfolioItems', (select count(*) from public.portfolio_items pi where pi.user_id = v_uid),
    'lastCompletedAt', (select max(created_at) from public.journey_events je where je.user_id = v_uid and je.kind = 'step_done')
  );
end;
$$;
revoke all on function public.journey_snapshot from public;
grant execute on function public.journey_snapshot to anon, authenticated;

-- Stores the engine's result. Logs a stage_entered event when the stage changes and a step_done
-- event for each step id newly in `completed`, so saving the same result twice logs nothing.
create function public.save_journey_state(p_state jsonb, p_user uuid default null, p_token text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.journey_subject(p_user, p_token);
  v_old public.journey_state;
  v_stage smallint := (p_state ->> 'stage')::smallint;
  v_completed jsonb := coalesce(p_state -> 'completed', '[]');
begin
  if v_stage is null or v_stage not between 1 and 7 or jsonb_typeof(v_completed) <> 'array' or p_state ->> 'engineVersion' is null then
    raise exception 'Invalid journey state' using errcode = '22023';
  end if;
  select * into v_old from public.journey_state where user_id = v_uid for update;

  if v_old.user_id is null or v_old.stage <> v_stage then
    insert into public.journey_events (user_id, kind, stage) values (v_uid, 'stage_entered', v_stage);
  end if;
  insert into public.journey_events (user_id, kind, catalogue_id, step_id)
  select v_uid, 'step_done', split_part(id, ':', 1), id
  from jsonb_array_elements_text(v_completed) id
  where not coalesce(v_old.completed, '[]') ? id;

  insert into public.journey_state (user_id, stage, stage_progress, steps, completed, stalled, engine_version, computed_at)
  values (v_uid, v_stage, coalesce(p_state -> 'stageProgress', '{}'), coalesce(p_state -> 'steps', '[]'), v_completed,
          coalesce((p_state ->> 'stalled')::boolean, false), p_state ->> 'engineVersion', now())
  on conflict (user_id) do update set
    stage = excluded.stage, stage_progress = excluded.stage_progress, steps = excluded.steps,
    completed = excluded.completed, stalled = excluded.stalled, engine_version = excluded.engine_version,
    computed_at = excluded.computed_at;
end;
$$;
revoke all on function public.save_journey_state from public;
grant execute on function public.save_journey_state to anon, authenticated;

-- Students who signed in within 90 days, a page at a time by id, for the daily recompute (spec 4.5).
create function public.journey_due_users(p_token text, p_after uuid default null, p_limit integer default 200)
returns setof uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hash text;
begin
  select cron_token_hash into v_hash from public.journey_config;
  if v_hash is null or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_hash then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select u.id from auth.users u join public.profiles p on p.user_id = u.id
    where u.last_sign_in_at > now() - interval '90 days' and (p_after is null or u.id > p_after)
    order by u.id
    limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;
revoke all on function public.journey_due_users from public;
grant execute on function public.journey_due_users to anon, authenticated;
