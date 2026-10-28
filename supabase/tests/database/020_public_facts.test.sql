begin;
\ir _helpers.psql
select no_plan();

select tests.make_program('visible') as cycle \gset
select tests.make_program('hidden', false) as hidden_cycle \gset
select tests.create_user('reader@test.dev') as reader \gset
insert into public.admins (user_id) select tests.create_user('admin@test.dev');
select user_id as admin from public.admins a join auth.users u on u.id = a.user_id where u.email = 'admin@test.dev' \gset

-- One verified fact, one extracted (published unverified) fact, one pending proposal and one
-- unpublished row.
select tests.propose_deadline(:'cycle', '2027-01-15') as v_verified \gset
select tests.propose_deadline(:'cycle', '2027-03-01') as v_extracted \gset
select tests.propose_deadline(:'cycle', '2027-05-01') as v_pending \gset
select public.promote_fact_version(:'v_verified');
select public.publish_extracted_version(:'v_extracted');
insert into public.cost_items (cycle_id, kind, basis, low, base, high, currency, status, published)
  values (:'cycle', 'tuition', 'per_year', 1, 2, 3, 'GBP', 'unverified', false);

select tests.as_anon();
select is((select count(*)::int from public.programs where slug = 'visible'), 1, 'anon sees a published program');
select is((select count(*)::int from public.programs where slug = 'hidden'), 0, 'anon cannot see an unpublished program');
select is((select count(*)::int from public.program_cycles where id = :'hidden_cycle'), 0, 'anon cannot see cycles of an unpublished program');
select results_eq(
  format($$ select status::text from public.deadlines where cycle_id = %L order by due_at $$, :'cycle'),
  array['verified', 'unverified'],
  'anon sees the verified and the extracted deadline, not the pending one'
);
select is((select count(*)::int from public.cost_items where cycle_id = :'cycle'), 0, 'anon cannot see an unpublished cost');
select throws_ok($$ select * from public.fact_versions $$, '42501', null, 'anon cannot read the review queue');
select is((select coverage_tier::text from public.programs where slug = 'visible'), 'verified', 'coverage tier follows the verified fact');
select is((select facts_verified::int from public.program_cards where slug = 'visible'), 1, 'program_cards counts verified facts');

select tests.authenticate_as(:'reader');
select is((select count(*)::int from public.fact_versions), 0, 'non-admins cannot read the review queue');
select is((select count(*)::int from public.cost_items where cycle_id = :'cycle'), 0, 'non-admins cannot see unpublished facts');
select throws_ok(
  $$ insert into public.deadlines (cycle_id, due_at) select id, now() from public.program_cycles limit 1 $$,
  '42501', null, 'users cannot write facts directly'
);

select tests.authenticate_as(:'admin');
select is((select count(*)::int from public.fact_versions where cycle_id = :'cycle'), 3, 'admins see every fact version');
select is((select count(*)::int from public.cost_items where cycle_id = :'cycle'), 1, 'admins see unpublished facts');
select is((select count(*)::int from public.programs where slug = 'hidden'), 1, 'admins see unpublished programs');

select * from finish();
rollback;
