begin;
\ir _helpers.psql
select no_plan();

-- Journey M4 (J4.3): the lifecycle log takes the journey email kinds; the notifier reads, never writes, journey events.
select tests.create_user('je-a@test.dev') as a \gset
insert into public.journey_events (user_id, kind, stage) values (:'a', 'stage_entered', 4);

select lives_ok(format($$ insert into public.lifecycle_log (user_id, kind, period_key) values (%L, 'journey_digest', '2026-W45') $$, :'a'),
  'journey_digest is a lifecycle kind');
select lives_ok(format($$ insert into public.lifecycle_log (user_id, kind, period_key) values (%L, 'stage_change', 'e1') $$, :'a'),
  'stage_change is a lifecycle kind');
select throws_ok(format($$ insert into public.lifecycle_log (user_id, kind, period_key) values (%L, 'anything', 'x') $$, :'a'),
  '23514', null, 'other kinds are still refused');

set local role notifier;
select is((select count(*) from public.journey_events where user_id = :'a'), 1::bigint, 'the notifier reads journey events');
select throws_ok(format($$ insert into public.journey_events (user_id, kind, stage) values (%L, 'stage_entered', 5) $$, :'a'),
  '42501', null, 'the notifier cannot write journey events');
reset role;

select * from finish();
rollback;
