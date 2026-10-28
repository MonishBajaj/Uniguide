begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('loci-a@test.dev') as a \gset
select tests.create_user('loci-b@test.dev') as b \gset
select tests.make_program('loci-gb') as cycle \gset

select tests.authenticate_as(:'a');
insert into public.applications (user_id, cycle_id, decision, status) values (:'a', :'cycle', 'waitlisted', 'decided') returning id as app \gset
select lives_ok(format($$ insert into public.documents (user_id, application_id, kind, title, word_limit) values (%L, %L, 'continued_interest', 'Letter', 300) $$, :'a', :'app'),
  'a student starts a letter of continued interest for their waitlisted application');
select tests.authenticate_as(:'b');
select is_empty($$ select 1 from public.documents where kind = 'continued_interest' $$, 'letters are private like every draft');

select * from finish();
rollback;
