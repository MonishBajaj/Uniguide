begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('pf-a@test.dev') as a \gset
select tests.create_user('pf-b@test.dev') as b \gset
select tests.create_user('pf-mum@test.dev') as mum \gset
select tests.create_user('pf-cou@test.dev') as cou \gset
select tests.create_user('pf-admin@test.dev') as admin \gset
insert into public.admins (user_id) values (:'admin');

select is((select public from storage.buckets where id = 'portfolios'), false, 'the portfolio bucket is private');

-- Files go only into the owner's own folder.
select tests.authenticate_as(:'a');
select lives_ok(format($$ insert into storage.objects (bucket_id, name, owner) values ('portfolios', %L, %L) $$, :'a' || '/poster.png', :'a'), 'a student uploads into their folder');
select throws_ok(format($$ insert into storage.objects (bucket_id, name, owner) values ('portfolios', %L, %L) $$, :'b' || '/sneaky.png', :'a'), '42501', null, 'not into someone else''s');
select throws_ok(format($$ insert into storage.objects (bucket_id, name, owner) values ('portfolios', 'loose.png', %L) $$, :'a'), '42501', null, 'not outside a folder');
select lives_ok(format($$ insert into public.portfolio_items (user_id, title, kind, path, mime) values (%L, 'Poster', 'file', %L, 'image/png') $$, :'a', :'a' || '/poster.png'), 'and lists it');
select lives_ok(format($$ insert into public.portfolio_items (user_id, title, kind, url) values (%L, 'Thesis repo', 'link', 'https://github.com/asha/thesis') $$, :'a'), 'links need no file');
select throws_ok(format($$ insert into public.portfolio_items (user_id, title, kind, path, mime) values (%L, 'Stolen', 'file', %L, 'image/png') $$, :'a', :'b' || '/x.png'), '23514', null, 'an item cannot point at another student''s file');
select throws_ok(format($$ insert into public.portfolio_items (user_id, title, kind, url) values (%L, 'Plain http', 'link', 'http://example.org') $$, :'a'), '23514', null, 'links are https');
select throws_ok(format($$ insert into public.portfolio_items (user_id, title, kind, path, mime) values (%L, 'Video', 'file', %L, 'video/mp4') $$, :'a', :'a' || '/v.mp4'), '23514', null, 'only PNG, JPEG or PDF');

select tests.authenticate_as(:'b');
select is_empty($$ select 1 from storage.objects where bucket_id = 'portfolios' $$, 'B cannot see A''s files');
select is_empty($$ select 1 from public.portfolio_items $$, 'or A''s items');
-- The Storage API sets this flag to pass Storage's guard trigger; RLS still decides what is deleted.
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'portfolios';
select tests.as_postgres();
select is((select count(*)::int from storage.objects where bucket_id = 'portfolios'), 1, 'B cannot delete A''s files');

select tests.as_postgres();
insert into public.parent_links (parent_id, student_id, student_name) values (:'mum', :'a', 'A');
select tests.authenticate_as(:'mum');
select is_empty($$ select 1 from public.portfolio_items union all select 1 from storage.objects where bucket_id = 'portfolios' $$, 'a linked parent does not see the portfolio');

-- A counselor sees it while the student shares.
select tests.authenticate_as(:'admin');
insert into public.organizations (name, country, invite_code) values ('Bright Futures', 'IN', 'pf1234') returning id as org \gset
select public.add_org_member(:'org', 'pf-cou@test.dev');
select tests.authenticate_as(:'cou');
select is_empty($$ select 1 from public.portfolio_items $$, 'no access before sharing');
select tests.authenticate_as(:'a');
select public.grant_agency_share('pf1234', 'Asha', 'test');
select tests.authenticate_as(:'cou');
select is((select count(*)::int from public.portfolio_items), 2, 'the counselor sees the shared items');
select is((select count(*)::int from storage.objects where bucket_id = 'portfolios'), 1, 'and can open the files');

select * from finish();
rollback;
