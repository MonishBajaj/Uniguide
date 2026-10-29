begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('idx-admin@test.dev') as admin \gset
select tests.create_user('idx-student@test.dev') as student \gset
insert into public.admins (user_id) values (:'admin');

insert into public.institutions (id, name, country, official_domain) values ('00000000-0000-4000-c000-0000000000a1', 'Index U', 'US', 'index.example.org');
insert into public.programs (id, institution_id, slug, title, level, published, suggestion_status) values
  ('00000000-0000-4000-c000-0000000000b1', '00000000-0000-4000-c000-0000000000a1', 'idx-sugg-1', 'Suggested One', 'master', false, 'pending'),
  ('00000000-0000-4000-c000-0000000000b2', '00000000-0000-4000-c000-0000000000a1', 'idx-sugg-2', 'Suggested Two', 'master', false, 'pending'),
  ('00000000-0000-4000-c000-0000000000b3', '00000000-0000-4000-c000-0000000000a1', 'idx-plain', 'Plain', 'master', true, null);

select tests.as_worker();
select lives_ok($$ insert into public.institution_indexes (institution_id, url, active) values ('00000000-0000-4000-c000-0000000000a1', 'https://index.example.org/programs', true) $$, 'the worker registers an index');
select lives_ok($$ update public.institution_indexes set content_hash = 'abc', last_checked_at = now() $$, 'and records a crawl');
select throws_ok($$ insert into public.institution_indexes (institution_id, url) values ('00000000-0000-4000-c000-0000000000a1', 'https://index.example.org/programs') $$, '23505', null, 'an index URL is registered once per institution');

reset role;
select tests.authenticate_as(:'student');
select is((select count(*)::int from public.institution_indexes), 0, 'students cannot read indexes');
select is((select count(*)::int from public.programs where slug like 'idx-%'), 1, 'students see published courses only');
select throws_ok($$ select public.review_suggested_course('00000000-0000-4000-c000-0000000000b1', true) $$, '42501', null, 'students cannot approve suggestions');

reset role;
select tests.authenticate_as(:'admin');
select is((select count(*)::int from public.institution_indexes), 1, 'admins read indexes');
select is((select count(*)::int from public.programs where slug like 'idx-sugg-%'), 2, 'admins see pending suggestions');
select lives_ok($$ select public.review_suggested_course('00000000-0000-4000-c000-0000000000b1', true) $$, 'an admin approves a suggestion');
select is((select published from public.programs where slug = 'idx-sugg-1'), true, 'approval publishes it');
select is((select suggestion_status from public.programs where slug = 'idx-sugg-1'), 'approved', 'and records the decision');
select lives_ok($$ select public.review_suggested_course('00000000-0000-4000-c000-0000000000b2', false) $$, 'an admin rejects one');
select is((select published from public.programs where slug = 'idx-sugg-2'), false, 'rejection keeps it hidden');
select is((select suggestion_status from public.programs where slug = 'idx-sugg-2'), 'rejected', 'and records the decision');
select throws_ok($$ select public.review_suggested_course('00000000-0000-4000-c000-0000000000b3', true) $$, 'P0002', null, 'only suggested courses can be reviewed');
select throws_ok($$ select public.review_suggested_course('00000000-0000-4000-c000-0000000000b1', true) $$, 'P0002', null, 'a decided suggestion cannot be decided again');

select * from finish();
rollback;
