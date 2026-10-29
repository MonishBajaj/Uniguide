begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('brag-a@test.dev') as a \gset
select tests.create_user('brag-b@test.dev') as b \gset

select tests.authenticate_as(:'a');
insert into public.recommenders (user_id, name) values (:'a', 'Dr Mehta') returning id as rec \gset
select lives_ok(format($$ update public.recommenders set brag_notes = 'Led the capstone scheduling model.' where id = %L $$, :'rec'), 'a student writes notes for a recommender');
select throws_ok(format($$ update public.recommenders set brag_notes = repeat('x', 3001) where id = %L $$, :'rec'), '23514', null, 'notes are capped at 3,000 characters');

select tests.authenticate_as(:'b');
select is_empty($$ select brag_notes from public.recommenders $$, 'B cannot read A''s notes');
update public.recommenders set brag_notes = 'hijacked' where id = :'rec';

select tests.as_postgres();
select results_eq(format($$ select brag_notes from public.recommenders where id = %L $$, :'rec'), array['Led the capstone scheduling model.'], 'B cannot change them');

select * from finish();
rollback;
