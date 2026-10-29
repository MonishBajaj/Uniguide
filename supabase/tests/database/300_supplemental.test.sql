begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('sup-a@test.dev') as a \gset
select tests.create_user('sup-b@test.dev') as b \gset
select tests.make_program('sup-one') as cycle \gset

select tests.authenticate_as(:'a');
insert into public.applications (user_id, cycle_id) values (:'a', :'cycle') returning id as app \gset
select lives_ok(format($$ insert into public.documents (user_id, application_id, kind, title, question, word_limit) values (%L, %L, 'supplemental', 'Why us', 'Why do you want to attend?', 250) $$, :'a', :'app'),
  'a supplemental essay is saved with the school''s question');
select lives_ok(format($$ insert into public.documents (user_id, application_id, kind, title, question) values (%L, %L, 'supplemental', 'Community', 'Describe a community you belong to.') $$, :'a', :'app'),
  'an application can have several supplemental essays');
select throws_ok(format($$ insert into public.documents (user_id, kind, title) values (%L, 'supplemental', 'No question') $$, :'a'),
  '23514', null, 'a supplemental essay needs the question');
select throws_ok(format($$ insert into public.documents (user_id, kind, title, question) values (%L, 'supplemental', 'Blank', '   ') $$, :'a'),
  '23514', null, 'a blank question does not count');
select lives_ok(format($$ insert into public.documents (user_id, kind, title) values (%L, 'statement_of_purpose', 'SOP') $$, :'a'),
  'other kinds still save without a question');
select throws_ok($$ update public.documents set question = null where kind = 'supplemental' $$, '23514', null, 'the question cannot be removed later');

select tests.authenticate_as(:'b');
select is_empty($$ select 1 from public.documents where kind = 'supplemental' $$, 'B cannot read A''s essays');

select * from finish();
rollback;
