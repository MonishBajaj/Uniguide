begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('student@test.dev') as student \gset
select tests.make_program('worker') as cycle \gset
select tests.make_source() as source \gset

select tests.as_worker();
select throws_ok($$ select * from public.profiles $$, '42501', null, 'worker cannot read profiles');
select throws_ok($$ select * from public.test_scores $$, '42501', null, 'worker cannot read test scores');
select throws_ok($$ select * from public.signups $$, '42501', null, 'worker cannot read the waitlist');
select throws_ok($$ update public.deadlines set due_at = now() $$, '42501', null, 'worker cannot edit facts directly');
select throws_ok(
  format($$ insert into public.fact_versions (subject, cycle_id, proposed, evidence_quote, source_id, review_state, created_by)
            values ('deadline', %L, '{}', 'q', %L, 'approved', 'worker') $$, :'cycle', :'source'),
  '42501', null, 'worker cannot insert an approved version'
);
select lives_ok(
  format($$ insert into public.fact_versions (subject, cycle_id, proposed, evidence_quote, source_id, created_by)
            values ('deadline', %L, '{"due_at": "2027-01-15T00:00:00Z"}', 'q', %L, 'worker') $$, :'cycle', :'source'),
  'worker can propose a version'
);
select throws_ok(
  format($$ select public.promote_fact_version(id) from public.fact_versions where cycle_id = %L $$, :'cycle'),
  '42501', null, 'worker cannot approve its own proposal'
);
select lives_ok(
  $$ insert into public.institutions (name, country, cricos_provider_code) values ('Register Uni', 'AU', '00001A') $$,
  'worker can import institutions from a register'
);

select * from finish();
rollback;
