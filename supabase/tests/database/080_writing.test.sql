begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('w1@test.dev') as a \gset
select tests.create_user('w2@test.dev') as b \gset

select tests.authenticate_as(:'a');
insert into public.documents (user_id, kind, title) values (:'a', 'statement_of_purpose', 'SOP');
select id as doc from public.documents where user_id = :'a' \gset
insert into public.document_versions (document_id, user_id, body, word_count) values (:'doc', :'a', 'Draft one.', 2);
select id as v1 from public.document_versions where document_id = :'doc' \gset

select throws_ok(format($$ update public.document_versions set body = 'changed' where id = %L $$, :'v1'), '42501', null, 'drafts are append-only');
select throws_ok(
  format($$ insert into public.reviews (user_id, version_id, kind, model, prompt_version, result) values (%L, %L, 'rubric', 'm', 'p', '{}') $$, :'a', :'v1'),
  '42501', null, 'reviews cannot be inserted directly (they go through the charging function)'
);

-- First rubric review is free; the next needs a credit.
select lives_ok(format($$ select public.record_writing_review(%L, 'rubric', 'm', 'p', '{}') $$, :'v1'), 'first review is free');
select throws_ok(format($$ select public.record_writing_review(%L, 'rubric', 'm', 'p', '{}') $$, :'v1'), 'P0001', 'insufficient_credits', 'second review needs credits');
select tests.as_postgres();
select public.grant_credits(:'a', 2);
select tests.authenticate_as(:'a');
select lives_ok(format($$ select public.record_writing_review(%L, 'rubric', 'm', 'p', '{}') $$, :'v1'), 'with credits the review is recorded');
select is(public.credit_balance(), 1, 'one credit was spent');

-- B cannot see or use A's drafts.
select tests.authenticate_as(:'b');
select is_empty($$ select 1 from public.documents $$, 'B cannot read A''s documents');
select is_empty($$ select 1 from public.document_versions $$, 'B cannot read A''s drafts');
select is_empty($$ select 1 from public.reviews $$, 'B cannot read A''s reviews');
select throws_ok(format($$ select public.record_writing_review(%L, 'rubric', 'm', 'p', '{}') $$, :'v1'), '42501', null, 'B cannot review A''s draft');
select throws_ok(
  format($$ insert into public.document_versions (document_id, user_id, body, word_count) values (%L, %L, 'x', 1) $$, :'doc', :'b'),
  '42501', null, 'B cannot add a draft to A''s document'
);

-- Story answers are private.
select tests.authenticate_as(:'a');
insert into public.story_answers (user_id, question_id, answer) values (:'a', 'turning_point', 'In 2023 I...');
select tests.authenticate_as(:'b');
select is_empty($$ select 1 from public.story_answers $$, 'B cannot read A''s story answers');

select * from finish();
rollback;
