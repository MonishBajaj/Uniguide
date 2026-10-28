-- Shared vocabularies. These are the source of truth for the TS types
-- (supabase gen types) and the Python StrEnums (worker/scripts/gen_enums.py).

-- One shared level scale across countries; programs also carry an ISCED 2011 code.
create type public.program_level as enum ('foundation', 'diploma', 'bachelor', 'master', 'doctorate');
create type public.delivery_mode as enum ('on_campus', 'online', 'hybrid');
create type public.credit_system as enum ('us_credit', 'ects', 'uk_cats', 'other');

-- Trust layer
create type public.fact_status as enum ('verified', 'unverified', 'conflicting', 'unknown');
create type public.coverage_tier as enum ('listed', 'extracted', 'verified');
create type public.review_state as enum ('pending', 'approved', 'rejected', 'superseded', 'auto_rejected');
create type public.verification_method as enum ('human_review', 'seed_manual', 'official_register', 'automated_extraction');
create type public.fact_subject as enum ('requirement', 'deadline', 'cost_item');

-- Requirements
create type public.applicant_category as enum ('all', 'domestic', 'international', 'eu_eea', 'uk_home');
create type public.requirement_kind as enum (
  'entry_qualification', 'language_test', 'admissions_test', 'prerequisite',
  'recommendation_letters', 'statement', 'portfolio', 'interview', 'other'
);
create type public.test_policy as enum (
  'required', 'recommended', 'optional', 'not_accepted', 'waived_conditional', 'unknown', 'conflicting'
);
create type public.exam_kind as enum (
  'ielts_academic', 'ielts_ukvi', 'toefl_ibt', 'toefl_ibt_home', 'pte_academic', 'duolingo',
  'cambridge_c1_c2', 'testdaf', 'dsh', 'goethe', 'delf_dalf', 'tcf',
  'gre', 'gmat', 'sat', 'act'
);

-- Deadlines and costs
create type public.deadline_kind as enum ('application', 'priority', 'funding', 'scholarship', 'documents', 'deposit');
create type public.owning_system as enum ('direct', 'ucas', 'uni_assist', 'common_app', 'ouac', 'uac', 'cao', 'other');
create type public.date_precision as enum ('exact_time', 'date', 'month');
create type public.cost_kind as enum ('tuition', 'fees', 'insurance', 'living', 'application_fee', 'other');
create type public.cost_basis as enum ('per_credit', 'per_term', 'per_year', 'per_month', 'total', 'one_off');

-- Users and consent
create type public.age_band as enum ('under_13', 'age_13_15', 'age_16_17', 'adult');
create type public.consent_state as enum ('not_required', 'pending_parental', 'granted', 'revoked');
create type public.consent_kind as enum ('terms', 'privacy', 'parental', 'ai_processing', 'outcomes_research', 'marketing');
create type public.application_status as enum ('shortlisted', 'preparing', 'submitted', 'decided', 'withdrawn');
create type public.signup_interest as enum ('verified_tracker', 'writing_coach');
