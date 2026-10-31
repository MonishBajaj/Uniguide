begin;
\ir _helpers.psql
select no_plan();

-- Journey M4 (J4.2, J4.4): parents read parent-safe steps only; counselors with a share read the journey.
select tests.create_user('pj-student@test.dev') as s \gset
select tests.create_user('pj-other@test.dev') as other \gset
select tests.create_user('pj-mum@test.dev') as mum \gset
select tests.create_user('pj-dad@test.dev') as dad \gset
select tests.create_user('pj-stranger@test.dev') as stranger \gset
select tests.create_user('pj-counselor@test.dev') as counselor \gset
select tests.create_user('pj-counselor2@test.dev') as counselor2 \gset

insert into public.parent_links (parent_id, student_id, student_name, parent_name) values (:'mum', :'s', 'Asha', 'Meera');
insert into public.parent_links (parent_id, student_id, student_name, parent_name, revoked_at) values (:'dad', :'s', 'Asha', 'Raj', now());
insert into public.organizations (name, country) values ('PJ Counselling', 'IN') returning id as org \gset
insert into public.organizations (name, country) values ('PJ Other Org', 'IN') returning id as org2 \gset
insert into public.org_members (org_id, user_id) values (:'org', :'counselor'), (:'org2', :'counselor2');
insert into public.agency_shares (student_id, org_id, display_name) values (:'s', :'org', 'Asha');

-- Six steps: a writing step and a score step without parentTitle, and five with one.
insert into public.journey_state (user_id, stage, stage_progress, steps, engine_version) values (:'s', 4,
  '{"done": 1, "total": 2, "label": "1 of 2 applications ready"}',
  '[{"id": "S4.05:a1", "stage": 4, "title": "Draft your statement", "reason": "Your essay for MSc X.", "href": "/app/writing", "dueAt": "2027-01-01"},
    {"id": "S4.12:a1", "stage": 4, "title": "Send your IELTS score", "reason": "Your score 7.5.", "href": "/app/tracker/a1#scores"},
    {"id": "S4.01:a1", "stage": 4, "title": "Work through the checklist", "reason": "3 items left.", "href": "/app/tracker/a1", "parentTitle": "Working through the MSc X checklist", "dueAt": "2027-01-02"},
    {"id": "S4.14:a1", "stage": 4, "title": "Record the fee", "reason": "r", "href": "/x", "parentTitle": "Paying application fees"},
    {"id": "S1.07", "stage": 1, "title": "Invite a parent", "reason": "r", "href": "/x", "parentTitle": "Joining the journey"},
    {"id": "S4.10", "stage": 4, "title": "Build your CV", "reason": "r", "href": "/x", "parentTitle": "Building a CV"},
    {"id": "S2.03", "stage": 2, "title": "Compare countries", "reason": "r", "href": "/x", "parentTitle": "Comparing countries"},
    {"id": "S4.02", "stage": 4, "title": "APS", "reason": "r", "href": "/x", "parentTitle": "Getting the APS certificate"}]',
  'journey-0.3.0');

-- A linked parent.
select tests.authenticate_as(:'mum');
select public.parent_journey(:'s') as pj \gset
select is((:'pj'::jsonb) -> 'stage', '4'::jsonb, 'a parent sees the stage');
select is((:'pj'::jsonb) -> 'progress', '{"done": 1, "total": 2, "label": "1 of 2 applications ready"}'::jsonb, 'and the progress line');
select is(jsonb_array_length((:'pj'::jsonb) -> 'steps'), 5, 'at most five steps');
select is((:'pj'::jsonb) #> '{steps,0}', '{"parentTitle": "Working through the MSc X checklist", "stage": 4}'::jsonb,
  'steps keep their order and carry only the parent title and stage');
select ok(not exists (select 1 from jsonb_array_elements((:'pj'::jsonb) -> 'steps') e where e ?| array['title', 'reason', 'href', 'dueAt', 'factRefs', 'source', 'id']),
  'no step carries its own title, reason, link, date, facts or id');
select ok((:'pj'::text) not like '%statement%' and (:'pj'::text) not like '%IELTS%' and (:'pj'::text) not like '%7.5%',
  'writing and score steps never reach a parent');
select is((select count(*) from public.journey_state), 0::bigint, 'a parent still cannot read journey_state itself');

-- A revoked link, a stranger, and the student asking for someone else.
select tests.authenticate_as(:'dad');
select throws_ok(format('select public.parent_journey(%L)', :'s'), '42501', null, 'a revoked link gets nothing');
select tests.authenticate_as(:'stranger');
select throws_ok(format('select public.parent_journey(%L)', :'s'), '42501', null, 'an unlinked user gets nothing');
select tests.authenticate_as(:'other');
select throws_ok(format('select public.parent_journey(%L)', :'s'), '42501', null, 'another student gets nothing');

-- A linked student with no journey yet.
select tests.as_postgres();
insert into public.parent_links (parent_id, student_id, student_name, parent_name) values (:'mum', :'other', 'Ravi', 'Meera');
select tests.authenticate_as(:'mum');
select is(public.parent_journey(:'other'), null::jsonb, 'no journey yet gives null');

-- Counselors.
select tests.authenticate_as(:'counselor');
select is((select stage from public.journey_state where user_id = :'s'), 4::smallint, 'a counselor with an active share reads the journey');
select tests.authenticate_as(:'counselor2');
select is((select count(*) from public.journey_state), 0::bigint, 'a counselor without a share reads nothing');

select tests.as_anon();
select throws_ok(format('select public.parent_journey(%L)', :'s'), '42501', null, 'anonymous users cannot call it');

select * from finish();
rollback;
