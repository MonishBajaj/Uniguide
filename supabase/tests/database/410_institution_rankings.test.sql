begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('rank-student@test.dev') as student \gset
insert into public.institutions (id, name, country) values ('00000000-0000-4000-c000-0000000000d1', 'Ranked U', 'US');

select tests.as_worker();
select lives_ok($$ insert into public.institution_rankings (institution_id, subject, rank_low, rank_high, edition)
  values ('00000000-0000-4000-c000-0000000000d1', 'Computer Science & Information Systems', 751, 850, '2026') $$,
  'the worker writes a ranking band');
select throws_ok($$ insert into public.institution_rankings (institution_id, subject, rank_low, rank_high, edition)
  values ('00000000-0000-4000-c000-0000000000d1', 'Computer Science & Information Systems', 5, 5, '2026') $$,
  '23505', null, 'a subject is ranked once per institution and edition');
select lives_ok($$ insert into public.institution_rankings (institution_id, subject, rank_low, rank_high, edition)
  values ('00000000-0000-4000-c000-0000000000d1', 'Computer Science & Information Systems', 5, 5, '2027') $$,
  'another edition of the same subject is a separate row');
select throws_ok($$ insert into public.institution_rankings (institution_id, subject, rank_low, rank_high, edition)
  values ('00000000-0000-4000-c000-0000000000d1', 'Law', 50, 10, '2026') $$,
  '23514', null, 'a band cannot end before it starts');
select lives_ok($$ delete from public.institution_rankings where edition = '2027' $$, 'the worker replaces an edition by deleting it');

reset role;
select tests.authenticate_as(:'student');
select is((select count(*)::int from public.institution_rankings where institution_id = '00000000-0000-4000-c000-0000000000d1'), 1, 'students can read rankings (the app never shows them)');
select throws_ok($$ insert into public.institution_rankings (institution_id, subject, rank_low, rank_high, edition)
  values ('00000000-0000-4000-c000-0000000000d1', 'Law', 1, 1, '2026') $$, '42501', null, 'students cannot write rankings');

reset role;
select tests.as_anon();
select is((select count(*)::int from public.institution_rankings where institution_id = '00000000-0000-4000-c000-0000000000d1'), 0, 'visitors cannot read rankings: only signed-in students can');

select * from finish();
rollback;
