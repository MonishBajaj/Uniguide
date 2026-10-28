-- Months 4-6: decision season (offers, decision matrix), Wave 2 registers, Germany depth
-- (APS, ECTS), country rules with sources, and published admit rates for optional bands.

-- Registers without a dedicated id column (NL, later FR, NZ, ...) key institutions by country + id.
create unique index institutions_register_key on public.institutions (country, (other_ids ->> 'register_id'))
  where other_ids ? 'register_id';

-- Credits: course minimums (e.g. "at least 180 ECTS") and the student's prior degree.
alter table public.requirements
  add column min_credits numeric check (min_credits > 0),
  add column credit_system public.credit_system;
alter table public.profiles
  add column prior_credits numeric check (prior_credits > 0),
  add column prior_credit_system public.credit_system,
  -- Self-reported standing within the home grading cohort (top x%), only used for optional bands.
  add column class_percentile smallint check (class_percentile between 1 and 100);
grant update (prior_credits, prior_credit_system, class_percentile) on public.profiles to authenticated;

-- Rules that depend on where the student comes from and where they go (APS for Germany, visa
-- pages). Same provenance as facts; nothing here is individual immigration advice.
create table public.country_rules (
  id uuid primary key default gen_random_uuid(),
  destination char(2) not null check (destination ~ '^[A-Z]{2}$'),
  applies_to char(2)[] not null default '{}',   -- residence countries; empty = everyone
  kind text not null check (kind in ('aps_certificate', 'visa_info', 'proof_of_funds', 'other')),
  title text not null,
  details text,
  link text check (link ~ '^https?://'),
  status public.fact_status not null default 'unverified',
  source_id uuid references public.sources (id) on delete set null,
  evidence_quote text,
  verified_at timestamptz,
  verified_by uuid references auth.users (id),
  published boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.country_rules enable row level security;
create policy "published" on public.country_rules for select to anon, authenticated using (published or (select public.is_admin()));
create policy "admins manage" on public.country_rules for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke insert, update, delete on public.country_rules from anon;

create function public.verify_country_rule(p_rule_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can verify rules' using errcode = '42501';
  end if;
  update public.country_rules set status = 'verified', verified_at = now(), verified_by = auth.uid() where id = p_rule_id;
end;
$$;
revoke all on function public.verify_country_rule from public, anon;

-- Published admit rates (e.g. a university's own admissions statistics). Shown only as an optional,
-- low-confidence band, and only when verified.
create table public.program_stats (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  cycle_label text not null,
  admit_rate numeric not null check (admit_rate > 0 and admit_rate <= 1),
  applicants integer check (applicants > 0),
  admitted integer check (admitted >= 0),
  status public.fact_status not null default 'unverified',
  source_id uuid references public.sources (id) on delete set null,
  evidence_quote text,
  verified_at timestamptz,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (program_id, cycle_label)
);
alter table public.program_stats enable row level security;
create policy "published" on public.program_stats for select to anon, authenticated using (published or (select public.is_admin()));
create policy "admins manage" on public.program_stats for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke insert, update, delete on public.program_stats from anon;

-- The student's own decision matrix across offers.
create table public.decision_matrices (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criteria jsonb not null default '[]',   -- [{id, label, weight 1-5}]
  scores jsonb not null default '{}',     -- {application_id: {criterion_id: 1-5}}
  updated_at timestamptz not null default now()
);
alter table public.decision_matrices enable row level security;
revoke all on public.decision_matrices from anon;
create policy "own row" on public.decision_matrices for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id));

grant select on public.country_rules, public.program_stats to ingest_worker;
create policy "worker read" on public.country_rules for select to ingest_worker using (true);
create policy "worker read" on public.program_stats for select to ingest_worker using (true);

-- Reference data. Official pages only; each starts unverified until a reviewer confirms it.
with src as (
  insert into public.sources (url, owner, rights_note, robots_ok, fetched_at)
  values ('https://aps-india.de/', 'Akademische Prüfstelle (APS) India, German Embassy New Delhi', 'Official page; short quote only.', true, '2026-10-28')
  on conflict (url, coalesce(content_hash, '')) do update set owner = excluded.owner
  returning id
)
insert into public.country_rules (destination, applies_to, kind, title, details, link, source_id, evidence_quote)
select 'DE', '{IN}', 'aps_certificate', 'APS certificate for applicants with Indian qualifications',
  'Apply to APS India early: the certificate checks your academic documents and is needed for the German student visa.',
  'https://aps-india.de/', src.id,
  'The APS certificate is part of the documentation generally required for the German student visa procedure.'
from src;

insert into public.country_rules (destination, kind, title, link) values
  ('GB', 'visa_info', 'UK Student visa (GOV.UK)', 'https://www.gov.uk/student-visa'),
  ('US', 'visa_info', 'US student visas (U.S. Department of State)', 'https://travel.state.gov/content/travel/en/us-visas/study/student-visa.html'),
  ('CA', 'visa_info', 'Study permit (Immigration, Refugees and Citizenship Canada)', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit.html'),
  ('AU', 'visa_info', 'Student visa subclass 500 (Department of Home Affairs)', 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500'),
  ('DE', 'visa_info', 'Visa for studying in Germany (Make it in Germany, Federal Government)', 'https://www.make-it-in-germany.com/en/visa-residence/types/studying'),
  ('DE', 'visa_info', 'Visa services (Federal Foreign Office)', 'https://www.auswaertiges-amt.de/en/visa-service'),
  ('IE', 'visa_info', 'Coming to study in Ireland (Immigration Service Delivery)', 'https://www.irishimmigration.ie/coming-to-study-in-ireland/'),
  ('NL', 'visa_info', 'Residence permit for study (IND)', 'https://ind.nl/en/residence-permits/study'),
  ('NZ', 'visa_info', 'Visas (Immigration New Zealand)', 'https://www.immigration.govt.nz/visas/'),
  ('FR', 'visa_info', 'Studying in France (Campus France)', 'https://www.campusfrance.org/en');
