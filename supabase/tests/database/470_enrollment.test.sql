begin;
\ir _helpers.psql
select no_plan();

-- Journey M5: enrollment columns, offer conditions, interview and "missing" events, rollover and arrival.
select tests.create_user('en-a@test.dev') as a \gset
select tests.create_user('en-b@test.dev') as b \gset
select tests.create_user('en-mum@test.dev') as mum \gset
select tests.make_program('enrol-one') as c1 \gset
insert into public.parent_links (parent_id, student_id, student_name, parent_name) values (:'mum', :'a', 'A', 'Meera');
insert into public.deadlines (cycle_id, applicant_category, kind, owning_system, due_at, timezone, precision, status, published)
  values (:'c1', 'all', 'deposit', 'direct', '2027-05-01 23:59+00', 'Europe/London', 'date', 'verified', true);

select tests.authenticate_as(:'a');
insert into public.applications (id, user_id, cycle_id, status, decision)
  values ('00000000-0000-0000-0000-0000000e0a01', :'a', :'c1', 'decided', 'admitted');

-- Offer conditions: the student's own, never a parent's.
select lives_ok($$ insert into public.offer_conditions (application_id, user_id, conditions)
  values ('00000000-0000-0000-0000-0000000e0a01', (select auth.uid()), 'Final grade of at least 8.0') $$, 'a student saves their offer conditions');
select tests.authenticate_as(:'b');
select throws_ok($$ insert into public.offer_conditions (application_id, user_id, conditions)
  values ('00000000-0000-0000-0000-0000000e0a01', (select auth.uid()), 'x') $$, '42501', null, 'not on someone else''s application');
select is((select count(*) from public.offer_conditions), 0::bigint, 'another student sees no conditions');
select tests.authenticate_as(:'mum');
select is((select count(*) from public.offer_conditions), 0::bigint, 'a linked parent never sees conditions');
select is((select count(*) from public.applications where user_id = :'a'), 1::bigint, 'though they still see the application');

-- Interviews and "missing" notes.
select tests.authenticate_as(:'a');
select lives_ok($$ insert into public.application_events (application_id, user_id, kind, occurs_at)
  values ('00000000-0000-0000-0000-0000000e0a01', (select auth.uid()), 'interview', '2027-02-10 10:00+00') $$, 'a student logs an interview');
select throws_ok($$ insert into public.application_events (application_id, user_id, kind)
  values ('00000000-0000-0000-0000-0000000e0a01', (select auth.uid()), 'interview') $$, '23514', null, 'an interview needs its time');
select lives_ok($$ insert into public.application_events (id, application_id, user_id, kind, note, missing)
  values ('00000000-0000-0000-0000-0000000e0e01', '00000000-0000-0000-0000-0000000e0a01', (select auth.uid()), 'portal_check', 'Transcript missing', true) $$,
  'a portal check can say something is missing');
select throws_ok($$ insert into public.application_events (application_id, user_id, kind, note, missing)
  values ('00000000-0000-0000-0000-0000000e0a01', (select auth.uid()), 'note', 'x', true) $$, '23514', null, 'only a portal check is "missing"');
select lives_ok($$ update public.application_events set resolved_at = now() where id = '00000000-0000-0000-0000-0000000e0e01' $$, 'and marked sorted');
select throws_ok($$ update public.application_events set note = 'changed' where id = '00000000-0000-0000-0000-0000000e0e01' $$,
  '42501', null, 'nothing else about an event can change');
select throws_ok($$ insert into public.application_events (application_id, user_id, kind) values ('00000000-0000-0000-0000-0000000e0a01', (select auth.uid()), 'decision') $$,
  '42501', null, 'decision events still come only from the trigger');

-- The snapshot carries it all.
update public.applications set deposit_paid_at = now(), expected_decision_on = '2027-03-01' where id = '00000000-0000-0000-0000-0000000e0a01';
select public.journey_snapshot() -> 'applications' -> 0 as app \gset
select is((:'app'::jsonb) -> 'conditions' -> 'metAt', 'null'::jsonb, 'conditions not yet met');
select ok((:'app'::jsonb) ->> 'depositPaidAt' is not null and (:'app'::jsonb) -> 'hasDepositDeadline' = 'true'::jsonb, 'deposit paid, and a deposit deadline is published');
select is((:'app'::jsonb) ->> 'expectedDecisionOn', '2027-03-01', 'the expected decision date');
select is(jsonb_array_length((:'app'::jsonb) -> 'interviews'), 1, 'the interview');
select is((:'app'::jsonb) -> 'missingNotes', '0'::jsonb, 'the missing note is resolved');
select ok(public.journey_snapshot() -> 'profile' ? 'intakeRolledAt', 'the profile says when the student rolled over');

-- Arrival is stored with the journey.
select public.save_journey_state('{"stage": 7, "completed": [], "arrived": true, "engineVersion": "journey-0.4.0"}');
select is((select arrived from public.journey_state where user_id = :'a'), true, 'arrival is saved');

select * from finish();
rollback;
