begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('gut-a@test.dev') as a \gset
select tests.create_user('gut-b@test.dev') as b \gset

select tests.authenticate_as(:'a');
insert into public.decision_matrices (user_id, gut_checks)
values (:'a', '[{"application_id": "00000000-0000-0000-0000-000000000001", "reaction": "relieved", "at": "2027-04-01T10:00:00Z"}]');
select is((select jsonb_array_length(gut_checks) from public.decision_matrices), 1, 'reactions are saved with the matrix');
select throws_ok($$ update public.decision_matrices set gut_checks = '{"not": "a list"}' $$, '23514', null, 'gut checks are a list');
select throws_ok($$ update public.decision_matrices set gut_checks = (select jsonb_agg(x) from generate_series(1, 51) x) $$, '23514', null, 'at most 50 are kept');

select tests.authenticate_as(:'b');
select is_empty($$ select 1 from public.decision_matrices $$, 'gut checks are private');

select * from finish();
rollback;
