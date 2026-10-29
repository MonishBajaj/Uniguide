-- Watching a course for changes without shortlisting it.
create table public.watches (
  user_id uuid not null references auth.users (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, program_id)
);
alter table public.watches enable row level security;
revoke all on public.watches from anon, authenticated;
grant select, insert, delete on public.watches to authenticated;
create policy "own watches" on public.watches for select to authenticated using (user_id = (select auth.uid()));
create policy "add own watch" on public.watches for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id));
create policy "remove own watch" on public.watches for delete to authenticated using (user_id = (select auth.uid()));

-- Everyone watching or shortlisting a course is told once when its facts change.
create or replace function public.notify_program_watchers(p_program_id uuid, p_title text, p_body text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if not (session_user = 'ingest_worker' or current_setting('role', true) = 'ingest_worker'
          or public.is_admin() or public.is_operator()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.notifications (user_id, kind, title, body, program_id)
  select r.user_id, 'fact_changed', left(p_title, 200), left(p_body, 2000), p_program_id
  from (
    select s.user_id from public.shortlists s where s.program_id = p_program_id
    union
    select w.user_id from public.watches w where w.program_id = p_program_id
  ) r;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
