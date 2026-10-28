begin;
\ir _helpers.psql
select no_plan();

select is(public.fact_table('requirement'), 'requirements', 'requirements');
select is(public.fact_table('deadline'), 'deadlines', 'deadlines');
select is(public.fact_table('cost_item'), 'cost_items', 'cost items');
select throws_ok($$ select public.fact_table(null) $$, 'P0001', null, 'fact_table raises on an unknown subject');

select * from finish();
rollback;
