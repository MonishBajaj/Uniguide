-- Row-level security on every table. A test asserts that no public table is left without it.

alter table public.sources enable row level security;
alter table public.ingest_runs enable row level security;
alter table public.fetch_log enable row level security;
alter table public.institutions enable row level security;
alter table public.programs enable row level security;
alter table public.program_cycles enable row level security;
alter table public.fact_versions enable row level security;
alter table public.requirements enable row level security;
alter table public.deadlines enable row level security;
alter table public.cost_items enable row level security;
alter table public.fx_rates enable row level security;
alter table public.consent_age_rules enable row level security;
alter table public.admins enable row level security;
alter table public.profiles enable row level security;
alter table public.test_scores enable row level security;
alter table public.consents enable row level security;
alter table public.parental_consent_requests enable row level security;
alter table public.ai_runs enable row level security;
alter table public.match_runs enable row level security;
alter table public.shortlists enable row level security;
alter table public.applications enable row level security;
alter table public.checklist_items enable row level security;
alter table public.signups enable row level security;

-- Anonymous visitors never touch user tables, whatever the policies say.
revoke all on public.profiles, public.test_scores, public.consents, public.parental_consent_requests,
  public.ai_runs, public.match_runs, public.shortlists, public.applications, public.checklist_items,
  public.admins, public.fact_versions, public.ingest_runs, public.fetch_log
from anon;

-- Catalog and facts are written only through RPCs or by the ingest worker.
revoke insert, update, delete, truncate on public.sources, public.institutions, public.programs,
  public.program_cycles, public.requirements, public.deadlines, public.cost_items, public.fx_rates,
  public.consent_age_rules, public.fact_versions, public.ingest_runs, public.fetch_log, public.admins
from anon, authenticated;

-- Profiles: users may edit their academic profile, never their age or consent state.
revoke update on public.profiles from authenticated;
grant update (display_name, home_qualification, grade_value, grade_text, grade_scale, budget_amount,
  budget_currency, target_levels, target_countries, target_fields, intake_year, preferences)
on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated;

-- Public reference data -------------------------------------------------------

create policy "public read" on public.sources for select to anon, authenticated using (true);
create policy "public read" on public.institutions for select to anon, authenticated using (true);
create policy "public read" on public.fx_rates for select to anon, authenticated using (true);
create policy "public read" on public.consent_age_rules for select to anon, authenticated using (true);

create policy "published programs" on public.programs for select to anon, authenticated
  using (published or (select public.is_admin()));

create policy "cycles of published programs" on public.program_cycles for select to anon, authenticated
  using (
    exists (select 1 from public.programs p where p.id = program_id and (p.published or (select public.is_admin())))
  );

-- Facts: anyone sees published facts (verified, or extracted and badged unverified, or
-- conflicting). Admins also see unpublished ones.
create policy "published facts" on public.requirements for select to anon, authenticated
  using (published or (select public.is_admin()));
create policy "published facts" on public.deadlines for select to anon, authenticated
  using (published or (select public.is_admin()));
create policy "published facts" on public.cost_items for select to anon, authenticated
  using (published or (select public.is_admin()));

create policy "admins read" on public.fact_versions for select to authenticated using ((select public.is_admin()));
create policy "admins read" on public.ingest_runs for select to authenticated using ((select public.is_admin()));
create policy "admins read" on public.fetch_log for select to authenticated using ((select public.is_admin()));
create policy "own admin row" on public.admins for select to authenticated using (user_id = (select auth.uid()));

-- Waitlist: insert-only for visitors; only admins can read it.
create policy "anyone can join" on public.signups for insert to anon, authenticated with check (true);
create policy "admins read" on public.signups for select to authenticated using ((select public.is_admin()));
revoke update, delete, truncate on public.signups from anon, authenticated;

-- User-owned tables -------------------------------------------------------------

create policy "own profile" on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
-- Editing the academic profile is processing personal data, so it waits for parental consent.
create policy "own profile update" on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id));

create policy "own rows" on public.test_scores for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.test_scores for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id));
create policy "own rows update" on public.test_scores for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id));
create policy "own rows delete" on public.test_scores for delete to authenticated using (user_id = (select auth.uid()));

-- Consents are written by the user (their own checkboxes) or by RPCs (parental consent).
create policy "own rows" on public.consents for select to authenticated using (user_id = (select auth.uid()));
create policy "own non-parental consents" on public.consents for insert to authenticated
  with check (user_id = (select auth.uid()) and kind <> 'parental');
create policy "withdraw own consents" on public.consents for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and kind <> 'parental');

create policy "own rows" on public.parental_consent_requests for select to authenticated
  using (user_id = (select auth.uid()));

create policy "own rows" on public.ai_runs for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.ai_runs for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id));

create policy "own rows" on public.match_runs for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.match_runs for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id));

create policy "own rows" on public.shortlists for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.shortlists for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id));
create policy "own rows update" on public.shortlists for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.shortlists for delete to authenticated using (user_id = (select auth.uid()));

create policy "own rows" on public.applications for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.applications for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id));
create policy "own rows update" on public.applications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.applications for delete to authenticated using (user_id = (select auth.uid()));

create policy "own rows" on public.checklist_items for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.checklist_items for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.applications a where a.id = application_id and a.user_id = (select auth.uid()))
  );
create policy "own rows update" on public.checklist_items for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.checklist_items for delete to authenticated using (user_id = (select auth.uid()));
