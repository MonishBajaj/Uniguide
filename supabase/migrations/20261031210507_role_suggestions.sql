-- Application assist M7 (A1.6): a per-student limit on suggested roles for unmatched fields.
--
-- The suggest-field-role Edge Function asks this before each model call. Only who asked and when is kept:
-- never the label, the suggested role or any value. Nothing is shown to counselors or parents.
--
-- This migration has a real timestamp (docs/SETUP.md, "Migrations dated 2027"). It depends only on
-- auth.users and can_process_personal_data(), both from the 2026-10-28 migrations, so it can run before
-- the 2027-dated ones on a fresh database.

create table public.role_suggestion_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index role_suggestion_calls_user_at on public.role_suggestion_calls (user_id, at desc);

alter table public.role_suggestion_calls enable row level security;
-- Students see their own calls; rows are added only by take_role_suggestion().
create policy role_suggestion_calls_own on public.role_suggestion_calls for select using (user_id = auth.uid());
grant select on public.role_suggestion_calls to authenticated;

/**
 * Records one suggestion request for the signed-in student and says whether it may go ahead:
 * 'ok', 'consent' (pending or revoked: no features, rule 8), 'limit' (30 an hour, 200 a day) or 'signed_out'.
 */
create function public.take_role_suggestion() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return 'signed_out';
  end if;
  if not public.can_process_personal_data(v_uid) then
    return 'consent';
  end if;
  -- One at a time per student, so the counts below can't be raced past.
  perform pg_advisory_xact_lock(hashtextextended('role_suggestion:' || v_uid::text, 0));
  if (select count(*) from public.role_suggestion_calls where user_id = v_uid and at > now() - interval '1 hour') >= 30
     or (select count(*) from public.role_suggestion_calls where user_id = v_uid and at > now() - interval '1 day') >= 200 then
    return 'limit';
  end if;
  delete from public.role_suggestion_calls where user_id = v_uid and at < now() - interval '2 days';
  insert into public.role_suggestion_calls (user_id) values (v_uid);
  return 'ok';
end;
$$;

revoke all on function public.take_role_suggestion() from public, anon;
grant execute on function public.take_role_suggestion() to authenticated;
