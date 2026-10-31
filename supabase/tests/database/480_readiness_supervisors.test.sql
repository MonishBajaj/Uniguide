begin;
\ir _helpers.psql
select no_plan();

-- Journey M5 (J5.3): document readiness and supervisor contacts.
select tests.create_user('rs-a@test.dev') as a \gset
select tests.create_user('rs-b@test.dev') as b \gset
select tests.create_user('rs-mum@test.dev') as mum \gset
select tests.create_user('rs-minor@test.dev', tests.birth_month_for_age(15), 'IN') as minor \gset
select tests.make_program('rs-one') as c1 \gset
insert into public.parent_links (parent_id, student_id, student_name, parent_name) values (:'mum', :'a', 'A', 'Meera');
insert into public.applications (id, user_id, cycle_id, status) values ('00000000-0000-0000-0000-000000000b01', :'b', :'c1', 'preparing');

select tests.authenticate_as(:'a');
insert into public.applications (id, user_id, cycle_id, status) values ('00000000-0000-0000-0000-000000000a01', :'a', :'c1', 'preparing');
select lives_ok($$ insert into public.readiness_items (user_id, kind, ready, expires_on) values ((select auth.uid()), 'passport', true, '2030-01-01') $$,
  'a student saves their passport expiry');
select throws_ok($$ insert into public.readiness_items (user_id, kind) values ((select auth.uid()), 'passport') $$, '23505', null, 'one passport row');
select throws_ok($$ insert into public.readiness_items (user_id, kind, expires_on) values ((select auth.uid()), 'transcript', '2030-01-01') $$,
  '23514', null, 'only a passport has an expiry');
select lives_ok($$ insert into public.supervisor_contacts (user_id, application_id, name, institution, contacted_on, reply)
  values ((select auth.uid()), '00000000-0000-0000-0000-000000000a01', 'Prof. Rao', 'Example U', '2026-10-01', 'positive') $$,
  'a student logs a supervisor contact');
select throws_ok($$ insert into public.supervisor_contacts (user_id, application_id, name, institution, contacted_on)
  values ((select auth.uid()), '00000000-0000-0000-0000-000000000b01', 'X', 'Y', '2026-10-01') $$,
  '42501', null, 'not against someone else''s application');
select throws_ok($$ update public.supervisor_contacts set application_id = '00000000-0000-0000-0000-000000000b01' $$,
  '42501', null, 'nor moved onto it later');

select public.journey_snapshot() as snap \gset
select is((:'snap'::jsonb) -> 'readiness', '[{"kind": "passport", "ready": true, "expiresOn": "2030-01-01"}]'::jsonb, 'the snapshot has readiness');
select is((:'snap'::jsonb) -> 'supervisorContacts', '[{"applicationId": "00000000-0000-0000-0000-000000000a01", "reply": "positive"}]'::jsonb,
  'and supervisor contacts, without names');

select tests.authenticate_as(:'b');
select is((select count(*) from public.readiness_items) + (select count(*) from public.supervisor_contacts), 0::bigint, 'another student sees neither');
select tests.authenticate_as(:'mum');
select is((select count(*) from public.readiness_items) + (select count(*) from public.supervisor_contacts), 0::bigint, 'a parent sees neither');
select tests.authenticate_as(:'minor');
select throws_ok($$ insert into public.readiness_items (user_id, kind) values ((select auth.uid()), 'passport') $$, '42501', null, 'nothing before parental consent');

select * from finish();
rollback;
