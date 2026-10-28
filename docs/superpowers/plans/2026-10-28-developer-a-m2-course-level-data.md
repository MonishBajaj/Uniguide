# Developer A, Milestone 2: Course-level reference data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Milestone 1's deferred defects, make fee waivers a fourth kind of sourced fact, and ship three public pages built from existing facts: a deadline calendar, similar courses on each course page, and an English test guide.

**Architecture:** Facts today are `requirement`, `deadline` and `cost_item`, each with its own table, all arriving through `fact_versions` and the review RPCs. Fee waivers join as `fee_waiver` with a `fee_waivers` table, after one refactor that replaces the three hard-coded `CASE subject` mappings (whose `else` silently means `cost_items`) with a single `public.fact_table(subject)` function. The pages are server components reading published facts through RLS, with the grouping logic in pure, unit-tested functions under `apps/web/lib`.

**Tech Stack:** Postgres (Supabase) with pgTAP; Python 3.13 worker (uv, pytest, ruff, mypy); Next.js 16 server components, Vitest.

**Spec:** `docs/FEATURES.md` rows 4.4, 3.11, 3.5, 2.6 and the Milestone 1 deferred minors; `docs/superpowers/plans/2026-10-28-developer-a-roadmap.md` (M2).

## Global Constraints

- Only official sources. Every fact shown carries `status`, `source_id`, `evidence_quote` and `verified_at`; unverified facts show the existing "Unverified, confirm on the official page" badge.
- Migrations in this milestone start with `20261102`. Adding an enum value goes in its own migration file, before any migration that uses the value.
- Every new table: RLS enabled, a `published facts` select policy like `deadlines`, pgTAP tests. Every new function: `security definer set search_path = ''` only when it must bypass RLS, explicit `revoke ... from public` and grants.
- After a migration: `pnpm db:types`; commit `packages/db-types` and `worker/src/uniguide_worker/db_enums.py`.
- Checks before each commit: worker `uv run ruff check . && uv run ruff format --check . && uv run mypy src tests scripts evals && uv run pytest`; database `pnpm db:test`; web `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test`.
- Copy follows the site: sentence case, no hyphens inside sentences, no exclamation marks, no unsourced numbers.
- Plain commit messages with no `Co-Authored-By: Claude` line (the owner's rule).

## Review Focus

1. **A version with a subject the mapping does not know** must raise, never write into `cost_items`. Pinned in Task 2 (`fact_table raises on an unknown subject`).
2. **A fee waiver with no amount** means the whole fee is waived and must render as "Fee waived", not "0" or "null". Pinned in Task 5 (`formats a null amount as fee waived`).
3. **A deadline on the last day of a month in a time zone ahead of UTC** must appear under its local month, not UTC's. Pinned in Task 6 (`groups by the deadline's own time zone`).
4. **Similar courses for a course with no field code** must return nothing rather than every course. Pinned in Task 7 (`no field code, no similar courses`).
5. **A language requirement with section minimums but no overall minimum** must still appear in the English guide. Pinned in Task 8 (`keeps section-only minimums`).

---

### Task 1: Milestone 1 cleanup (deferred minors)

**Files:**
- Modify: `worker/src/uniguide_worker/seed/loader.py` (`check_sources`, `check_second_look`, `load`)
- Modify: `docs/FEATURES.md` (contract line: amount can be null), `BACKLOG.md:14`
- Test: `worker/tests/test_seed.py`, `worker/tests/test_seed_db.py`, `supabase/tests/database/130_contracts.test.sql`

**Interfaces:**
- Produces: `RESERVED_HOST_SUFFIXES = ("example.org", "example.com", "example.net", ".example", ".test", ".invalid", "localhost")` in `loader.py`.

- [ ] **Step 1: Write the failing tests**

```python
def test_reserved_hosts_are_rejected_in_real_files() -> None:
    with pytest.raises(SeedError, match="reserved"):
        check_sources([_doc("x.example.org", "https://x.example.org/p")])

def test_extra_domain_needs_two_labels() -> None:
    with pytest.raises(SeedError, match="too broad"):
        check_sources([_doc("uni.ac.uk", "https://www.ucas.com/x", extra=["com"])])

def test_second_look_names_compare_case_and_space_insensitively() -> None:
    with pytest.raises(SeedError, match="second look"):
        check_second_look([_fact_doc("deadline", {"date": "2027-01-15"}, second=(" harman ", "2026-11-02"))])
```

In `test_seed_db.py`, `test_hosted_publish_placeholders_is_refused_before_any_write` asserts `load(operator, [PLACEHOLDER_ROOT], hosted=True, publish_placeholders=True)` raises `SeedError` matching `local development only`, and that `select count(*) from fact_versions` is unchanged. In `130_contracts.test.sql`, for both functions: `select function_privs_are('public', 'my_entitlement', array[]::text[], 'anon', array['EXECUTE'])`, the same for `authenticated`, and `select ok(not has_function_privilege('public', 'public.my_entitlement()', 'EXECUTE'))`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd worker && uv run pytest tests/test_seed.py tests/test_seed_db.py -q` then `pnpm db:test`
Expected: the four new Python tests FAIL; the grant assertions PASS already (they pin current behaviour; that is fine, they are regression guards).

- [ ] **Step 3: Implement**

Reserved hosts fail in `check_sources` before the domain match. Each `extra_official_domains` entry needs at least one dot. Names compare with `.strip().casefold()`. Move the `hosted and publish_placeholders` check to the first line of `load()`. Add "`amount` can be null: the whole fee is waived" to the contract line in `docs/FEATURES.md`; fix `BACKLOG.md:14` to say real courses go in `data/seed/courses/`, placeholders in `data/seed/placeholders/`.

- [ ] **Step 4: Run all checks** (Global Constraints). Expected: green.

- [ ] **Step 5: Commit** `Tighten seed checks: reserved hosts, broad extra domains, name variants, and refusal order`

### Task 2: One mapping from fact subject to table

**Files:**
- Create: `supabase/migrations/20261102000001_fact_table.sql`
- Test: `supabase/tests/database/140_fact_table.test.sql`

**Interfaces:**
- Produces: `public.fact_table(p_subject public.fact_subject) returns text` (`immutable`, plain SQL, not security definer), raising `'unknown fact subject %'` for anything unmapped. `_apply_fact_version`, `publish_extracted_version` and `reject_fact_version` are recreated (`create or replace`, same signatures) to call it. Start from their latest definitions: `_apply_fact_version` in `20261028000007_rpcs.sql`, `publish_extracted_version` and `reject_fact_version` in whichever of `20261028000008_worker_role.sql` and `20261028000019_verifiers_agencies.sql` defines them last.

- [ ] **Step 1: Write the failing pgTAP test**

```sql
select is(public.fact_table('requirement'), 'requirements', 'requirements');
select is(public.fact_table('deadline'), 'deadlines', 'deadlines');
select is(public.fact_table('cost_item'), 'cost_items', 'cost items');
select throws_ok($$ select public.fact_table(null) $$, 'P0001', null, 'fact_table raises on an unknown subject');
```

- [ ] **Step 2:** `pnpm db:test`. Expected: FAIL, `function public.fact_table does not exist`.
- [ ] **Step 3:** Write the migration. Replace each `case ... else 'cost_items' end` with `public.fact_table(...)`. Keep the defaults `case v_table` but make its `else` raise.
- [ ] **Step 4:** `pnpm exec supabase migration up && pnpm db:test`. Expected: all tests pass, including the 196 existing ones (the refactor changes no behaviour).
- [ ] **Step 5: Commit** `Map fact subjects to tables in one place, and refuse unknown subjects`

### Task 3: `fee_waiver` facts in the database

**Files:**
- Create: `supabase/migrations/20261102000002_fee_waiver_subject.sql` (only `alter type public.fact_subject add value 'fee_waiver';`)
- Create: `supabase/migrations/20261102000003_fee_waivers.sql`
- Test: `supabase/tests/database/150_fee_waivers.test.sql`

**Interfaces:**
- Produces: table `public.fee_waivers` with `id`, `cycle_id` (fk `program_cycles`, cascade), `applicant_category public.applicant_category not null default 'all'`, `kind text not null check (kind in ('automatic','event','need_based','on_request'))`, `amount numeric check (amount > 0)` (null = whole fee waived), `currency char(3)`, `conditions text`, plus the standard fact columns copied from `deadlines` (`status`, `source_id`, `evidence_quote`, `verified_at`, `verified_by`, `verification_method`, `current_version_id`, `published`, `created_at`, `updated_at`). `fact_table('fee_waiver') = 'fee_waivers'`; the defaults branch gives `kind = 'on_request'`. A `published facts` select policy matching `deadlines`.

- [ ] **Step 1: Write the failing pgTAP test.** Using the helpers in `_helpers.psql` (`tests.make_program`, the propose and promote helpers): insert a `fee_waiver` version for a cycle, promote it as an admin, then assert one `fee_waivers` row exists with the proposed `kind` and `status = 'verified'`; as anon, the row is visible once published and invisible when `published = false`; a version with `kind = 'free_lunch'` fails the check constraint.
- [ ] **Step 2:** `pnpm db:test`. Expected: FAIL (`invalid input value for enum fact_subject: "fee_waiver"`).
- [ ] **Step 3:** Write both migrations; extend `fact_table`; add the policy and `revoke insert, update, delete ... from anon, authenticated`. Leave `recompute_coverage` unchanged: coverage stays about requirements, deadlines and costs.
- [ ] **Step 4:** `pnpm exec supabase migration up && pnpm db:types && pnpm db:test`. Expected: all pass.
- [ ] **Step 5: Commit** `Add fee waivers as a fourth kind of sourced fact`

### Task 4: `course_fee_waivers` returns real rows

**Files:**
- Create: `supabase/migrations/20261102000004_course_fee_waivers.sql` (`create or replace`, same signature as `20261101000001_contracts_for_web.sql`)
- Test: `supabase/tests/database/130_contracts.test.sql` (extend)

**Interfaces:**
- Consumes: `public.fee_waivers` (Task 3).
- Produces: unchanged signature. Returns published waivers for the program's cycles whose `intake_year >= extract(year from now())`, ordered by `kind`, then `amount nulls first`. Stays `security definer` so it reads only published rows explicitly (`where published`).

- [ ] **Step 1:** Add assertions: a published waiver for the program's current cycle is returned; an unpublished one and one on a past cycle are not; another program's waiver is not.
- [ ] **Step 2:** `pnpm db:test`. Expected: the new assertions FAIL (stub returns no rows).
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** `pnpm exec supabase migration up && pnpm db:test`. Expected: pass. Tell Developer B the badge data is live.
- [ ] **Step 5: Commit** `Return published fee waivers from course_fee_waivers`

### Task 5: Fee waivers in the seed loader and on the course page

**Files:**
- Modify: `worker/src/uniguide_worker/seed/schema.json` (subject enum adds `fee_waiver`), `worker/src/uniguide_worker/seed/loader.py` (`_fact_fields` for fee waivers, `FACT_TABLES`), `data/seed/README.md` (fact fields table row)
- Modify: `apps/web/lib/catalog.ts` (load fee waivers with the cycle), `apps/web/components/course-view.tsx` (a "Application fee waivers" section), `apps/web/lib/format.ts` (`waiverAmount`)
- Test: `worker/tests/test_seed.py`, `worker/tests/test_seed_db.py`, `apps/web/lib/format.test.ts` (create if missing)

**Interfaces:**
- Produces: `waiverAmount(amount: number | null, currency: string | null): string` in `apps/web/lib/format.ts`: `null` gives `"Fee waived"`, otherwise `money(amount, currency)` followed by `" off"`. `CycleFacts` gains `feeWaivers: Tables<"fee_waivers">[]`.

- [ ] **Step 1: Write the failing tests**

```ts
it("formats a null amount as fee waived", () => expect(waiverAmount(null, null)).toBe("Fee waived"));
it("formats a partial waiver", () => expect(waiverAmount(50, "USD")).toBe("$50 off"));
```

```python
def test_fee_waiver_seed_fact_loads(seed_dir, operator):  # in test_seed_db.py, reuse TEMPLATE with a fee_waiver fact
    ...
    assert operator.execute("select kind, amount from fee_waivers ...").fetchone() == {"kind": "event", "amount": None}
```

- [ ] **Step 2:** run `pnpm --filter web test` and `uv run pytest tests/test_seed_db.py`. Expected: FAIL (`waiverAmount` not exported; schema rejects `fee_waiver`).
- [ ] **Step 3:** Implement. Fee waivers are not critical facts (no second look). The section shows each waiver's kind label, `waiverAmount`, conditions, and the existing `FactBadge` and `Evidence` components; it is hidden when there are none.
- [ ] **Step 4:** Run all checks, then load a local seed file with one waiver and open the course page. Expected: the section shows the waiver with its source.
- [ ] **Step 5: Commit** `Load fee waivers from seed files and show them on course pages`

**Not in this task:** extracting fee waivers from pages with the model. Record it in `BACKLOG.md` as a follow-up; human-verified seed and admin review are the only paths for now.

### Task 6 (3.11): Deadline calendar at `/deadlines`

**Files:**
- Create: `apps/web/lib/deadline-calendar.ts`, `apps/web/lib/deadline-calendar.test.ts`
- Create: `apps/web/app/deadlines/page.tsx`
- Modify: `apps/web/app/sitemap.ts` (add `/deadlines`), `apps/web/components/site-footer.tsx` (link)

**Interfaces:**
- Produces: `type CalendarDeadline = { programSlug: string; programTitle: string; institution: string; country: string; level: string; kind: string; dueAt: string; timezone: string; precision: string; status: string }` and `groupByMonth(rows: CalendarDeadline[], now: Date): { month: string; label: string; items: CalendarDeadline[] }[]` (month key `YYYY-MM` in the deadline's own time zone; past deadlines dropped; months ascending; items by `dueAt`).

- [ ] **Step 1: Write the failing tests**

```ts
it("groups by the deadline's own time zone", () => {
  const r = groupByMonth([row({ dueAt: "2027-01-31T20:00:00Z", timezone: "Asia/Kolkata" })], new Date("2026-11-01"));
  expect(r[0].month).toBe("2027-02");
});
it("drops past deadlines", () => expect(groupByMonth([row({ dueAt: "2026-10-01T00:00:00Z" })], new Date("2026-11-01"))).toEqual([]));
it("orders months and items", () => { /* three rows across two months; assert keys and order */ });
```

- [ ] **Step 2:** `pnpm --filter web test`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `groupByMonth` with `Intl.DateTimeFormat` and the row's `timezone`. The page reads published deadlines of kind `application` joined to cycles, programs and institutions, with `searchParams` filters `country`, `level`, `intake` (cycle label), using the same field styles as `/courses`. Each item links to the course page and shows the existing `deadlineText` and status badge. Empty state: "No open deadlines match these filters." Metadata title "Application deadlines".
- [ ] **Step 4:** Run web checks, then open `/deadlines` and `/deadlines?country=GB`. Expected: months in order, filter applied, mobile width has no horizontal scroll.
- [ ] **Step 5: Commit** `Add a public deadline calendar grouped by month`

### Task 7 (3.5): Similar courses on the course page

**Files:**
- Create: `supabase/migrations/20261102000005_similar_programs.sql`
- Test: `supabase/tests/database/160_similar_programs.test.sql`
- Modify: `apps/web/components/course-view.tsx` ("Similar courses" section)

**Interfaces:**
- Produces: `public.similar_programs(p_program uuid, p_limit int default 4) returns setof public.programs`, `stable`, **not** security definer (RLS decides visibility). Same `level`, same `isced_f` (when the course's `isced_f` is a 4-digit code, fall back to its first 3 digits if fewer than `p_limit` match), published, different institution, excluding itself; ordered by coverage tier (`verified` first) then title.

- [ ] **Step 1: Write the failing pgTAP test**: three published programs sharing `isced_f` and level at other institutions are returned; an unpublished one, one at the same institution, and one at another level are not; `no field code, no similar courses` (a program with `isced_f` null returns zero rows); anon can call it.
- [ ] **Step 2:** `pnpm db:test`. Expected: FAIL (function missing).
- [ ] **Step 3:** Write the migration; `pnpm exec supabase migration up && pnpm db:types`. Render up to four `ProgramCard`s; hide the section when empty.
- [ ] **Step 4:** Run all checks, open a course page. Expected: section shows other placeholder courses of the same field and level, or nothing.
- [ ] **Step 5: Commit** `Show similar courses on course pages`

### Task 8 (2.6): English test guide at `/english-tests`

**Files:**
- Create: `apps/web/lib/english-tests.ts`, `apps/web/lib/english-tests.test.ts`
- Create: `apps/web/app/english-tests/page.tsx`
- Modify: `apps/web/app/sitemap.ts`, `apps/web/components/site-footer.tsx`

**Interfaces:**
- Produces: `type LanguageRow = { programSlug: string; programTitle: string; institution: string; country: string; exam: string; examVersion: string | null; minTotal: number | null; minSections: Record<string, number> | null; status: string; testPolicy: string | null }` and `byExam(rows: LanguageRow[]): { exam: string; label: string; courses: LanguageRow[] }[]` (exams ordered by number of courses, descending; courses by country then title).

- [ ] **Step 1: Write the failing tests**: `byExam` groups and orders; `keeps section-only minimums` (a row with `minTotal: null` and sections stays and renders its sections); rows with a different `examVersion` of the same exam stay separate entries in that exam's list (never merged: TOEFL versions use different scales).
- [ ] **Step 2:** `pnpm --filter web test`. Expected: FAIL.
- [ ] **Step 3:** Page reads published `requirements` of kind `language_test`. A section per exam: which courses accept it and their published minimums with status badges. An exam filter (`?exam=ielts_academic`). An intro that says the guide shows only what each course publishes, and that score conversions between tests are not shown because they are not published facts here.
- [ ] **Step 4:** Run web checks, open `/english-tests`. Expected: one section per exam present in the data.
- [ ] **Step 5: Commit** `Add an English test guide built from each course's published requirements`

### After the last task

Update `docs/FEATURES.md`: 4.4 and 3.11 and 2.6 to Built, 3.5 note "similar courses done; campus living is 7.3, career outcomes 13.3", and the totals line.
