begin;
\ir _helpers.psql
select no_plan();

-- Journey M5 (J5.7): choosing the intake for a shortlisted course.
select tests.create_user('ci-a@test.dev') as a \gset
select tests.make_program('intake-one') as c1 \gset
select tests.make_program('intake-other') as other \gset
select program_id as prog from public.program_cycles where id = :'c1' \gset
insert into public.program_cycles (program_id, label, intake_year, intake_term) values (:'prog', '2028-spring', 2028, 'spring') returning id as c2 \gset
insert into public.program_cycles (program_id, label, intake_year, intake_term) values (:'prog', '2026-autumn', 2026, 'autumn') returning id as c0 \gset
insert into public.deadlines (cycle_id, applicant_category, kind, owning_system, due_at, timezone, precision, status, published) values
  (:'c1', 'all', 'application', 'direct', now() + interval '60 days', 'Europe/London', 'date', 'verified', true),
  (:'c2', 'all', 'application', 'direct', now() + interval '200 days', 'Europe/London', 'date', 'unverified', true),
  (:'c0', 'all', 'application', 'direct', now() - interval '30 days', 'Europe/London', 'date', 'verified', true);

select tests.authenticate_as(:'a');
insert into public.shortlists (user_id, program_id) values ((select auth.uid()), :'prog');
insert into public.applications (user_id, cycle_id) values ((select auth.uid()), :'c1');
select public.journey_snapshot() -> 'applications' -> 0 as app \gset
select is((:'app'::jsonb) -> 'openCycles', '2'::jsonb, 'two intakes still have an application deadline ahead');
select is((:'app'::jsonb) -> 'intakeChosen', 'false'::jsonb, 'no intake chosen yet');

select throws_ok($$ update public.shortlists set cycle_id = '$$ || :'other' || $$' where user_id = auth.uid() $$, '23514', null,
  'another course''s intake cannot be chosen');
select lives_ok($$ update public.shortlists set cycle_id = '$$ || :'c2' || $$' where user_id = auth.uid() $$, 'a student chooses an intake');
select is(public.journey_snapshot() -> 'applications' -> 0 -> 'intakeChosen', 'true'::jsonb, 'and the snapshot says so');

select * from finish();
rollback;
