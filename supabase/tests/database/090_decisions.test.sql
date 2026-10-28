begin;
\ir _helpers.psql
select no_plan();

insert into public.admins (user_id) select tests.create_user('admin@test.dev');
select user_id as admin from public.admins a join auth.users u on u.id = a.user_id where u.email = 'admin@test.dev' \gset
select tests.create_user('s1@test.dev') as a \gset
select tests.create_user('s2@test.dev') as b \gset
select tests.make_program('decide-msc') as cycle \gset
select program_id as prog from public.program_cycles where id = :'cycle' \gset

-- Country rules: only admins add or verify, and a quote is required.
select tests.authenticate_as(:'a');
select throws_ok($$ select public.add_country_rule('DE', 'other', 'x', 'https://example.gov/', 'quote') $$, '42501', null, 'students cannot add rules');
select throws_ok($$ insert into public.country_rules (destination, kind, title) values ('DE', 'other', 'x') $$, '42501', null, 'students cannot insert rules directly');
select tests.authenticate_as(:'admin');
select throws_ok($$ select public.add_country_rule('DE', 'other', 'x', 'https://example.gov/', '  ') $$, '22023', null, 'a rule needs its quote');
select public.add_country_rule('de', 'proof_of_funds', 'Blocked account', 'https://example.gov/funds', 'You need a blocked account.', '{IN}') as rule \gset
select is((select status::text from public.country_rules where id = :'rule'), 'unverified', 'new rules start unverified');
select tests.authenticate_as(:'a');
select throws_ok(format($$ select public.verify_country_rule(%L) $$, :'rule'), '42501', null, 'students cannot verify rules');
select tests.authenticate_as(:'admin');
select public.verify_country_rule(:'rule');
select is((select status::text from public.country_rules where id = :'rule'), 'verified', 'admins verify rules');

-- Admit rates are hidden until verified.
select public.add_program_stat(:'prog', '2026-autumn', 0.42, 'https://example.edu/stats', '42% of applicants were admitted.') as stat \gset
select tests.as_anon();
select is_empty(format($$ select 1 from public.program_stats where program_id = %L $$, :'prog'), 'unverified admit rates are not public');
select tests.authenticate_as(:'admin');
select public.verify_program_stat(:'stat');
select tests.as_anon();
select is((select admit_rate from public.program_stats where id = :'stat'), 0.42, 'verified admit rates are public');
select tests.authenticate_as(:'admin');
select public.add_program_stat(:'prog', '2026-autumn', 0.40, 'https://example.edu/stats', '40% were admitted.');
select tests.as_anon();
select is_empty(format($$ select 1 from public.program_stats where program_id = %L $$, :'prog'), 'a corrected rate goes back to review');

-- Decision matrices are private.
select tests.authenticate_as(:'a');
insert into public.decision_matrices (user_id, criteria) values (:'a', '[{"id":"c","label":"City","weight":3}]');
select tests.authenticate_as(:'b');
select is_empty($$ select 1 from public.decision_matrices $$, 'B cannot read A''s matrix');
select throws_ok(format($$ insert into public.decision_matrices (user_id) values (%L) $$, :'a'), '42501', null, 'B cannot write A''s matrix');

-- Pending parental consent blocks saving a matrix.
select tests.create_user('kid@test.dev', tests.birth_month_for_age(15), 'DE') as kid \gset
select tests.authenticate_as(:'kid');
select throws_ok(format($$ insert into public.decision_matrices (user_id) values (%L) $$, :'kid'), '42501', null, 'pending consent blocks the matrix');

select * from finish();
rollback;
