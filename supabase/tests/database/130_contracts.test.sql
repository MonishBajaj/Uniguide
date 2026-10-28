begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('payer@test.dev') as payer \gset
select tests.as_anon();
select is(public.my_entitlement(), 'none', 'anonymous visitors have no entitlement');
select is_empty($$ select * from public.course_fee_waivers(gen_random_uuid()) $$, 'anon gets no fee waivers until M2');
select tests.authenticate_as(:'payer');
select is(public.my_entitlement(), 'free', 'signed-in users are free until payments ship');
select is_empty($$ select * from public.course_fee_waivers(gen_random_uuid()) $$, 'no fee waivers until M2');
select has_function('public', 'course_fee_waivers', array['uuid'], 'the signature the web app builds against exists');

select tests.as_postgres();
select ok(has_function_privilege('anon', 'public.my_entitlement()', 'EXECUTE'), 'anon can call my_entitlement');
select ok(has_function_privilege('authenticated', 'public.my_entitlement()', 'EXECUTE'), 'authenticated can call my_entitlement');
select ok(not has_function_privilege('public', 'public.my_entitlement()', 'EXECUTE'), 'public cannot call my_entitlement');
select ok(has_function_privilege('anon', 'public.course_fee_waivers(uuid)', 'EXECUTE'), 'anon can call course_fee_waivers');
select ok(not has_function_privilege('public', 'public.course_fee_waivers(uuid)', 'EXECUTE'), 'public cannot call course_fee_waivers');

-- Real rows (course_fee_waivers reads published waivers of current and future intakes).
select tests.as_postgres();
select tests.make_program('waiver-a') as cyc_a \gset
select tests.make_program('waiver-b') as cyc_b \gset
select program_id as prog_a from public.program_cycles where id = :'cyc_a' \gset
insert into public.program_cycles (program_id, label, intake_year, intake_term) values (:'prog_a', '2020-autumn', 2020, 'autumn') returning id as cyc_old \gset
insert into public.program_cycles (program_id, label, intake_year, intake_term, is_current) values (:'prog_a', '2027-spring', 2027, 'spring', false) returning id as cyc_stale \gset
insert into public.fee_waivers (cycle_id, kind, amount, currency, conditions, published, status) values
  (:'cyc_a', 'event', null, null, 'Attend a campus visit', true, 'verified'),
  (:'cyc_a', 'need_based', 50, 'USD', null, true, 'unverified'),
  (:'cyc_a', 'on_request', null, null, 'unpublished', false, 'unverified'),
  (:'cyc_old', 'automatic', null, null, 'past intake', true, 'verified'),
  (:'cyc_b', 'automatic', null, null, 'other program', true, 'verified'),
  (:'cyc_stale', 'automatic', null, null, 'superseded intake', true, 'verified');
select tests.as_anon();
select results_eq(format($$ select kind, amount from public.course_fee_waivers(%L) $$, :'prog_a'),
  $$ values ('event'::text, null::numeric), ('need_based'::text, 50::numeric) $$,
  'published waivers of current intakes, ordered by kind');
select is_empty(format($$ select 1 from public.course_fee_waivers(%L) where conditions in ('past intake', 'superseded intake') $$, :'prog_a'), 'past and superseded intakes are not returned');

select * from finish();
rollback;
