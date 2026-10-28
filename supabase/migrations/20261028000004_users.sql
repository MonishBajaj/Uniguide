-- Per-user data. Everything here is private to its owner (see the RLS migration).

-- Age below which a parent must consent, per country of residence. Kept as data so counsel
-- can change it without a deploy. Countries not listed fall back to 13 (COPPA floor).
create table public.consent_age_rules (
  country char(2) primary key check (country ~ '^[A-Z]{2}$'),
  parental_consent_below smallint not null check (parental_consent_below between 13 and 18),
  basis text not null
);

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  -- Stored as the first of the month; the day is never collected.
  birth_month date not null check (extract(day from birth_month) = 1),
  residence_country char(2) not null check (residence_country ~ '^[A-Z]{2}$'),
  age_band public.age_band not null,
  consent_state public.consent_state not null,
  -- Academic profile. Raw grade plus its scale; no universal 4.0 conversion.
  home_qualification text,                  -- same codes as requirements.qualification
  grade_value numeric,
  grade_text text,
  grade_scale text,
  budget_amount numeric check (budget_amount > 0),
  budget_currency char(3) check (budget_currency ~ '^[A-Z]{3}$'),
  target_levels public.program_level[] not null default '{}',
  target_countries char(2)[] not null default '{}',
  target_fields text[] not null default '{}', -- ISCED-F codes or prefixes
  intake_year smallint,
  preferences jsonb not null default '{}',  -- fit-score weights and other preferences
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.test_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam public.exam_kind not null,
  exam_version text,                        -- TOEFL iBT moved to a 1-6 scale on 2026-01-21
  taken_on date,
  total numeric,
  sections jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index test_scores_user_idx on public.test_scores (user_id);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.consent_kind not null,
  policy_version text not null,
  method text not null,                     -- 'checkbox', 'email_link'
  evidence jsonb not null default '{}',     -- hashes only, e.g. parent email hash
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
create index consents_user_idx on public.consents (user_id, kind);

create table public.parental_consent_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_email text not null,
  token_hash text not null unique,          -- sha256 of the emailed token; the token itself is never stored
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,  -- null for worker runs
  purpose text not null,                    -- 'profile_extract', 'page_extract', ...
  model text not null,
  prompt_version text not null,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10, 6),
  latency_ms integer,
  stop_reason text,
  input_hash text,                          -- sha256 of the input; the raw input is not stored
  created_at timestamptz not null default now()
);
create index ai_runs_user_idx on public.ai_runs (user_id, created_at desc);

alter table public.fact_versions
  add constraint fact_versions_ai_run_fk foreign key (ai_run_id) references public.ai_runs (id) on delete set null;

create table public.match_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  algorithm_version text not null,
  weights jsonb not null,
  profile_snapshot jsonb not null,
  catalog_hash text not null,               -- hash of the fact ids and versions that were scored
  results jsonb not null,
  created_at timestamptz not null default now()
);
create index match_runs_user_idx on public.match_runs (user_id, created_at desc);

create table public.shortlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  cycle_id uuid references public.program_cycles (id) on delete set null,
  fit_score numeric check (fit_score between 0 and 100),
  eligibility jsonb,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, program_id)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cycle_id uuid not null references public.program_cycles (id) on delete cascade,
  status public.application_status not null default 'shortlisted',
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, cycle_id)
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  due_at timestamptz,
  done boolean not null default false,
  requirement_id uuid references public.requirements (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Landing-page waitlist. Signups by country and level set the wave order.
create table public.signups (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  residence_country char(2) check (residence_country ~ '^[A-Z]{2}$'),
  destination_countries char(2)[] not null default '{}',
  target_level public.program_level not null,
  field text,
  interest public.signup_interest not null,  -- the fake door the visitor chose
  confirmed_13_plus boolean not null check (confirmed_13_plus),
  utm jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create unique index signups_email_key on public.signups (lower(email));
