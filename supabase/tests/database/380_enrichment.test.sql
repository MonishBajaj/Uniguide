begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('enrich-a@test.dev') as a \gset
select tests.create_user('enrich-b@test.dev') as b \gset
select tests.create_user('enrich-c@test.dev') as c \gset

insert into public.institutions (id, name, country) values ('00000000-0000-4000-b000-0000000000a1', 'Enrich U', 'DE');
insert into public.programs (id, institution_id, slug, title, level, published) values
  ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-b000-0000000000a1', 'enrich-one', 'One', 'master', true),
  ('00000000-0000-4000-b000-0000000000b2', '00000000-0000-4000-b000-0000000000a1', 'enrich-two', 'Two', 'master', true);

select tests.authenticate_as(:'a');
select throws_ok($$ insert into public.enrichment_jobs (user_id) values (auth.uid()) $$, '42501', null, 'students cannot insert jobs directly');
select throws_ok($$ select public.start_enrichment(array(select gen_random_uuid() from generate_series(1, 13))) $$, '22023', null, 'more than twelve courses are refused');

select public.start_enrichment(array['00000000-0000-4000-b000-0000000000b1','00000000-0000-4000-b000-0000000000b2']::uuid[]) as job \gset
select is((select count(*)::int from public.enrichment_items where job_id = :'job'), 2, 'one item per course');
select is((select status::text from public.enrichment_jobs where id = :'job'), 'queued', 'a new job is queued');
select is((select allow_fallback from public.enrichment_jobs where id = :'job'), false, 'no AI consent, no fallback');
select is(public.start_enrichment(array['00000000-0000-4000-b000-0000000000b1']::uuid[]), :'job'::uuid, 'an active job is returned, not duplicated');

select tests.authenticate_as(:'b');
select is((select count(*)::int from public.enrichment_jobs), 0, 'another student sees no jobs');
select is((select count(*)::int from public.enrichment_items), 0, 'nor items');
insert into public.consents (user_id, kind, policy_version, method) values (:'b', 'ai_processing', 'v1', 'test');
select public.start_enrichment(array['00000000-0000-4000-b000-0000000000b1']::uuid[]) as jobb \gset
select is((select allow_fallback from public.enrichment_jobs where id = :'jobb'), true, 'AI consent allows the fallback');

select tests.as_worker();
select lives_ok($$ update public.enrichment_jobs set status = 'done', stage = 'done', finished_at = now() where status = 'queued' $$, 'the worker updates jobs');
select lives_ok($$ update public.enrichment_items set status = 'running' where program_id = '00000000-0000-4000-b000-0000000000b1' and job_id = (select id from public.enrichment_jobs order by created_at limit 1) $$, 'the worker marks an item running');
select throws_ok($$ update public.enrichment_items set status = 'running' where program_id = '00000000-0000-4000-b000-0000000000b1' and status = 'pending' $$, '23505', null, 'only one item per course may run');

reset role;
select tests.authenticate_as(:'a');
select public.start_enrichment(array['00000000-0000-4000-b000-0000000000b1']::uuid[]) as j2 \gset
reset role;
update public.enrichment_jobs set status = 'done' where user_id = :'a';
select tests.authenticate_as(:'a');
select public.start_enrichment(array['00000000-0000-4000-b000-0000000000b1']::uuid[]) as j3 \gset
reset role;
update public.enrichment_jobs set status = 'done' where user_id = :'a';
select tests.authenticate_as(:'a');
select throws_ok($$ select public.start_enrichment(array['00000000-0000-4000-b000-0000000000b1']::uuid[]) $$, null, 'rate_limited', 'a fourth job in a day is refused');

reset role;
update public.profiles set target_countries = '{DE}', target_levels = '{master}', target_fields = '{0613}' where user_id = :'c';
select tests.authenticate_as(:'c');
select public.start_enrichment('{}'::uuid[]) as jobc \gset
select is((select count(*)::int from public.enrichment_items where job_id = :'jobc'), 0, 'an empty catalog still starts a job');
select is((select profile_snapshot from public.enrichment_jobs where id = :'jobc'), '{"target_countries":["DE"],"target_levels":["master"],"target_fields":["0613"]}'::jsonb, 'the targets come from the stored profile');

reset role;
insert into public.programs (id, institution_id, slug, title, level, published)
values ('00000000-0000-4000-b000-0000000000b3', '00000000-0000-4000-b000-0000000000a1', 'enrich-draft', 'Draft', 'master', false);
select tests.create_user('enrich-d@test.dev') as d \gset
select tests.authenticate_as(:'d');
select public.start_enrichment(array['00000000-0000-4000-b000-0000000000b3','00000000-0000-4000-b000-0000000000b1']::uuid[]) as jobd \gset
select is((select count(*)::int from public.enrichment_items where job_id = :'jobd'), 1, 'unpublished courses are not queued');

select * from finish();
rollback;
