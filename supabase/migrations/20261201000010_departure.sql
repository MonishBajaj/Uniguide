-- 10.1 Pre-departure checklist: the student marks the one offer they are taking, then ticks off a
-- timeline counted back from the course start. The tasks themselves are generic and live in the
-- app; country-specific steps come only from published country_rules. Parents cannot read it.

alter table public.applications add column offer_accepted_at timestamptz;
create unique index applications_one_accepted_idx on public.applications (user_id) where offer_accepted_at is not null;

-- Marks the caller's admitted application as the offer they are taking (null clears it).
create function public.set_accepted_offer(p_application_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_application_id is not null and not exists (
    select 1 from public.applications a
    where a.id = p_application_id and a.user_id = auth.uid() and a.decision = 'admitted'
  ) then
    raise exception 'Only your own admitted applications can be accepted' using errcode = '42501';
  end if;
  update public.applications set offer_accepted_at = null
    where user_id = auth.uid() and offer_accepted_at is not null and id is distinct from p_application_id;
  update public.applications set offer_accepted_at = coalesce(offer_accepted_at, now())
    where id = p_application_id;
end;
$$;
revoke all on function public.set_accepted_offer from public, anon;
grant execute on function public.set_accepted_offer to authenticated;

create table public.departure_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  task_key text not null check (task_key ~ '^([a-z_]{1,40}|rule:[0-9a-f-]{36})$'),
  done_at timestamptz not null default now(),
  unique (application_id, task_key)
);

alter table public.departure_tasks enable row level security;
revoke all on public.departure_tasks from anon;
revoke update on public.departure_tasks from authenticated;

create policy "own rows" on public.departure_tasks for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.departure_tasks for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id) and public.owns_application(application_id));
create policy "own rows delete" on public.departure_tasks for delete to authenticated using (user_id = (select auth.uid()));
