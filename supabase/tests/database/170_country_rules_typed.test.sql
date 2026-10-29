begin;
\ir _helpers.psql
select no_plan();

insert into public.admins (user_id) select tests.create_user('admin@test.dev');
select user_id as admin from public.admins a join auth.users u on u.id = a.user_id where u.email = 'admin@test.dev' \gset

select tests.authenticate_as(:'admin');
select lives_ok($$ select public.add_country_rule('XA', 'proof_of_funds', 'Funds', 'https://gov.example/x', 'You must show 1,000 per month.',
  p_amount := 1000, p_currency := 'GBP', p_period := 'per_month', p_months := 9, p_region := 'london') $$, 'a typed proof of funds rule');
select lives_ok($$ select public.add_country_rule('XA', 'post_study_work', 'Stay after study', 'https://gov.example/y', 'Graduates may stay for 2 years.', p_months := 24) $$, 'a post study work rule');
select lives_ok($$ select public.add_country_rule('XA', 'work_hours', 'Part time work', 'https://gov.example/z', 'Students may work 20 hours a week.', p_hours_per_week := 20) $$, 'a work hours rule');
select lives_ok($$ select public.add_country_rule('XA', 'visa_step', 'Apply online', 'https://gov.example/s', 'Step one is to apply online.', p_step := 1) $$, 'a visa step');

select lives_ok($$ select public.add_country_rule('XA', 'banking', 'Opening a student account', 'https://gov.example/bank', 'Students can open an account with a passport and a letter.') $$, 'a banking rule');

select lives_ok($$ select public.add_country_rule('XA', 'credential_evaluation', 'Official credential evaluation', 'https://gov.example/eval', 'Foreign qualifications are assessed by the national agency.') $$, 'a credential evaluation link');

select throws_ok($$ select public.add_country_rule('XA', 'proof_of_funds', 'Bad', 'https://gov.example/b', 'quote text', p_amount := 500) $$,
  '23514', null, 'a proof of funds amount needs a currency and period');
select throws_ok($$ select public.add_country_rule('XA', 'post_study_work', 'Bad', 'https://gov.example/b', 'quote text') $$,
  '23514', null, 'a post study work rule needs months');
select throws_ok($$ select public.add_country_rule('XA', 'work_hours', 'Bad', 'https://gov.example/b', 'quote text') $$,
  '23514', null, 'a work hours rule needs hours per week');

select tests.as_anon();
select is((select count(*)::int from public.country_rules where destination = 'XA'), 6, 'anon reads the published rules');
select is((select amount from public.country_rules where destination = 'XA' and kind = 'proof_of_funds'), 1000::numeric, 'the amount is stored');
select throws_ok($$ insert into public.country_rules (destination, kind, title) values ('XA', 'visa_step', 'x') $$, '42501', null, 'anon cannot insert');

select * from finish();
rollback;
