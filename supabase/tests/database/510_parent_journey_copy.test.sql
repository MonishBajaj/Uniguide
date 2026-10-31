begin;
\ir _helpers.psql
select no_plan();

-- Journey M6 (J6.2): parent titles can be shown in Hindi. parent_journey() returns the catalogue id and only the
-- values a parent title uses (course, rule, date), never a step's other parameters.
select tests.create_user('pjc-student@test.dev') as s \gset
select tests.create_user('pjc-mum@test.dev') as mum \gset
insert into public.parent_links (parent_id, student_id, student_name, parent_name) values (:'mum', :'s', 'Asha', 'Meera');
insert into public.journey_state (user_id, stage, stage_progress, steps, engine_version) values (:'s', 4,
  '{"done": 0, "total": 1, "label": "0 of 1 application ready"}',
  '[{"id": "S4.12:a1", "catalogueId": "S4.12", "stage": 4, "title": "Send your IELTS score", "reason": "r",
     "copy": {"key": "S4.12", "params": {"exam": "IELTS", "course": "MSc X"}}},
    {"id": "S6.04:a1", "catalogueId": "S6.04", "stage": 6, "title": "Reply", "reason": "r", "parentTitle": "Replying to the MSc X offer by 1 May 2027",
     "copy": {"key": "S6.04", "params": {"course": "MSc X", "date": "1 May 2027", "score": "7.5", "recommender": "Dr Rao"}}}]',
  'journey-0.5.0');

select tests.authenticate_as(:'mum');
select public.parent_journey(:'s') -> 'steps' as steps \gset
select is(jsonb_array_length(:'steps'::jsonb), 1, 'only the step with a parent title');
select is((:'steps'::jsonb) #>> '{0,catalogueId}', 'S6.04', 'it carries its catalogue id');
select is((:'steps'::jsonb) #> '{0,params}', '{"course": "MSc X", "date": "1 May 2027"}'::jsonb,
  'and only the values its parent title uses');
select ok((:'steps'::text) not like '%7.5%' and (:'steps'::text) not like '%Rao%' and (:'steps'::text) not like '%IELTS%',
  'no score, recommender or exam reaches a parent');

select * from finish();
rollback;
