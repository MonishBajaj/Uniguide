begin;
\ir _helpers.psql
select no_plan();

insert into public.admins (user_id) select tests.create_user('admin@test.dev');
select user_id as admin from public.admins a join auth.users u on u.id = a.user_id where u.email = 'admin@test.dev' \gset
select tests.create_user('gb-verifier@test.dev') as gbv \gset
select tests.create_user('de-verifier@test.dev') as dev \gset
select tests.make_program('inst-facts-a') as cyc_a \gset
select tests.make_program('inst-facts-b') as cyc_b \gset
select institution_id as inst, p.id as prog_a from public.programs p join public.program_cycles c on c.program_id = p.id where c.id = :'cyc_a' \gset
select p.id as prog_b from public.programs p join public.program_cycles c on c.program_id = p.id where c.id = :'cyc_b' \gset
update public.institutions set official_domain = 'test.ac.uk' where id = :'inst';
insert into public.verifiers (user_id, display_name, countries) values (:'gbv', 'G', '{GB}'), (:'dev', 'D', '{DE}');

select tests.authenticate_as(:'admin');
select lives_ok(format($$ select public.add_institution_fact(%L, 'assistantship', 'Teaching assistantships', 'https://funding.test.ac.uk/ta', 'Teaching assistants receive a stipend.',
  p_amount := 1800, p_currency := 'GBP', p_period := 'per_month') $$, :'inst'), 'an admin adds an institution fact');
select lives_ok(format($$ select public.add_institution_fact(%L, 'housing_on_campus', 'Halls', 'https://test.ac.uk/housing', 'Halls cost 700 a month.',
  p_program := %L, p_amount := 700, p_currency := 'GBP', p_period := 'per_month') $$, :'inst', :'prog_a'), 'a fact tied to one program');
select throws_ok(format($$ select public.add_institution_fact(%L, 'assistantship', 'Off site', 'https://example.com/x', 'quote text') $$, :'inst'),
  '22023', null, 'a source outside the institution''s official domain is refused');
select throws_ok(format($$ select public.add_institution_fact(%L, 'assistantship', 'Bad amount', 'https://test.ac.uk/x', 'quote text', p_amount := 5) $$, :'inst'),
  '23514', null, 'an amount needs a currency and a period');
select throws_ok(format($$ select public.add_institution_fact(%L, 'free_lunch', 'Bad kind', 'https://test.ac.uk/x', 'quote text') $$, :'inst'),
  '23514', null, 'an unknown kind is refused');

select tests.authenticate_as(:'dev');
select throws_ok(format($$ select public.add_institution_fact(%L, 'assistantship', 'x', 'https://test.ac.uk/x', 'quote text') $$, :'inst'),
  '42501', null, 'a verifier for another country cannot add');
select tests.authenticate_as(:'gbv');
select lives_ok(format($$ select public.add_institution_fact(%L, 'transit_pass', 'Bus pass', 'https://test.ac.uk/bus', 'Bus pass is 50 a term.', p_amount := 50, p_currency := 'GBP', p_period := 'per_term') $$, :'inst'),
  'a verifier for the country adds');
select public.verify_institution_fact(id) from public.institution_facts where kind = 'assistantship';
select tests.as_postgres();
select is((select status::text from public.institution_facts where kind = 'assistantship'), 'verified', 'a verifier verifies a fact');

select tests.as_anon();
select is((select count(*)::int from public.institution_facts where institution_id = :'inst'), 3, 'anon reads published facts');
select throws_ok($$ insert into public.institution_facts (institution_id, kind, title, evidence_quote) select id, 'airport', 'x', 'quote text' from public.institutions limit 1 $$,
  '42501', null, 'anon cannot insert');
select tests.authenticate_as(:'dev');
select throws_ok(format($$ select public.verify_institution_fact(%L) $$, (select id from public.institution_facts where kind = 'transit_pass')),
  '42501', null, 'a verifier for another country cannot verify');

select * from finish();
rollback;
