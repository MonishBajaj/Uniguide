begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('a@test.dev') as a \gset
select tests.create_user('b@test.dev') as b \gset
select tests.make_program('isolation') as cycle \gset
select id as program from public.program_cycles where id = :'cycle' \gset
select program_id as program from public.program_cycles where id = :'cycle' \gset

-- User A creates one row in each private table.
select tests.authenticate_as(:'a');
insert into public.test_scores (user_id, exam, exam_version, total) values (:'a', 'ielts_academic', 'academic', 7.5);
insert into public.shortlists (user_id, program_id) values (:'a', :'program');
insert into public.match_runs (user_id, algorithm_version, weights, profile_snapshot, catalog_hash, results)
  values (:'a', 'test', '{}', '{}', 'x', '[]');
insert into public.ai_runs (user_id, purpose, model, prompt_version) values (:'a', 'profile_extract', 'm', 'v1');
insert into public.applications (user_id, cycle_id) values (:'a', :'cycle');
insert into public.consents (user_id, kind, policy_version, method) values (:'a', 'terms', '2026-10', 'checkbox');
insert into public.checklist_items (application_id, user_id, title)
  select id, :'a', 'Send transcript' from public.applications where user_id = :'a';
update public.profiles set grade_value = 3.6, grade_scale = 'gpa_4' where user_id = :'a';

select is((select count(*)::int from public.test_scores), 1, 'A sees own test score');

-- User B sees none of it.
select tests.authenticate_as(:'b');
select is_empty($$ select 1 from public.profiles where user_id <> auth.uid() $$, 'B cannot read A''s profile');
select is_empty($$ select 1 from public.test_scores $$, 'B cannot read A''s test scores');
select is_empty($$ select 1 from public.shortlists $$, 'B cannot read A''s shortlist');
select is_empty($$ select 1 from public.match_runs $$, 'B cannot read A''s match runs');
select is_empty($$ select 1 from public.ai_runs $$, 'B cannot read A''s AI runs');
select is_empty($$ select 1 from public.applications $$, 'B cannot read A''s applications');
select is_empty($$ select 1 from public.checklist_items $$, 'B cannot read A''s checklist');
select is_empty($$ select 1 from public.consents $$, 'B cannot read A''s consents');

-- Updates and deletes against A's rows silently match nothing.
update public.profiles set grade_value = 1.0 where user_id = :'a';
update public.test_scores set total = 1 where user_id = :'a';
delete from public.shortlists where user_id = :'a';
delete from public.applications where user_id = :'a';

-- Writing rows that claim to be A's is rejected.
select throws_ok(
  format($$ insert into public.test_scores (user_id, exam, total) values (%L, 'gre', 330) $$, :'a'),
  '42501', null, 'B cannot insert a test score for A'
);
select throws_ok(
  format($$ insert into public.shortlists (user_id, program_id) values (%L, %L) $$, :'a', :'program'),
  '42501', null, 'B cannot add to A''s shortlist'
);
select tests.as_postgres();
select id as a_application from public.applications where user_id = :'a' \gset
select tests.authenticate_as(:'b');
select throws_ok(
  format($$ insert into public.checklist_items (application_id, user_id, title) values (%L, %L, 'x') $$, :'a_application', :'b'),
  '42501', null, 'B cannot attach a checklist item to A''s application'
);

-- Back as A: nothing changed.
select tests.authenticate_as(:'a');
select is((select grade_value from public.profiles where user_id = :'a'), 3.6::numeric, 'A''s profile unchanged');
select is((select total from public.test_scores), 7.5::numeric, 'A''s test score unchanged');
select is((select count(*)::int from public.shortlists), 1, 'A''s shortlist unchanged');
select is((select count(*)::int from public.applications), 1, 'A''s application unchanged');

-- Users cannot change their own age or consent state.
select throws_ok(
  format($$ update public.profiles set consent_state = 'granted' where user_id = %L $$, :'a'),
  '42501', null, 'users cannot edit consent_state'
);
select throws_ok(
  format($$ update public.profiles set birth_month = '1980-01-01' where user_id = %L $$, :'a'),
  '42501', null, 'users cannot edit birth_month'
);
select throws_ok(
  format($$ insert into public.consents (user_id, kind, policy_version, method) values (%L, 'parental', 'x', 'checkbox') $$, :'a'),
  '42501', null, 'users cannot grant their own parental consent'
);
select throws_ok(
  format($$ insert into public.admins (user_id) values (%L) $$, :'a'),
  '42501', null, 'users cannot make themselves admin'
);

-- Anonymous visitors cannot read user tables at all.
select tests.as_anon();
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon has no access to profiles');
select throws_ok($$ select * from public.test_scores $$, '42501', null, 'anon has no access to test scores');

select * from finish();
rollback;
