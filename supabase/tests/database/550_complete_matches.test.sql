begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('cm-a@test.dev') as a \gset
select tests.create_user('cm-b@test.dev') as b \gset

-- Eight courses at eight institutions; make_program returns each current cycle.
select tests.make_program('cm-complete') as c1 \gset
select tests.make_program('cm-no-req') as c2 \gset
select tests.make_program('cm-no-cost') as c3 \gset
select tests.make_program('cm-no-deadline') as c4 \gset
select tests.make_program('cm-old-cycle') as c5 \gset
select tests.make_program('cm-unpublished-fact') as c6 \gset
select tests.make_program('cm-wrong-kinds') as c7 \gset

insert into public.deadlines (cycle_id, due_at, precision, kind, published, status)
  select c, now() + interval '30 days', 'date', 'application', true, 'unverified' from unnest(array[:'c1', :'c2', :'c3', :'c5']::uuid[]) c;
insert into public.deadlines (cycle_id, due_at, precision, kind, published, status) values
  (:'c6', now() + interval '30 days', 'date', 'application', false, 'unverified'),
  (:'c7', now() + interval '30 days', 'date', 'funding', true, 'unverified');
insert into public.cost_items (cycle_id, kind, basis, low, base, high, currency, published, status)
  select c, 'tuition', 'per_year', 9000, 9000, 9000, 'GBP', true, 'unverified' from unnest(array[:'c1', :'c2', :'c4', :'c5', :'c6']::uuid[]) c;
insert into public.cost_items (cycle_id, kind, basis, low, base, high, currency, published, status) values
  (:'c7', 'fees', 'per_year', 100, 100, 100, 'GBP', true, 'unverified');
insert into public.requirements (cycle_id, kind, qualification, published, status)
  select c, 'entry_qualification', 'bachelor_4yr', true, 'unverified' from unnest(array[:'c1', :'c3', :'c4', :'c5', :'c6', :'c7']::uuid[]) c;
update public.program_cycles set is_current = false where id = :'c5';

select is(public.course_is_complete((select program_id from public.program_cycles where id = :'c1')), true, 'deadline, tuition and a requirement, all unverified: complete');
select is(public.course_is_complete((select program_id from public.program_cycles where id = :'c2')), false, 'no requirement: incomplete');
select is(public.course_is_complete((select program_id from public.program_cycles where id = :'c3')), false, 'no cost: incomplete');
select is(public.course_is_complete((select program_id from public.program_cycles where id = :'c4')), false, 'no deadline: incomplete');
select is(public.course_is_complete((select program_id from public.program_cycles where id = :'c5')), false, 'facts only on an old intake: incomplete');
select is(public.course_is_complete((select program_id from public.program_cycles where id = :'c6')), false, 'an unpublished deadline does not count');
select is(public.course_is_complete((select program_id from public.program_cycles where id = :'c7')), false, 'a funding deadline and a fees item are not the application deadline and tuition');
select is(public.course_is_complete(gen_random_uuid()), false, 'an unknown course is not complete');

select i1 from (select institution_id as i1 from public.programs where slug = 'cm-complete') x \gset
select i2 from (select institution_id as i2 from public.programs where slug = 'cm-no-req') x \gset
update public.profiles set target_countries = '{GB}', target_levels = '{master}', target_fields = '{06}' where user_id = :'a';

select tests.authenticate_as(:'a');
select public.start_enrichment(array[:'i2', :'i1', gen_random_uuid()]::uuid[]) as job \gset
select is((select array_agg(institution_id order by position) from public.enrichment_candidates where job_id = :'job'), array[:'i2', :'i1']::uuid[], 'the queue keeps the order given and drops unknown universities');
select is((select array_agg(position order by position) from public.enrichment_candidates where job_id = :'job'), array[1, 2], 'positions count from 1');
select is((select profile_snapshot from public.enrichment_jobs where id = :'job'), '{"target_countries":["GB"],"target_levels":["master"],"target_fields":["06"]}'::jsonb, 'the targets come from the stored profile');
select is((select (target_complete, max_tries, tried, kept)::text from public.enrichment_jobs where id = :'job'), '(10,30,0,0)', 'a job targets 10 complete courses in at most 30 tries');
select is(public.start_enrichment(array[:'i1']::uuid[]), :'job'::uuid, 'an active job is returned, not duplicated');
select throws_ok($$ select public.start_enrichment(array(select gen_random_uuid() from generate_series(1, 31))) $$, '22023', null, 'more than thirty universities are refused');
select throws_ok($$ insert into public.enrichment_candidates (job_id, position, institution_id) values (null, 9, null) $$, '42501', null, 'students cannot write candidates');
select throws_ok($$ select * from public.institution_discovery $$, '42501', null, 'students cannot read discovery results');
select is((select count(*)::int from public.enrichment_candidates), 2, 'the owner reads their candidates');

reset role;
select tests.authenticate_as(:'b');
select is((select count(*)::int from public.enrichment_candidates), 0, 'another student sees none');
select public.start_enrichment(array[:'i1']::uuid[]) as jb1 \gset
reset role;
update public.enrichment_jobs set status = 'done' where user_id = :'b';
select tests.authenticate_as(:'b');
select public.start_enrichment(array[:'i1']::uuid[]) as jb2 \gset
reset role;
update public.enrichment_jobs set status = 'done' where user_id = :'b';
select tests.authenticate_as(:'b');
select public.start_enrichment(array[:'i1']::uuid[]) as jb3 \gset
reset role;
update public.enrichment_jobs set status = 'done' where user_id = :'b';
select tests.authenticate_as(:'b');
select throws_ok($$ select public.start_enrichment(array[(select institution_id from public.programs where slug = 'cm-complete')]) $$, null, 'rate_limited', 'a fourth job in a day is refused');

reset role;
select tests.as_worker();
select lives_ok(format($f$ update public.enrichment_candidates set status = 'skipped', reason = 'no list found', finished_at = now() where position = 1 and job_id = %L $f$, :'job'), 'the worker closes a candidate');
select lives_ok(format($f$ update public.enrichment_jobs set tried = 1, kept = 0 where id = %L $f$, :'job'), 'the worker counts tries');
select lives_ok(format($f$ insert into public.institution_discovery (institution_id, status, reason) values (%L, 'none', 'needs JavaScript') $f$, :'i1'), 'the worker remembers a failed discovery');
select lives_ok(format($f$ insert into public.enrichment_items (job_id, program_id, status) select %L, id, 'incomplete' from public.programs where slug = 'cm-no-req' $f$, :'job'), 'an item can end incomplete');

select * from finish();
rollback;
