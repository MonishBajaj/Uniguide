begin;
\ir _helpers.psql
select no_plan();

-- Journey M6 (J6.4, G25): next steps that quote unverified facts raise that course's verification demand.
insert into public.admins (user_id) select tests.create_user('jd-admin@test.dev');
select user_id as admin from public.admins a join auth.users u on u.id = a.user_id where u.email = 'jd-admin@test.dev' \gset
select tests.create_user('jd-a@test.dev') as a \gset
select tests.create_user('jd-b@test.dev') as b \gset
select tests.create_user('jd-c@test.dev') as c \gset
select tests.make_program('jd-unverified') as c1 \gset
select tests.make_program('jd-verified') as c2 \gset
select program_id as p1 from public.program_cycles where id = :'c1' \gset
select program_id as p2 from public.program_cycles where id = :'c2' \gset
insert into public.deadlines (cycle_id, applicant_category, kind, owning_system, due_at, timezone, precision, status, published)
  values (:'c1', 'all', 'application', 'direct', now() + interval '30 days', 'Europe/London', 'date', 'unverified', true) returning id as d1 \gset
insert into public.deadlines (cycle_id, applicant_category, kind, owning_system, due_at, timezone, precision, status, published)
  values (:'c2', 'all', 'application', 'direct', now() + interval '30 days', 'Europe/London', 'date', 'verified', true) returning id as d2 \gset
insert into public.requirements (cycle_id, kind, status) values (:'c1', 'statement', 'conflicting') returning id as q1 \gset
insert into public.country_rules (destination, kind, title, status) values ('GB', 'housing', 'JD housing', 'unverified') returning id as r1 \gset

-- Student a quotes the unverified deadline and the conflicting requirement of course 1 (counted once), the verified
-- deadline of course 2 (not counted) and the housing rule. Student b quotes course 1 too. Student c's journey is old.
insert into public.journey_state (user_id, stage, steps, engine_version, computed_at) values
  (:'a', 4, format('[{"id": "S3.05:x", "factRefs": [{"table": "deadlines", "id": "%s", "status": "unverified"}]},
                     {"id": "S4.05:x", "factRefs": [{"table": "requirements", "id": "%s", "status": "conflicting"}]},
                     {"id": "S3.05:y", "factRefs": [{"table": "deadlines", "id": "%s", "status": "verified"}]},
                     {"id": "S7.03:x", "factRefs": [{"table": "country_rules", "id": "%s", "status": "unverified"}]}]',
                   :'d1', :'q1', :'d2', :'r1')::jsonb, 'journey-0.5.0', now()),
  (:'b', 3, format('[{"id": "S3.05:z", "factRefs": [{"table": "deadlines", "id": "%s", "status": "unverified"}]}]', :'d1')::jsonb,
   'journey-0.5.0', now()),
  (:'c', 3, format('[{"id": "S3.05:w", "factRefs": [{"table": "deadlines", "id": "%s", "status": "unverified"}]}]', :'d1')::jsonb,
   'journey-0.5.0', now() - interval '30 days');

select tests.authenticate_as(:'admin');
select is((select journey_steps from public.verification_demand(1000) where program_id = :'p1'), 2::bigint,
  'two students with recent steps quoting course 1''s unchecked facts; an old journey doesn''t count');
select is((select journey_steps from public.verification_demand(1000) where program_id = :'p2'), null,
  'a verified fact raises no demand');
select is((select program_id from public.verification_demand(1)), :'p1'::uuid, 'the course students need comes first');
select is((select journey_steps from public.rule_demand() where rule_id = :'r1'), 1::bigint, 'and the rule a step quotes');

-- Once the fact is verified, it stops counting, even before the journeys are computed again.
select tests.as_postgres();
update public.deadlines set status = 'verified' where id = :'d1';
select tests.authenticate_as(:'admin');
select is((select journey_steps from public.verification_demand(1000) where program_id = :'p1'), 1::bigint,
  'only the still-conflicting requirement counts now');

-- Only counts, and only for reviewers and the worker.
select tests.authenticate_as(:'a');
select throws_ok($$ select * from public.verification_demand() $$, '42501', null, 'a student cannot read demand');
select throws_ok($$ select * from public.rule_demand() $$, '42501', null, 'nor rule demand');
select throws_ok($$ select * from public.journey_fact_demand() $$, '42501', null, 'nor the helper behind them');
select tests.as_anon();
select throws_ok($$ select * from public.verification_demand() $$, '42501', null, 'anonymous visitors get nothing');
select tests.as_worker();
select lives_ok($$ select * from public.verification_demand() $$, 'the worker can read demand');

select * from finish();
rollback;
