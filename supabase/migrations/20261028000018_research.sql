-- Research: de-identified outcomes for analytics and the admission model, read through an
-- analyst role that cannot see user tables, and the model runs it publishes.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'analyst') then
    create role analyst nologin noinherit;
  end if;
end
$$;
grant analyst to postgres;
grant usage on schema public to analyst;

-- Only outcomes whose owner still consents, without user or application ids: the analyst may read
-- every outcomes column except those two, and row-level security drops rows without consent. The
-- grade stays on its own scale; the model standardises within each scale and never converts.
grant select (id, program_id, cycle_id, decision, funding_offered, verification_level, profile_snapshot)
  on public.outcomes to analyst;
create policy "analyst, consented only" on public.outcomes for select to analyst
  using (public.has_consent(user_id, 'outcomes_research'));
grant execute on function public.has_consent to analyst;

create view public.research_outcomes with (security_invoker = true) as
select
  o.id,
  o.program_id,
  i.country,
  c.label as cycle_label,
  c.intake_year,
  o.decision,
  o.funding_offered,
  o.verification_level,
  o.profile_snapshot ->> 'residence_country' as residence_country,
  o.profile_snapshot ->> 'home_qualification' as home_qualification,
  case when jsonb_typeof(o.profile_snapshot -> 'grade_value') = 'number'
       then (o.profile_snapshot ->> 'grade_value')::numeric end as grade_value,
  o.profile_snapshot ->> 'grade_scale' as grade_scale
from public.outcomes o
join public.program_cycles c on c.id = o.cycle_id
join public.programs p on p.id = o.program_id
join public.institutions i on i.id = p.institution_id;
revoke all on public.research_outcomes from public, anon, authenticated;
grant select on public.research_outcomes to analyst;
grant select on public.programs, public.institutions, public.program_cycles to analyst;
create policy "analyst" on public.programs for select to analyst using (true);
create policy "analyst" on public.institutions for select to analyst using (true);
create policy "analyst" on public.program_cycles for select to analyst using (true);

create table public.admission_models (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  trained_through integer not null,         -- last intake year in the training data
  holdout_year integer not null,            -- the later intake it was tested on
  n_train integer not null,
  n_holdout integer not null,
  brier numeric not null,
  brier_baseline numeric not null,          -- predicting the training admit rate for everyone
  calibration_error numeric not null,       -- expected calibration error on the holdout
  calibration jsonb not null default '[]',  -- [{bin, predicted, observed, n}]
  passed boolean not null,
  params jsonb not null,                    -- intercept, slopes, scale stats, country and program offsets
  min_program_n integer not null,
  active boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create unique index admission_models_one_active on public.admission_models (active) where active;
alter table public.admission_models enable row level security;
-- Only a model that passed its gate is ever visible, and only the active one.
create policy "passed and active" on public.admission_models for select to anon, authenticated using (passed and active);
create policy "admins read" on public.admission_models for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete on public.admission_models from anon, authenticated;
grant select, insert, update (active) on public.admission_models to analyst;
create policy "analyst" on public.admission_models for all to analyst using (true) with check (true);
