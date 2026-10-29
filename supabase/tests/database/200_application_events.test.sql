begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('log-a@test.dev') as a \gset
select tests.create_user('log-b@test.dev') as b \gset
select tests.create_user('log-parent@test.dev') as mum \gset
select tests.make_program('log-gb') as cycle \gset

select tests.authenticate_as(:'a');
insert into public.applications (user_id, cycle_id) values (:'a', :'cycle') returning id as app \gset
select results_eq(format($$ select kind, to_value from public.application_events where application_id = %L $$, :'app'),
  $$ values ('created'::text, 'shortlisted'::text) $$, 'adding an application logs its creation');

update public.applications set status = 'submitted' where id = :'app';
update public.applications set decision = 'admitted', status = 'decided' where id = :'app';
update public.applications set notes = 'only notes changed' where id = :'app';
select results_eq(
  format($$ select kind, from_value, to_value from public.application_events where application_id = %L and kind in ('status', 'decision') order by kind desc, from_value $$, :'app'),
  $$ values ('status'::text, 'shortlisted'::text, 'submitted'::text), ('status', 'submitted', 'decided'), ('decision', null, 'admitted') $$,
  'status and decision changes are logged with before and after, other edits are not');

-- Students add portal checks and notes, which stamp the application.
insert into public.application_events (application_id, user_id, kind, note) values (:'app', :'a', 'portal_check', 'Shows under review');
select isnt((select portal_checked_at from public.applications where id = :'app'), null, 'a portal check stamps the application');
select lives_ok(format($$ insert into public.application_events (application_id, user_id, kind, note) values (%L, %L, 'note', 'Emailed the office') $$, :'app', :'a'), 'students add notes');
select throws_ok(format($$ insert into public.application_events (application_id, user_id, kind, note) values (%L, %L, 'note', '  ') $$, :'app', :'a'), '23514', null, 'an empty note is refused');
select throws_ok(format($$ insert into public.application_events (application_id, user_id, kind, to_value) values (%L, %L, 'decision', 'admitted') $$, :'app', :'a'), '42501', null, 'students cannot forge status or decision rows');
select throws_ok(format($$ update public.application_events set note = 'edited' where application_id = %L $$, :'app'), '42501', null, 'the log cannot be edited');
select throws_ok(format($$ delete from public.application_events where application_id = %L $$, :'app'), '42501', null, 'the log cannot be deleted');

-- Other students see nothing and cannot write into someone else's log.
select tests.authenticate_as(:'b');
select is_empty(format($$ select 1 from public.application_events where application_id = %L $$, :'app'), 'B cannot read A''s log');
select throws_ok(format($$ insert into public.application_events (application_id, user_id, kind, note) values (%L, %L, 'note', 'x') $$, :'app', :'b'), '42501', null, 'B cannot add to A''s log');

-- A linked parent reads the log.
select tests.as_postgres();
insert into public.parent_links (parent_id, student_id, student_name) values (:'mum', :'a', 'A');
select tests.authenticate_as(:'mum');
select is((select count(*)::int from public.application_events where application_id = :'app'), 6, 'a linked parent reads the history');

-- Deleting the application removes its history.
select tests.authenticate_as(:'a');
delete from public.applications where id = :'app';
select tests.as_postgres();
select is((select count(*)::int from public.application_events where application_id = :'app'), 0, 'history goes with the application');

select * from finish();
rollback;
