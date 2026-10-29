begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('rs-a@test.dev') as a \gset
select tests.create_user('rs-b@test.dev') as b \gset
select tests.make_program('rs-one') as cycle \gset

select tests.authenticate_as(:'a');
insert into public.applications (user_id, cycle_id) values (:'a', :'cycle') returning id as app \gset
select lives_ok(format($$ insert into public.documents (user_id, application_id, kind, title, word_limit) values (%L, %L, 'research_statement', 'Research statement', 1000) $$, :'a', :'app'),
  'a student starts a research statement for an application');
select lives_ok(format($$ insert into public.documents (user_id, kind, title) values (%L, 'research_statement', 'General research statement') $$, :'a'),
  'or one not linked to an application');

select tests.authenticate_as(:'b');
select is_empty($$ select 1 from public.documents where kind = 'research_statement' $$, 'B cannot read A''s research statements');

select * from finish();
rollback;
