-- Facts live at the program-cycle level. Every row carries its own provenance, and every
-- change arrives as a fact_versions row first (the trust layer). A fact with no row is "unknown".

create table public.fact_versions (
  id uuid primary key default gen_random_uuid(),
  subject public.fact_subject not null,
  subject_id uuid,                          -- null = proposes a new fact row
  cycle_id uuid not null references public.program_cycles (id) on delete cascade,
  proposed jsonb not null,                  -- the fact row's fields
  evidence jsonb not null default '{}',     -- field -> verbatim quote from the source
  evidence_quote text not null,             -- the main quote shown to students and reviewers
  source_id uuid not null references public.sources (id),
  extractor_version text,
  ai_run_id uuid,
  validation jsonb not null default '[]',   -- deterministic validator findings
  review_state public.review_state not null default 'pending',
  created_by text not null default 'worker' check (created_by in ('worker', 'seed', 'admin', 'user_report')),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  reject_reason text,
  conflicts_with uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index fact_versions_queue_idx on public.fact_versions (review_state, created_at);
create index fact_versions_subject_idx on public.fact_versions (subject, subject_id);

-- Provenance columns are repeated on each typed fact table (not a JSON blob) so enum/CHECK
-- typing and SQL filters keep working.
create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.program_cycles (id) on delete cascade,
  applicant_category public.applicant_category not null default 'all',
  kind public.requirement_kind not null,
  -- entry_qualification: one row per accepted qualification
  qualification text,                       -- 'a_levels', 'ib', 'cbse', 'atar', 'abitur', 'bachelor_3yr', 'bachelor_4yr', ...
  min_grade_text text,                      -- as published: 'AAA', '36 points', '2:1'
  min_grade_numeric numeric,
  grade_scale text,                         -- 'gpa_4', 'gpa_10', 'percent', 'ib_45', 'atar', 'uk_class', ...
  -- language_test / admissions_test: one row per exam
  exam public.exam_kind,
  exam_version text,                        -- e.g. TOEFL iBT '2026-01' (1-6 band scale) vs 'legacy' (0-120)
  min_total numeric,
  min_sections jsonb,                       -- {"reading": 6.0, "writing": 6.5}
  test_policy public.test_policy,
  -- other kinds
  count_required smallint,                  -- recommendation letters
  word_limit integer,                       -- statement
  details text,
  is_desirable boolean not null default false, -- a desirable minimum is never treated as an exclusion
  -- provenance
  status public.fact_status not null default 'unknown',
  source_id uuid references public.sources (id) on delete set null,
  evidence_quote text,
  verified_at timestamptz,
  verified_by uuid references auth.users (id),
  verification_method public.verification_method,
  current_version_id uuid references public.fact_versions (id),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint requirements_kind_shape check (
    case kind
      when 'entry_qualification' then qualification is not null and exam is null
      when 'language_test' then exam is not null and exam not in ('gre', 'gmat', 'sat', 'act')
      when 'admissions_test' then exam in ('gre', 'gmat', 'sat', 'act') and test_policy is not null
      when 'recommendation_letters' then count_required is not null
      else true
    end
  ),
  constraint requirements_grade_pair check ((min_grade_numeric is null) or (grade_scale is not null))
);
create index requirements_cycle_idx on public.requirements (cycle_id);

create table public.deadlines (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.program_cycles (id) on delete cascade,
  applicant_category public.applicant_category not null default 'all',
  round text,                               -- 'Round 1', 'Equal consideration', ...
  kind public.deadline_kind not null default 'application',
  owning_system public.owning_system not null default 'direct',
  due_at timestamptz not null,
  timezone text not null default 'UTC',     -- IANA zone the institution states
  precision public.date_precision not null default 'date',
  original_text text,                       -- the deadline exactly as published
  status public.fact_status not null default 'unknown',
  source_id uuid references public.sources (id) on delete set null,
  evidence_quote text,
  verified_at timestamptz,
  verified_by uuid references auth.users (id),
  verification_method public.verification_method,
  current_version_id uuid references public.fact_versions (id),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index deadlines_cycle_idx on public.deadlines (cycle_id);
create index deadlines_due_idx on public.deadlines (due_at);

create table public.cost_items (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.program_cycles (id) on delete cascade,
  applicant_category public.applicant_category not null default 'all',
  kind public.cost_kind not null,
  basis public.cost_basis not null,
  low numeric not null check (low >= 0),
  base numeric not null,
  high numeric not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  fee_year text,                            -- '2027-28'
  mandatory boolean not null default true,
  details text,
  status public.fact_status not null default 'unknown',
  source_id uuid references public.sources (id) on delete set null,
  evidence_quote text,
  verified_at timestamptz,
  verified_by uuid references auth.users (id),
  verification_method public.verification_method,
  current_version_id uuid references public.fact_versions (id),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_items_order check (low <= base and base <= high)
);
create index cost_items_cycle_idx on public.cost_items (cycle_id);

create table public.fx_rates (
  base char(3) not null check (base ~ '^[A-Z]{3}$'),
  quote char(3) not null check (quote ~ '^[A-Z]{3}$'),
  rate numeric not null check (rate > 0),
  as_of date not null,
  source text not null,
  primary key (base, quote, as_of)
);
