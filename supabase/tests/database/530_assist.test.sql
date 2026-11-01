begin;
\ir _helpers.psql
select no_plan();

-- Application assist M7 (A1.1): the fill profile, final drafts, AI policies, the audit log and submitted status.
insert into public.admins (user_id) select tests.create_user('as-admin@test.dev');
select user_id as admin from public.admins a join auth.users u on u.id = a.user_id where u.email = 'as-admin@test.dev' \gset
select tests.create_user('as-a@test.dev', '1995-01', 'IN') as a \gset
select tests.create_user('as-b@test.dev') as b \gset
select tests.create_user('as-mum@test.dev') as mum \gset
select tests.create_user('as-counselor@test.dev') as counselor \gset
select tests.make_program('assist-one') as c1 \gset
select program_id as p1 from public.program_cycles where id = :'c1' \gset
insert into public.deadlines (cycle_id, applicant_category, kind, owning_system, due_at, timezone, precision, status, published)
  values (:'c1', 'all', 'application', 'ucas', now() + interval '60 days', 'Europe/London', 'date', 'verified', true);
insert into public.parent_links (parent_id, student_id, student_name, parent_name) values (:'mum', :'a', 'A', 'Meera');
insert into public.organizations (name, country) values ('AS Counselling', 'IN') returning id as org \gset
insert into public.org_members (org_id, user_id) values (:'org', :'counselor');
insert into public.agency_shares (student_id, org_id, display_name) values (:'a', :'org', 'A');
update public.profiles set display_name = 'Nickname', home_qualification = 'cbse_12', grade_value = 91.4, grade_text = '91.4%',
  grade_scale = 'percentage' where user_id = :'a';

select tests.authenticate_as(:'a');
insert into public.applications (id, user_id, cycle_id, status) values ('00000000-0000-0000-0000-0000000a5a01', :'a', :'c1', 'preparing');
insert into public.test_scores (user_id, exam, exam_version, total) values (:'a', 'ielts_academic', null, 7.5);
insert into public.cv_entries (user_id, section, title, organisation) values (:'a', 'projects', 'Robotics club lead', 'City School');

-- The fill profile: only fill fields, grades as entered, no name or birth month.
select public.fill_profile('00000000-0000-0000-0000-0000000a5a01') as fp \gset
select is((:'fp'::jsonb) #>> '{application,portal}', 'ucas', 'the portal comes from the course''s application deadlines');
select is((:'fp'::jsonb) #> '{education,grade}', '{"value": 91.4, "text": "91.4%", "scale": "percentage"}'::jsonb,
  'the grade exactly as entered, with its scale');
select is((:'fp'::jsonb) #>> '{contact,email}', 'as-a@test.dev', 'the sign-in email');
select is(jsonb_array_length((:'fp'::jsonb) -> 'testScores'), 1, 'test scores');
select is((:'fp'::jsonb) #>> '{activities,0,title}', 'Robotics club lead', 'activities from the CV');
select ok((:'fp'::text) not like '%Nickname%' and not ((:'fp'::jsonb) -> 'contact' ? 'birthMonth'),
  'no display name and no birth month');
select is((:'fp'::jsonb) ->> 'aiPolicy', 'unknown', 'no policy yet reads as unknown');
select is((:'fp'::jsonb) -> 'finalDrafts', '[]'::jsonb, 'no final drafts yet');

-- Final drafts: one of the document's own versions, and only its text, on request.
insert into public.documents (id, user_id, application_id, kind, title) values
  ('00000000-0000-0000-0000-0000000a5d01', :'a', '00000000-0000-0000-0000-0000000a5a01', 'personal_statement', 'PS'),
  ('00000000-0000-0000-0000-0000000a5d02', :'a', null, 'other', 'Other');
insert into public.document_versions (id, document_id, user_id, body, word_count) values
  ('00000000-0000-0000-0000-0000000a5e01', '00000000-0000-0000-0000-0000000a5d01', :'a', 'My own final words.', 4),
  ('00000000-0000-0000-0000-0000000a5e02', '00000000-0000-0000-0000-0000000a5d02', :'a', 'Something else.', 2);
select throws_ok($$ update public.documents set final_version_id = '00000000-0000-0000-0000-0000000a5e02'
  where id = '00000000-0000-0000-0000-0000000a5d01' $$, '23514', null, 'a final draft must be one of the document''s versions');
select lives_ok($$ update public.documents set final_version_id = '00000000-0000-0000-0000-0000000a5e01'
  where id = '00000000-0000-0000-0000-0000000a5d01' $$, 'the student marks a final draft');
select is(public.fill_profile('00000000-0000-0000-0000-0000000a5a01') #>> '{finalDrafts,0,documentId}',
  '00000000-0000-0000-0000-0000000a5d01', 'the final draft is listed');
select ok(public.fill_profile('00000000-0000-0000-0000-0000000a5a01')::text not like '%My own final words%',
  'without its text');
select is(public.final_draft_text('00000000-0000-0000-0000-0000000a5d01'), 'My own final words.', 'its text on request');
select is(public.final_draft_text('00000000-0000-0000-0000-0000000a5d02'), null, 'a document with no final version has none');

-- AI policies: only a verified, published "allows" counts; everything else is a ban to the extension.
select tests.authenticate_as(:'admin');
select public.add_program_ai_policy(:'p1', 'allows', 'https://example.ac.uk/ai', 'You may use AI tools for spelling only') as pol \gset
select tests.authenticate_as(:'a');
select is(public.fill_profile('00000000-0000-0000-0000-0000000a5a01') ->> 'aiPolicy', 'unknown', 'an unverified policy is still unknown');
select throws_ok(format('select public.verify_program_ai_policy(%L)', :'pol'), '42501', null, 'only admins verify a policy');
select tests.authenticate_as(:'admin');
select public.verify_program_ai_policy(:'pol');
select tests.authenticate_as(:'a');
select is(public.fill_profile('00000000-0000-0000-0000-0000000a5a01') ->> 'aiPolicy', 'allows', 'a verified policy counts');
select throws_ok($$ insert into public.program_ai_policies (program_id, policy, evidence_quote)
  values ((select program_id from public.program_cycles limit 1), 'allows', 'xyz') $$, '42501', null, 'students cannot add policies');

-- The audit log: own runs only, no values, consent required.
select public.start_assist_run('00000000-0000-0000-0000-0000000a5a01', 'ucas', 'fill', 'practice-1') as run \gset
select lives_ok(format($$ select public.log_assist_event(%L, 'filled', 'education.grade', 'p2-education', 'profile.education.grade') $$, :'run'),
  'a fill is logged by role, page and source');
select throws_ok(format($$ select public.log_assist_event(%L, 'filled', 'education.grade', 'p2', 'Grade 91.4 percent') $$, :'run'),
  '23514', null, 'a value cannot be smuggled into the log');
select throws_ok(format($$ select public.log_assist_event(%L, 'paused', null, 'p2', null, 'the CAPTCHA was hard') $$, :'run'),
  '23514', null, 'reasons come from a fixed list');
select throws_ok($$ insert into public.assist_events (run_id, user_id, kind) select id, user_id, 'filled' from public.assist_runs $$,
  '42501', null, 'events are written only through the logging function');

select tests.authenticate_as(:'b');
select throws_ok(format($$ select public.log_assist_event(%L, 'filled') $$, :'run'), '42501', null, 'not into someone else''s run');
select throws_ok($$ select public.start_assist_run('00000000-0000-0000-0000-0000000a5a01', 'ucas', 'fill', 'practice-1') $$,
  '42501', null, 'not for someone else''s application');
select is(public.fill_profile('00000000-0000-0000-0000-0000000a5a01'), null, 'another student gets no fill profile');
select is(public.final_draft_text('00000000-0000-0000-0000-0000000a5d01'), null, 'nor their draft');
select is((select count(*) from public.assist_runs), 0::bigint, 'nor their runs');

select tests.authenticate_as(:'mum');
select is((select count(*) from public.assist_runs) + (select count(*) from public.assist_events), 0::bigint,
  'a parent sees no assist log');
select tests.authenticate_as(:'counselor');
select is((select count(*) from public.assist_events where run_id = :'run'), 1::bigint, 'a counselor with a share reads the log');
select throws_ok(format($$ select public.log_assist_event(%L, 'filled') $$, :'run'), '42501', null, 'but cannot write to it');

-- Consent pending or revoked: nothing.
select tests.as_postgres();
update public.profiles set consent_state = 'pending_parental' where user_id = :'a';
select tests.authenticate_as(:'a');
select is(public.fill_profile('00000000-0000-0000-0000-0000000a5a01'), null, 'no fill profile while consent is pending');
select is(public.final_draft_text('00000000-0000-0000-0000-0000000a5d01'), null, 'no draft text while consent is pending');
select throws_ok($$ select public.start_assist_run(null, 'ucas', 'fill', 'practice-1') $$, '42501', null, 'no runs while consent is pending');
select tests.as_postgres();
update public.profiles set consent_state = 'revoked' where user_id = :'a';
select tests.authenticate_as(:'a');
select is(public.fill_profile('00000000-0000-0000-0000-0000000a5a01'), null, 'nor while it is revoked');
select tests.as_postgres();
update public.profiles set consent_state = 'not_required' where user_id = :'a';

-- Submitted: the student's own application only, and the run closes.
select tests.authenticate_as(:'b');
select throws_ok($$ select public.mark_application_submitted('00000000-0000-0000-0000-0000000a5a01', 'student_said_submitted') $$,
  '42501', null, 'not someone else''s application');
select tests.authenticate_as(:'a');
select lives_ok(format($$ select public.mark_application_submitted('00000000-0000-0000-0000-0000000a5a01', 'confirmation_page', %L) $$, :'run'),
  'the portal''s confirmation page marks it submitted');
select is((select status::text from public.applications where id = '00000000-0000-0000-0000-0000000a5a01'), 'submitted', 'it is submitted');
select is((select outcome from public.assist_runs where id = :'run'), 'submitted', 'and the run ends as submitted');
select is((select reason from public.assist_events where run_id = :'run' and kind = 'submitted'), 'confirmation_page', 'with how it was confirmed');

select * from finish();
rollback;
