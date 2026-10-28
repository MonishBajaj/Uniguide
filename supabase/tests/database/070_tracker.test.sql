begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('a@test.dev') as a \gset
select tests.create_user('b@test.dev') as b \gset
select tests.create_user('kid@test.dev', tests.birth_month_for_age(15), 'DE') as kid \gset
insert into public.admins (user_id) select tests.create_user('admin@test.dev');
select user_id as admin from public.admins a join auth.users u on u.id = a.user_id where u.email = 'admin@test.dev' \gset
select tests.make_program('tracker') as cycle \gset
select program_id as program from public.program_cycles where id = :'cycle' \gset

-- Outcomes need their own consent.
select tests.authenticate_as(:'a');
insert into public.applications (user_id, cycle_id, decision) values (:'a', :'cycle', 'admitted');
select id as app from public.applications where user_id = :'a' \gset
select throws_ok(
  format($$ insert into public.outcomes (application_id, user_id, program_id, cycle_id, decision) values (%L, %L, %L, %L, 'admitted') $$,
         :'app', :'a', :'program', :'cycle'),
  '42501', null, 'outcomes cannot be shared without outcomes_research consent'
);
insert into public.consents (user_id, kind, policy_version, method) values (:'a', 'outcomes_research', 'v', 'checkbox');
select lives_ok(
  format($$ insert into public.outcomes (application_id, user_id, program_id, cycle_id, decision) values (%L, %L, %L, %L, 'admitted') $$,
         :'app', :'a', :'program', :'cycle'),
  'with consent the outcome is shared'
);

-- B cannot see A's outcome, notifications, reports or credits.
select tests.as_postgres();
insert into public.notifications (user_id, kind, title) values (:'a', 'fact_changed', 'x');
select tests.authenticate_as(:'b');
select is_empty($$ select 1 from public.outcomes $$, 'B cannot read A''s outcomes');
select is_empty($$ select 1 from public.notifications $$, 'B cannot read A''s notifications');
select throws_ok(
  format($$ insert into public.outcomes (application_id, user_id, program_id, cycle_id, decision) values (%L, %L, %L, %L, 'rejected') $$,
         :'app', :'b', :'program', :'cycle'),
  '42501', null, 'B cannot share an outcome for A''s application'
);

-- Credits are only written by functions.
select throws_ok(
  format($$ insert into public.credit_ledger (user_id, delta, reason) values (%L, 100, 'admin_grant') $$, :'b'),
  '42501', null, 'users cannot grant themselves credits'
);
select throws_ok(format($$ select public.grant_credits(%L, 5) $$, :'b'), '42501', null, 'non-admins cannot call grant_credits');

-- Reports: anyone signed in can file; only admins resolve, and accepted reports earn credits.
insert into public.fact_reports (user_id, program_id, message) values (:'b', :'program', 'Deadline moved to 1 Feb');
select id as report from public.fact_reports where user_id = :'b' \gset
select throws_ok(format($$ select public.resolve_fact_report(%L, true) $$, :'report'), '42501', null, 'non-admins cannot resolve reports');
select tests.authenticate_as(:'admin');
select public.resolve_fact_report(:'report', true);
select tests.authenticate_as(:'b');
select is(public.credit_balance(), 2, 'an accepted report earns 2 credits');
select is((select count(*)::int from public.notifications where kind = 'report_resolved'), 1, 'the reporter is notified');

-- Pending parental consent blocks applications.
select tests.authenticate_as(:'kid');
select throws_ok(
  format($$ insert into public.applications (user_id, cycle_id) values (%L, %L) $$, :'kid', :'cycle'),
  '42501', null, 'pending users cannot create applications'
);

-- Source register: public read, admin write.
select tests.authenticate_as(:'a');
select throws_ok(
  format($$ insert into public.program_sources (program_id, kind, url) values (%L, 'fees', 'https://x.example.org/fees') $$, :'program'),
  '42501', null, 'non-admins cannot edit the source register'
);
select tests.authenticate_as(:'admin');
select lives_ok(
  format($$ insert into public.program_sources (program_id, kind, url) values (%L, 'fees', 'https://x.example.org/fees') $$, :'program'),
  'admins can add official sources'
);

-- Opening intakes is admin-only, and only the newest real intake stays current.
select tests.authenticate_as(:'a');
select throws_ok(format($$ select public.add_program_cycle(%L, 2028::smallint, 'autumn') $$, :'program'), '42501', null, 'non-admins cannot open intakes');
select tests.authenticate_as(:'admin');
select public.add_program_cycle(:'program', 2028::smallint, 'autumn');
select results_eq(
  format($$ select label || ':' || is_current from public.program_cycles where program_id = %L order by label $$, :'program'),
  array['2027-autumn:false', '2028-autumn:true'],
  'the new intake becomes current'
);

-- Demand is aggregate and admin or worker only.
select tests.authenticate_as(:'a');
select throws_ok($$ select * from public.verification_demand() $$, '42501', null, 'students cannot read demand');
select tests.as_worker();
select lives_ok($$ select * from public.verification_demand() $$, 'the worker can read demand');
select lives_ok(format($$ select public.notify_program_watchers(%L, 't', 'b') $$, :'program'), 'the worker can notify watchers');
select throws_ok($$ select * from public.notifications $$, '42501', null, 'the worker cannot read notifications');

-- Notifier role.
select tests.as_postgres();
select set_config('role', 'notifier', true);
select throws_ok($$ select * from public.test_scores $$, '42501', null, 'notifier cannot read test scores');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'notifier cannot read profiles');
select lives_ok($$ select * from public.notifier_recipients() $$, 'notifier gets recipients through the function');

select * from finish();
rollback;
