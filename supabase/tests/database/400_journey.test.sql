begin;
\ir _helpers.psql
select no_plan();

-- A known recompute token for this test, whatever the seed holds.
insert into public.journey_config (cron_token_hash) values (encode(extensions.digest('test-journey-token', 'sha256'), 'hex'))
on conflict (id) do update set cron_token_hash = excluded.cron_token_hash;

select tests.create_user('journey-a@test.dev', '1998-01', 'IN') as a \gset
select tests.create_user('journey-b@test.dev') as b \gset
select tests.create_user('journey-mum@test.dev') as mum \gset
select tests.create_user('journey-minor@test.dev', tests.birth_month_for_age(15), 'DE') as minor \gset
select tests.make_program('journey-one') as c1 \gset
update auth.users set last_sign_in_at = now() - interval '1 day' where id in (:'a', :'b');
update auth.users set last_sign_in_at = now() - interval '120 days' where id = :'mum';

-- A's data: a profile, a published requirement and deadline (and an unpublished one), an application
-- with a checklist item from a country rule, a letter, a document with a version, a cost and a departure task.
update public.profiles set target_levels = '{master}', target_countries = '{GB,DE}', target_fields = '{0613}',
  budget_amount = 30000, budget_currency = 'GBP', entry_path = 'knows' where user_id = :'a';
insert into public.requirements (cycle_id, applicant_category, kind, count_required, status, published)
  values (:'c1', 'all', 'recommendation_letters', 2, 'verified', true) returning id as req \gset
insert into public.requirements (cycle_id, applicant_category, kind, count_required, status, published)
  values (:'c1', 'all', 'recommendation_letters', 3, 'unverified', false);
insert into public.requirements (cycle_id, applicant_category, kind, count_required, status, published)
  values (:'c1', 'domestic', 'recommendation_letters', 1, 'verified', true);
insert into public.deadlines (cycle_id, applicant_category, kind, owning_system, due_at, timezone, precision, status, published)
  values (:'c1', 'all', 'application', 'direct', '2027-01-15 23:59+00', 'Europe/London', 'date', 'unverified', true) returning id as dl \gset
insert into public.country_rules (destination, applies_to, kind, title, link, status, published)
  values ('GB', '{IN}', 'other', 'Tuberculosis test', 'https://example.gov.uk/tb', 'verified', true) returning id as rule \gset
insert into public.country_rules (destination, applies_to, kind, title, status, published)
  values ('FR', '{}', 'other', 'Not a destination', 'verified', true);

select tests.authenticate_as(:'a');
insert into public.applications (user_id, cycle_id, status) values (:'a', :'c1', 'preparing') returning id as app \gset
insert into public.checklist_items (application_id, user_id, title, kind, link, country_rule_id)
  values (:'app', :'a', 'Tuberculosis test', 'system_step', 'https://example.gov.uk/tb', :'rule');
insert into public.recommenders (user_id, name) values (:'a', 'Dr Rao') returning id as rec \gset
insert into public.recommendation_requests (user_id, recommender_id, application_id, status) values (:'a', :'rec', :'app', 'asked');
insert into public.documents (user_id, application_id, kind, title) values (:'a', :'app', 'statement_of_purpose', 'SOP') returning id as doc \gset
insert into public.document_versions (document_id, user_id, body, word_count) values (:'doc', :'a', 'My plan.', 2);
insert into public.application_costs (user_id, application_id, kind, amount, currency) values (:'a', :'app', 'application_fee', 75, 'GBP');
insert into public.cv_entries (user_id, section, title) values (:'a', 'education', 'BTech');

-- Profile column
select throws_ok($$ update public.profiles set entry_path = 'wandering' where user_id = auth.uid() $$, '23514', null, 'entry_path rejects other values');

-- Snapshot for the signed-in student
select lives_ok($$ select public.journey_snapshot() $$, 'a student reads their own snapshot');
select public.journey_snapshot() as snap \gset
select is((:'snap'::jsonb) #>> '{profile,entryPath}', 'knows', 'the snapshot has the profile, camelCase');
select is((:'snap'::jsonb) #> '{profile,targetCountries}', '["GB", "DE"]'::jsonb, 'target countries are a JSON array');
select is(jsonb_array_length((:'snap'::jsonb) -> 'applications'), 1, 'it has the application');
select is((:'snap'::jsonb) #>> '{applications,0,program,country}', 'GB', 'with its course and country');
select is((:'snap'::jsonb) #> '{applications,0,requirements}',
  jsonb_build_array(jsonb_build_object('id', :'req', 'kind', 'recommendation_letters', 'exam', null, 'testPolicy', null, 'countRequired', 2, 'status', 'verified')),
  'only published requirements for the student''s applicant category');
select is((:'snap'::jsonb) #>> '{applications,0,deadlines,0,status}', 'unverified', 'deadlines keep their status');
select is((:'snap'::jsonb) #>> '{applications,0,checklist,0,countryRuleId}', :'rule', 'checklist items carry their country rule');
select is((:'snap'::jsonb) #>> '{applications,0,letters,0,recommenderName}', 'Dr Rao', 'letters name the recommender');
select is((:'snap'::jsonb) #> '{applications,0,documents,0,versions}', '1'::jsonb, 'documents count their versions');
select is((:'snap'::jsonb) #> '{applications,0,costCount}', '1'::jsonb, 'costs are counted');
select is((:'snap'::jsonb) #> '{applications,0,outcomeShared}', 'false'::jsonb, 'outcome sharing is reported');
select ok(jsonb_path_query_array(:'snap'::jsonb, '$.countryRules[*].title') @> '["Tuberculosis test"]', 'country rules for the student''s destinations');
select ok(not jsonb_path_query_array(:'snap'::jsonb, '$.countryRules[*].destination') @> '["FR"]', 'and no others');
select is(jsonb_path_query_first(:'snap'::jsonb, '$.countryRules[*] ? (@.title == "Tuberculosis test").status') #>> '{}', 'verified', 'rules keep their status');
select is((:'snap'::jsonb) -> 'cvEntries', '1'::jsonb, 'CV entries are counted');
select is((:'snap'::jsonb) -> 'parentLinked', 'false'::jsonb, 'no parent linked yet');
select is((:'snap'::jsonb) -> 'lastCompletedAt', 'null'::jsonb, 'nothing completed yet');
select ok((:'snap'::jsonb) ?& array['tracks', 'testScores', 'shortlist', 'recommenders', 'departureTasks', 'matchRuns',
  'enrichment', 'stepState', 'aiConsent', 'decisionMatrixSaved', 'portfolioItems'], 'every block is present');

select throws_ok(format('select public.journey_snapshot(%L)', :'b'), '42501', null, 'a student cannot read another student''s snapshot');
select throws_ok(format('select public.journey_snapshot(%L, %L)', :'b', 'wrong-token'), '42501', null, 'a wrong token is refused');

-- Saving the result
select lives_ok($$ select public.save_journey_state('{"stage": 4, "completed": ["S1.01", "S1.02"], "steps": [], "stageProgress": {}, "stalled": false, "engineVersion": "journey-0.1.0"}') $$,
  'a student saves their own journey');
select results_eq($$ select kind, count(*)::int from public.journey_events group by kind order by kind $$,
  $$ values ('stage_entered'::text, 1), ('step_done', 2) $$, 'the first save logs the stage and the done steps');
select lives_ok($$ select public.save_journey_state('{"stage": 4, "completed": ["S1.01", "S1.02"], "steps": [], "engineVersion": "journey-0.1.0"}') $$, 'saving again');
select results_eq($$ select count(*)::int from public.journey_events $$, array[3], 'the same result twice logs nothing new');
select public.save_journey_state('{"stage": 5, "completed": ["S1.01", "S1.02", "S4.14:x", "S4.16:x"], "engineVersion": "journey-0.1.0"}');
select results_eq($$ select kind, count(*)::int from public.journey_events group by kind order by kind $$,
  $$ values ('stage_entered'::text, 2), ('step_done', 4) $$, 'a new stage adds one event and two new steps add two');
select results_eq($$ select catalogue_id from public.journey_events where step_id = 'S4.14:x' $$, array['S4.14'], 'events keep the catalogue id');
select results_eq($$ select stage::int, engine_version from public.journey_state $$, $$ values (5, 'journey-0.1.0') $$, 'the state is stored');
select ok((public.journey_snapshot() ->> 'lastCompletedAt') is not null, 'the snapshot reports the last completion');
select throws_ok($$ select public.save_journey_state('{"stage": 9, "engineVersion": "x"}') $$, '22023', null, 'an invalid stage is refused');
select throws_ok(format($$ select public.save_journey_state('{"stage": 2, "engineVersion": "x"}', %L) $$, :'b'), '42501', null, 'a student cannot save another student''s journey');

-- Direct writes
select throws_ok(format($$ insert into public.journey_state (user_id, stage, engine_version) values (%L, 7, 'x') $$, :'a'), '42501', null, 'no direct insert into journey_state');
select throws_ok($$ update public.journey_state set stage = 7 $$, '42501', null, 'no direct update of journey_state');
select throws_ok(format($$ insert into public.journey_events (user_id, kind, stage) values (%L, 'stage_entered', 7) $$, :'a'), '42501', null, 'no direct insert into journey_events');
select throws_ok($$ delete from public.journey_events $$, '42501', null, 'journey events cannot be deleted');

-- Step state
select lives_ok(format($$ insert into public.journey_step_state (user_id, step_id, state, until) values (%L, 'S4.14:%s', 'snoozed', now() + interval '7 days') $$, :'a', :'app'), 'a student snoozes a step');
select lives_ok(format($$ insert into public.journey_step_state (user_id, step_id, state) values (%L, 'S2.03', 'done') $$, :'a'), 'a student marks a step done');
select throws_ok(format($$ insert into public.journey_step_state (user_id, step_id, state) values (%L, 'S2.04', 'snoozed') $$, :'a'), '23514', null, 'a snooze needs an end date');
select throws_ok(format($$ insert into public.journey_step_state (user_id, step_id, state) values (%L, 'S2.04', 'hidden') $$, :'a'), '23514', null, 'unknown states are refused');
select throws_ok(format($$ insert into public.journey_step_state (user_id, step_id, state) values (%L, 'not a step', 'done') $$, :'a'), '23514', null, 'step ids are checked');
select is(jsonb_array_length(public.journey_snapshot() -> 'stepState'), 2, 'the snapshot includes step state');
select throws_ok(format($$ insert into public.journey_step_state (user_id, step_id, state) values (%L, 'S2.03', 'done') $$, :'b'), '42501', null, 'a student cannot write another student''s step state');

-- Other students and parents
select tests.authenticate_as(:'b');
select is_empty($$ select 1 from public.journey_state $$, 'B cannot read A''s journey');
select is_empty($$ select 1 from public.journey_step_state $$, 'B cannot read A''s step state');
select is_empty($$ select 1 from public.journey_events $$, 'B cannot read A''s events');
update public.journey_step_state set state = 'dismissed';
delete from public.journey_step_state;

select tests.as_postgres();
select results_eq($$ select count(*)::int from public.journey_step_state $$, array[2], 'B cannot change or delete A''s step state');
insert into public.parent_links (parent_id, student_id, student_name) values (:'mum', :'a', 'A');
select tests.authenticate_as(:'mum');
select is_empty($$ select 1 from public.journey_state $$, 'a linked parent does not read journey_state');
select is_empty($$ select 1 from public.journey_step_state $$, 'a linked parent does not read step state');
select is_empty($$ select 1 from public.journey_events $$, 'a linked parent does not read events');
select throws_ok(format('select public.journey_snapshot(%L)', :'a'), '42501', null, 'a linked parent cannot read the snapshot');
select tests.authenticate_as(:'a');
select is(public.journey_snapshot() -> 'parentLinked', 'true'::jsonb, 'the snapshot reports a linked parent');

-- Pending parental consent
select tests.authenticate_as(:'minor');
select throws_ok(format($$ insert into public.journey_step_state (user_id, step_id, state) values (%L, 'S1.01', 'dismissed') $$, :'minor'), '42501', null,
  'a student waiting for parental consent cannot save step state');
select is(public.journey_snapshot() #>> '{profile,consentState}', 'pending_parental', 'their snapshot shows the pending consent');

-- The recompute token (no session)
select tests.as_anon();
select throws_ok($$ select public.journey_snapshot() $$, '42501', null, 'anonymous calls without a token are refused');
select throws_ok(format('select public.journey_snapshot(%L, %L)', :'a', 'wrong-token'), '42501', null, 'a wrong token is refused');
select is(public.journey_snapshot(:'a', 'test-journey-token') #>> '{profile,entryPath}', 'knows', 'the token reads any student''s snapshot');
select lives_ok(format($$ select public.save_journey_state('{"stage": 5, "completed": [], "engineVersion": "journey-0.1.0"}', %L, 'test-journey-token') $$, :'b'), 'the token saves a journey');
select throws_ok($$ select public.journey_snapshot(null, 'test-journey-token') $$, '42501', null, 'the token needs a student id');
select throws_ok($$ select * from public.journey_due_users(null) $$, '42501', null, 'due users need the token');
select throws_ok($$ select * from public.journey_due_users('wrong-token') $$, '42501', null, 'due users refuse a wrong token');

select tests.as_postgres();
select array_agg(id order by id) as due from auth.users where id in (:'a', :'b') \gset
select array(select u.id from auth.users u join public.profiles p on p.user_id = u.id
  where u.last_sign_in_at > now() - interval '90 days' and u.id > (:'due'::uuid[])[1] order by u.id) as after_first \gset
select tests.as_anon();
select ok(not (:'mum' = any (array(select public.journey_due_users('test-journey-token', null, 1000)))), 'students inactive for 90 days are skipped');
select ok((select array_agg(u) from public.journey_due_users('test-journey-token', null, 1000) u) @> :'due'::uuid[], 'recently active students are listed');
select is(array(select public.journey_due_users('test-journey-token', (:'due'::uuid[])[1], 1000)), :'after_first'::uuid[],
  'pages start after the cursor, ordered by id');
select is((select count(*)::int from public.journey_due_users('test-journey-token', null, 1)), 1, 'pages respect the limit');

-- Notifier
select tests.as_postgres();
select set_config('role', 'notifier', true);
select ok((select count(*) from public.journey_state) >= 2, 'the notifier reads stored journeys for emails');
select throws_ok($$ select * from public.journey_events $$, '42501', null, 'the notifier does not read events');

select * from finish();
rollback;
