begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('r1@test.dev') as a \gset
select tests.create_user('r2@test.dev') as b \gset
select tests.make_program('research-msc') as cycle \gset
select program_id as prog from public.program_cycles where id = :'cycle' \gset

-- A shares an outcome with research consent; B's consent is later withdrawn.
select tests.as_postgres();
insert into public.applications (id, user_id, cycle_id, decision) values
  ('00000000-0000-0000-0000-0000000000a1', :'a', :'cycle', 'admitted'),
  ('00000000-0000-0000-0000-0000000000b1', :'b', :'cycle', 'rejected');
insert into public.consents (user_id, kind, policy_version, method) values
  (:'a', 'outcomes_research', 'test', 'checkbox'), (:'b', 'outcomes_research', 'test', 'checkbox');
insert into public.outcomes (application_id, user_id, program_id, cycle_id, decision, profile_snapshot) values
  ('00000000-0000-0000-0000-0000000000a1', :'a', :'prog', :'cycle', 'admitted', '{"grade_value": 8.1, "grade_scale": "gpa_10", "residence_country": "IN"}'),
  ('00000000-0000-0000-0000-0000000000b1', :'b', :'prog', :'cycle', 'rejected', '{"grade_value": "n/a"}');
update public.consents set withdrawn_at = now() where user_id = :'b';

select tests.as_analyst();
select results_eq($$ select decision::text, grade_value, residence_country from public.research_outcomes $$,
  $$ values ('admitted', 8.1::numeric, 'IN') $$, 'the analyst sees consented outcomes only, de-identified');
select hasnt_column('public', 'research_outcomes', 'user_id', 'no user id in research rows');
select throws_ok($$ select user_id from public.outcomes $$, '42501', null, 'the analyst cannot read user ids');
select throws_ok($$ select application_id from public.outcomes $$, '42501', null, 'the analyst cannot read application ids');
select throws_ok($$ select 1 from public.profiles $$, '42501', null, 'the analyst cannot read profiles');
select throws_ok($$ select 1 from auth.users $$, '42501', null, 'the analyst cannot read users');

select tests.authenticate_as(:'a');
select throws_ok($$ select 1 from public.research_outcomes $$, '42501', null, 'students cannot read research rows');
select tests.as_anon();
select throws_ok($$ select 1 from public.research_outcomes $$, '42501', null, 'anon cannot read research rows');

-- Models are public only when they passed the gate and are active.
select tests.as_analyst();
insert into public.admission_models (version, trained_through, holdout_year, n_train, n_holdout, brier, brier_baseline,
  calibration_error, passed, params, min_program_n, active)
values ('t-fail', 2025, 2026, 10, 5, 0.3, 0.25, 0.2, false, '{}', 20, false),
       ('t-pass', 2025, 2026, 900, 200, 0.18, 0.24, 0.04, true, '{}', 20, true);
select throws_ok($$ update public.admission_models set active = true where version = 't-fail' $$, '23505', null, 'only one active model');
select tests.as_anon();
select results_eq($$ select version from public.admission_models $$, $$ values ('t-pass') $$, 'only the passed, active model is visible');
select tests.authenticate_as(:'a');
select throws_ok($$ insert into public.admission_models (version, trained_through, holdout_year, n_train, n_holdout, brier,
  brier_baseline, calibration_error, passed, params, min_program_n) values ('x', 1, 2, 1, 1, 0, 0, 0, true, '{}', 1) $$,
  '42501', null, 'students cannot publish models');

select * from finish();
rollback;
