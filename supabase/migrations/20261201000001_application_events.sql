-- 4.7 Portal status log: an append-only history per application. Status and decision changes are
-- recorded by a trigger; the student adds portal checks and notes. Counselors and parents with access
-- to the application can read its history, never write it.

alter table public.applications add column portal_checked_at timestamptz;

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('created', 'status', 'decision', 'portal_check', 'note')),
  from_value text,
  to_value text,
  note text check (length(note) <= 1000),
  created_at timestamptz not null default now(),
  check (kind <> 'note' or length(btrim(note)) > 0)
);
create index application_events_app_idx on public.application_events (application_id, created_at desc);

alter table public.application_events enable row level security;
revoke all on public.application_events from anon;
revoke update, delete on public.application_events from authenticated;

create policy "own rows" on public.application_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy "counselors read shared" on public.application_events for select to authenticated
  using (public.counselor_can_see(user_id));
create policy "parents read linked" on public.application_events for select to authenticated
  using (public.parent_can_see(user_id));
-- Students add only portal checks and notes; status and decision rows come from the trigger.
create policy "own notes and portal checks" on public.application_events for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and kind in ('portal_check', 'note')
    and public.can_process_personal_data(user_id)
    and exists (select 1 from public.applications a where a.id = application_id and a.user_id = (select auth.uid()))
  );

create function public.log_application_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_events (application_id, user_id, kind, to_value)
    values (new.id, new.user_id, 'created', new.status::text);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.application_events (application_id, user_id, kind, from_value, to_value)
    values (new.id, new.user_id, 'status', old.status::text, new.status::text);
  end if;
  if new.decision is distinct from old.decision then
    insert into public.application_events (application_id, user_id, kind, from_value, to_value)
    values (new.id, new.user_id, 'decision', old.decision::text, new.decision::text);
  end if;
  return new;
end;
$$;
revoke all on function public.log_application_change from public, anon, authenticated;

create trigger applications_log_change after insert or update of status, decision on public.applications
  for each row execute function public.log_application_change();

-- A portal check stamps the application, so lists can show "last checked" without reading the log.
create function public.stamp_portal_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.applications set portal_checked_at = new.created_at
  where id = new.application_id and (portal_checked_at is null or portal_checked_at < new.created_at);
  return new;
end;
$$;
revoke all on function public.stamp_portal_check from public, anon, authenticated;

create trigger application_events_portal_check after insert on public.application_events
  for each row when (new.kind = 'portal_check') execute function public.stamp_portal_check();
