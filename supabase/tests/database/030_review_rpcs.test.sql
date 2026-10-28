begin;
\ir _helpers.psql
select no_plan();

select tests.make_program('review') as cycle \gset
select tests.create_user('user@test.dev') as someone \gset
insert into public.admins (user_id) select tests.create_user('admin@test.dev');
select user_id as admin from public.admins a join auth.users u on u.id = a.user_id where u.email = 'admin@test.dev' \gset

select tests.propose_deadline(:'cycle', '2027-01-15') as v1 \gset
select tests.propose_deadline(:'cycle', '2027-02-01') as v2 \gset

-- Non-admins cannot approve or reject.
select tests.authenticate_as(:'someone');
select throws_ok(format($$ select public.promote_fact_version(%L) $$, :'v1'), '42501', null, 'non-admin cannot approve');
select throws_ok(format($$ select public.reject_fact_version(%L, 'no') $$, :'v1'), '42501', null, 'non-admin cannot reject');
select throws_ok(format($$ select public.publish_extracted_version(%L) $$, :'v1'), '42501', null, 'non-admin cannot publish extractions');

-- Admin approves v1: the fact becomes verified and visible.
select tests.authenticate_as(:'admin');
select public.promote_fact_version(:'v1') as fact \gset
select is((select review_state::text from public.fact_versions where id = :'v1'), 'approved', 'version marked approved');
select is((select status::text from public.deadlines where id = :'fact'), 'verified', 'fact is verified');
select is((select verified_by from public.deadlines where id = :'fact'), :'admin'::uuid, 'verified_by records the reviewer');
select is((select verification_method::text from public.deadlines where id = :'fact'), 'human_review', 'method is human review');
select isnt((select verified_at from public.deadlines where id = :'fact'), null, 'verified_at is set');
select throws_ok(format($$ select public.promote_fact_version(%L) $$, :'v1'), 'P0001', null, 'an approved version cannot be approved twice');
select throws_ok(format($$ select public.promote_fact_version(%L, 'unknown') $$, :'v2'), 'P0001', null, 'approval cannot set status unknown');

-- Admin rejects v2.
select public.reject_fact_version(:'v2', 'wrong cycle');
select is((select review_state::text from public.fact_versions where id = :'v2'), 'rejected', 'version rejected');
select is((select count(*)::int from public.deadlines), 1, 'rejected proposal created no fact');

-- An update to the verified fact supersedes the old version.
select tests.as_postgres();
select tests.propose_deadline(:'cycle', '2027-01-20', :'fact') as v3 \gset
select tests.authenticate_as(:'admin');
select public.promote_fact_version(:'v3');
select is((select review_state::text from public.fact_versions where id = :'v1'), 'superseded', 'old version superseded');
select is((select due_at::date from public.deadlines where id = :'fact'), '2027-01-20'::date, 'fact updated in place');

-- The worker's extraction cannot overwrite the verified fact; it waits for a human.
select tests.as_postgres();
select tests.propose_deadline(:'cycle', '2027-01-31', :'fact') as v4 \gset
select tests.as_worker();
select is(public.publish_extracted_version(:'v4'), null, 'extraction does not overwrite a verified fact');
select tests.as_postgres();
select is((select due_at::date from public.deadlines where id = :'fact'), '2027-01-20'::date, 'verified value kept');
select ok(
  (select validation @> '[{"code": "differs_from_reviewed"}]' from public.fact_versions where id = :'v4'),
  'the disagreement is flagged for the reviewer'
);

-- A new extracted fact is published as unverified, and rejecting it takes it down.
select tests.propose_deadline(:'cycle', '2027-06-30') as v5 \gset
select tests.as_worker();
select public.publish_extracted_version(:'v5') as extracted \gset
select tests.as_postgres();
select is((select status::text from public.deadlines where id = :'extracted'), 'unverified', 'extraction published as unverified');
select is((select published from public.deadlines where id = :'extracted'), true, 'extraction is visible');
select tests.authenticate_as(:'admin');
select public.reject_fact_version(:'v5', 'misread date');
select is((select published from public.deadlines where id = :'extracted'), false, 'rejected extraction is unpublished');

-- Validator errors block publication.
select tests.as_postgres();
select tests.propose_deadline(:'cycle', '2027-07-01') as v6 \gset
update public.fact_versions set validation = '[{"level": "error", "code": "quote_not_found"}]' where id = :'v6';
select tests.as_worker();
select is(public.publish_extracted_version(:'v6'), null, 'a version with validator errors is not published');

-- Conflicting official pages are stored and shown as conflicting.
select tests.as_postgres();
select tests.propose_deadline(:'cycle', '2027-08-01') as v7 \gset
select tests.authenticate_as(:'admin');
select public.promote_fact_version(:'v7', 'conflicting') as conflict \gset
select tests.as_anon();
select is((select status::text from public.deadlines where id = :'conflict'), 'conflicting', 'conflicting fact is visible as conflicting');

select * from finish();
rollback;
