begin;
\ir _helpers.psql
select no_plan();

insert into public.admins (user_id) select tests.create_user('admin@test.dev');
select user_id as admin from public.admins a join auth.users u on u.id = a.user_id where u.email = 'admin@test.dev' \gset
select tests.create_user('gb-verifier@test.dev') as gbv \gset
select tests.create_user('de-verifier@test.dev') as dev \gset
select tests.make_program('verify-gb') as cycle \gset
select tests.propose_deadline(:'cycle', '2027-01-15') as v1 \gset
select tests.propose_deadline(:'cycle', '2027-02-15') as v2 \gset

select tests.authenticate_as(:'gbv');
select throws_ok($$ select public.add_verifier('de-verifier@test.dev', 'D', '{DE}') $$, '42501', null, 'only admins add verifiers');
select tests.authenticate_as(:'admin');
select public.add_verifier('GB-Verifier@test.dev', 'Gemma', '{GB}');
select public.add_verifier('de-verifier@test.dev', 'Dieter', '{DE}');
select throws_ok($$ select public.add_verifier('nobody@test.dev', 'N', '{FR}') $$, 'P0002', null, 'unknown email is refused');

-- Verifiers see and review only their own countries.
select tests.authenticate_as(:'dev');
select is_empty(format($$ select 1 from public.fact_versions where cycle_id = %L $$, :'cycle'), 'a DE verifier cannot see GB proposals');
select throws_ok(format($$ select public.promote_fact_version(%L) $$, :'v1'), '42501', null, 'a DE verifier cannot approve GB facts');
select throws_ok(format($$ select public.reject_fact_version(%L, 'no') $$, :'v1'), '42501', null, 'a DE verifier cannot reject GB facts');
select tests.authenticate_as(:'gbv');
select is((select count(*)::int from public.fact_versions where cycle_id = :'cycle'), 2, 'a GB verifier sees GB proposals');
select lives_ok(format($$ select public.promote_fact_version(%L) $$, :'v1'), 'a GB verifier approves a GB fact');
select lives_ok(format($$ select public.reject_fact_version(%L, 'wrong') $$, :'v2'), 'a GB verifier rejects a GB fact');
select lives_ok($$ select * from public.verification_demand(10) $$, 'verifiers see demand');
select results_eq($$ select display_name, approved, rejected, courses_verified from public.verifier_tally() $$,
  $$ values ('Gemma'::text, 1::bigint, 1::bigint, 1::bigint) $$, 'a verifier sees only their own tally');
select tests.authenticate_as(:'admin');
select is((select count(*)::int from public.verifier_tally() where display_name in ('Gemma', 'Dieter')), 2, 'admins see every tally');
update public.verifiers set active = false where user_id = :'gbv';
select tests.as_postgres();
select tests.propose_deadline(:'cycle', '2027-03-01') as v3 \gset
select tests.authenticate_as(:'gbv');
select throws_ok(format($$ select public.promote_fact_version(%L) $$, :'v3'), '42501', null, 'an inactive verifier cannot approve');

-- Agencies: a counselor sees a student only while the student shares.
select tests.create_user('student@test.dev') as stu \gset
select tests.create_user('other@test.dev') as other \gset
select tests.create_user('counselor@test.dev') as cou \gset
select tests.authenticate_as(:'admin');
insert into public.organizations (name, country, invite_code) values ('Bright Futures', 'IN', 'abc123') returning id as org \gset
select public.add_org_member(:'org', 'counselor@test.dev');

select tests.authenticate_as(:'stu');
insert into public.applications (user_id, cycle_id) values (:'stu', :'cycle');
select tests.authenticate_as(:'other');
insert into public.applications (user_id, cycle_id) values (:'other', :'cycle');

select tests.authenticate_as(:'cou');
select is_empty(format($$ select 1 from public.profiles where user_id = %L $$, :'stu'), 'no access before sharing');
select tests.authenticate_as(:'stu');
select results_eq($$ select name from public.organization_by_code(' ABC123 ') $$, $$ values ('Bright Futures'::text) $$, 'students find an organisation by code');
select throws_ok($$ insert into public.agency_shares (student_id, org_id, display_name) select auth.uid(), id, 'x' from public.organizations $$,
  '42501', null, 'shares are only created through the function');
select public.grant_agency_share('abc123', 'Asha', 'test') as share \gset
select is((select count(*)::int from public.consents where kind = 'agency_sharing' and withdrawn_at is null), 1, 'sharing records a consent');
select results_eq($$ select o.name from public.agency_shares s join public.organizations o on o.id = s.org_id $$,
  $$ values ('Bright Futures'::text) $$, 'the student can name the organisation they share with');
select tests.authenticate_as(:'other');
select is_empty($$ select 1 from public.organizations $$, 'other students cannot list organisations');
select tests.authenticate_as(:'stu');
select throws_ok($$ select public.grant_agency_share('abc123', 'Asha', 'test') $$, '23505', null, 'no duplicate active share');

select tests.authenticate_as(:'cou');
select is((select count(*)::int from public.profiles where user_id = :'stu'), 1, 'the counselor reads the shared profile');
select is((select count(*)::int from public.applications), 1, 'the counselor sees only the sharing student''s applications');
select is_empty(format($$ update public.applications set notes = 'x' where user_id = %L returning 1 $$, :'stu'), 'counselor updates touch nothing');
select is_empty($$ select 1 from public.documents $$, 'writing is never shared');

select tests.authenticate_as(:'stu');
select public.revoke_agency_share(:'share');
select is((select count(*)::int from public.consents where kind = 'agency_sharing' and withdrawn_at is null), 0, 'revoking withdraws the consent');
select tests.authenticate_as(:'cou');
select is_empty(format($$ select 1 from public.profiles where user_id = %L $$, :'stu'), 'access ends on revoke');
select is_empty($$ select 1 from public.applications $$, 'applications hidden after revoke');

-- A student awaiting parental consent cannot share.
select tests.create_user('teen@test.dev', tests.birth_month_for_age(15), 'DE') as teen \gset
select tests.authenticate_as(:'teen');
select throws_ok($$ select public.grant_agency_share('abc123', 'T', 'test') $$, '42501', null, 'pending consent blocks sharing');

select * from finish();
rollback;
