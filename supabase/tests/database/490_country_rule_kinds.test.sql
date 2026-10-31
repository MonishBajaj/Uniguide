begin;
\ir _helpers.psql
select no_plan();

-- Journey M5 (J5.5): the new rule kinds and lead times, which need their own quote.
select tests.create_user('crk-admin@test.dev') as admin \gset
select tests.create_user('crk-student@test.dev') as student \gset
insert into public.admins (user_id) values (:'admin');

select tests.authenticate_as(:'admin');
select lives_ok($$ select public.add_country_rule('DE', 'health_insurance', 'Health insurance for students', 'https://example.gov.de/insurance',
  'Students must have health insurance to enrol.', p_lead_days => 60, p_lead_days_quote => 'Apply at least two months before you arrive.') $$,
  'an admin adds a health insurance rule with a lead time');
select lives_ok($$ select public.add_country_rule('DE', 'residence_registration', 'Register your address', 'https://example.gov.de/register',
  'Register within 14 days of moving in.') $$, 'and a registration rule');
select lives_ok($$ select public.add_country_rule('DE', 'housing', 'Student housing', 'https://example.gov.de/housing', 'Apply early.') $$, 'and housing');
select throws_ok($$ select public.add_country_rule('DE', 'housing', 'X rule', 'https://example.gov.de/x', 'Some quote.', p_lead_days => 30) $$,
  '23514', null, 'a lead time needs its own quote');
select throws_ok($$ select public.add_country_rule('DE', 'weather', 'X rule', 'https://example.gov.de/x', 'Some quote.') $$,
  '23514', null, 'unknown kinds are still refused');

select tests.authenticate_as(:'student');
select throws_ok($$ select public.add_country_rule('DE', 'housing', 'X rule', 'https://example.gov.de/x', 'Some quote.') $$,
  '42501', null, 'students cannot add rules');
update public.profiles set target_countries = '{DE}' where user_id = :'student';
select is(jsonb_path_query_first(public.journey_snapshot(), '$.countryRules[*] ? (@.kind == "health_insurance").leadDays'), '60'::jsonb,
  'the snapshot carries the lead time');

select * from finish();
rollback;
