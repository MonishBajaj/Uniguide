-- Application assist M7 (A1.1): what the browser extension reads and writes.
--
-- * fill_profile(): the one place the extension gets a student's data. Only what portals ask for, only for the
--   caller's own application, and nothing while consent is pending or revoked. It leaves out the display name
--   (not a legal name) and the birth month (a portal's date of birth needs more), so a portal field asking for
--   them is left for the student. Essay text is not included; final_draft_text() returns one draft, on request.
-- * documents.final_version_id: the version the student chose as final. Only a final version can be offered for
--   an essay field, and only the student's own words, never generated text.
-- * program_ai_policies: a sourced, reviewed fact per course. Only a verified "allows" lets the extension paste a
--   draft; "limited", unverified and unknown all count as a ban (owner decision, 31 October 2026).
-- * assist_runs / assist_events: the audit log the student sees. Events record what happened to which field and
--   where the value came from, never the value: every text column is limited to identifier-shaped strings.
-- * mark_application_submitted(): moves the student's own application to submitted when the portal confirms it,
--   or when the student says so.

-- Final drafts ---------------------------------------------------------------------------------------------------

-- No foreign key: a second documents/document_versions relationship would make the web app's existing
-- document_versions(...) embeds ambiguous. The trigger checks the version belongs to this document, and
-- fill_profile and final_draft_text join through it, so a missing version simply isn't offered.
alter table public.documents add column final_version_id uuid;

create function public.check_final_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.final_version_id is not null and not exists (
    select 1 from public.document_versions v where v.id = new.final_version_id and v.document_id = new.id
  ) then
    raise exception 'A final draft must be one of this document''s own versions' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger documents_final_version before insert or update of final_version_id on public.documents
  for each row execute function public.check_final_version();

-- AI policy per course -------------------------------------------------------------------------------------------

create table public.program_ai_policies (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  policy text not null check (policy in ('allows', 'limited', 'bans')),
  status public.fact_status not null default 'unverified',
  source_id uuid references public.sources (id) on delete set null,
  evidence_quote text not null check (length(btrim(evidence_quote)) >= 3),
  verified_at timestamptz,
  verified_by uuid references auth.users (id),
  published boolean not null default true,
  created_at timestamptz not null default now()
);
create index program_ai_policies_program on public.program_ai_policies (program_id, created_at desc);
alter table public.program_ai_policies enable row level security;
create policy "published" on public.program_ai_policies for select to anon, authenticated
  using (published or (select public.is_admin()));
create policy "admins manage" on public.program_ai_policies for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke insert, update, delete on public.program_ai_policies from anon;

create function public.add_program_ai_policy(p_program_id uuid, p_policy text, p_source_url text, p_quote text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can add AI policies' using errcode = '42501';
  end if;
  insert into public.program_ai_policies (program_id, policy, source_id, evidence_quote)
  values (p_program_id, p_policy, public._admin_source(p_source_url, 'Official page'), trim(p_quote))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_program_ai_policy from public, anon;
grant execute on function public.add_program_ai_policy to authenticated;

create function public.verify_program_ai_policy(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can verify AI policies' using errcode = '42501';
  end if;
  update public.program_ai_policies set status = 'verified', verified_at = now(), verified_by = auth.uid() where id = p_id;
end;
$$;
revoke all on function public.verify_program_ai_policy from public, anon;
grant execute on function public.verify_program_ai_policy to authenticated;

-- The policy the extension acts on: the latest verified, published row, else "unknown".
create function public.program_ai_policy(p_program_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.policy from public.program_ai_policies p
    where p.program_id = p_program_id and p.published and p.status = 'verified'
    order by p.verified_at desc nulls last, p.created_at desc limit 1), 'unknown');
$$;
revoke all on function public.program_ai_policy from public, anon;
grant execute on function public.program_ai_policy to anon, authenticated;

-- What the extension reads ---------------------------------------------------------------------------------------

-- The application system a course uses, from its published application deadlines; own applications have none.
create function public.application_portal(p_cycle_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select d.owning_system::text from public.deadlines d
    where d.cycle_id = p_cycle_id and d.kind = 'application' and d.published
    group by d.owning_system order by count(*) desc, d.owning_system limit 1), 'unknown');
$$;
revoke all on function public.application_portal from public, anon;

create function public.fill_profile(p_application_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_app public.applications;
  v_profile public.profiles;
  v_program uuid;
begin
  if v_uid is null or not public.can_process_personal_data(v_uid) then
    return null;
  end if;
  select * into v_app from public.applications where id = p_application_id and user_id = v_uid;
  if not found then
    return null;
  end if;
  select * into v_profile from public.profiles where user_id = v_uid;
  select c.program_id into v_program from public.program_cycles c where c.id = v_app.cycle_id;

  return jsonb_build_object(
    'application', jsonb_build_object(
      'id', v_app.id,
      'own', v_app.cycle_id is null,
      'portal', case when v_app.cycle_id is null then 'unknown' else public.application_portal(v_app.cycle_id) end,
      'course', coalesce((
        select jsonb_build_object('title', pr.title, 'institution', i.name, 'country', i.country, 'level', pr.level)
        from public.programs pr join public.institutions i on i.id = pr.institution_id where pr.id = v_program),
        jsonb_build_object('title', v_app.own_title, 'institution', v_app.own_institution, 'country', v_app.own_country,
                           'level', null))),
    'contact', jsonb_build_object(
      'email', (select u.email from auth.users u where u.id = v_uid),
      'residenceCountry', v_profile.residence_country),
    'education', jsonb_build_object(
      'qualification', v_profile.home_qualification,
      -- Exactly as the student entered it: the value, its text form and its scale. Never converted.
      'grade', jsonb_build_object('value', v_profile.grade_value, 'text', v_profile.grade_text, 'scale', v_profile.grade_scale),
      'priorCredits', jsonb_build_object('value', v_profile.prior_credits, 'system', v_profile.prior_credit_system)),
    'testScores', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'exam', t.exam, 'version', t.exam_version, 'total', t.total,
                                          'sections', t.sections, 'takenOn', t.taken_on) order by t.taken_on desc nulls last)
      from public.test_scores t where t.user_id = v_uid), '[]'),
    'activities', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'section', e.section, 'title', e.title, 'organisation', e.organisation,
                                          'location', e.location, 'start', e.start_month, 'end', e.end_month,
                                          'bullets', e.bullets) order by e.start_month desc nulls last)
      from public.cv_entries e where e.user_id = v_uid), '[]'),
    'aiPolicy', case when v_program is null then 'unknown' else public.program_ai_policy(v_program) end,
    -- Final drafts for this application, or the student's general ones: ids and sizes only, never the text.
    'finalDrafts', coalesce((
      select jsonb_agg(jsonb_build_object('documentId', d.id, 'kind', d.kind, 'title', d.title, 'question', d.question,
                                          'versionId', d.final_version_id, 'wordCount', v.word_count) order by d.created_at)
      from public.documents d join public.document_versions v on v.id = d.final_version_id
      where d.user_id = v_uid and (d.application_id = v_app.id or d.application_id is null)), '[]'));
end;
$$;
revoke all on function public.fill_profile from public, anon;
grant execute on function public.fill_profile to authenticated;

-- One final draft's text, asked for when the student confirms a paste or a copy.
create function public.final_draft_text(p_document_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select v.body from public.documents d join public.document_versions v on v.id = d.final_version_id
  where d.id = p_document_id and d.user_id = auth.uid() and public.can_process_personal_data(auth.uid());
$$;
revoke all on function public.final_draft_text from public, anon;
grant execute on function public.final_draft_text to authenticated;

-- The audit log ----------------------------------------------------------------------------------------------------

create table public.assist_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid references public.applications (id) on delete set null,
  portal text not null check (portal ~ '^[a-z_]{1,40}$'),
  feature text not null check (feature in ('fill', 'guided')),
  adapter_version text not null check (adapter_version ~ '^[a-z0-9_.-]{1,40}$'),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  outcome text check (outcome in ('review', 'stopped', 'paused', 'submitted', 'abandoned')),
  check ((ended_at is null) = (outcome is null))
);
create index assist_runs_user on public.assist_runs (user_id, started_at desc);

-- What happened to which field, and where its value came from. No column can hold a value: roles, pages and
-- sources are identifier-shaped, and reasons come from a fixed list.
create table public.assist_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.assist_runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('filled', 'copied', 'skipped', 'left', 'paused', 'resumed', 'navigated', 'blocked',
                                     'pasted_draft', 'copied_draft', 'took_over', 'submitted')),
  field_role text check (field_role ~ '^[a-z][a-z0-9_.\[\]]{0,79}$'),
  page text check (page ~ '^[a-z0-9_.-]{1,60}$'),
  source text check (source ~ '^[a-z][a-zA-Z0-9_.\[\]]{0,79}$'),
  reason text check (reason in ('no_match', 'no_value', 'format_differs', 'page_differs', 'captcha', 'sign_in', 'payment',
                                'fee_waiver', 'declaration', 'unexpected', 'student', 'guard', 'confirmation_page',
                                'student_said_submitted', 'ai_policy'))
);
create index assist_events_run on public.assist_events (run_id, at);

alter table public.assist_runs enable row level security;
alter table public.assist_events enable row level security;
revoke all on public.assist_runs, public.assist_events from anon;
revoke insert, update, delete on public.assist_runs, public.assist_events from authenticated;
grant select on public.assist_runs, public.assist_events to authenticated;
create policy "own runs" on public.assist_runs for select to authenticated using (user_id = (select auth.uid()));
create policy "own events" on public.assist_events for select to authenticated using (user_id = (select auth.uid()));
-- Counselors with an active share read the log (never values; there are none). Parents don't.
create policy "counselors read shared" on public.assist_runs for select to authenticated using (public.counselor_can_see(user_id));
create policy "counselors read shared" on public.assist_events for select to authenticated using (public.counselor_can_see(user_id));

create function public.start_assist_run(p_application_id uuid, p_portal text, p_feature text, p_adapter_version text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null or not public.can_process_personal_data(v_uid) then
    raise exception 'Not available while consent is pending or revoked' using errcode = '42501';
  end if;
  if p_application_id is not null
     and not exists (select 1 from public.applications a where a.id = p_application_id and a.user_id = v_uid) then
    raise exception 'Not your application' using errcode = '42501';
  end if;
  insert into public.assist_runs (user_id, application_id, portal, feature, adapter_version)
  values (v_uid, p_application_id, p_portal, p_feature, p_adapter_version) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.start_assist_run from public, anon;
grant execute on function public.start_assist_run to authenticated;

create function public.log_assist_event(p_run_id uuid, p_kind text, p_field_role text default null, p_page text default null,
                                        p_source text default null, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (select 1 from public.assist_runs r where r.id = p_run_id and r.user_id = v_uid and r.ended_at is null) then
    raise exception 'Not an open run of yours' using errcode = '42501';
  end if;
  insert into public.assist_events (run_id, user_id, kind, field_role, page, source, reason)
  values (p_run_id, v_uid, p_kind, p_field_role, p_page, p_source, p_reason);
end;
$$;
revoke all on function public.log_assist_event from public, anon;
grant execute on function public.log_assist_event to authenticated;

create function public.end_assist_run(p_run_id uuid, p_outcome text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.assist_runs set ended_at = now(), outcome = p_outcome
  where id = p_run_id and user_id = auth.uid() and ended_at is null;
  if not found then
    raise exception 'Not an open run of yours' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.end_assist_run from public, anon;
grant execute on function public.end_assist_run to authenticated;

-- Submitted: when the portal's confirmation page is detected, or the student says they've submitted.
create function public.mark_application_submitted(p_application_id uuid, p_how text, p_run_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if p_how not in ('confirmation_page', 'student_said_submitted') then
    raise exception 'Unknown way of confirming' using errcode = '22023';
  end if;
  if v_uid is null or not public.can_process_personal_data(v_uid) then
    raise exception 'Not available while consent is pending or revoked' using errcode = '42501';
  end if;
  update public.applications set status = 'submitted'
  where id = p_application_id and user_id = v_uid and status in ('shortlisted', 'preparing');
  if not found and not exists (select 1 from public.applications a where a.id = p_application_id and a.user_id = v_uid) then
    raise exception 'Not your application' using errcode = '42501';
  end if;
  if p_run_id is not null then
    perform public.log_assist_event(p_run_id, 'submitted', null, null, null, p_how);
    perform public.end_assist_run(p_run_id, 'submitted');
  end if;
end;
$$;
revoke all on function public.mark_application_submitted from public, anon;
grant execute on function public.mark_application_submitted to authenticated;
