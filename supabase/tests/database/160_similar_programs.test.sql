begin;
\ir _helpers.psql
select no_plan();

select tests.make_program('sim-me') as c_me \gset
select tests.make_program('sim-1') as c_1 \gset
select tests.make_program('sim-2') as c_2 \gset
select tests.make_program('sim-near') as c_near \gset
select tests.make_program('sim-hidden', false) as c_hidden \gset
select tests.make_program('sim-phd') as c_phd \gset
select tests.make_program('sim-nofield') as c_nofield \gset

update public.programs set isced_f = '9991' where slug in ('sim-me', 'sim-1', 'sim-2', 'sim-hidden', 'sim-phd');
update public.programs set isced_f = '9992' where slug = 'sim-near';       -- same 3-digit broad field
update public.programs set level = 'doctorate' where slug = 'sim-phd';
-- A second program at the same institution as sim-me
insert into public.programs (institution_id, slug, title, level, published, isced_f)
  select institution_id, 'sim-same-inst', 'MSc same institution', 'master', true, '9991' from public.programs where slug = 'sim-me';

select id as me from public.programs where slug = 'sim-me' \gset
select id as nofield from public.programs where slug = 'sim-nofield' \gset

select tests.as_anon();
select results_eq(format($$ select slug from public.similar_programs(%L, 4) $$, :'me'),
  $$ values ('sim-1'::text), ('sim-2'::text), ('sim-near'::text) $$,
  'same level and field at other institutions, exact field first, then the broad field');
select is((select count(*)::int from public.similar_programs(:'me', 1)), 1, 'the limit applies');
select is_empty(format($$ select 1 from public.similar_programs(%L, 4) where slug in ('sim-hidden', 'sim-phd', 'sim-same-inst', 'sim-me') $$, :'me'),
  'unpublished, other level, same institution and itself are excluded');
select is_empty(format($$ select 1 from public.similar_programs(%L, 4) $$, :'nofield'), 'no field code, no similar courses');

select * from finish();
rollback;
