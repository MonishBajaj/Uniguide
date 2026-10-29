begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('costs-a@test.dev') as a \gset
select tests.create_user('costs-b@test.dev') as b \gset
select tests.create_user('costs-mum@test.dev') as mum \gset
select tests.make_program('costs-gb') as cycle \gset

select tests.authenticate_as(:'a');
insert into public.applications (user_id, cycle_id) values (:'a', :'cycle') returning id as app \gset
select tests.authenticate_as(:'b');
insert into public.applications (user_id, cycle_id) values (:'b', :'cycle') returning id as app_b \gset

select tests.authenticate_as(:'a');
select lives_ok(format($$ insert into public.application_costs (user_id, application_id, kind, amount, currency) values (%L, %L, 'application_fee', 80, 'GBP') $$, :'a', :'app'),
  'a student records a fee on their own application');
select lives_ok(format($$ insert into public.application_costs (user_id, kind, amount, currency) values (%L, 'exam', 250, 'USD') $$, :'a'),
  'a cost need not belong to one application');
select throws_ok(format($$ insert into public.application_costs (user_id, application_id, kind, amount, currency) values (%L, %L, 'deposit', 500, 'GBP') $$, :'a', :'app_b'),
  '42501', null, 'nobody can file a cost under someone else''s application');
select throws_ok(format($$ insert into public.application_costs (user_id, kind, amount, currency) values (%L, 'other', 0, 'GBP') $$, :'a'),
  '23514', null, 'amounts are positive');
select throws_ok(format($$ insert into public.application_costs (user_id, kind, amount, currency) values (%L, 'tuition', 10, 'GBP') $$, :'a'),
  '23514', null, 'only the listed kinds are accepted');

select tests.authenticate_as(:'b');
select is_empty($$ select 1 from public.application_costs $$, 'B cannot see A''s costs');

select tests.as_postgres();
insert into public.parent_links (parent_id, student_id, student_name) values (:'mum', :'a', 'A');
select tests.authenticate_as(:'mum');
select is_empty($$ select 1 from public.application_costs $$, 'costs are private, even from a linked parent');

-- Deleting the application keeps the cost, which was still paid.
select tests.authenticate_as(:'a');
delete from public.applications where id = :'app';
select is((select count(*)::int from public.application_costs where application_id is null), 2, 'a deleted application leaves its costs unfiled');

select * from finish();
rollback;
