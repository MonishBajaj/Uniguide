begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('trk-a@test.dev') as a \gset
select tests.create_user('trk-b@test.dev') as b \gset
select tests.create_user('trk-teen@test.dev', tests.birth_month_for_age(15), 'DE') as teen \gset
select tests.make_program('trk-one') as cycle \gset

select tests.authenticate_as(:'a');
select lives_ok(format($$ insert into public.tracks (user_id, name, target_levels, target_countries, budget_amount, budget_currency) values (%L, 'MBA', '{master}', '{GB,US}', 90000, 'USD') $$, :'a'),
  'a student adds a track');
select throws_ok(format($$ insert into public.tracks (user_id, name, target_levels) values (%L, 'MBA', '{master}') $$, :'a'), '23505', null, 'track names are unique per student');
select throws_ok(format($$ insert into public.tracks (user_id, name, target_levels) values (%L, 'Empty', '{}') $$, :'a'), '23514', null, 'a track needs a level');
select throws_ok(format($$ insert into public.tracks (user_id, name, target_levels, budget_amount) values (%L, 'Half', '{master}', 100) $$, :'a'), '23514', null, 'a budget needs its currency');
select id as track from public.tracks where name = 'MBA' \gset
insert into public.applications (user_id, cycle_id, track_id) values (:'a', :'cycle', :'track') returning id as app \gset
select results_eq(format($$ select track_id::text from public.applications where id = %L $$, :'app'), array[:'track'], 'an application joins the student''s track');

select tests.authenticate_as(:'b');
select is_empty($$ select 1 from public.tracks $$, 'B cannot see A''s tracks');
select throws_ok(format($$ insert into public.applications (user_id, cycle_id, track_id) values (%L, %L, %L) $$, :'b', :'cycle', :'track'), '42501', null, 'B cannot file an application under A''s track');
insert into public.applications (user_id, cycle_id) values (:'b', :'cycle') returning id as app_b \gset
select throws_ok(format($$ update public.applications set track_id = %L where id = %L $$, :'track', :'app_b'), '42501', null, 'nor move one into it');

select tests.authenticate_as(:'teen');
select throws_ok(format($$ insert into public.tracks (user_id, name, target_levels) values (%L, 'X', '{bachelor}') $$, :'teen'), '42501', null, 'pending parental consent blocks saving');

select tests.authenticate_as(:'a');
delete from public.tracks where id = :'track';
select results_eq(format($$ select track_id is null from public.applications where id = %L $$, :'app'), array[true], 'deleting a track keeps its applications, back on Main');

select * from finish();
rollback;
