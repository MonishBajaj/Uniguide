-- Practical facts about an institution (funding, housing, transit, arrival), each with its source and quote.
-- Same provenance and verification model as country_rules; entered by admins and by verifiers for their country.
create table public.institution_facts (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  program_id uuid references public.programs (id) on delete cascade,   -- null = the whole institution
  kind text not null check (kind in ('assistantship', 'on_campus_work', 'housing_on_campus', 'housing_off_campus',
    'transit_pass', 'parking', 'airport', 'arrival_support', 'course_registration', 'health_insurance')),
  title text not null check (length(title) between 3 and 200),
  details text check (length(details) <= 1000),
  amount numeric check (amount >= 0),
  currency char(3) check (currency ~ '^[A-Z]{3}$'),
  period text check (period in ('per_month', 'per_term', 'per_year', 'one_off')),
  hours_per_week smallint check (hours_per_week between 1 and 80),
  link text check (link ~ '^https?://'),
  status public.fact_status not null default 'unverified',
  source_id uuid references public.sources (id) on delete set null,
  evidence_quote text not null check (length(trim(evidence_quote)) >= 3),
  verified_at timestamptz,
  verified_by uuid references auth.users (id),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  check (amount is null or (currency is not null and period is not null))
);
create index institution_facts_institution_idx on public.institution_facts (institution_id, kind);
alter table public.institution_facts enable row level security;
create policy "published" on public.institution_facts for select to anon, authenticated
  using (published or (select public.is_admin()));
revoke all on public.institution_facts from anon, authenticated;
grant select on public.institution_facts to anon, authenticated;

create function public._can_edit_institution(p_institution uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.is_operator() or exists (
    select 1 from public.institutions i where i.id = p_institution and i.country = any (public.verifier_countries())
  );
$$;
revoke all on function public._can_edit_institution from public, anon, authenticated;

create function public.add_institution_fact(
  p_institution uuid, p_kind text, p_title text, p_source_url text, p_quote text,
  p_program uuid default null, p_details text default null, p_amount numeric default null,
  p_currency char(3) default null, p_period text default null, p_hours_per_week integer default null,
  p_link text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_domain text;
  v_host text;
begin
  if not public._can_edit_institution(p_institution) then
    raise exception 'Only admins and this country''s verifiers can add facts' using errcode = '42501';
  end if;
  select official_domain into v_domain from public.institutions where id = p_institution;
  v_host := lower(substring(p_source_url from '^https?://([^/:?#]+)'));
  if v_domain is null or v_host is null or not (v_host = lower(v_domain) or v_host like '%.' || lower(v_domain)) then
    raise exception 'The source must be on the institution''s official domain' using errcode = '22023';
  end if;
  insert into public.institution_facts (institution_id, program_id, kind, title, details, amount, currency, period,
                                        hours_per_week, link, source_id, evidence_quote)
  values (p_institution, p_program, p_kind, p_title, p_details, p_amount, p_currency, p_period, p_hours_per_week,
          coalesce(p_link, p_source_url), public._admin_source(p_source_url, 'Official page'), p_quote)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_institution_fact from public, anon;
grant execute on function public.add_institution_fact to authenticated;

create function public.verify_institution_fact(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_institution uuid;
begin
  select institution_id into v_institution from public.institution_facts where id = p_id;
  if not found or not public._can_edit_institution(v_institution) then
    raise exception 'Only admins and this country''s verifiers can verify facts' using errcode = '42501';
  end if;
  update public.institution_facts set status = 'verified', verified_at = now(), verified_by = auth.uid() where id = p_id;
end;
$$;
revoke all on function public.verify_institution_fact from public, anon;
grant execute on function public.verify_institution_fact to authenticated;
