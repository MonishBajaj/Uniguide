begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('media-a@test.dev') as a \gset
select tests.create_user('media-admin@test.dev') as admin \gset
insert into public.admins (user_id) values (:'admin');

select tests.authenticate_as(:'a');
select throws_ok($$ insert into public.media_items (kind, title, url) values ('video', 'Sneaky video', 'https://youtu.be/x') $$, '42501', null, 'only admins add media');

select tests.authenticate_as(:'admin');
select lives_ok($$ insert into public.media_items (kind, title, url, published) values ('video', 'Reading a requirements page', 'https://www.youtube.com/watch?v=abc123DEF45', true) $$, 'an admin publishes a video');
select lives_ok($$ insert into public.media_items (kind, title, starts_at, registration_url) values ('webinar', 'UK visas Q&A', now() + interval '7 days', 'https://example.org/register') $$, 'and drafts a webinar');
select throws_ok($$ insert into public.media_items (kind, title) values ('webinar', 'No time') $$, '23514', null, 'a webinar needs a time');
select throws_ok($$ insert into public.media_items (kind, title) values ('podcast', 'No link') $$, '23514', null, 'a recording needs its link');
select throws_ok($$ insert into public.media_items (kind, title, url) values ('video', 'Plain http', 'http://example.org/v') $$, '23514', null, 'links are https');
select isnt((select published_at from public.media_items where title = 'Reading a requirements page'), null, 'publishing is stamped');

select tests.as_anon();
select results_eq($$ select title from public.media_items $$, array['Reading a requirements page'], 'guests see published items only');
select throws_ok($$ insert into public.media_items (kind, title, url) values ('video', 'Guest', 'https://youtu.be/x') $$, '42501', null, 'guests cannot add');

select * from finish();
rollback;
