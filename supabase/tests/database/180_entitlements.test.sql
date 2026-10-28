begin;
\ir _helpers.psql
select no_plan();

insert into public.payment_config (webhook_token_hash) values (encode(extensions.digest('good-token', 'sha256'), 'hex'))
  on conflict (id) do update set webhook_token_hash = excluded.webhook_token_hash;
insert into public.admins (user_id) select tests.create_user('admin@test.dev');
select user_id as admin from public.admins a join auth.users u on u.id = a.user_id where u.email = 'admin@test.dev' \gset
select tests.create_user('buyer@test.dev') as buyer \gset
select tests.create_user('other@test.dev') as other \gset

select tests.as_anon();
select throws_ok(format($$ select public.record_payment('bad-token', 'stripe', 'pay_1', %L, 19, 'USD') $$, :'buyer'), '42501', null, 'a wrong token is refused');
select tests.as_postgres();
select is((select count(*)::int from public.entitlements), 0, 'and nothing was written');
select tests.as_anon();

select public.record_payment('good-token', 'stripe', 'pay_1', :'buyer', 19, 'USD') as ent \gset
select tests.as_postgres();
select is((select count(*)::int from public.entitlements where user_id = :'buyer'), 1, 'the right token creates one entitlement');
select is((select ends_at > now() + interval '11 months' from public.entitlements where id = :'ent'), true, 'a pass lasts about a year');

select tests.as_anon();
select is(public.record_payment('good-token', 'stripe', 'pay_1', :'buyer', 19, 'USD'), :'ent'::uuid, 'replayed payment id is a no-op');
select tests.as_postgres();
select is((select count(*)::int from public.entitlements), 1, 'and still one row');

select tests.authenticate_as(:'buyer');
select is((select count(*)::int from public.entitlements), 1, 'a student sees their own entitlement');
select tests.authenticate_as(:'other');
select is_empty($$ select 1 from public.entitlements $$, 'and not anyone else''s');
select throws_ok($$ select * from public.payment_config $$, '42501', null, 'nobody can read the payment config');
select throws_ok($$ select public.refund_payment(gen_random_uuid()) $$, '42501', null, 'only admins refund');

select tests.authenticate_as(:'admin');
select public.refund_payment(:'ent');
select tests.as_postgres();
select isnt((select refunded_at from public.entitlements where id = :'ent'), null, 'an admin marks a payment refunded');

select * from finish();
rollback;
