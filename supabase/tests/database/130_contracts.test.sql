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

select * from finish();
rollback;
