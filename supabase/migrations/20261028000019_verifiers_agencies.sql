-- Months 6-12: per-country verifiers (contractors) and consultancy dashboards with
-- student-granted, revocable sharing.

-- Verifiers ---------------------------------------------------------------------

create table public.verifiers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 120),
  countries char(2)[] not null check (cardinality(countries) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.verifiers enable row level security;
revoke all on public.verifiers from anon;
create policy "admins manage" on public.verifiers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "own row" on public.verifiers for select to authenticated using (user_id = (select auth.uid()));

create function public.verifier_countries() returns char(2)[]
language sql stable security definer set search_path = '' as $$
  select coalesce((select v.countries from public.verifiers v where v.user_id = auth.uid() and v.active), '{}');
$$;

-- Admins and operators review everything; a verifier only courses in their countries.
create function public.can_review_cycle(p_cycle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.is_operator() or exists (
    select 1 from public.program_cycles c
    join public.programs p on p.id = c.program_id
    join public.institutions i on i.id = p.institution_id
    where c.id = p_cycle and i.country = any (public.verifier_countries())
  );
$$;

create policy "verifiers read their countries" on public.fact_versions for select to authenticated
  using (cardinality((select public.verifier_countries())) > 0 and public.can_review_cycle(cycle_id));

create or replace function public.promote_fact_version(
  p_version_id uuid,
  p_status public.fact_status default 'verified',
  p_method public.verification_method default 'human_review',
  p_verified_at timestamptz default null,
  p_reviewer_name text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_version public.fact_versions;
  v_fact_id uuid;
begin
  if p_status not in ('verified', 'conflicting') then
    raise exception 'A reviewed fact is either verified or conflicting';
  end if;
  if p_method not in ('human_review', 'seed_manual') then
    raise exception 'Approval must be a human review or a manual seed check';
  end if;

  select * into v_version from public.fact_versions where id = p_version_id for update;
  if not found then
    raise exception 'Fact version % not found', p_version_id;
  end if;
  if not public.can_review_cycle(v_version.cycle_id) then
    raise exception 'Only admins and this country''s verifiers can approve facts' using errcode = '42501';
  end if;
  if v_version.review_state not in ('pending') then
    raise exception 'Fact version % is already %', p_version_id, v_version.review_state;
  end if;

  v_fact_id := public._apply_fact_version(
    v_version, p_status, p_method, coalesce(p_verified_at, now()), auth.uid()
  );

  update public.fact_versions
    set review_state = 'superseded'
    where subject = v_version.subject and subject_id = v_fact_id and review_state = 'approved' and id <> p_version_id;

  update public.fact_versions
    set review_state = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        reject_reason = case when p_reviewer_name is not null then 'reviewer: ' || p_reviewer_name end
    where id = p_version_id;

  return v_fact_id;
end;
$$;

create or replace function public.reject_fact_version(p_version_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_version public.fact_versions;
  v_table text;
  v_program uuid;
begin
  select * into v_version from public.fact_versions where id = p_version_id for update;
  if not found or not public.can_review_cycle(v_version.cycle_id) then
    raise exception 'Only admins and this country''s verifiers can reject facts' using errcode = '42501';
  end if;
  if v_version.review_state <> 'pending' then
    raise exception 'Fact version % is not pending', p_version_id;
  end if;

  update public.fact_versions
    set review_state = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = p_reason
    where id = p_version_id;

  if v_version.subject_id is not null then
    v_table := case v_version.subject when 'requirement' then 'requirements' when 'deadline' then 'deadlines' else 'cost_items' end;
    execute format(
      'update public.%I set published = false where id = $1 and current_version_id = $2 and status = ''unverified''',
      v_table
    ) using v_version.subject_id, p_version_id;
    select program_id into v_program from public.program_cycles where id = v_version.cycle_id;
    perform public.recompute_coverage(v_program);
  end if;
end;
$$;

create or replace function public.verification_demand(p_limit integer default 100)
returns table (program_id uuid, shortlists bigint, next_deadline timestamptz, facts_unverified bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_admin() or public.is_operator() or current_setting('role', true) = 'ingest_worker'
          or session_user = 'ingest_worker' or cardinality(public.verifier_countries()) > 0) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  with demand as (
    select s.program_id, count(*) as n from public.shortlists s group by s.program_id
  )
  select d.program_id, d.n,
    (select min(dl.due_at) from public.deadlines dl join public.program_cycles c on c.id = dl.cycle_id
       where c.program_id = d.program_id and dl.due_at > now()),
    (select count(*) from public.fact_versions v join public.program_cycles c on c.id = v.cycle_id
       where c.program_id = d.program_id and v.review_state = 'pending')
  from demand d
  order by d.n desc, 3 asc nulls last
  limit least(greatest(p_limit, 1), 1000);
end;
$$;

-- Work done per verifier: reviews and distinct courses with a verified fact. Admins see everyone,
-- a verifier sees their own row.
create function public.verifier_tally()
returns table (user_id uuid, display_name text, countries char(2)[], approved bigint, rejected bigint,
               courses_verified bigint, last_review timestamptz)
language sql stable security definer set search_path = '' as $$
  select v.user_id, v.display_name, v.countries,
    count(*) filter (where fv.review_state in ('approved', 'superseded')),
    count(*) filter (where fv.review_state = 'rejected'),
    count(distinct c.program_id) filter (where fv.review_state in ('approved', 'superseded')),
    max(fv.reviewed_at)
  from public.verifiers v
  left join public.fact_versions fv on fv.reviewed_by = v.user_id
  left join public.program_cycles c on c.id = fv.cycle_id
  where public.is_admin() or v.user_id = auth.uid()
  group by v.user_id, v.display_name, v.countries;
$$;
revoke all on function public.verifier_tally from public, anon;

-- Admins add people by email without reading auth.users from the app.
create function public.add_verifier(p_email text, p_display_name text, p_countries char(2)[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can add verifiers' using errcode = '42501';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then
    raise exception 'No account with that email; ask them to sign up first' using errcode = 'P0002';
  end if;
  insert into public.verifiers (user_id, display_name, countries) values (v_uid, p_display_name, p_countries)
  on conflict (user_id) do update set display_name = excluded.display_name, countries = excluded.countries, active = true;
  return v_uid;
end;
$$;
revoke all on function public.add_verifier from public, anon;

-- Agencies ------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 160),
  country char(2) check (country ~ '^[A-Z]{2}$'),
  website text check (website ~ '^https?://'),
  invite_code text not null unique default encode(extensions.gen_random_bytes(6), 'hex'),
  created_at timestamptz not null default now()
);
create table public.org_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'counselor' check (role in ('owner', 'counselor')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
-- A student's grant to one organisation. Revoking ends access at once; the row stays as a record.
create table public.agency_shares (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 120),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index agency_shares_active on public.agency_shares (student_id, org_id) where revoked_at is null;
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.agency_shares enable row level security;
revoke all on public.organizations, public.org_members, public.agency_shares from anon;
revoke insert, update, delete on public.agency_shares from authenticated;

create function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = auth.uid());
$$;

-- True while the student has an active share with an organisation the caller belongs to.
create function public.counselor_can_see(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.agency_shares s join public.org_members m on m.org_id = s.org_id
    where s.student_id = p_student and s.revoked_at is null and m.user_id = auth.uid()
  );
$$;

create policy "admins manage" on public.organizations for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "members read" on public.organizations for select to authenticated using (public.is_org_member(id));
create policy "students read their organisations" on public.organizations for select to authenticated
  using (exists (select 1 from public.agency_shares s where s.org_id = organizations.id and s.student_id = (select auth.uid())));
create policy "admins manage" on public.org_members for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "members read" on public.org_members for select to authenticated using (public.is_org_member(org_id));
create policy "student reads own" on public.agency_shares for select to authenticated using (student_id = (select auth.uid()));
create policy "members read" on public.agency_shares for select to authenticated using (public.is_org_member(org_id));

-- Counselors read, never write, what a student shares: profile, scores, shortlist and tracker.
-- Writing (drafts, reviews, story answers) is never shared.
create policy "counselors read shared" on public.profiles for select to authenticated using (public.counselor_can_see(user_id));
create policy "counselors read shared" on public.test_scores for select to authenticated using (public.counselor_can_see(user_id));
create policy "counselors read shared" on public.shortlists for select to authenticated using (public.counselor_can_see(user_id));
create policy "counselors read shared" on public.applications for select to authenticated using (public.counselor_can_see(user_id));
create policy "counselors read shared" on public.checklist_items for select to authenticated using (public.counselor_can_see(user_id));

-- Students look up an organisation by its invite code only; there is no public list.
create function public.organization_by_code(p_code text) returns table (id uuid, name text, country char(2), website text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, o.country, o.website from public.organizations o where o.invite_code = lower(trim(p_code));
$$;
revoke all on function public.organization_by_code from public, anon;

create function public.grant_agency_share(p_code text, p_display_name text, p_policy_version text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not public.can_process_personal_data(auth.uid()) then
    raise exception 'A parent must approve your account before you share it' using errcode = '42501';
  end if;
  select id into v_org from public.organizations where invite_code = lower(trim(p_code));
  if v_org is null then
    raise exception 'No organisation with that code' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.agency_shares where student_id = auth.uid() and org_id = v_org and revoked_at is null) then
    raise exception 'You already share with this organisation' using errcode = '23505';
  end if;
  insert into public.consents (user_id, kind, policy_version, method, evidence)
  values (auth.uid(), 'agency_sharing', p_policy_version, 'checkbox', jsonb_build_object('org_id', v_org));
  insert into public.agency_shares (student_id, org_id, display_name)
  values (auth.uid(), v_org, p_display_name)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.grant_agency_share from public, anon;

create function public.revoke_agency_share(p_share_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  update public.agency_shares set revoked_at = now()
  where id = p_share_id and student_id = auth.uid() and revoked_at is null
  returning org_id into v_org;
  if v_org is null then
    raise exception 'No active share' using errcode = 'P0002';
  end if;
  update public.consents set withdrawn_at = now()
  where user_id = auth.uid() and kind = 'agency_sharing' and withdrawn_at is null and evidence ->> 'org_id' = v_org::text;
end;
$$;
revoke all on function public.revoke_agency_share from public, anon;

create function public.add_org_member(p_org uuid, p_email text, p_role text default 'counselor') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can add members' using errcode = '42501';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then
    raise exception 'No account with that email; ask them to sign up first' using errcode = 'P0002';
  end if;
  insert into public.org_members (org_id, user_id, role) values (p_org, v_uid, p_role)
  on conflict (org_id, user_id) do update set role = excluded.role;
  return v_uid;
end;
$$;
revoke all on function public.add_org_member from public, anon;
