begin;
\ir _helpers.psql
select no_plan();

-- Journey M3 (J3.4): test plans, "not taken yet" or booked.
select tests.create_user('plan-a@test.dev') as a \gset
select tests.create_user('plan-b@test.dev') as b \gset
select tests.create_user('plan-mum@test.dev') as mum \gset
select tests.create_user('plan-minor@test.dev', tests.birth_month_for_age(15), 'IN') as minor \gset
insert into public.parent_links (parent_id, student_id, student_name, parent_name) values (:'mum', :'a', 'A', 'Meera');

select has_table('public', 'test_plans', 'test_plans exists');

select tests.authenticate_as(:'a');
select lives_ok(format($$ insert into public.test_plans (user_id, exam, status) values (%L, 'gre', 'not_taken') $$, :'a'),
  'a student marks an exam as not taken yet');
select lives_ok(format($$ insert into public.test_plans (user_id, exam, status, booked_for) values (%L, 'ielts_academic', 'booked', '2027-01-10') $$, :'a'),
  'a student books a test');
select throws_ok(format($$ insert into public.test_plans (user_id, exam, status) values (%L, 'toefl_ibt', 'booked') $$, :'a'),
  '23514', null, 'a booked test needs its date');
select throws_ok(format($$ insert into public.test_plans (user_id, exam, status, booked_for) values (%L, 'gmat', 'not_taken', '2027-01-10') $$, :'a'),
  '23514', null, 'a test not taken yet has no date');
select throws_ok(format($$ insert into public.test_plans (user_id, exam, status) values (%L, 'gre', 'not_taken') $$, :'a'),
  '23505', null, 'one plan per exam');
select throws_ok(format($$ insert into public.test_plans (user_id, exam, status) values (%L, 'gre', 'not_taken') $$, :'b'),
  '42501', null, 'a student cannot write another student''s plans');

select is(public.journey_snapshot() -> 'testPlans',
  '[{"exam": "gre", "examVersion": null, "status": "not_taken", "bookedFor": null},
    {"exam": "ielts_academic", "examVersion": null, "status": "booked", "bookedFor": "2027-01-10"}]'::jsonb,
  'the snapshot carries the plans');

select tests.authenticate_as(:'b');
select is((select count(*) from public.test_plans), 0::bigint, 'another student sees no plans');
select tests.authenticate_as(:'mum');
select is((select count(*) from public.test_plans), 0::bigint, 'a linked parent sees no plans');

-- A minor waiting for parental consent can't save plans, like scores.
select tests.authenticate_as(:'minor');
select throws_ok(format($$ insert into public.test_plans (user_id, exam, status) values (%L, 'sat', 'not_taken') $$, :'minor'),
  '42501', null, 'no plans before parental consent');

select tests.as_anon();
select throws_ok($$ select 1 from public.test_plans $$, '42501', null, 'anonymous users cannot read plans');

select * from finish();
rollback;
