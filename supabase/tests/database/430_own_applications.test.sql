begin;
\ir _helpers.psql
select no_plan();

-- Journey M3 (J3.3a): own applications, for courses that aren't in the catalogue.
select tests.create_user('own-a@test.dev', '1998-01', 'IN') as a \gset
select tests.create_user('own-b@test.dev') as b \gset
select tests.create_user('own-mum@test.dev') as mum \gset
select tests.make_program('own-catalogue') as cycle \gset
select program_id as prog from public.program_cycles where id = :'cycle' \gset
insert into public.parent_links (parent_id, student_id, student_name, parent_name) values (:'mum', :'a', 'A', 'Meera');
insert into public.consents (user_id, kind, policy_version, method) values (:'a', 'outcomes_research', 'test', 'checkbox');
insert into public.country_rules (destination, applies_to, kind, title, status, published)
  values ('NL', '{}', 'other', 'Residence permit', 'verified', true);

select tests.authenticate_as(:'a');

-- The shape: a catalogue course, or the student's own institution, title and country, never both or half.
select lives_ok($$ insert into public.applications (id, user_id, own_institution, own_title, own_country, own_due_at)
  values ('00000000-0000-0000-0000-00000000a0a1', (select auth.uid()), 'Universiteit Voorbeeld', 'MSc Urban Planning', 'NL', '2027-02-01 23:59+01') $$,
  'a student adds a course that is not in the catalogue');
select throws_ok(format($$ insert into public.applications (user_id, cycle_id, own_title) values (%L, %L, 'Something') $$, :'a', :'cycle'),
  '23514', null, 'a catalogue application cannot also carry own fields');
select throws_ok(format($$ insert into public.applications (user_id, own_title, own_country) values (%L, 'No institution', 'NL') $$, :'a'),
  '23514', null, 'an own application needs its institution');
select throws_ok(format($$ insert into public.applications (user_id, own_institution, own_title, own_country) values (%L, 'U', 'T', 'nl') $$, :'a'),
  '23514', null, 'the country is a two-letter code');
select throws_ok(format($$ insert into public.applications (user_id, own_institution, own_title, own_country) values (%L, '  ', 'T', 'NL') $$, :'a'),
  '23514', null, 'a blank institution is refused');
select throws_ok(format($$ insert into public.applications (user_id) values (%L) $$, :'a'),
  '23514', null, 'an application with neither a course nor own details is refused');
insert into public.applications (id, user_id, cycle_id, decision) values ('00000000-0000-0000-0000-00000000a0a2', :'a', :'cycle', 'admitted');

-- Two own applications can coexist (the unique cycle rule doesn't apply to them).
select lives_ok(format($$ insert into public.applications (user_id, own_institution, own_title, own_country) values (%L, 'Other U', 'MSc Other', 'NL') $$, :'a'),
  'a second own application is allowed');

-- The student's own checklist works for them.
select lives_ok($$ insert into public.checklist_items (application_id, user_id, title, kind)
  values ('00000000-0000-0000-0000-00000000a0a1', (select auth.uid()), 'Portfolio upload', 'custom') $$,
  'the student adds their own checklist items');

-- Outcomes stay catalogue-only, even with research consent.
update public.applications set status = 'decided', decision = 'admitted' where id = '00000000-0000-0000-0000-00000000a0a1';
select throws_ok(format($$ insert into public.outcomes (application_id, user_id, program_id, cycle_id, decision)
  values ('00000000-0000-0000-0000-00000000a0a1', %L, %L, %L, 'admitted') $$, :'a', :'prog', :'cycle'),
  '42501', null, 'an own application''s outcome cannot be shared, even against a catalogue course');
select lives_ok(format($$ insert into public.outcomes (application_id, user_id, program_id, cycle_id, decision)
  values ('00000000-0000-0000-0000-00000000a0a2', %L, %L, %L, 'admitted') $$, :'a', :'prog', :'cycle'),
  'a catalogue application''s outcome can still be shared');

-- The journey counts own applications, with the student's words and no facts.
select public.journey_snapshot() as snap \gset
select is(jsonb_path_query_first(:'snap'::jsonb, '$.applications[*] ? (@.program.title == "MSc Urban Planning")') - 'id' - 'createdAt'
    - 'checklist' - 'status' - 'decision',
  '{"own": true, "ownDueAt": "2027-02-01T22:59:00+00:00", "program": {"id": null, "slug": null, "title": "MSc Urban Planning",
    "institution": "Universiteit Voorbeeld", "country": "NL", "level": null}, "cycle": null, "requirements": [], "deadlines": [],
    "trackId": null, "offerAcceptedAt": null, "depositDueAt": null, "awardedAid": null, "portalCheckedAt": null,
    "documents": [], "letters": [], "scoresSent": [], "costCount": 0, "outcomeShared": false,
    "conditions": null, "depositPaidAt": null, "hasDepositDeadline": false, "admissionDocumentAt": null, "declinedAt": null,
    "expectedDecisionOn": null, "interviews": [], "missingNotes": 0, "housingFacts": 0,
    "openCycles": 0, "intakeChosen": false}'::jsonb,
  'an own application is in the snapshot with its own words and no facts');
select is(jsonb_path_query_first(:'snap'::jsonb, '$.applications[*] ? (@.program.slug == "own-catalogue").own'), 'false'::jsonb,
  'a catalogue application says it is not own');
select is(jsonb_array_length(jsonb_path_query_array(:'snap'::jsonb, '$.applications[*] ? (@.own == true)')), 2, 'both own applications count');
select ok(jsonb_path_exists(:'snap'::jsonb, '$.countryRules[*] ? (@.title == "Residence permit")'),
  'country rules include an own application''s country');

-- Who can see it: the student and a linked parent, never another student.
select tests.authenticate_as(:'b');
select is((select count(*) from public.applications where own_title is not null), 0::bigint, 'another student sees no own applications');
select tests.authenticate_as(:'mum');
select results_eq($$ select own_title from public.applications where own_title is not null order by own_title $$,
  $$ values ('MSc Other'), ('MSc Urban Planning') $$, 'a linked parent sees the titles');

select * from finish();
rollback;
