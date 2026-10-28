begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('cv-a@test.dev') as a \gset
select tests.create_user('cv-b@test.dev') as b \gset
select tests.create_user('cv-mum@test.dev') as mum \gset
select tests.create_user('cv-teen@test.dev', tests.birth_month_for_age(15), 'DE') as teen \gset

select tests.authenticate_as(:'a');
insert into public.cv_headers (user_id, full_name) values (:'a', 'Asha Rao');
select lives_ok(format($$ insert into public.cv_entries (user_id, section, title, start_month, bullets) values (%L, 'experience', 'Data intern', '2025-06-01', '{"Built a dashboard used by 40 staff"}') $$, :'a'),
  'a student adds a CV entry');
select throws_ok(format($$ insert into public.cv_entries (user_id, section, title, start_month, end_month) values (%L, 'experience', 'X', '2025-06-01', '2025-01-01') $$, :'a'),
  '23514', null, 'an entry cannot end before it starts');
select throws_ok(format($$ insert into public.cv_entries (user_id, section, title, start_month) values (%L, 'experience', 'X', '2025-06-15') $$, :'a'),
  '23514', null, 'months are stored as the first of the month');
select throws_ok(format($$ insert into public.cv_entries (user_id, section, title) values (%L, 'hobbies', 'X') $$, :'a'),
  '23514', null, 'only known sections');
select throws_ok(format($$ insert into public.cv_entries (user_id, section, title, bullets) values (%L, 'other', 'X', (select array_agg('b'::text) from generate_series(1, 9))) $$, :'a'),
  '23514', null, 'at most eight bullets');

select tests.authenticate_as(:'b');
select is_empty($$ select 1 from public.cv_entries union all select 1 from public.cv_headers $$, 'B cannot read A''s CV');

select tests.as_postgres();
insert into public.parent_links (parent_id, student_id, student_name) values (:'mum', :'a', 'A');
select tests.authenticate_as(:'mum');
select is_empty($$ select 1 from public.cv_entries $$, 'a linked parent does not see the CV');

select tests.authenticate_as(:'teen');
select throws_ok(format($$ insert into public.cv_entries (user_id, section, title) values (%L, 'other', 'X') $$, :'teen'), '42501', null, 'pending parental consent blocks saving');

select * from finish();
rollback;
