begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('watcher@test.dev') as w \gset
select tests.create_user('both@test.dev') as b \gset
select tests.create_user('other@test.dev') as o \gset
select tests.create_user('minor@test.dev', tests.birth_month_for_age(14), 'IN') as minor \gset
select tests.make_program('watch-prog') as cyc \gset
select program_id as prog from public.program_cycles where id = :'cyc' \gset

select tests.authenticate_as(:'w');
select lives_ok(format($$ insert into public.watches (user_id, program_id) values (%L, %L) $$, :'w', :'prog'), 'a student watches a course');
select throws_ok(format($$ insert into public.watches (user_id, program_id) values (%L, %L) $$, :'o', :'prog'), '42501', null, 'not on behalf of someone else');
select tests.authenticate_as(:'b');
insert into public.watches (user_id, program_id) values (:'b', :'prog');
insert into public.shortlists (user_id, program_id) values (:'b', :'prog');
select tests.authenticate_as(:'o');
select is_empty($$ select 1 from public.watches $$, 'students read only their own watches');
select tests.authenticate_as(:'minor');
select throws_ok(format($$ insert into public.watches (user_id, program_id) values (%L, %L) $$, :'minor', :'prog'), '42501', null, 'pending parental consent cannot watch');

select tests.as_worker();
select is(public.notify_program_watchers(:'prog', 'Changed', 'Body'), 2, 'a watcher and a watcher who also shortlisted each get one notice');
select tests.as_postgres();
select is((select count(*)::int from public.notifications where user_id = :'b' and program_id = :'prog'), 1, 'watch and shortlist notify once');
select is((select count(*)::int from public.notifications where user_id = :'w'), 1, 'a watcher alone is notified');

select * from finish();
rollback;
