-- Welcome, digest and re-engagement emails, sent by the worker as the notifier role.
create table public.lifecycle_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('welcome_1', 'welcome_2', 'welcome_3', 'digest', 'reengage')),
  period_key text not null,                -- 'once' for one-off emails, an ISO week such as 2026-W45 for the digest
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, period_key)
);
alter table public.lifecycle_log enable row level security;
revoke all on public.lifecycle_log from anon, authenticated;
grant select, insert on public.lifecycle_log to notifier;
create policy "notifier" on public.lifecycle_log for all to notifier using (true) with check (true);

-- Who can receive lifecycle email. Never accounts waiting for a parent's consent.
create function public.notifier_lifecycle_recipients()
returns table (user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
               digest boolean, tips boolean, unsubscribe_token text, has_shortlist boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (session_user = 'notifier' or current_setting('role', true) = 'notifier' or public.is_operator()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select p.user_id, u.email::text, u.created_at, u.last_sign_in_at, e.digest, e.tips, e.unsubscribe_token,
         exists (select 1 from public.shortlists s where s.user_id = p.user_id)
  from public.profiles p
  join auth.users u on u.id = p.user_id
  join public.email_preferences e on e.user_id = p.user_id
  where p.consent_state in ('not_required', 'granted') and u.email is not null;
end;
$$;
revoke all on function public.notifier_lifecycle_recipients from public, anon, authenticated;
grant execute on function public.notifier_lifecycle_recipients to notifier;
