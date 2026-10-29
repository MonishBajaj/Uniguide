-- Verified university staff propose corrections to their own institution's facts. A proposal is an ordinary pending
-- fact version: nothing is published until a reviewer promotes it. No paid placement, no change to ordering.
create table public.university_staff (
  user_id uuid not null references auth.users (id) on delete cascade,
  institution_id uuid not null references public.institutions (id) on delete cascade,
  verified_by uuid references auth.users (id),
  verified_at timestamptz not null default now(),
  primary key (user_id, institution_id)
);
alter table public.university_staff enable row level security;
revoke all on public.university_staff from anon, authenticated;
grant select on public.university_staff to authenticated;
create policy "own staff rows" on public.university_staff for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

alter table public.fact_versions drop constraint fact_versions_created_by_check;
alter table public.fact_versions add constraint fact_versions_created_by_check
  check (created_by in ('worker', 'seed', 'admin', 'user_report', 'university'));

create function public.add_university_staff(p_institution uuid, p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can verify university staff' using errcode = '42501';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then
    raise exception 'No account with that email; ask them to sign up first' using errcode = 'P0002';
  end if;
  insert into public.university_staff (user_id, institution_id, verified_by) values (v_uid, p_institution, auth.uid())
  on conflict do nothing;
  return v_uid;
end;
$$;
revoke all on function public.add_university_staff from public, anon;
grant execute on function public.add_university_staff to authenticated;

create function public.propose_university_correction(
  p_cycle uuid, p_subject public.fact_subject, p_proposed jsonb, p_source_url text, p_quote text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.program_cycles c
    join public.programs p on p.id = c.program_id
    join public.university_staff s on s.institution_id = p.institution_id and s.user_id = auth.uid()
    where c.id = p_cycle
  ) then
    raise exception 'Only verified staff of this institution can propose corrections' using errcode = '42501';
  end if;
  if coalesce(length(trim(p_quote)), 0) < 3 then
    raise exception 'A correction needs the quote it rests on' using errcode = '22023';
  end if;
  insert into public.fact_versions (subject, cycle_id, proposed, evidence_quote, source_id, created_by)
  values (p_subject, p_cycle, p_proposed, p_quote, public._admin_source(p_source_url, 'University staff'), 'university')
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.propose_university_correction from public, anon;
grant execute on function public.propose_university_correction to authenticated;
