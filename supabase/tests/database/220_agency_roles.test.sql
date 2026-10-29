begin;
\ir _helpers.psql
select no_plan();

insert into public.admins (user_id) select tests.create_user('admin@test.dev');
select user_id as admin from public.admins a join auth.users u on u.id = a.user_id where u.email = 'admin@test.dev' \gset
select tests.create_user('owner@test.dev') as owner \gset
select tests.create_user('cou@test.dev') as cou \gset
select tests.create_user('view@test.dev') as viewer \gset
select tests.create_user('out@test.dev') as outsider \gset
select tests.authenticate_as(:'admin');
insert into public.organizations (name, country, invite_code) values ('Team Org', 'IN', 'team123') returning id as org \gset
select public.add_org_member(:'org', 'owner@test.dev', 'owner');

select tests.authenticate_as(:'owner');
select lives_ok(format($$ select public.owner_add_member(%L, 'cou@test.dev', 'counselor') $$, :'org'), 'an owner adds a counselor');
select lives_ok(format($$ select public.owner_add_member(%L, 'view@test.dev', 'viewer') $$, :'org'), 'an owner adds a viewer');
select throws_ok(format($$ select public.owner_add_member(%L, 'nobody@test.dev', 'counselor') $$, :'org'), 'P0002', null, 'an unknown email is refused');

select tests.authenticate_as(:'cou');
select throws_ok(format($$ select public.owner_add_member(%L, 'out@test.dev', 'counselor') $$, :'org'), '42501', null, 'a counselor cannot add members');
select throws_ok(format($$ select public.owner_remove_member(%L, %L) $$, :'org', :'viewer'), '42501', null, 'a counselor cannot remove members');
select tests.authenticate_as(:'outsider');
select throws_ok(format($$ select public.owner_add_member(%L, 'out@test.dev', 'counselor') $$, :'org'), '42501', null, 'an outsider cannot add members');

select tests.authenticate_as(:'owner');
select lives_ok(format($$ select public.owner_remove_member(%L, %L) $$, :'org', :'viewer'), 'an owner removes a member');
select throws_ok(format($$ select public.owner_remove_member(%L, %L) $$, :'org', :'owner'), '23514', null, 'the last owner cannot be removed');

select throws_ok(format($$ select public.owner_add_member(%L, 'owner@test.dev', 'viewer') $$, :'org'), '23514', null, 'the last owner cannot demote themselves');
select lives_ok(format($$ select public.owner_add_member(%L, 'cou@test.dev', 'owner') $$, :'org'), 'an owner can promote a counselor');
select lives_ok(format($$ select public.owner_add_member(%L, 'owner@test.dev', 'viewer') $$, :'org'), 'with a second owner, an owner can step down');

select * from finish();
rollback;
