begin;
\ir _helpers.psql
select no_plan();

insert into public.admins (user_id) select tests.create_user('admin@test.dev');
select user_id as admin from public.admins a join auth.users u on u.id = a.user_id where u.email = 'admin@test.dev' \gset
select tests.make_program('waiver-prog') as cycle \gset

create function pg_temp.propose_waiver(p_cycle uuid, p_kind text, p_amount numeric) returns uuid
language sql as $$
  insert into public.fact_versions (subject, cycle_id, proposed, evidence_quote, source_id, created_by)
  values ('fee_waiver', p_cycle, jsonb_build_object('kind', p_kind, 'amount', p_amount, 'currency', case when p_amount is null then null else 'USD' end),
          'Application fee waived for campus visitors.', tests.make_source(), 'worker')
  returning id;
$$;

select pg_temp.propose_waiver(:'cycle', 'event', null) as v1 \gset
select tests.authenticate_as(:'admin');
select public.promote_fact_version(:'v1') as fact \gset
select is((select kind from public.fee_waivers where id = :'fact'), 'event', 'the proposed kind is stored');
select is((select amount from public.fee_waivers where id = :'fact'), null, 'a null amount means the whole fee is waived');
select is((select status::text from public.fee_waivers where id = :'fact'), 'verified', 'the waiver is verified');
select is(public.fact_table('fee_waiver'), 'fee_waivers', 'fact_table knows fee waivers');

select tests.as_postgres();
update public.fee_waivers set published = false where id = :'fact';
select tests.as_anon();
select is_empty($$ select 1 from public.fee_waivers $$, 'anon cannot see an unpublished waiver');
select tests.as_postgres();
update public.fee_waivers set published = true where id = :'fact';
select tests.as_anon();
select is((select count(*)::int from public.fee_waivers), 1, 'anon sees a published waiver');
select throws_ok($$ insert into public.fee_waivers (cycle_id, kind) select id, 'event' from public.program_cycles limit 1 $$,
  '42501', null, 'anon cannot insert waivers');

select tests.as_postgres();
select throws_ok(format($$ insert into public.fee_waivers (cycle_id, kind) values (%L, 'free_lunch') $$, :'cycle'),
  '23514', null, 'an unknown waiver kind is rejected');

select * from finish();
rollback;
