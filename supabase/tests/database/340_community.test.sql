begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('com-a@test.dev') as a \gset
select tests.create_user('com-b@test.dev') as b \gset
select tests.create_user('com-alum@test.dev') as alum \gset
select tests.create_user('com-teen@test.dev', tests.birth_month_for_age(16), 'GB') as teen \gset
select tests.create_user('com-admin@test.dev') as admin \gset
insert into public.admins (user_id) values (:'admin');
select tests.make_program('com-one') as cycle \gset
select program_id as program from public.program_cycles where id = :'cycle' \gset

-- Posting a story: pending, invisible to others, never self-published.
select tests.authenticate_as(:'a');
select lives_ok(format($$ insert into public.community_posts (author_id, kind, pseudonym, title, body, country, level) values (%L, 'story', 'Asha R', 'From Pune to Leeds', 'I applied to six courses and learned a lot about deadlines.', 'GB', 'master') $$, :'a'),
  'an adult posts a story');
select throws_ok(format($$ insert into public.community_posts (author_id, kind, pseudonym, title, body, status) values (%L, 'story', 'Asha', 'Sneaky', 'Trying to publish my own post directly.', 'published') $$, :'a'),
  '42501', null, 'status cannot be set by the author');
select throws_ok(format($$ insert into public.community_posts (author_id, kind, pseudonym, title, body) values (%L, 'story', 'Asha', 'Contact', 'Email me at asha.rao@example.com for help.') $$, :'a'),
  '23514', null, 'an email address is refused');
select throws_ok(format($$ insert into public.community_posts (author_id, kind, pseudonym, title, body) values (%L, 'story', 'Asha', 'Link', 'See my notes at https://example.org/notes please.') $$, :'a'),
  '23514', null, 'a link is refused');
select throws_ok(format($$ insert into public.community_posts (author_id, kind, pseudonym, body) values (%L, 'story', 'Asha', 'A story needs a title to be posted.') $$, :'a'),
  '23514', null, 'a story needs a title');
select results_eq($$ select status::text from public.my_community_posts() $$, array['pending'], 'the author sees their own pending post');
select throws_ok($$ select author_id from public.community_posts $$, '42501', null, 'author_id is never readable');

select tests.authenticate_as(:'b');
select is_empty($$ select 1 from public.community_posts $$, 'a pending post is invisible to others');
select tests.as_anon();
select is_empty($$ select 1 from public.community_posts $$, 'and to guests');

-- Limits on who and how much.
select tests.authenticate_as(:'teen');
select throws_ok(format($$ insert into public.community_posts (author_id, kind, pseudonym, title, body) values (%L, 'story', 'Sam', 'My story', 'I am sixteen and want to share this.') $$, :'teen'),
  '42501', null, 'under-18s cannot post');
select tests.authenticate_as(:'a');
insert into public.community_posts (author_id, kind, pseudonym, title, body) select :'a', 'story', 'Asha', 'Story ' || n, 'Another story body that is long enough.' from generate_series(2, 5) n;
select throws_ok(format($$ insert into public.community_posts (author_id, kind, pseudonym, title, body) values (%L, 'story', 'Asha', 'Sixth', 'A sixth pending story should wait.') $$, :'a'),
  '42501', null, 'at most five posts wait for moderation at once');

-- Reviews need an admitted application to that course, one live review each.
select tests.authenticate_as(:'b');
select throws_ok(format($$ insert into public.community_posts (author_id, kind, program_id, pseudonym, body, ratings) values (%L, 'review', %L, 'Ben', 'Great teaching but the support was slow.', '{"teaching": 5, "support": 2, "value": 4}') $$, :'b', :'program'),
  '42501', null, 'a review needs an admitted application');
insert into public.applications (user_id, cycle_id, decision) values (:'b', :'cycle', 'admitted');
select lives_ok(format($$ insert into public.community_posts (author_id, kind, program_id, pseudonym, body, ratings) values (%L, 'review', %L, 'Ben', 'Great teaching but the support was slow.', '{"teaching": 5, "support": 2, "value": 4}') $$, :'b', :'program'),
  'an admitted student reviews the course');
select throws_ok(format($$ insert into public.community_posts (author_id, kind, program_id, pseudonym, body, ratings) values (%L, 'review', %L, 'Ben', 'Second review of the same course here.', '{"teaching": 5, "support": 2, "value": 4}') $$, :'b', :'program'),
  '23505', null, 'one live review per course');
select throws_ok(format($$ insert into public.community_posts (author_id, kind, program_id, pseudonym, body, ratings) values (%L, 'review', %L, 'Ben', 'Ratings out of range should fail here.', '{"teaching": 6, "support": 2, "value": 4}') $$, :'b', :'program'),
  '23514', null, 'ratings are whole numbers from 1 to 5');
select results_eq($$ select badge from public.my_community_posts() m join public.community_posts p using (id) $$, array['Admitted here (self-reported)'], 'the review is labelled self-reported');

-- Questions, and answers only from approved alumni.
select lives_ok(format($$ insert into public.community_posts (author_id, kind, program_id, pseudonym, body) values (%L, 'question', %L, 'Ben', 'How many hours a week does the course take?') $$, :'b', :'program'),
  'a student asks alumni a question');
select id as question from public.community_posts where kind = 'question' \gset
select tests.authenticate_as(:'alum');
insert into public.community_alumni (user_id, program_id, graduation_year, evidence) values (:'alum', :'program', 2024, 'Degree certificate');
select throws_ok(format($$ insert into public.community_posts (author_id, kind, parent_id, pseudonym, body) values (%L, 'answer', %L, 'Old hand', 'About thirty hours a week in term time.') $$, :'alum', :'question'),
  '42501', null, 'nobody answers before the question is published and the alum approved');
select throws_ok(format($$ select public.review_community_alum(id, true) from public.community_alumni $$), '42501', null, 'only admins approve alumni');

-- Moderation.
select tests.authenticate_as(:'a');
select throws_ok(format($$ select public.moderate_community_post(%L, 'published') $$, :'question'), '42501', null, 'only admins moderate');
select tests.authenticate_as(:'admin');
select is((select count(*)::int from public.community_posts where status = 'pending'), 7, 'admins see the pending queue');
select lives_ok(format($$ select public.moderate_community_post(%L, 'published') $$, :'question'), 'an admin publishes the question');
select lives_ok($$ select public.review_community_alum(id, true) from public.community_alumni $$, 'and approves the alum');

select tests.authenticate_as(:'alum');
select lives_ok(format($$ insert into public.community_posts (author_id, kind, parent_id, pseudonym, body) values (%L, 'answer', %L, 'Old hand', 'About thirty hours a week in term time.') $$, :'alum', :'question'),
  'an approved alum answers');
select results_eq($$ select badge from public.community_posts where kind = 'answer' $$, array['Alum, class of 2024'], 'the answer carries the alum label');
select tests.authenticate_as(:'a');
select throws_ok(format($$ insert into public.community_posts (author_id, kind, parent_id, pseudonym, body) values (%L, 'answer', %L, 'Asha', 'I think it is about twenty hours.') $$, :'a', :'question'),
  '42501', null, 'a non-alum cannot answer');

-- Reports: three hide a published post again.
select tests.as_postgres();
select id as story from public.community_posts where title = 'From Pune to Leeds' \gset
update public.community_posts set status = 'published' where id = :'story';
select tests.as_anon();
select results_eq($$ select title from public.community_posts where kind = 'story' $$, array['From Pune to Leeds'], 'a published story is public');
select throws_ok($$ insert into public.community_reports (post_id, reporter_id, reason) values (gen_random_uuid(), gen_random_uuid(), 'spam') $$, '42501', null, 'guests cannot report');
select tests.authenticate_as(:'b');
select lives_ok(format($$ insert into public.community_reports (post_id, reporter_id, reason) values (%L, %L, 'misleading') $$, :'story', :'b'), 'a reader reports a post');
select throws_ok(format($$ insert into public.community_reports (post_id, reporter_id, reason) values (%L, %L, 'spam') $$, :'story', :'b'), '23505', null, 'once per reader');
select tests.authenticate_as(:'alum');
insert into public.community_reports (post_id, reporter_id, reason) values (:'story', :'alum', 'spam');
select tests.authenticate_as(:'teen');
insert into public.community_reports (post_id, reporter_id, reason) values (:'story', :'teen', 'abuse');
select tests.as_anon();
select is_empty($$ select 1 from public.community_posts where kind = 'story' $$, 'three reports take the post down for another look');
select tests.authenticate_as(:'b');
select is_empty($$ select 1 from public.community_reports where reporter_id <> auth.uid() $$, 'readers see only their own reports');

select tests.authenticate_as(:'admin');
select lives_ok($$ select public.resolve_community_report(id, true) from public.community_reports where reason = 'abuse' $$, 'an admin upholds a report');
select results_eq(format($$ select status::text from public.community_posts where id = %L $$, :'story'), array['removed'], 'which removes the post');

select * from finish();
rollback;
