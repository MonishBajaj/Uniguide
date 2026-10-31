-- Journey M3 (J3.1): test requirements in the snapshot also carry the exam version and the published
-- minimum total, so the engine can tell when a verified minimum is above the student's best score (S2.05).
-- Otherwise unchanged from 20270102000001_journey_shell.sql.

create or replace function public.journey_snapshot(p_user uuid default null, p_token text default null) returns jsonb
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
            'countRequired', r.count_required, 'status', r.status,
            'examVersion', r.exam_version, 'minTotal', r.min_total,
            'sourceUrl', (select src.url from public.sources src where src.id = r.source_id)) order by r.created_at)
          from public.requirements r
          where r.cycle_id = c.id and r.published
            and r.applicant_category = any (public.journey_categories(v_residence, i.country))), '[]'),
        'deadlines', coalesce((
          select jsonb_agg(jsonb_build_object('id', d.id, 'dueAt', d.due_at, 'timezone', d.timezone,
            'precision', d.precision, 'status', d.status,
            'sourceUrl', (select src.url from public.sources src where src.id = d.source_id)) order by d.due_at)
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
        'link', cr.link, 'status', cr.status, 'appliesTo', to_jsonb(cr.applies_to),
        'sourceUrl', coalesce(cr.link, (select src.url from public.sources src where src.id = cr.source_id)))
        order by cr.destination, cr.created_at)
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
    'lastCompletedAt', (select max(created_at) from public.journey_events je where je.user_id = v_uid and je.kind = 'step_done'),
    -- Who the student shares their plans with, for the home's "Shared with" panel.
    'sharedWith', jsonb_build_object(
      'parents', coalesce((
        select jsonb_agg(coalesce(nullif(pl.parent_name, ''), 'Parent') order by pl.created_at)
        from public.parent_links pl where pl.student_id = v_uid and pl.revoked_at is null), '[]'),
      'counselors', coalesce((
        select jsonb_agg(o.name order by s.granted_at)
        from public.agency_shares s join public.organizations o on o.id = s.org_id
        where s.student_id = v_uid and s.revoked_at is null), '[]'))
  );
end;
$$;
revoke all on function public.journey_snapshot from public;
grant execute on function public.journey_snapshot to anon, authenticated;
