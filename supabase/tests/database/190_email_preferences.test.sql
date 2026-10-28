begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('mail1@test.dev') as a \gset
select tests.create_user('mail2@test.dev') as b \gset

select tests.as_postgres();
select is((select count(*)::int from public.email_preferences where user_id in (:'a', :'b')), 2, 'a new user gets a preferences row');
select is((select digest and tips from public.email_preferences where user_id = :'a'), true, 'both on by default');
select unsubscribe_token as tok_a from public.email_preferences where user_id = :'a' \gset

select tests.authenticate_as(:'b');
select is((select count(*)::int from public.email_preferences), 1, 'a user reads only their own row');
select is_empty(format($$ select 1 from public.email_preferences where user_id = %L $$, :'a'), 'not anyone else''s');

select tests.as_anon();
select is(public.unsubscribe('wrong-token', 'digest'), false, 'a wrong token changes nothing');
select is(public.unsubscribe(:'tok_a', 'digest'), true, 'the token turns off the digest');
select tests.as_postgres();
select is((select digest::text || tips::text from public.email_preferences where user_id = :'a'), 'falsetrue', 'only the digest went off');
select tests.as_anon();
select is(public.unsubscribe(:'tok_a', 'all'), true, 'all turns off everything');
select tests.as_postgres();
select is((select digest::text || tips::text from public.email_preferences where user_id = :'a'), 'falsefalse', 'digest and tips are both off');
select tests.as_anon();
select throws_ok(format($$ select public.unsubscribe(%L, 'reminders') $$, :'tok_a'), '22023', null, 'an unknown kind is refused');

select * from finish();
rollback;
