# Developer A, Milestone 3: Country-level reference data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `country_rules` from free text into typed, sourced numbers, then build four public pages from them: visa step checklists (9.1), a proof-of-funds calculator (9.2), post-graduation work routes (9.4) and a country comparison (3.10).

**Architecture:** `country_rules` gains typed columns (amount, currency, period, months, hours, step order) and new kinds, entered and verified by admins exactly as today. One pure function in `packages/matching` computes required funds from verified rules plus a course's own published tuition, so the calculator and any later student feature agree. Pages are server components reading published rules through RLS. Nothing is computed from an unverified number without saying so on screen.

**Tech Stack:** Postgres (Supabase) with pgTAP; `packages/matching` (TypeScript, Vitest); Next.js 16 server components.

**Spec:** `docs/FEATURES.md` rows 9.1, 9.2, 9.4, 3.10; `docs/DATA_SOURCES.md` ("Visa and country rules": government pages only); roadmap M3.

## Global Constraints

- `country_rules` links only to government pages, or government-run study portals where the visa page refuses automated checks (`docs/DATA_SOURCES.md`). Every typed number has an `evidence_quote` from that page.
- No immigration advice. Pages say they list official requirements and link to the official page; they never predict a visa outcome (`/visas` already sets this tone).
- Only `verified` rules feed a calculation. An unverified amount may be shown, labelled, but the calculator refuses to total it.
- Money is never converted silently: show the official currency first; any conversion uses `loadFx` and says "approximate, at today's rate".
- Migrations start with `20261103`. Enum or check-constraint changes get their own migration before use.
- Same check commands and commit rules as Milestone 2 (no `Co-Authored-By: Claude` line).

## Review Focus

1. **Two verified proof-of-funds rules for one country** (for example London and the rest of the UK) must stay separate, chosen by a `region` key, never summed. Pinned in Task 3 (`picks the rule for the region, never sums two`).
2. **A rule that applies only to some residence countries** must not show for others. Pinned in Task 2 (`applies_to filters by residence`).
3. **Tuition published per credit or per term** must be annualised with the same basis logic as matching, not read as per year. Pinned in Task 3 (`uses the course's own cost basis`).
4. **A country with no verified data** must show "Not yet verified" in the comparison, never a blank or zero. Pinned in Task 6 (`missing values say not yet verified`).
5. **Steps with equal order numbers** must render in a stable order (by title). Pinned in Task 4 (`stable order for equal steps`).

---

### Task 1: Typed `country_rules`

**Files:**
- Create: `supabase/migrations/20261103000001_country_rules_typed.sql`
- Modify: the admin RPC used by `apps/web/app/admin/rules/actions.ts` (recreate with the new optional parameters), `apps/web/app/admin/rules/page.tsx` and `actions.ts` (new fields)
- Test: `supabase/tests/database/170_country_rules_typed.test.sql`

**Interfaces:**
- Produces new nullable columns: `amount numeric check (amount >= 0)`, `currency char(3)`, `period text check (period in ('per_month','per_year','total'))`, `months smallint check (months between 1 and 120)`, `hours_per_week smallint check (hours_per_week between 1 and 80)`, `region text` (for example `'london'`; null means the whole country), `step smallint` (order within a checklist). `kind` check extended to `('aps_certificate','visa_info','proof_of_funds','visa_step','post_study_work','work_hours','other')`. A check that `proof_of_funds` rows with an `amount` also have `currency` and `period`; `post_study_work` rows have `months`; `work_hours` rows have `hours_per_week`.

- [ ] **Step 1:** pgTAP: insert as admin one row per new kind with valid typed fields (passes); a `proof_of_funds` with amount but no currency fails `23514`; a `post_study_work` without months fails; anon reads published rows and cannot insert.
- [ ] **Step 2:** `pnpm db:test`. Expected: FAIL on the new columns.
- [ ] **Step 3:** Migration, `pnpm exec supabase migration up && pnpm db:types`. Admin form shows the typed fields that apply to the chosen kind (plain progressive disclosure: show all, label which kinds use them; the server action validates with zod per kind).
- [ ] **Step 4:** All checks; add one rule of each kind through `/admin/rules` locally. Expected: saved, listed, verifiable.
- [ ] **Step 5: Commit** `Give country rules typed amounts, durations, hours and step order`

### Task 2: Rule selection in one place

**Files:**
- Create: `packages/matching/src/country-rules.ts`, `packages/matching/src/country-rules.test.ts`; export from `packages/matching/src/index.ts`

**Interfaces:**
- Produces: `type CountryRule = { destination: string; appliesTo: string[]; kind: string; title: string; details: string | null; link: string | null; status: "verified" | "unverified" | "conflicting" | "unknown"; amount: number | null; currency: string | null; period: "per_month" | "per_year" | "total" | null; months: number | null; hoursPerWeek: number | null; region: string | null; step: number | null; evidenceQuote: string | null }` and `rulesFor(rules: CountryRule[], destination: string, residence: string | null, kind?: string): CountryRule[]` (destination match; `appliesTo` empty or containing `residence`; when `residence` is null only `appliesTo`-empty rules).

- [ ] **Step 1:** Vitest: `applies_to filters by residence` (an APS rule for `IN` shows for `IN`, not for `US`, not for `null`); kind filter; destination filter.
- [ ] **Step 2:** `pnpm --filter @uniguide/matching test`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement; map database rows to `CountryRule` in a small `toCountryRule(row)` in `apps/web/lib/country-rules.ts`.
- [ ] **Step 4:** Tests pass; `pnpm -r typecheck`.
- [ ] **Step 5: Commit** `Select country rules by destination, residence and kind in one function`

### Task 3 (9.2): Proof-of-funds calculation

**Files:**
- Create: `packages/matching/src/visa-funds.ts`, `packages/matching/src/visa-funds.test.ts`

**Interfaces:**
- Consumes: `CountryRule`, `rulesFor` (Task 2); the existing cost-basis helpers in `packages/matching/src/cost.ts` (use whatever function there annualises a `cost_item`; do not reimplement the basis logic).
- Produces: `type FundsResult = { ok: true; currency: string; living: number; tuition: number; total: number; rule: CountryRule } | { ok: false; reason: "no_verified_rule" | "region_required" | "currency_mismatch" | "no_tuition" }` and `requiredFunds(rules: CountryRule[], destination: string, region: string | null, firstYearTuition: { amount: number; currency: string } | null): FundsResult`. Uses only `verified` `proof_of_funds` rules. `per_month` × the rule's own `months` (a `per_month` rule with null `months` gives `no_verified_rule`: the admin must enter the months the official page states), `per_year` as is, `total` as is.

- [ ] **Step 1: Write the failing tests** with fixture numbers marked as fixtures (not real figures): monthly rule × months plus tuition; `picks the rule for the region, never sums two` (two verified rules with regions `london` and null; `region: "london"` uses the first; `region: null` uses the second; with only region rules and `region: null` gives `region_required`); unverified rule gives `no_verified_rule`; tuition in another currency gives `currency_mismatch`; `uses the course's own cost basis` (a per-credit tuition annualised by the existing helper).
- [ ] **Step 2:** `pnpm --filter @uniguide/matching test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5: Commit** `Compute proof of funds from verified country rules and the course's own tuition`

### Task 4 (9.1): Visa step checklists on `/visas`

**Files:**
- Modify: `apps/web/app/visas/page.tsx`
- Create: `apps/web/lib/visa-steps.ts`, `apps/web/lib/visa-steps.test.ts`

**Interfaces:**
- Produces: `orderSteps(rules: CountryRule[]): CountryRule[]` (kind `visa_step` only, by `step`, then title: `stable order for equal steps`).

- [ ] **Step 1:** Vitest for `orderSteps`, including equal step numbers.
- [ ] **Step 2:** Expected FAIL. **Step 3:** For each destination with steps, render a numbered list under its official links, each step with its badge, quote and link; an optional "Where you live" select (`?from=IN`) applies `rulesFor`. Destinations without steps stay as today.
- [ ] **Step 4:** Web checks; add two local steps through admin and view `/visas`. Expected: ordered, badged, filtered by residence.
- [ ] **Step 5: Commit** `Show sourced visa steps per country, filtered by where the student lives`

### Task 5 (9.2 page, 9.4): `/visas/funds` calculator and post-graduation routes

**Files:**
- Create: `apps/web/app/visas/funds/page.tsx`
- Modify: `apps/web/app/visas/page.tsx` (a "Working after you graduate" block per destination from `post_study_work` rules, and part-time hours from `work_hours`)

**Interfaces:**
- Consumes: `requiredFunds` (Task 3), `loadCycle` / `loadCurrentCycles` from `apps/web/lib/catalog.ts` for a course's tuition, `loadFx` for the approximate conversion.

- [ ] **Step 1:** Add to `visa-funds.test.ts` (or a new `apps/web/lib` test if mapping code lives there) a test that the page's tuition picker passes the course's first-year tuition in its own currency.
- [ ] **Step 2:** Expected FAIL. **Step 3:** The page takes `?course=<slug>&region=<region>`: shows the rule used (amount, period, quote, link), the course's tuition fact, the total in the official currency, and an "approximate, at today's rate" line in the student's chosen currency. Every `ok: false` reason has its own plain sentence (for example "This country's amount is not verified yet. Check the official page."). The post-graduation block lists each verified route with its months and link; unverified ones carry the badge.
- [ ] **Step 4:** Web checks; try a course in a country with and without a verified rule. Expected: total with sources, or the specific reason.
- [ ] **Step 5: Commit** `Add a proof of funds calculator and post graduation work routes to the visa pages`

### Task 6 (3.10): Country comparison at `/compare/countries`

**Files:**
- Create: `apps/web/lib/country-compare.ts`, `apps/web/lib/country-compare.test.ts`, `apps/web/app/compare/countries/page.tsx`
- Modify: `apps/web/app/sitemap.ts`, `apps/web/components/site-footer.tsx`

**Interfaces:**
- Produces: `type CountryColumn = { code: string; tuitionRange: { low: number; high: number; currency: string; courses: number } | null; fundsRule: CountryRule | null; postStudy: CountryRule | null; workHours: CountryRule | null }` and `compareCountries(codes: string[], rules: CountryRule[], tuition: { country: string; amount: number; currency: string }[]): CountryColumn[]`. Tuition range only from published, verified tuition facts (annualised), with the count of courses it rests on.

- [ ] **Step 1:** Vitest: ranges from several courses; `missing values say not yet verified` (no data gives `null`, which the page renders as "Not yet verified"); unverified rules excluded from columns.
- [ ] **Step 2:** Expected FAIL. **Step 3:** Page with up to four countries (`?c=GB&c=DE&c=CA`), one row per dimension: tuition range (with "from N courses"), proof of funds, part-time work hours, post-graduation route. Each cell links to its source. A note that ranges reflect only courses verified so far.
- [ ] **Step 4:** Web checks at desktop and phone width. Expected: no horizontal page scroll (the table scrolls inside its own container).
- [ ] **Step 5: Commit** `Add a country comparison built only from verified facts`

### After the last task

Data entry (operational, not code): for each Wave 1 country (US, GB, CA, AU, DE, IE), an admin enters and a second person verifies `proof_of_funds`, `post_study_work`, `work_hours` and the main `visa_step` rules from government pages. Then update `docs/FEATURES.md`: 9.1, 9.2, 9.4, 3.10 to Built, and the totals.
