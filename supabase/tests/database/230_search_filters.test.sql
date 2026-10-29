begin;
\ir _helpers.psql
select no_plan();

-- Four courses, searched by a shared word: open deadline and cheap; closed deadline; open but no
-- tuition published; open, per-term tuition in EUR.
select tests.make_program('zzfilter-open-cheap') as c1 \gset
select tests.make_program('zzfilter-closed') as c2 \gset
select tests.make_program('zzfilter-no-fee') as c3 \gset
select tests.make_program('zzfilter-per-term') as c4 \gset
insert into public.deadlines (cycle_id, due_at, precision, published, status) values
  (:'c1', now() + interval '30 days', 'date', true, 'verified'),
  (:'c2', now() - interval '3 days', 'date', true, 'verified'),
  (:'c3', now() + interval '30 days', 'date', true, 'unverified'),
  (:'c4', date_trunc('day', now()), 'date', true, 'verified');          -- closes at the end of today
insert into public.cost_items (cycle_id, kind, basis, low, base, high, currency, published, status) values
  (:'c1', 'tuition', 'per_year', 9000, 9000, 9000, 'GBP', true, 'verified'),
  (:'c2', 'tuition', 'per_year', 9000, 9000, 9000, 'GBP', true, 'verified'),
  (:'c4', 'tuition', 'per_term', 1500, 1500, 1500, 'EUR', true, 'verified');
insert into public.fx_rates (base, quote, rate, as_of, source) values ('EUR', 'GBP', 0.85, '2026-11-01', 'test');

select tests.as_anon();
select results_eq($$ select slug from public.search_programs(p_query => 'zzfilter') order by slug $$,
  $$ values ('zzfilter-closed'), ('zzfilter-no-fee'), ('zzfilter-open-cheap'), ('zzfilter-per-term') $$, 'no filters: every course');
select results_eq($$ select slug from public.search_programs(p_query => 'zzfilter', p_deadline_open => true) order by slug $$,
  $$ values ('zzfilter-no-fee'), ('zzfilter-open-cheap'), ('zzfilter-per-term') $$, 'deadline open drops the closed course and keeps one closing today');
select results_eq($$ select slug from public.search_programs(p_query => 'zzfilter', p_max_tuition => 5000, p_tuition_currency => 'GBP') order by slug $$,
  $$ values ('zzfilter-per-term') $$, 'per-term fees count twice a year, converted (3000 EUR is about 2550 GBP)');
select results_eq($$ select slug from public.search_programs(p_query => 'zzfilter', p_max_tuition => 10000, p_tuition_currency => 'GBP') order by slug $$,
  $$ values ('zzfilter-closed'), ('zzfilter-open-cheap'), ('zzfilter-per-term') $$, 'a course with no published tuition is left out, not guessed');
select is_empty($$ select 1 from public.search_programs(p_query => 'zzfilter', p_max_tuition => 10000, p_tuition_currency => 'INR') $$,
  'no rate to INR: nothing can be shown as under the limit');
select results_eq($$ select slug from public.search_programs(p_query => 'zzfilter', p_deadline_open => true, p_max_tuition => 10000, p_tuition_currency => 'GBP') order by slug $$,
  $$ values ('zzfilter-open-cheap'), ('zzfilter-per-term') $$, 'filters combine');
select is(public.fx_convert(100, 'GBP', 'EUR'), 100 / 0.85, 'the inverse rate is used when only the other direction is stored');

select * from finish();
rollback;
