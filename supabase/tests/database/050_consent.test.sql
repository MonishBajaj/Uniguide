begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('de15@test.dev', tests.birth_month_for_age(15), 'DE') as de15 \gset
select tests.create_user('in17@test.dev', tests.birth_month_for_age(17), 'IN') as in17 \gset
select tests.create_user('us17@test.dev', tests.birth_month_for_age(17), 'US') as us17 \gset
select tests.create_user('es14@test.dev', tests.birth_month_for_age(14), 'ES') as es14 \gset

select is((select consent_state::text from public.profiles where user_id = :'de15'), 'pending_parental', '15-year-old in Germany needs a parent');
select is((select age_band::text from public.profiles where user_id = :'de15'), 'age_13_15', 'age band 13-15');
select is((select consent_state::text from public.profiles where user_id = :'in17'), 'pending_parental', '17-year-old in India needs a parent (DPDP)');
select is((select consent_state::text from public.profiles where user_id = :'us17'), 'not_required', '17-year-old in the US does not');
select is((select consent_state::text from public.profiles where user_id = :'es14'), 'not_required', '14-year-old in Spain does not');

select throws_ok(
  format($$ select tests.create_user('kid@test.dev', %L, 'US') $$, tests.birth_month_for_age(12)),
  'P0001', 'Accounts are not available to children under 13', 'under-13s cannot create an account'
);
select throws_ok(
  $$ insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nobirth@test.dev', '{}') $$,
  'P0001', null, 'an account needs a birth month and country'
);

-- While consent is pending, personal data is not processed.
select tests.authenticate_as(:'de15');
select throws_ok(
  format($$ insert into public.test_scores (user_id, exam, total) values (%L, 'ielts_academic', 6.5) $$, :'de15'),
  '42501', null, 'pending user cannot store test scores'
);
select throws_ok(
  format($$ insert into public.ai_runs (user_id, purpose, model, prompt_version) values (%L, 'profile_extract', 'm', 'v') $$, :'de15'),
  '42501', null, 'pending user cannot run AI features'
);
select throws_ok(
  format($$ update public.profiles set grade_value = 80 where user_id = %L $$, :'de15'),
  '42501', null, 'pending user cannot fill in the academic profile'
);

-- The child asks a parent; the parent confirms from the emailed link.
select public.request_parental_consent('Parent@Example.com', encode(extensions.digest('secret-token', 'sha256'), 'hex'));
select throws_ok(
  format($$ select public.request_parental_consent('p@example.com', %L) $$, 'not-a-hash'),
  'P0001', null, 'token hash must be a sha256 hex digest'
);

select tests.as_anon();
select is(public.confirm_parental_consent('wrong-token', '2026-10'), false, 'a wrong token is rejected');
select is(public.confirm_parental_consent('secret-token', '2026-10'), true, 'the parent link grants consent');
select is(public.confirm_parental_consent('secret-token', '2026-10'), false, 'a link works only once');

select tests.as_postgres();
select is((select consent_state::text from public.profiles where user_id = :'de15'), 'granted', 'consent state is granted');
select is((select count(*)::int from public.consents where user_id = :'de15' and kind = 'parental'), 1, 'parental consent recorded');
select ok(
  (select not (evidence::text ilike '%parent@example.com%') from public.consents where user_id = :'de15' and kind = 'parental'),
  'the consent record stores a hash, not the parent email'
);

select tests.authenticate_as(:'de15');
select lives_ok(
  format($$ insert into public.test_scores (user_id, exam, total) values (%L, 'ielts_academic', 6.5) $$, :'de15'),
  'after consent the user can store test scores'
);

-- Expired links do not work.
select tests.authenticate_as(:'in17');
select public.request_parental_consent('parent2@example.com', encode(extensions.digest('old-token', 'sha256'), 'hex'));
select tests.as_postgres();
update public.parental_consent_requests set expires_at = now() - interval '1 minute' where parent_email = 'parent2@example.com';
select tests.as_anon();
select is(public.confirm_parental_consent('old-token', '2026-10'), false, 'an expired link is rejected');

-- Adults cannot use the parental flow.
select tests.authenticate_as(:'us17');
select throws_ok(
  format($$ select public.request_parental_consent('p@example.com', %L) $$, encode(extensions.digest('t', 'sha256'), 'hex')),
  'P0001', null, 'parental consent requests only for accounts that need one'
);

-- Terms and privacy acceptance at sign-up is recorded with the account.
select tests.as_postgres();
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-4000-b000-000000000099', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'terms@test.dev', '{"birth_month": "1990-05", "residence_country": "GB", "accepted_policy_version": "2026-10-draft"}');
select results_eq(
  $$ select kind::text from public.consents where user_id = '00000000-0000-4000-b000-000000000099' order by kind $$,
  array['privacy', 'terms'],
  'sign-up records terms and privacy consent'
);

select * from finish();
rollback;
