-- Catalog: where facts come from, which institutions and programs exist, and intakes.

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  url text not null check (url ~ '^https?://'),
  owner text not null,                      -- e.g. 'University of Edinburgh', 'CRICOS register'
  rights_note text,                         -- licence / reuse terms; we store facts and hashes, never page copies
  robots_ok boolean,
  fetched_at timestamptz,
  http_status integer,
  content_hash text,                        -- sha256 of normalised page text
  extractor_version text,
  created_at timestamptz not null default now()
);
create unique index sources_url_hash_key on public.sources (url, coalesce(content_hash, ''));

create table public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,                        -- 'import:au_cricos', 'extract', 'seed'
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  stats jsonb not null default '{}',
  error text
);

create table public.fetch_log (
  id bigint generated always as identity primary key,
  run_id uuid references public.ingest_runs (id) on delete set null,
  url text not null,
  host text not null,
  fetched_at timestamptz not null default now(),
  robots_allowed boolean not null,
  http_status integer,
  bytes integer,
  content_hash text,
  not_modified boolean not null default false
);
create index fetch_log_host_time_idx on public.fetch_log (host, fetched_at desc);

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country char(2) not null check (country ~ '^[A-Z]{2}$'),
  city text,
  official_domain text,
  -- Each country's register identifiers.
  ror_id text,
  ipeds_unitid text,
  ukprn text,
  cricos_provider_code text,
  other_ids jsonb not null default '{}',
  source_id uuid references public.sources (id) on delete set null,
  verification_method public.verification_method not null default 'official_register',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index institutions_ror_key on public.institutions (ror_id) where ror_id is not null;
create unique index institutions_ipeds_key on public.institutions (ipeds_unitid) where ipeds_unitid is not null;
create unique index institutions_ukprn_key on public.institutions (ukprn) where ukprn is not null;
create unique index institutions_cricos_key on public.institutions (cricos_provider_code) where cricos_provider_code is not null;
create index institutions_country_idx on public.institutions (country);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  level public.program_level not null,
  -- ISCED 2011 level and ISCED-F 2013 field are kept beside the product label; "foundation"
  -- or "diploma" do not map to a single ISCED level, so there is no hard-coded mapping.
  isced_level smallint check (isced_level between 2 and 8),
  isced_f text check (isced_f ~ '^\d{2,4}$'),
  cip text check (cip ~ '^\d{2}\.\d{4}$'),
  field_label text,
  track text,                               -- 'professional', 'research', 'thesis', ...
  delivery_mode public.delivery_mode not null default 'on_campus',
  duration_months smallint check (duration_months between 1 and 120),
  required_credits numeric check (required_credits > 0),
  credit_system public.credit_system,
  languages_of_instruction text[] not null default '{en}',
  official_url text check (official_url ~ '^https?://'),
  register_ids jsonb not null default '{}', -- e.g. {"cricos_course_code": "012345A"}
  coverage_tier public.coverage_tier not null default 'listed',
  published boolean not null default false,
  source_id uuid references public.sources (id) on delete set null,
  verification_method public.verification_method not null default 'official_register',
  search_tsv tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(field_label, '') || ' ' || coalesce(track, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index programs_institution_idx on public.programs (institution_id);
create index programs_level_idx on public.programs (level);
create index programs_search_idx on public.programs using gin (search_tsv);

create table public.program_cycles (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  label text not null check (label ~ '^\d{4}-[a-z0-9_]+$'),   -- '2027-fall', '2027-winter', '2027-semester_1'
  intake_year smallint not null check (intake_year between 2000 and 2100),
  intake_term text not null,
  starts_on date,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  unique (program_id, label)
);
