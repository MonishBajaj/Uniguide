begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('pass@test.dev') as a \gset
select tests.authenticate_as(:'a');
insert into public.documents (user_id, kind, title) values (:'a', 'statement_of_purpose', 'SOP');
select id as doc from public.documents where user_id = :'a' \gset
insert into public.document_versions (document_id, user_id, body, word_count) values (:'doc', :'a', 'Draft one.', 2);
select id as v1 from public.document_versions where document_id = :'doc' \gset
select public.record_writing_review(:'v1', 'rubric', 'm', 'p', '{}');   -- the one free review

select tests.as_postgres();
insert into public.entitlements (user_id, kind, provider, external_id, amount, currency, ends_at)
  values (:'a', 'season_pass', 'admin', 'p1', 0, 'USD', now() + interval '1 year') returning id as ent \gset

select tests.authenticate_as(:'a');
select is(public.my_entitlement(), 'season_pass', 'an active pass reports season_pass');
select is((select free_review from public.writing_allowance()), true, 'reviews are free during a pass');
select lives_ok(format($$ select public.record_writing_review(%L, 'rubric', 'm', 'p', '{}') $$, :'v1'), 'a review needs no credit during a pass');
select is((select count(*)::int from public.credit_ledger where user_id = :'a' and delta < 0), 0, 'and nothing was charged');

select tests.as_postgres();
update public.entitlements set ends_at = now() - interval '1 day' where id = :'ent';
select tests.authenticate_as(:'a');
select is(public.my_entitlement(), 'free', 'an expired pass reports free');
select throws_ok(format($$ select public.record_writing_review(%L, 'rubric', 'm', 'p', '{}') $$, :'v1'), 'P0001', 'insufficient_credits', 'expired pass charges again');

select tests.as_postgres();
update public.entitlements set ends_at = now() + interval '1 year', refunded_at = now() where id = :'ent';
select tests.authenticate_as(:'a');
select is(public.my_entitlement(), 'free', 'a refunded pass behaves as expired');

select * from finish();
rollback;
