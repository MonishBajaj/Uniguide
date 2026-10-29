begin;
\ir _helpers.psql
select no_plan();

insert into public.admins (user_id) select tests.create_user('admin@test.dev');
select user_id as admin from public.admins a join auth.users u on u.id = a.user_id where u.email = 'admin@test.dev' \gset
select tests.create_user('staff@test.dev') as staff \gset
select tests.create_user('nobody@test.dev') as nobody \gset
select tests.make_program('uni-a') as cyc_a \gset
select tests.make_program('uni-b') as cyc_b \gset
select institution_id as inst_a from public.programs p join public.program_cycles c on c.program_id = p.id where c.id = :'cyc_a' \gset

select tests.authenticate_as(:'admin');
select lives_ok(format($$ select public.add_university_staff(%L, 'staff@test.dev') $$, :'inst_a'), 'an admin verifies university staff');
select tests.authenticate_as(:'staff');
select throws_ok(format($$ select public.add_university_staff(%L, 'nobody@test.dev') $$, :'inst_a'), '42501', null, 'staff cannot add staff');

select lives_ok(format($$ select public.propose_university_correction(%L, 'deadline', '{"due_at": "2027-02-01T00:00:00Z", "kind": "application", "precision": "date", "timezone": "Europe/London"}'::jsonb,
  'https://example.com/apply', 'Applications close on 1 February 2027.') $$, :'cyc_a'), 'staff propose a correction for their own institution');
select tests.as_postgres();
select is((select review_state::text || '/' || created_by from public.fact_versions where cycle_id = :'cyc_a' and created_by = 'university'), 'pending/university', 'it arrives pending, marked as from the university');
select is((select count(*)::int from public.deadlines where cycle_id = :'cyc_a'), 0, 'and nothing is published until a reviewer promotes it');

select tests.authenticate_as(:'staff');
select throws_ok(format($$ select public.propose_university_correction(%L, 'deadline', '{"due_at": "2027-02-01T00:00:00Z"}'::jsonb, 'https://example.com/a', 'quote text') $$, :'cyc_b'),
  '42501', null, 'staff cannot propose for another institution');
select tests.authenticate_as(:'nobody');
select throws_ok(format($$ select public.propose_university_correction(%L, 'deadline', '{"due_at": "2027-02-01T00:00:00Z"}'::jsonb, 'https://example.com/a', 'quote text') $$, :'cyc_a'),
  '42501', null, 'unverified users cannot propose');

select * from finish();
rollback;
