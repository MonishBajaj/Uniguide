begin;
\ir _helpers.psql
select no_plan();

insert into public.admins (user_id) select tests.create_user('admin@test.dev');
select user_id as admin from public.admins a join auth.users u on u.id = a.user_id where u.email = 'admin@test.dev' \gset
select tests.create_user('pupil@test.dev') as pupil \gset
select tests.create_user('teacher@test.dev') as teacher \gset
select tests.make_program('school-prog') as cycle \gset

select tests.authenticate_as(:'admin');
insert into public.organizations (name, country, invite_code, kind) values ('Hillside School', 'IN', 'school123', 'school') returning id as org \gset
select public.add_org_member(:'org', 'teacher@test.dev', 'counselor');
select is((select kind from public.organizations where id = :'org'), 'school', 'an organisation can be a school');
select throws_ok($$ insert into public.organizations (name, country, invite_code, kind) values ('X', 'IN', 'x1', 'bakery') $$, '23514', null, 'an unknown kind is refused');

select tests.authenticate_as(:'pupil');
insert into public.applications (user_id, cycle_id) values (:'pupil', :'cycle');

select tests.authenticate_as(:'teacher');
select is_empty(format($$ select 1 from public.applications where user_id = %L $$, :'pupil'), 'no share, no access');
select is_empty(format($$ select 1 from public.profiles where user_id = %L $$, :'pupil'), 'and no profile either');

select tests.authenticate_as(:'pupil');
select public.grant_agency_share('school123', 'Asha', 'test') as share \gset
select tests.authenticate_as(:'teacher');
select is((select count(*)::int from public.applications where user_id = :'pupil'), 1, 'after the student shares, the school counselor sees the application');
select is_empty($$ select 1 from public.documents $$, 'writing is never shared');

select tests.authenticate_as(:'pupil');
select public.revoke_agency_share(:'share');
select tests.authenticate_as(:'teacher');
select is_empty(format($$ select 1 from public.applications where user_id = %L $$, :'pupil'), 'revoking ends access at once');

select * from finish();
rollback;
