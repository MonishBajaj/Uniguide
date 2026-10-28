# Developer A, Milestone 5: Depth (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Developer A's 13 P2 rows: sourced institution facts and the pages built on them (7.2, 7.3, 10.2, 10.3, 10.4), the student-side intelligence functions (1.3, 13.4), public trend insights (13.5), watching a course without shortlisting it (3.9), consultancy team tools (16.4), and the gated data rows (X7, X8, X9).

**Architecture:** Per-university practical facts (funding, housing, transit, airport, registration) share one table, `institution_facts`, with typed value columns, a `kind`, an optional `program_id`, and the same provenance columns and admin verification flow as `country_rules`. Country-level banking guidance becomes another `country_rules` kind. Profile comparison and shortlist advice are pure functions in `packages/matching`, each with a ready-to-place component; Developer B places them on student pages. Trend insights are aggregates the worker's `analyst` role publishes with small-group suppression.

**Tech Stack:** Postgres (Supabase) with pgTAP; `packages/matching` (Vitest); Next.js 16; Python worker (pytest).

**Spec:** `docs/FEATURES.md` P2 rows for Developer A; `docs/ARCHITECTURE.md` (research suppression under 10, admission model gate); `docs/DATA_SOURCES.md`.

**Order:** Tasks 1 to 5 depend on each other in sequence (Task 1 first). Tasks 6 to 13 are independent; pick by demand.

## Global Constraints

- Official sources only: the university's own pages for `institution_facts`, government pages for `country_rules`. No forums, rental listing sites or review sites.
- Research aggregates suppress any group under 10 (`docs/ARCHITECTURE.md`); nothing identifies a student.
- Developer B owns `apps/web/app/app/*`. Where A's feature appears on a student page, A ships a tested component and B places it (stated per task).
- Migrations start with `20261105`. Same check commands and commit rules as Milestone 2 (no `Co-Authored-By: Claude` line).

## Review Focus

1. **An institution fact tied to one program** must not appear on the institution's other programs. Pinned in Task 1 (`program facts stay on their program`).
2. **Insight groups of 9** are suppressed, groups of 10 shown. Pinned in Task 8 (`suppresses groups under ten`).
3. **A watched course that is later shortlisted** gets one notification per change, not two. Pinned in Task 9 (`watch and shortlist notify once`).
4. **Shortlist advice with zero shortlisted courses** returns a single "start by shortlisting" item, not an error. Pinned in Task 7 (`empty shortlist`).
5. **A CSV export cell starting with `=`, `+`, `-` or `@`** is escaped (spreadsheet formula injection). Pinned in Task 10 (`escapes formula cells`).

---

### Task 1: `institution_facts`

**Files:** Create `supabase/migrations/20261105000001_institution_facts.sql`, `supabase/tests/database/200_institution_facts.test.sql`; create `apps/web/app/admin/institution-facts/page.tsx` and `actions.ts` (same layout and verification flow as `/admin/rules`); modify the admin nav in `components/site-header.tsx` (one link, admin only).

**Interfaces:** Table `public.institution_facts (id, institution_id uuid not null fk, program_id uuid null fk, kind text not null check (kind in ('assistantship','on_campus_work','housing_on_campus','housing_off_campus','transit_pass','parking','airport','arrival_support','course_registration','health_insurance')), title text not null, details text, amount numeric, currency char(3), period text check (period in ('per_month','per_term','per_year','one_off')), hours_per_week smallint, link text check (link ~ '^https?://'), status public.fact_status not null default 'unverified', source_id uuid, evidence_quote text not null, verified_at timestamptz, verified_by uuid, published boolean not null default true, created_at timestamptz not null default now())`, a check that amounts carry currency and period, and that `link`'s host is under the institution's official domain is enforced in the admin action. RLS like `country_rules`. RPCs `add_institution_fact(...)` and `verify_institution_fact(p_id uuid)`: admins, or verifiers whose countries include the institution's country (reuse the verifier check in `20261028000019_verifiers_agencies.sql`). Pure helper `factsFor(facts, programId, kinds)` in `apps/web/lib/institution-facts.ts`: institution-wide facts plus that program's own.

- [ ] **Step 1:** pgTAP (admin and verifier can add and verify within their country; a verifier for another country cannot; anon sees published only) and Vitest (`program facts stay on their program`).
- [ ] **Step 2:** Run both; expected FAIL. **Step 3:** Implement. **Step 4:** All checks; add two facts locally through the admin page. **Step 5: Commit** `Add sourced institution facts with admin and verifier entry`

### Task 2 (7.2): Funding and work section on course pages

**Files:** Modify `apps/web/components/course-view.tsx`; create `apps/web/components/funding-and-work.tsx`, `apps/web/lib/institution-facts.test.ts` cases.

**Interfaces:** Consumes `factsFor` with kinds `assistantship`, `on_campus_work`, plus the destination's `work_hours` rule from Milestone 3 (`rulesFor`).

- [ ] **Step 1:** Vitest: assistantships listed before on-campus work; a monthly stipend renders with its period; the country work-hours rule shows once. **Step 2:** FAIL. **Step 3:** Section titled "Funding and work while you study", each item with badge and quote; hidden when empty. **Step 4:** Checks, view a course with facts. **Step 5: Commit** `Show assistantships, campus jobs and work hours on course pages`

### Task 3 (7.3): Campus living section

**Files:** Create `apps/web/components/campus-living.tsx`; modify `course-view.tsx`.

**Interfaces:** Kinds `housing_on_campus`, `housing_off_campus`, `transit_pass`, `parking`, `health_insurance`. Monthly equivalents for comparison use `period` (per term to per month uses the program cycle's term length only if published; otherwise shown as published, never converted).

- [ ] **Step 1:** Vitest: grouping by kind; per-term amounts are not converted when term length is unknown. **Step 2:** FAIL. **Step 3:** Section "Living there". **Step 4:** Checks. **Step 5: Commit** `Show sourced housing, transit, parking and insurance costs on course pages`

### Task 4 (10.2, 10.4): Arrival and registration guide at `/courses/[slug]/arrival`

**Files:** Create `apps/web/app/courses/[slug]/arrival/page.tsx`; link from `course-view.tsx` when facts exist.

**Interfaces:** Kinds `airport`, `arrival_support`, `course_registration`.

- [ ] **Step 1:** Vitest for an `arrivalSections(facts)` helper in `apps/web/lib/institution-facts.ts` (orders airport, arrival support, registration; drops empty sections). **Step 2:** FAIL. **Step 3:** Page with the three sections, each fact sourced; `notFound()` when the course has none. **Step 4:** Checks. **Step 5: Commit** `Add an arrival and course registration guide per course`

### Task 5 (10.3): Banking and money setup per country

**Files:** Migration `20261105000002_country_rules_banking.sql` (adds `banking` to the `country_rules.kind` check); modify `apps/web/app/visas/page.tsx` ("Money and banking" block per destination).

- [ ] **Step 1:** pgTAP: a `banking` rule inserts and is readable; Vitest: `rulesFor(..., "banking")`. **Step 2:** FAIL. **Step 3:** Implement; government or central-bank pages only (for example a government page on opening a bank account as a student). **Step 4:** Checks. **Step 5: Commit** `Add sourced banking guidance per destination`

### Task 6 (1.3): Profile comparison function and component

**Files:** Create `packages/matching/src/profile-compare.ts` and test; create `apps/web/components/profile-comparison.tsx`.

**Interfaces:** `compareProfile(profile: StudentProfile, programs: { id: string; title: string; requirements: RequirementRow[]; admitRate: { rate: number; status: string } | null }[]): { programId: string; grade: "above" | "meets" | "below" | "unknown"; tests: { exam: string; result: "above" | "meets" | "below" | "unknown" }[]; admitRate: number | null }[]`. Grades compare only on the same scale (reuse the eligibility logic in `packages/matching/src/eligibility.ts`, never convert); only verified admit rates appear. No percentages of chance.

- [ ] **Step 1:** Vitest: above / meets / below on the same scale; different scale gives `unknown`; unverified admit rate is `null`. **Step 2:** FAIL. **Step 3:** Implement the function and a presentational component (props in, no data fetching). **Step 4:** Checks. **Step 5: Commit** `Add profile comparison against each course's published requirements`. Hand-off: Developer B places `<ProfileComparison>` on the profile or matches page.

### Task 7 (13.4): Shortlist advice

**Files:** Create `packages/matching/src/shortlist-advice.ts` and test; create `apps/web/components/shortlist-advice.tsx`.

**Interfaces:** `shortlistAdvice(items: { programId: string; title: string; band: "reach" | "target" | "likely" | null; deadlines: string[]; country: string; fundingFacts: number; baseCost: number | null }[], profile: { budget: number | null; countries: string[] }): { kind: "empty" | "deadline_cluster" | "no_funding" | "over_budget" | "single_country" | "band_balance"; message: string; programIds: string[] }[]`. Deadline cluster: three or more deadlines within 7 days. Band balance only when bands are on (they are optional); never a percentage.

- [ ] **Step 1:** Vitest: `empty shortlist`; a three-deadline cluster; all over budget; one country only. **Step 2:** FAIL. **Step 3:** Implement with plain, specific messages. **Step 4:** Checks. **Step 5: Commit** `Add shortlist advice: deadline clusters, budget, funding and spread`. Hand-off: Developer B places `<ShortlistAdvice>` on the shortlist page.

### Task 8 (13.5): Public trend insights at `/insights`

**Files:** Migration `20261105000003_public_insights.sql` (`public.public_insights (metric text, dimension jsonb, value numeric, group_size integer check (group_size >= 10), computed_at)`, anon read, `analyst` insert and delete); `worker/src/uniguide_worker/research/insights.py`; CLI `research insights`; `.github/workflows/scheduled.yml` (weekly research job also runs it); `apps/web/app/insights/page.tsx`.

**Interfaces:** `compute_insights(rows: list[OutcomeRow]) -> list[Insight]`: admit share by destination and level, shortlist counts by destination (from `shortlists`, counted without user ids), each with `group_size`.

- [ ] **Step 1:** pytest: `suppresses groups under ten` (9 dropped, 10 kept); nothing with a user id leaves the function. **Step 2:** FAIL. **Step 3:** Implement; the page explains the suppression and the date computed. **Step 4:** Worker and web checks; run locally. **Step 5: Commit** `Publish suppressed trend insights and show them at /insights`

### Task 9 (3.9): Watch a course without shortlisting it

**Files:** Migration `20261105000004_watches.sql` (`public.watches (user_id, program_id, created_at, primary key (user_id, program_id))`, own-row RLS, blocked during pending parental consent like shortlists); modify the monitor notification query in `worker/src/uniguide_worker/monitor.py` (recipients = shortlisted ∪ watching); a `WatchButton` in `apps/web/components/` used by `course-view.tsx`.

- [ ] **Step 1:** pytest (DB): a watcher gets a change notification; `watch and shortlist notify once`; pgTAP: own rows only, pending consent cannot insert. **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** Checks. **Step 5: Commit** `Let students watch a course for changes without shortlisting it`

### Task 10 (16.4): Consultancy team roles and CSV export

**Files:** Migration `20261105000005_agency_roles.sql` (`org_members.role` gains `viewer`; owners add and remove members through `add_org_member` / a new `remove_org_member`); `apps/web/app/agency/team/page.tsx`; `apps/web/app/agency/export/route.ts` (CSV of the dashboard rows); `apps/web/lib/csv.ts` and test.

**Interfaces:** `toCsv(rows: Record<string, string | number | null>[], columns: string[]): string` (RFC 4180 quoting; `escapes formula cells` by prefixing `'`).

- [ ] **Step 1:** Vitest for `toCsv`; pgTAP: only owners manage members, viewers read only. **Step 2:** FAIL. **Step 3:** Implement; export contains only what the dashboard already shows (no writing). **Step 4:** Checks. **Step 5: Commit** `Add consultancy team roles and a CSV export of shared students`

### Task 11 (X7): Hochschulkompass, France and New Zealand

**Gate:** start only when HRK grants partner access. Until then France and New Zealand courses arrive through extraction and the source register (no code).

- [ ] When access arrives: replace the stub in `worker/src/uniguide_worker/importers/de_hochschulkompass.py` with an importer for the partner export format, following `nl_duo.py` (fixture-based tests in `tests/test_importers.py`, `--limit`, Listed tier only). Commit `Import Hochschulkompass programmes from the HRK partner export`.

### Task 12 (X8): Admission model go-live

**Gate:** at least two intakes of consented outcomes. No code unless the gate passes.

- [ ] Run `uv run uniguide-worker research train-admission` weekly (already scheduled). When a run passes the gate (`docs/ARCHITECTURE.md`: 500 training and 100 holdout outcomes, 5% Brier improvement, calibration error at most 0.05), check `/app/match` shows "about N in 10" only for courses with at least 20 outcomes. Record the date in `BACKLOG.md`.

### Task 13 (X9): Gulf visa links

Operational: on `/admin/rules`, add `visa_info` links for AE and QA from the current official government pages, with a quote, and have a second person verify them. No code.

### After the last task

Update `docs/FEATURES.md` statuses for each finished row and the totals.
