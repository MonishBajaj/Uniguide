begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('rank-order@test.dev') as student \gset

-- Names sort A < B < C < D, ranks sort C (3) < B (50); A is unranked; D is ranked only in another subject.
insert into public.institutions (id, name, country) values
  ('00000000-0000-4000-c000-0000000000e1', 'Zrank A Unranked U', 'US'),
  ('00000000-0000-4000-c000-0000000000e2', 'Zrank B Rank 50 U', 'US'),
  ('00000000-0000-4000-c000-0000000000e3', 'Zrank C Rank 3 U', 'US'),
  ('00000000-0000-4000-c000-0000000000e4', 'Zrank D Law U', 'US');
insert into public.programs (institution_id, slug, title, level, isced_f, published, coverage_tier) values
  ('00000000-0000-4000-c000-0000000000e1', 'zrank-a', 'MS Computing', 'master', '0613', true, 'listed'),
  ('00000000-0000-4000-c000-0000000000e2', 'zrank-b', 'MS Computing', 'master', '0613', true, 'listed'),
  ('00000000-0000-4000-c000-0000000000e3', 'zrank-c', 'MS Computing', 'master', '0613', true, 'listed'),
  ('00000000-0000-4000-c000-0000000000e4', 'zrank-d', 'MS Computing', 'master', '0613', true, 'listed'),
  ('00000000-0000-4000-c000-0000000000e3', 'zrank-c-eng', 'MS Engineering', 'master', '0714', true, 'listed');
insert into public.institution_rankings (institution_id, subject, rank_low, rank_high, edition) values
  ('00000000-0000-4000-c000-0000000000e2', 'Computer Science & Information Systems', 50, 50, '2026'),
  ('00000000-0000-4000-c000-0000000000e3', 'Data Science and Artificial Intelligence', 3, 3, '2026'),
  ('00000000-0000-4000-c000-0000000000e4', 'Law', 9, 9, '2026');

reset role;
select tests.authenticate_as(:'student');
select results_eq($$ select slug from public.search_programs(p_query => 'zrank', p_fields => '{06}',
    p_rank_subjects => '{"Computer Science & Information Systems","Data Science and Artificial Intelligence"}') $$,
  $$ values ('zrank-c'), ('zrank-b'), ('zrank-a'), ('zrank-d') $$,
  'best rank first across the subjects, unranked and other-subject institutions after, other fields excluded');
select results_eq($$ select slug from public.search_programs(p_query => 'zrank', p_fields => '{06}') $$,
  $$ values ('zrank-a'), ('zrank-b'), ('zrank-c'), ('zrank-d') $$,
  'without rank subjects the order is by name, as before');
select results_eq($$ select slug from public.search_programs(p_query => 'zrank', p_fields => '{06}', p_rank_subjects => '{}') $$,
  $$ values ('zrank-a'), ('zrank-b'), ('zrank-c'), ('zrank-d') $$,
  'an empty subject list also keeps the name order');
select results_eq($$ select slug from public.search_programs(p_query => 'zrank', p_fields => '{06}', p_rank_subjects => '{"Music"}') $$,
  $$ values ('zrank-a'), ('zrank-b'), ('zrank-c'), ('zrank-d') $$,
  'a subject nobody is ranked in leaves the name order');

reset role;
update public.programs set coverage_tier = 'extracted' where slug = 'zrank-a';
reset role;
select tests.authenticate_as(:'student');
select is((select slug from public.search_programs(p_query => 'zrank', p_fields => '{06}',
    p_rank_subjects => '{"Computer Science & Information Systems"}') limit 1), 'zrank-a',
  'a course with better coverage still comes before a ranked course with less');

-- p_per_institution keeps the first courses of each institution so one university cannot fill the pool.
reset role;
update public.programs set coverage_tier = 'listed' where slug = 'zrank-a';
insert into public.programs (institution_id, slug, title, level, isced_f, published, coverage_tier) values
  ('00000000-0000-4000-c000-0000000000e3', 'zrank-c-2', 'MS Computing 2', 'master', '0613', true, 'listed'),
  ('00000000-0000-4000-c000-0000000000e3', 'zrank-c-3', 'MS Computing 3', 'master', '0613', true, 'listed');
reset role;
select tests.authenticate_as(:'student');
select is((select count(*)::int from public.search_programs(p_query => 'zrank', p_fields => '{06}')), 6,
  'without a cap every matching course is returned');
select results_eq($$ select slug from public.search_programs(p_query => 'zrank', p_fields => '{06}', p_per_institution => 2,
    p_rank_subjects => '{"Data Science and Artificial Intelligence"}') $$,
  $$ values ('zrank-c'), ('zrank-c-2'), ('zrank-a'), ('zrank-b'), ('zrank-d') $$,
  'at most two courses per institution, best-ranked institution first, the rest in rank then name order');

-- Only the newest edition counts, so a re-import for a later year does not mix old ranks in.
reset role;
insert into public.institution_rankings (institution_id, subject, rank_low, rank_high, edition) values
  ('00000000-0000-4000-c000-0000000000e1', 'Law', 1, 1, '2098'),
  ('00000000-0000-4000-c000-0000000000e1', 'Law', 90, 90, '2099'),
  ('00000000-0000-4000-c000-0000000000e4', 'Law', 20, 20, '2099');
select tests.authenticate_as(:'student');
select results_eq($$ select slug from public.search_programs(p_query => 'zrank', p_fields => '{06}', p_rank_subjects => '{"Law"}', p_per_institution => 1) limit 2 $$,
  $$ values ('zrank-d'), ('zrank-a') $$,
  'the newest edition decides: A was first in 2098 but 90th in 2099, D is 20th');

-- Courses that tie on everything else come back in id order, so results do not change between page loads.
reset role;
insert into public.programs (id, institution_id, slug, title, level, isced_f, published, coverage_tier) values
  ('ffffffff-0000-4000-8000-000000000001', '00000000-0000-4000-c000-0000000000e1', 'zrank-tie-late', 'ZZ Tied course', 'master', '0613', true, 'listed'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-4000-c000-0000000000e1', 'zrank-tie-early', 'ZZ Tied course', 'master', '0613', true, 'listed');
select tests.authenticate_as(:'student');
select results_eq($$ select slug from public.search_programs(p_query => 'ZZ Tied course') $$,
  $$ values ('zrank-tie-early'), ('zrank-tie-late') $$, 'tied courses are ordered by id');

select * from finish();
rollback;
