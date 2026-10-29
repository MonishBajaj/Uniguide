begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('ama-a@test.dev') as a \gset
select tests.create_user('ama-admin@test.dev') as admin \gset
insert into public.admins (user_id) values (:'admin');

select tests.authenticate_as(:'a');
select throws_ok($$ insert into public.community_amas (title, host_name, starts_at, ends_at) values ('Sneaky AMA', 'Me', now(), now() + interval '1 hour') $$, '42501', null, 'only admins create AMAs');

select tests.authenticate_as(:'admin');
insert into public.community_amas (title, host_name, host_role, starts_at, ends_at, published) values ('UK visas', 'Priya Shah', 'International officer', now() + interval '2 days', now() + interval '2 days 1 hour', true) returning id as open_ama \gset
insert into public.community_amas (title, host_name, starts_at, ends_at, published) values ('Draft AMA', 'Tom', now() + interval '5 days', now() + interval '5 days 1 hour', false) returning id as draft_ama \gset
insert into public.community_amas (title, host_name, starts_at, ends_at, published) values ('Past AMA', 'Ana', now() - interval '10 days', now() - interval '10 days' + interval '1 hour', true) returning id as past_ama \gset
select throws_ok($$ insert into public.community_amas (title, host_name, starts_at, ends_at) values ('Backwards', 'X Y', now(), now() - interval '1 hour') $$, '23514', null, 'an AMA ends after it starts');

select tests.as_anon();
select results_eq($$ select title from public.community_amas order by starts_at $$, array['Past AMA', 'UK visas'], 'guests see published AMAs only');

select tests.authenticate_as(:'a');
select lives_ok(format($$ insert into public.community_posts (author_id, kind, ama_id, pseudonym, body) values (%L, 'ama_question', %L, 'Asha', 'How long does a CAS take to arrive after I accept?') $$, :'a', :'open_ama'),
  'a student asks before an open AMA');
select throws_ok(format($$ insert into public.community_posts (author_id, kind, ama_id, pseudonym, body) values (%L, 'ama_question', %L, 'Asha', 'Asking a question on a draft event.') $$, :'a', :'draft_ama'),
  '42501', null, 'not on an unpublished AMA');
select throws_ok(format($$ insert into public.community_posts (author_id, kind, ama_id, pseudonym, body) values (%L, 'ama_question', %L, 'Asha', 'Asking after the event is over.') $$, :'a', :'past_ama'),
  '42501', null, 'not after it ends');
select throws_ok(format($$ insert into public.community_posts (author_id, kind, pseudonym, body) values (%L, 'ama_question', 'Asha', 'An AMA question needs its event.') $$, :'a'),
  '42501', null, 'an AMA question without an event is refused');
select tests.as_postgres();
select throws_ok(format($$ insert into public.community_posts (author_id, kind, pseudonym, body) values (%L, 'ama_question', 'Asha', 'An AMA question needs its event.') $$, :'a'),
  '23514', null, 'and the table itself requires the event');
select tests.authenticate_as(:'a');
select id as q from public.community_posts where kind = 'ama_question' \gset
select throws_ok(format($$ select public.answer_ama_question(%L, 'Within days.') $$, :'q'), '42501', null, 'only admins post answers');

select tests.authenticate_as(:'admin');
select lives_ok(format($$ select public.answer_ama_question(%L, 'Usually within a few days of meeting your conditions.') $$, :'q'), 'an admin posts the host''s answer');
select tests.as_anon();
select results_eq($$ select concat(status, ': ', staff_answer) from public.community_posts where kind = 'ama_question' $$,
  array['published: Usually within a few days of meeting your conditions.'], 'the question and answer are public');

select * from finish();
rollback;
