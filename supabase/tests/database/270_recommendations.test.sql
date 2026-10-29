begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('rec-a@test.dev') as a \gset
select tests.create_user('rec-b@test.dev') as b \gset
select tests.create_user('rec-mum@test.dev') as mum \gset
select tests.make_program('rec-gb') as cycle \gset

select tests.authenticate_as(:'a');
insert into public.applications (user_id, cycle_id) values (:'a', :'cycle') returning id as app \gset
insert into public.recommenders (user_id, name, relationship) values (:'a', 'Dr Mehta', 'Thesis supervisor') returning id as rec \gset
select lives_ok(format($$ insert into public.recommendation_requests (user_id, recommender_id, application_id, status, due_on) values (%L, %L, %L, 'asked', '2027-01-10') $$, :'a', :'rec', :'app'),
  'a student tracks a letter from their recommender for their application');
select throws_ok(format($$ insert into public.recommendation_requests (user_id, recommender_id, application_id) values (%L, %L, %L) $$, :'a', :'rec', :'app'),
  '23505', null, 'one request per recommender and application');
select throws_ok(format($$ update public.recommendation_requests set status = 'lost' where application_id = %L $$, :'app'),
  '23514', null, 'only known statuses');
select throws_ok($$ insert into public.recommenders (user_id, name) values (auth.uid(), '   ') $$, '23514', null, 'a recommender needs a name');

select tests.authenticate_as(:'b');
insert into public.applications (user_id, cycle_id) values (:'b', :'cycle') returning id as app_b \gset
insert into public.recommenders (user_id, name) values (:'b', 'Prof B') returning id as rec_b \gset
select is_empty($$ select 1 from public.recommenders where name = 'Dr Mehta' $$, 'B cannot see A''s recommenders');
select is_empty($$ select 1 from public.recommendation_requests $$, 'B cannot see A''s requests');
select throws_ok(format($$ insert into public.recommendation_requests (user_id, recommender_id, application_id) values (%L, %L, %L) $$, :'b', :'rec', :'app_b'),
  '42501', null, 'B cannot use A''s recommender');
select throws_ok(format($$ insert into public.recommendation_requests (user_id, recommender_id, application_id) values (%L, %L, %L) $$, :'b', :'rec_b', :'app'),
  '42501', null, 'B cannot file a letter under A''s application');

-- Parents do not see recommenders; the notifier does, to remind the student.
select tests.as_postgres();
insert into public.parent_links (parent_id, student_id, student_name) values (:'mum', :'a', 'A');
select tests.authenticate_as(:'mum');
select is_empty($$ select 1 from public.recommenders $$, 'a linked parent does not see recommenders');
select tests.as_postgres();
set local role notifier;
select is((select count(*)::int from public.recommendation_requests where application_id = :'app'), 1, 'the notifier reads open requests');
reset role;

select * from finish();
rollback;
