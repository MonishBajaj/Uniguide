begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('scores-a@test.dev') as a \gset
select tests.create_user('scores-b@test.dev') as b \gset
select tests.create_user('scores-mum@test.dev') as mum \gset
select tests.make_program('scores-gb') as cycle \gset

select tests.authenticate_as(:'a');
insert into public.applications (user_id, cycle_id) values (:'a', :'cycle') returning id as app \gset
insert into public.test_scores (user_id, exam, total) values (:'a', 'ielts_academic', 7.5) returning id as ielts \gset
select tests.authenticate_as(:'b');
insert into public.applications (user_id, cycle_id) values (:'b', :'cycle') returning id as app_b \gset
insert into public.test_scores (user_id, exam, total) values (:'b', 'gre', 320) returning id as gre_b \gset

select tests.authenticate_as(:'a');
select lives_ok(format($$ insert into public.score_reports (user_id, application_id, test_score_id, sent_on) values (%L, %L, %L, '2026-12-01') $$, :'a', :'app', :'ielts'),
  'a student records sending their own score to their own application');
select throws_ok(format($$ insert into public.score_reports (user_id, application_id, test_score_id, sent_on) values (%L, %L, %L, '2026-12-02') $$, :'a', :'app', :'ielts'),
  '23505', null, 'the same score is recorded once per application');
select throws_ok(format($$ update public.score_reports set received_on = '2026-11-30' where application_id = %L $$, :'app'),
  '23514', null, 'a score cannot arrive before it was sent');
select lives_ok(format($$ update public.score_reports set received_on = '2026-12-08' where application_id = %L $$, :'app'), 'receipt is recorded');
select throws_ok(format($$ insert into public.score_reports (user_id, application_id, test_score_id, sent_on) values (%L, %L, %L, '2026-12-01') $$, :'a', :'app', :'gre_b'),
  '42501', null, 'nobody can attach someone else''s score');
select throws_ok(format($$ insert into public.score_reports (user_id, application_id, test_score_id, sent_on) values (%L, %L, %L, '2026-12-01') $$, :'a', :'app_b', :'ielts'),
  '42501', null, 'nobody can attach a score to someone else''s application');

select tests.authenticate_as(:'b');
select is_empty($$ select 1 from public.score_reports $$, 'B cannot see A''s score reports');

-- Parents never see scores; counselors with a share do.
select tests.as_postgres();
insert into public.parent_links (parent_id, student_id, student_name) values (:'mum', :'a', 'A');
select tests.authenticate_as(:'mum');
select is_empty($$ select 1 from public.score_reports $$, 'a linked parent does not see score reports');

-- Deleting the score or the application removes the report.
select tests.authenticate_as(:'a');
delete from public.test_scores where id = :'ielts';
select is_empty($$ select 1 from public.score_reports $$, 'deleting the score removes its reports');

select * from finish();
rollback;
