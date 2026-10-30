begin;
\ir _helpers.psql
select no_plan();

-- Journey M2 (J2.1): journey_snapshot carries each fact's official page and who the student shares with.
select tests.create_user('shell-a@test.dev', '1998-01', 'IN') as a \gset
select tests.create_user('shell-mum@test.dev') as mum \gset
select tests.create_user('shell-dad@test.dev') as dad \gset
select tests.make_program('shell-one') as c1 \gset
select tests.make_source() as src \gset
select url as src_url from public.sources where id = :'src' \gset

update public.profiles set target_countries = '{GB}' where user_id = :'a';
insert into public.requirements (cycle_id, applicant_category, kind, count_required, status, published, source_id)
  values (:'c1', 'all', 'recommendation_letters', 2, 'verified', true, :'src') returning id as req \gset
insert into public.requirements (cycle_id, applicant_category, kind, count_required, status, published)
  values (:'c1', 'all', 'statement', null, 'unverified', true) returning id as req_nosrc \gset
insert into public.deadlines (cycle_id, applicant_category, kind, owning_system, due_at, timezone, precision, status, published, source_id)
  values (:'c1', 'all', 'application', 'direct', '2027-01-15 23:59+00', 'Europe/London', 'date', 'verified', true, :'src') returning id as dl \gset
insert into public.country_rules (destination, applies_to, kind, title, link, status, published, source_id)
  values ('GB', '{IN}', 'other', 'Tuberculosis test', 'https://example.gov.uk/tb', 'verified', true, :'src') returning id as rule_link \gset
insert into public.country_rules (destination, applies_to, kind, title, status, published, source_id)
  values ('GB', '{IN}', 'banking', 'Opening a bank account', 'verified', true, :'src') returning id as rule_src \gset

insert into public.parent_links (parent_id, student_id, student_name, parent_name) values (:'mum', :'a', 'A', 'Meera');
insert into public.parent_links (parent_id, student_id, student_name, parent_name, revoked_at) values (:'dad', :'a', 'A', 'Raj', now());
insert into public.organizations (name, country) values ('Bright Futures Consultancy', 'IN') returning id as org \gset
insert into public.organizations (name, country) values ('Former Agency', 'IN') returning id as org_old \gset
insert into public.agency_shares (student_id, org_id, display_name) values (:'a', :'org', 'A');
insert into public.agency_shares (student_id, org_id, display_name, revoked_at) values (:'a', :'org_old', 'A', now());

select tests.authenticate_as(:'a');
insert into public.applications (user_id, cycle_id, status) values (:'a', :'c1', 'preparing');
select public.journey_snapshot() as snap \gset

select is(jsonb_path_query_first(:'snap'::jsonb, '$.applications[0].requirements[*] ? (@.kind == "recommendation_letters").sourceUrl') #>> '{}', :'src_url',
  'a requirement carries its source page');
select is(jsonb_path_query_first(:'snap'::jsonb, '$.applications[0].requirements[*] ? (@.kind == "statement").sourceUrl'), 'null'::jsonb,
  'a requirement without a source has a null sourceUrl');
select is((:'snap'::jsonb) #>> '{applications,0,deadlines,0,sourceUrl}', :'src_url', 'a deadline carries its source page');
select is(jsonb_path_query_first(:'snap'::jsonb, '$.countryRules[*] ? (@.title == "Tuberculosis test").sourceUrl') #>> '{}', 'https://example.gov.uk/tb',
  'a country rule links to its own official page first');
select is(jsonb_path_query_first(:'snap'::jsonb, '$.countryRules[*] ? (@.title == "Opening a bank account").sourceUrl') #>> '{}', :'src_url',
  'a country rule without a link falls back to its source page');
select is((:'snap'::jsonb) -> 'sharedWith', '{"parents": ["Meera"], "counselors": ["Bright Futures Consultancy"]}'::jsonb,
  'sharedWith lists active parents and counselor organisations, not revoked ones');

-- A student who shares with nobody gets empty lists, not nulls.
select tests.as_postgres();
select tests.create_user('shell-b@test.dev') as b \gset
select tests.authenticate_as(:'b');
select is(public.journey_snapshot() -> 'sharedWith', '{"parents": [], "counselors": []}'::jsonb, 'nobody shared: empty lists');

-- Access rules are unchanged by the replacement.
select throws_ok(format('select public.journey_snapshot(%L)', :'a'), '42501', null, 'B still cannot read A''s snapshot');

select * from finish();
rollback;
