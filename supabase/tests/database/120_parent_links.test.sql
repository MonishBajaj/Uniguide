begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('kid@test.dev') as kid \gset
select tests.create_user('other-kid@test.dev') as other \gset
select tests.create_user('mum@test.dev') as mum \gset
select tests.create_user('stranger@test.dev') as stranger \gset
select tests.make_program('parent-gb') as cycle \gset

select tests.authenticate_as(:'kid');
insert into public.applications (user_id, cycle_id) values (:'kid', :'cycle');
select tests.authenticate_as(:'other');
insert into public.applications (user_id, cycle_id) values (:'other', :'cycle');

-- Links are made by an operator; nobody can create one through the API.
select tests.authenticate_as(:'mum');
select throws_ok(format($$ insert into public.parent_links (parent_id, student_id, student_name) values (%L, %L, 'x') $$, :'mum', :'kid'),
  '42501', null, 'a parent cannot link themselves to a student');
select tests.as_postgres();
insert into public.parent_links (parent_id, student_id, student_name) values (:'mum', :'kid', 'Kid');

select tests.authenticate_as(:'mum');
select is((select count(*)::int from public.parent_links), 1, 'the parent sees their link');
select is((select count(*)::int from public.applications), 1, 'the parent sees only the linked student''s applications');
select is((select user_id from public.applications), :'kid'::uuid, 'and it is the linked student''s');
select is_empty(format($$ update public.applications set notes = 'x' where user_id = %L returning 1 $$, :'kid'), 'parent updates touch nothing');
select is_empty($$ select 1 from public.documents $$, 'writing is never shared with a parent');
select is_empty(format($$ select 1 from public.profiles where user_id = %L $$, :'kid'), 'the profile row (grades, budget) is not shared');

select tests.authenticate_as(:'stranger');
select is_empty($$ select 1 from public.applications $$, 'an unlinked user sees nothing');
select is_empty($$ select 1 from public.parent_links $$, 'an unlinked user sees no links');

select tests.authenticate_as(:'kid');
select is((select count(*)::int from public.parent_links), 1, 'the student can see who is linked');

select tests.as_postgres();
update public.parent_links set revoked_at = now() where parent_id = :'mum';
select tests.authenticate_as(:'mum');
select is_empty($$ select 1 from public.applications $$, 'revoking ends access at once');

select * from finish();
rollback;
