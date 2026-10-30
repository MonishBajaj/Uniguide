begin;
\ir _helpers.psql
select no_plan();

-- Journey M3 (J3.1): test requirements in journey_snapshot carry the exam version and the published minimum.
select tests.create_user('minimum-a@test.dev') as a \gset
select tests.make_program('minimum-one') as c1 \gset
insert into public.requirements (cycle_id, applicant_category, kind, exam, exam_version, min_total, status, published)
  values (:'c1', 'all', 'language_test', 'toefl_ibt', 'legacy', 100, 'verified', true);
insert into public.requirements (cycle_id, applicant_category, kind, count_required, status, published)
  values (:'c1', 'all', 'recommendation_letters', 2, 'verified', true);

select tests.authenticate_as(:'a');
insert into public.applications (user_id, cycle_id, status) values (:'a', :'c1', 'shortlisted');
select public.journey_snapshot() as snap \gset

select is(jsonb_path_query_first(:'snap'::jsonb, '$.applications[0].requirements[*] ? (@.kind == "language_test")') - 'id',
  '{"kind": "language_test", "exam": "toefl_ibt", "examVersion": "legacy", "minTotal": 100, "testPolicy": null,
    "countRequired": null, "status": "verified", "sourceUrl": null}'::jsonb,
  'a test requirement carries its exam version and minimum total');
select is(jsonb_path_query_first(:'snap'::jsonb, '$.applications[0].requirements[*] ? (@.kind == "recommendation_letters").minTotal'),
  'null'::jsonb, 'other requirements have a null minimum');

select * from finish();
rollback;
