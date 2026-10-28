begin;
\ir _helpers.psql
select no_plan();

select tests.as_anon();
select lives_ok(
  $$ insert into public.signups (email, residence_country, destination_countries, target_level, interest, confirmed_13_plus)
     values ('Visitor@Example.com', 'IN', '{GB,DE}', 'master', 'verified_tracker', true) $$,
  'anon can join the waitlist'
);
select is_empty($$ select 1 from public.signups $$, 'anon cannot read the waitlist');
select throws_ok(
  $$ insert into public.signups (email, target_level, interest, confirmed_13_plus)
     values ('visitor@example.com', 'bachelor', 'writing_coach', true) $$,
  '23505', null, 'the same email (any case) cannot join twice'
);
select throws_ok(
  $$ insert into public.signups (email, target_level, interest, confirmed_13_plus)
     values ('kid@example.com', 'bachelor', 'writing_coach', false) $$,
  '23514', null, 'visitors must confirm they are 13 or older'
);
select throws_ok($$ update public.signups set email = 'x@y.z' $$, '42501', null, 'anon cannot edit the waitlist');
select throws_ok($$ delete from public.signups $$, '42501', null, 'anon cannot delete from the waitlist');

select tests.as_postgres();
select tests.create_user('user@test.dev') as someone \gset
select tests.authenticate_as(:'someone');
select is_empty($$ select 1 from public.signups $$, 'signed-in users cannot read the waitlist');

select * from finish();
rollback;
