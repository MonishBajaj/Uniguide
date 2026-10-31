begin;
\ir _helpers.psql
select no_plan();

-- Application assist M7 (A1.6): the per-student limit on suggested roles. Labels are never stored.
select tests.create_user('rs-a@test.dev') as a \gset
select tests.create_user('rs-b@test.dev') as b \gset
select tests.create_user('rs-kid@test.dev', tests.birth_month_for_age(14)) as kid \gset
update public.profiles set consent_state = 'pending_parental' where user_id = :'kid';

select ok((select relrowsecurity from pg_class where oid = 'public.role_suggestion_calls'::regclass), 'row-level security is on');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'role_suggestion_calls'),
  3, 'only who and when: no label, no role, no value');
select ok(not has_function_privilege('anon', 'public.take_role_suggestion()', 'execute'), 'signed-out callers can''t take a suggestion');

select tests.authenticate_as(:'a');
select is(public.take_role_suggestion(), 'ok', 'a student with consent may ask');
select is((select count(*)::int from public.role_suggestion_calls), 1, 'the student sees their own call');
select throws_ok($$insert into public.role_suggestion_calls (user_id) values (auth.uid())$$, '42501', null,
  'calls are recorded only through the function');

-- 30 an hour.
do $$ begin perform public.take_role_suggestion() from generate_series(1, 29); end $$;
select is(public.take_role_suggestion(), 'limit', 'the 31st call within an hour is refused');
select is((select count(*)::int from public.role_suggestion_calls), 30, 'a refused call isn''t recorded');

select tests.authenticate_as(:'b');
select is((select count(*)::int from public.role_suggestion_calls), 0, 'another student sees none of them');
select is(public.take_role_suggestion(), 'ok', 'each student has their own limit');

-- No feature while consent is pending or revoked (rule 8).
select tests.authenticate_as(:'kid');
select is(public.take_role_suggestion(), 'consent', 'no suggestions while consent is pending');
reset role;
update public.profiles set consent_state = 'revoked' where user_id = :'b';
select tests.authenticate_as(:'b');
select is(public.take_role_suggestion(), 'consent', 'nor once consent is revoked');

-- Older calls stop counting.
reset role;
update public.role_suggestion_calls set at = now() - interval '2 hours' where user_id = :'a';
select tests.authenticate_as(:'a');
select is(public.take_role_suggestion(), 'ok', 'calls more than an hour old don''t count towards the hourly limit');

select * from finish();
rollback;
