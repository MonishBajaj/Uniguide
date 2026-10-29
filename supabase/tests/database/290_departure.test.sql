begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('dep-a@test.dev') as a \gset
select tests.create_user('dep-b@test.dev') as b \gset
select tests.create_user('dep-mum@test.dev') as mum \gset
select tests.make_program('dep-one') as c1 \gset
select tests.make_program('dep-two') as c2 \gset
select tests.make_program('dep-three') as c3 \gset

select tests.authenticate_as(:'a');
insert into public.applications (user_id, cycle_id, decision) values (:'a', :'c1', 'admitted') returning id as app1 \gset
insert into public.applications (user_id, cycle_id, decision) values (:'a', :'c2', 'admitted') returning id as app2 \gset
insert into public.applications (user_id, cycle_id, decision) values (:'a', :'c3', 'rejected') returning id as app3 \gset

select lives_ok(format('select public.set_accepted_offer(%L)', :'app1'), 'a student accepts an admitted offer');
select throws_ok(format('select public.set_accepted_offer(%L)', :'app3'), '42501', null, 'a rejected application cannot be accepted');
select lives_ok(format('select public.set_accepted_offer(%L)', :'app2'), 'accepting another offer switches to it');
select results_eq($$ select count(*)::int from public.applications where offer_accepted_at is not null $$, array[1], 'only one offer is accepted at a time');
select results_eq(format($$ select offer_accepted_at is not null from public.applications where id = %L $$, :'app2'), array[true], 'the newest choice is the accepted one');

select lives_ok(format($$ insert into public.departure_tasks (user_id, application_id, task_key) values (%L, %L, 'accommodation') $$, :'a', :'app2'), 'a student ticks a task');
select lives_ok(format($$ insert into public.departure_tasks (user_id, application_id, task_key) values (%L, %L, 'rule:%s') $$, :'a', :'app2', gen_random_uuid()), 'country rule tasks use the rule id');
select throws_ok(format($$ insert into public.departure_tasks (user_id, application_id, task_key) values (%L, %L, 'accommodation') $$, :'a', :'app2'), '23505', null, 'a task is ticked once');
select throws_ok(format($$ insert into public.departure_tasks (user_id, application_id, task_key) values (%L, %L, 'Bad Key!') $$, :'a', :'app2'), '23514', null, 'task keys are checked');
select throws_ok(format($$ update public.departure_tasks set done_at = now() where application_id = %L $$, :'app2'), '42501', null, 'ticks are not edited, only added or removed');

select tests.authenticate_as(:'b');
insert into public.applications (user_id, cycle_id, decision) values (:'b', :'c1', 'admitted') returning id as app_b \gset
select throws_ok(format('select public.set_accepted_offer(%L)', :'app1'), '42501', null, 'B cannot accept A''s offer');
select is_empty($$ select 1 from public.departure_tasks $$, 'B cannot read A''s tasks');
select throws_ok(format($$ insert into public.departure_tasks (user_id, application_id, task_key) values (%L, %L, 'flights') $$, :'b', :'app2'), '42501', null, 'B cannot tick tasks on A''s application');
select lives_ok('select public.set_accepted_offer(null)', 'clearing is allowed');
select results_eq(format($$ select offer_accepted_at is not null from public.applications where id = %L $$, :'app2'), array[]::boolean[], 'B still cannot see A''s application');

select tests.as_postgres();
select results_eq(format($$ select offer_accepted_at is not null from public.applications where id = %L $$, :'app2'), array[true], 'B clearing their own choice leaves A''s alone');
insert into public.parent_links (parent_id, student_id, student_name) values (:'mum', :'a', 'A');
select tests.authenticate_as(:'mum');
select is_empty($$ select 1 from public.departure_tasks $$, 'a linked parent does not see the checklist');

select tests.authenticate_as(:'a');
select lives_ok(format($$ delete from public.departure_tasks where application_id = %L and task_key = 'accommodation' $$, :'app2'), 'a student unticks a task');

select * from finish();
rollback;
