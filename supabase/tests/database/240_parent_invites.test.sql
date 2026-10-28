begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('inv-kid@test.dev') as kid \gset
select tests.create_user('inv-dad@test.dev') as dad \gset
select tests.create_user('inv-busy@test.dev') as busy \gset
select tests.create_user('inv-teen@test.dev', tests.birth_month_for_age(16), 'GB') as teen \gset
select tests.make_program('inv-gb') as cycle \gset

-- The student makes an invite; nobody can insert one directly.
select tests.authenticate_as(:'kid');
select throws_ok($$ insert into public.parent_invites (student_id, student_name) values (auth.uid(), 'x') $$, '42501', null, 'invites are made only through the function');
select throws_ok($$ select public.create_parent_invite('  ') $$, '22023', null, 'the invite needs a name');
select public.create_parent_invite('Asha') as code \gset
select is((select count(*)::int from public.parent_invites), 1, 'the student sees their invite');
select throws_ok(format($$ select public.accept_parent_invite(%L, 'Me') $$, :'code'), '22023', null, 'a student cannot accept their own invite');

-- Anyone with the code sees only the chosen name.
select tests.as_anon();
select results_eq(format($$ select student_name, usable from public.parent_invite_info(%L) $$, :'code'), $$ values ('Asha'::text, true) $$, 'the join page shows the name');

-- A 16-year-old cannot join as a parent; an account already used as a student cannot either.
select tests.authenticate_as(:'teen');
select throws_ok(format($$ select public.accept_parent_invite(%L, 'T') $$, :'code'), '42501', null, 'only adults join as parents');
select tests.authenticate_as(:'busy');
insert into public.applications (user_id, cycle_id) values (:'busy', :'cycle');
select throws_ok(format($$ select public.accept_parent_invite(%L, 'B') $$, :'code'), '22023', null, 'a student account cannot become a parent account');

-- The parent accepts; the code is spent.
select tests.authenticate_as(:'dad');
select is(public.accept_parent_invite(upper(:'code'), 'Dad'), :'kid'::uuid, 'an adult accepts, codes are case-insensitive');
select throws_ok(format($$ select public.accept_parent_invite(%L, 'Dad') $$, :'code'), 'P0002', null, 'an invite works once');
select tests.authenticate_as(:'kid');
insert into public.applications (user_id, cycle_id) values (:'kid', :'cycle');
select tests.authenticate_as(:'dad');
select is((select count(*)::int from public.applications), 1, 'the parent now sees the student''s application');
select is_empty($$ select 1 from public.parent_invites $$, 'the parent does not see the student''s invites');
select lives_ok(format($$ select public.set_parent_digest(%L, false) $$, :'kid'), 'the parent can turn the weekly email off');

-- The student sees who joined and removes them.
select tests.authenticate_as(:'kid');
select results_eq($$ select parent_name, digest_enabled from public.parent_links $$, $$ values ('Dad'::text, false) $$, 'the student sees the parent''s name');
select public.revoke_parent_link(:'dad');
select tests.authenticate_as(:'dad');
select is_empty($$ select 1 from public.applications $$, 'removing the parent ends access at once');
select tests.authenticate_as(:'busy');
select throws_ok(format($$ select public.revoke_parent_link(%L) $$, :'dad'), 'P0002', null, 'only the student can remove their own parent');

-- Expired invites cannot be used, and five open invites is the limit.
select tests.authenticate_as(:'kid');
select public.create_parent_invite('Asha') as old \gset
select tests.as_postgres();
update public.parent_invites set expires_at = now() - interval '1 minute' where code = :'old';
select tests.authenticate_as(:'dad');
select throws_ok(format($$ select public.accept_parent_invite(%L, 'Dad') $$, :'old'), 'P0002', null, 'an expired invite cannot be used');
select tests.authenticate_as(:'kid');
select public.create_parent_invite('A') from generate_series(1, 5);
select throws_ok($$ select public.create_parent_invite('A') $$, '54000', null, 'at most five open invites');

-- The notifier gets digest recipients; students and parents cannot call it.
select tests.authenticate_as(:'dad');
select throws_ok($$ select * from public.parent_digest_recipients() $$, '42501', null, 'only the notifier lists digest recipients');

select * from finish();
rollback;
