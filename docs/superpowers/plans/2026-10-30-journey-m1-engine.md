# Journey system M1: journey engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One pure engine that reads what a student has saved and returns their stage (1 to 7), ranked next steps and a stalled flag, stored in `journey_state` so later milestones (home, navigation, parent view, emails) all read the same result.

**Architecture:** A new workspace package `packages/journey` (pure TypeScript, like `packages/matching`) holds the types, stage rules, step catalogue, ranking and stalled detection. One security-definer RPC, `journey_snapshot`, returns everything the engine needs as one JSON document. One RPC, `save_journey_state`, stores the result and appends `journey_events`. The web app runs the engine for the signed-in student. A token-guarded cron route runs it for every recently active student, following the payments webhook pattern. No page shows the result yet; that is M2.

**Tech Stack:** TypeScript 5 + vitest + fast-check (engine), Postgres/Supabase (RLS, pgTAP, security-definer RPCs), Next.js 16 route handler, GitHub Actions schedule.

**Spec:** `docs/superpowers/specs/2026-10-30-journey-system-design.md` (sections 4, 5 and 8; build plan section 9, M1).

**Branch:** `Updated-developer-b`, from `develop`. The owner asked for this branch instead of the spec's `feat/journey-m1-engine`. One commit per task, starting with the task ID (`J1.3 Step catalogue as data`), plain messages, no co-author line.

## Global Constraints

- Product rules stay: the model never writes a fact a student sees; unverified or conflicting facts never decide anything and never produce "you meet" or "you don't meet"; no grade conversion; no admission percentage; no ghostwriting. Titles and reasons are templates in code, never model output.
- A reason may quote a date, amount or requirement only from a published fact, and must list that fact in `factRefs` with its status. Default lead times (recommenders 21 days, test booking 30, statement 21) are used for ranking only and never appear in copy.
- Migrations start at `20270101`, ship with pgTAP tests, keep RLS on every table, and are followed by `pnpm db:types`. This also regenerates `worker/src/uniguide_worker/db_enums.py`.
- `packages/journey` imports nothing from `apps/web` or Supabase. It takes plain data and a date and returns plain data, so the same code runs in a page and in the cron route.
- Student data is read only through `journey_snapshot`. For the signed-in student it is limited to `auth.uid()`. For the cron route it needs the token whose SHA-256 hash is in `journey_config`. No service key is added to the web app.
- Writes to `journey_state` and `journey_events` go only through `save_journey_state`. Students cannot insert or update those tables directly. `journey_step_state` is written by the student, and blocked while consent is pending, like other personal tables.
- Copy rules (spec section 1): sentence case, plain, every number with its unit.
- Length limits: titles at most 60 characters, reasons at most 160. A long course name is shortened with "…" inside the title only; the full name stays in `application.label`.
- Run `pnpm db:test`, `pnpm -r test`, `pnpm -r typecheck`, `pnpm --filter web lint`, `cd worker && uv run pytest`, `pnpm --filter web e2e`, `e2e:demo` and `e2e:community` before marking the milestone done.

## Where the spec and develop disagree

Checked against `develop` at `6b755ce` on 30 October 2026. Each row says what M1 does about it. Rows marked "M2", "M3" or "M5" need nothing from the engine beyond what this plan already does.

### Routes, anchors and links

| # | Spec says | Develop has | Resolution |
|---|---|---|---|
| R1 | "Today the student area has no navigation" (6.1) | `components/site-header.tsx` already shows My matches, Shortlist, Tracker, Offers, Writing, Profile, Updates and Display to signed-in students. `app/app/layout.tsx` has only the consent banner. | M2 should rework the existing header into the journey navigation, not add a second bar. Noted for M2; nothing in M1. |
| R2 | `/app` home and `/app/steps` | Neither exists. After sign-in, `safeNext` in `lib/age.ts` falls back to `/app/profile`. | M2 builds both and changes the fallback to `/app`. |
| R3 | S1.03 links `/app/profile#intake` | `profiles.intake_year` exists, but no student control writes it: the profile form has no intake field. | The step stays, linking to `/app/profile#intake`. M3 (J3.6) must add the field, not just the anchor. Recorded as a dependency. |
| R4 | `#grades` (S1.04), `#tests` (S1.05) | Anchors are `#qualification` and `#scores-section`. | The catalogue uses the existing anchors. J3.6 can add aliases later. |
| R5 | S1.08 links `/app/cv` to "upload your CV to fill this in" | `/app/cv` is the CV builder (6.2). The CV reader that fills the profile is on `/app/profile#cv`. | Link to `/app/profile#cv`. |
| R6 | S4.05 `/app/writing/new?application=…`, S4.07 `/app/writing/new?kind=supplemental` | `/app/writing/new` ignores query parameters. Linked documents start from buttons on `/app/tracker/[id]`, and supplemental essays from its `#supplemental` form. | Link to `/app/tracker/[id]` (S4.05) and `/app/tracker/[id]#supplemental` (S4.07). |
| R7 | S5.01 `/app/tracker/[id]#history` | History and portal checks are in the section with id `portal`. | Link to `#portal`. |
| R8 | S5.05 "4.8 waitlist guide in `/app/writing`" | The waitlist steps and the continued-interest letter are in the decision section of `/app/tracker/[id]`. | Link to `/app/tracker/[id]#decision`. |
| R9 | S2.04 `/english-tests` "filtered to matches" | The page filters only by `?exam=`. | Link to `/english-tests`. A "my matches" filter would be Developer A's change; noted, not planned. |
| R10 | S3.03 "course cost scenario on `/app/shortlist`" | The shortlist shows course cards and Remove only. Cost scenarios are on `/app/match` and `/app/offers`. | Mark S3.03 unavailable until the shortlist shows costs (M3, alongside G8). |
| R11 | S2.05, S3.01, S3.02 link to panels from 2.4, 13.4 and 1.3 | The components exist (`components/score-goals.tsx`, `shortlist-advice.tsx`, `profile-comparison.tsx`) but no page renders them. The spec is right about this. | The steps are written now and marked unavailable until M3 places the panels. |

### Tables, columns and values

| # | Spec says | Develop has | Resolution |
|---|---|---|---|
| D1 | `profile.level` (one level) picks the degree variant | `profiles.target_levels` and `tracks.target_levels` are arrays of `foundation`, `diploma`, `bachelor`, `master`, `doctorate`. There is no "research" or "MRes" level. | Engine helper `variantsFor(levels)`: `foundation`/`diploma`/`bachelor` → undergraduate, `master` → master's, `doctorate` → research. A student can be in more than one variant; their steps are combined, without duplicates. |
| D2 | `fields`, `countries` | `target_fields`, `target_countries` | Use the real names in `JourneyInput`. |
| D3 | `consentState: 'active' \| 'pending_parental'` | Enum `not_required \| pending_parental \| granted \| revoked` | Pass the enum through. Only `pending_parental` triggers S1.06. |
| D4 | Stage 2 starts when "the 'what matching needs' list is empty" | `profileChecklist` (`apps/web/lib/profile-completeness.ts`) also requires "at least one test score", plus research interests for doctorate. | Read literally, a student without a score stays in stage 1. That contradicts S1.05 ("only when a target course lists a test") and G11. The engine uses the checklist without the test-score item, and tests become S1.05. The checklist logic moves into `packages/journey` so the page and the engine share it. **Decision needed; default as described.** |
| D5 | Stage rules use `shortlisted`, `preparing`, `submitted` | Recording a decision sets `status = 'decided'` (`app/app/tracker/actions.ts`). | Read literally, a student rejected everywhere matches no rule and drops to stage 3. Stage 5 treats `decided` like `submitted`. Applications with status `withdrawn`, or decision `withdrawn` or `deferred`, are ignored. |
| D6 | "today, in the student's time zone" | Profiles have no time zone. | M1 uses the UTC date. Deadlines keep their own time zones when compared. Noted as an open question. |
| D7 | S4.02 is done "when the checklist item is done", only for verified rules | `lib/tracker.ts` adds checklist items for every published rule, verified or not, as `kind = 'system_step'` with no rule id. | J1.5 adds nullable `checklist_items.country_rule_id`. `ensureApplication` sets it for new items, and older items are matched by `link`. S4.02 only uses rules with `status = 'verified'`; any other rule gives the "check this with the university" step. |
| D8 | Several steps are done when something is "opened" or "viewed": S2.03, S2.04, S2.06, S3.02, S3.03, S4.04, S6.02; S2.07 "viewed a course twice"; S3.06 "parent opened" | Nothing records page or panel views, and section 8 adds no table for them. | `journey_step_state.state` gets a third value, `done`, meaning "the student marked it done". M2 records it when the step's own button is used. S2.07 and S3.06 stay unavailable: they need view tracking, which the spec never defines. **Decision needed.** |
| D9 | S5.02 "portal check noted 'missing'… note resolved" | Portal notes are free text in `application_events`, with no resolved flag. | S5.02 stays unavailable. Flagged for M5 (G26 work). |
| D10 | S6.09 "research consent not answered" | Only granted consents are stored; declining leaves no record. | Shown until shared, or dismissed (dismissable). |
| D11 | S3.04 "more than one open cycle → cycle chosen" | `shortlists` stores `program_id` only. The cycle is fixed when the student tracks the course. | S3.04 unavailable; needs a cycle on shortlist rows (M3). |
| D12 | S4.10 "course asks for a CV" | `requirement_kind` has no CV value (`entry_qualification`, `language_test`, `admissions_test`, `prerequisite`, `recommendation_letters`, `statement`, `portfolio`, `interview`, `other`). | S4.10 appears only for master's and research students with no CV entries, as advice, not as a requirement. |
| D13 | Stalled detection uses `journey_events` "step_done when done changes from false to true" | Nothing stores which steps were done earlier. | `JourneyResult.completed` lists the ids of steps that apply and are done. `save_journey_state` compares it with the stored list and appends a `step_done` event for each new id. `JourneyInput.lastCompletedAt` comes from `journey_events`. **Additions to the spec's types.** |
| D14 | `country_rules` kinds `health_insurance`, `residence_registration`, `housing` and `lead_days` | Present: `aps_certificate`, `visa_info`, `proof_of_funds`, `visa_step`, `post_study_work`, `work_hours`, `banking`, `credential_evaluation`, `other`. | As the spec says (G23, M5). S7.03, S7.04 and S7.08 unavailable until then. `long_lead` uses only catalogue defaults for now. |

### Infrastructure and process

| # | Spec says | Develop has | Resolution |
|---|---|---|---|
| I1 | A "daily cron route" recomputes `journey_state` (4.5, J1.7) | There are no cron routes. Scheduled work is GitHub Actions running the Python worker (`.github/workflows/scheduled.yml`), and the web app holds only the publishable key, so it cannot read other students. | Use the token-guarded RPC pattern from payments (`payment_config` with a hashed token, `record_payment`). Add `journey_config` and a `POST /api/cron/journeys` route that sends the token. A daily job in `scheduled.yml` calls it. The engine stays in TypeScript, with no service key. |
| I2 | "Load `JourneyInput` in one query" (J1.6, 6.2) | The parts live in about 20 tables. | `journey_snapshot` assembles them in SQL as one JSON document, so the page and the cron route make one round trip each. |
| I3 | Engine strings are plain English (4.1). Separately, 7.2 says "new journey copy must go through `apps/web/lib/i18n`". | The engine package cannot import the web i18n module. | Each `NextStep` also carries `copy: { key, params }`. M1 fills `title` and `reason` in English; M6 (J6.2) translates with the keys and needs no engine change. **Addition to the spec's types.** |
| I4 | "Add every new table to the parent-cannot-see test" (8) | There is no shared parent test; each feature's pgTAP file checks parents itself. | `400_journey.test.sql` checks parents for all three new tables. |
| I5 | "Same build, lint and test setup as `packages/matching`" | `matching` has no build step: the web app compiles its TypeScript (`transpilePackages`), and its `lint` script runs `tsc`. | Copy that setup exactly and add `@uniguide/journey` to `transpilePackages`. |
| I6 | Branch `feat/journey-m1-engine` | Owner instruction: `Updated-developer-b`. | Follow the owner. |
| I7 | `notifier` reads `journey_state` for emails (8) | The role exists, with per-table grants. | J1.5 grants `select` on `journey_state` to `notifier` now, so M4 needs no migration for it. |

Out-of-date docs found while checking, not caused by the spec: `README.md` still says "Payments are not built" (X6 is built) and "180 pgTAP tests" (381 today). Fix both in the J1.7 docs step.

## Deviations from the spec (decisions M1 takes)

- **Four type additions:**
  - `JourneyResult.completed: string[]` and `JourneyInput.lastCompletedAt: string | null` (D13)
  - `NextStep.copy` (I3)
  - `NextStep.available` on catalogue entries (below)
- **One more step state:** `journey_step_state.state` adds `done` (D8).
- **Unavailable steps.** Every catalogue entry is written now. Entries whose data, control or link does not exist yet are marked `available: false` and produce nothing; the later milestone that adds the missing piece flips them on. Unavailable in M1:
  - S2.05, S3.01, S3.02 (M3 placements)
  - S2.07, S3.06 (no view tracking; decision)
  - S3.03, S3.04 (M3)
  - S4.09 (G9)
  - S4.11, and the "not taken yet" half of S1.05 (G11)
  - S4.13 (G12)
  - S5.02 (D9)
  - S5.03, S5.04 (G26)
  - S6.05 to S6.08 (G13, G14)
  - S7.03, S7.04, S7.08 (G23)
- **Daily recompute** runs as a token-guarded route called by GitHub Actions, not as a host cron (I1).
- **Matching minimum** excludes the test-score item (D4).
- **Stage 5** counts `decided` (D5).
- **"Today"** is the UTC date (D6).

## Review Focus

- **Two applications, one submitted and one preparing with an open deadline:** stage 4. The submitted one shows as `carry_over` portal-check steps. (Task J1.2)
- **Rejected everywhere:** stage 5, never stage 3. (J1.2)
- **Unverified APS rule for an Indian applicant to Germany:** gives "Check this with the university", never S4.02, and the reason never says "you need". (J1.3)
- **A snoozed step reappears exactly when `until` passes.** A dismissed step never reappears. Steps marked "can't dismiss" (S1.06, S3.05, S6.04) ignore dismiss and snooze. (J1.4)
- **A step due tomorrow outranks a stage step due next month, and the same date sorts by catalogue order:** property tests. (J1.4)
- **Student B calls `journey_snapshot` with student A's id:** refused. The cron route with a wrong or missing token gets 401 and the RPC refuses too. (J1.5, J1.7)
- **A parent linked to the student reads `journey_state`, `journey_step_state` or `journey_events` directly:** sees nothing (parents get a safe RPC in M4). (J1.5)
- **The same snapshot computed twice:** no duplicate `step_done` or `stage_entered` events. (J1.5)
- **A course title of 120 characters:** the title still fits in 60 characters and the full name is in `application.label`. (J1.3)

## What the engine output must support in M2 (UI contract)

Checked with the ui-ux-pro-max skill (`ui-ux-pro-max/scripts/search.py`, UX domain). Its generated design systems for this product type did not fit: one was a children's style (Comic Neue, claymorphism), the other a dark marketing style (glassmorphism). By the skill's own rule they are not used, and the existing tokens in `apps/web/app/globals.css` stay the design system. The UX guidelines did apply, and they shape the data M1 returns:

| UX guideline (skill) | What M1 returns so M2 can meet it |
|---|---|
| Progress indicators: "Step 2 of 4", never no indication | `stage` plus `stageProgress { done, total, label }`, with the label already written ("2 of 3 applications ready"). |
| Empty states: a helpful message and an action, never a blank screen | Every stage has at least one step that can show from an empty account, and a fixture test checks it. |
| Live badge updates: one atomic status sentence, not a bare number | `urgentCount` plus `urgentLabel` ("2 steps due this fortnight") for the Applications badge. |
| Deep linking: every key screen reachable by URL | Every available step's `href` is checked against `ROUTES` (a list of real routes and anchors kept next to the catalogue); the test fails on any unknown target. |
| Truncation: prefer wrapping; when shortening, keep the full text available | 60 and 160 character limits, with the full course name in `application.label`. |
| Bottom navigation: at most 5 items, with labels | Matches spec 6.1 (Home, Explore, Applications, Help, More). Nothing for M1 to do; noted so M2 keeps it. |
| Current location highlighted in navigation | `stage` maps to the navigation item in `STAGES[stage].navItem`. |

## File Structure

| File | Responsibility |
|---|---|
| `packages/journey/package.json`, `tsconfig.json` | Same scripts and devDependencies as `packages/matching` |
| `packages/journey/src/types.ts` | `JourneyInput`, `JourneyResult`, `NextStep`, `StepDef`, helper types |
| `packages/journey/src/version.ts` | `ENGINE_VERSION = "journey-0.1.0"` |
| `packages/journey/src/stages.ts` | `STAGES` (name, route, for, done-when, usually-takes, nav item, parent note), `computeStage()` |
| `packages/journey/src/minimum.ts` | `profileChecklist` moved from `apps/web/lib/profile-completeness.ts`, plus `matchingMinimumMet()` |
| `packages/journey/src/variants.ts` | `variantsFor(levels)` (D1), track labels |
| `packages/journey/src/catalogue/stage1.ts` … `stage7.ts` | `StepDef` entries S1.01 to S7.08 |
| `packages/journey/src/catalogue/index.ts`, `routes.ts` | `CATALOGUE` in order, and `ROUTES` (known routes and anchors) |
| `packages/journey/src/copy.ts` | English title and reason templates by key, `fit()` for length limits |
| `packages/journey/src/rank.ts` | Bands, sorting, snooze and dismiss filter, `urgentCount`, `stalled` |
| `packages/journey/src/engine.ts`, `index.ts` | `computeJourney(input): JourneyResult` |
| `packages/journey/test/fixtures/*.json` | One snapshot per stage and per entry path, plus edge cases from Review Focus |
| `packages/journey/test/*.test.ts` | Stage, catalogue, ranking, property and fixture tests |
| `supabase/migrations/20270101000001_journey.sql` | `profiles.entry_path`, `journey_state`, `journey_step_state`, `journey_events`, `journey_config`, `checklist_items.country_rule_id`, RPCs, grants |
| `supabase/tests/database/400_journey.test.sql` | RLS, parent, RPC, token and event tests |
| `apps/web/lib/journey-snapshot.ts` + `.test.ts` | Parse the snapshot JSON (zod) into `JourneyInput`, run the engine, save; `loadJourney()` |
| `apps/web/lib/profile-completeness.ts` | Re-exports from `@uniguide/journey` (no behaviour change) |
| `apps/web/lib/tracker.ts`, `packages/matching/src/checklist.ts` | Carry `countryRuleId` onto checklist items (D7) |
| `apps/web/app/api/cron/journeys/route.ts` + `apps/web/lib/journey-cron.ts` (+ `.test.ts`) | Token-guarded batch recompute |
| `.github/workflows/scheduled.yml`, `.env.example`, `docs/SETUP.md` | Daily call, `JOURNEY_CRON_TOKEN`, setup step |
| `apps/web/next.config.ts`, `apps/web/package.json` | `@uniguide/journey` in `transpilePackages` and dependencies |

---

### Task J1.1: Package, types and version

**Files:**
- Create: `packages/journey/package.json`, `tsconfig.json`, `src/types.ts`, `src/version.ts`, `src/index.ts`, `test/types.test.ts`
- Modify: `apps/web/package.json` (`"@uniguide/journey": "workspace:*"`), `apps/web/next.config.ts` (`transpilePackages`), `pnpm-lock.yaml`

**Interfaces:**
- Produces: the spec's `JourneyInput`, `JourneyResult` and `NextStep` (section 4.1), with D2, D3 and D13 applied and these additions: `NextStep.copy: { key: string; params: Record<string, string> }`, `JourneyResult.completed: string[]`, `JourneyResult.urgentCount: number`, `JourneyResult.urgentLabel: string | null`, `JourneyInput.lastCompletedAt: string | null`, and `JourneyInput.matchRuns: { latestAt: string | null; feasibleCount: number | null }`.
- `StepDef`: `{ id, stage, variants?: Variant[], dismissable, leadDays?, available, parentTitle?, subjects(ctx) => Subject[], done(ctx, s) => boolean, dueAt?(ctx, s), factRefs?(ctx, s), href(ctx, s), copyKey, params(ctx, s) }`. One `StepDef` yields one `NextStep` per subject (the student, an application, a recommender, a rule).

- [ ] **Step 1: Write a failing test** `test/types.test.ts` that imports `ENGINE_VERSION`, `computeJourney` and the types from `../src`, and checks `ENGINE_VERSION` matches `/^journey-\d+\.\d+\.\d+$/`.
- [ ] **Step 2: Run** `pnpm --filter @uniguide/journey test`; expect failure (package missing).
- [ ] **Step 3: Create the package** by copying `packages/matching/package.json` and `tsconfig.json`, renamed to `@uniguide/journey`. Same devDependencies and pinned versions (vitest 5.0.5, fast-check 4.10.2), same scripts (`typecheck`, `test`, `lint`). Write `types.ts` and `version.ts`. `computeJourney` is a stub returning stage 1 with no steps.
- [ ] **Step 4: Wire the app:** add the dependency and `transpilePackages` entry, then run `pnpm install`.
- [ ] **Step 5: Run** `pnpm -r typecheck && pnpm -r test`; expect pass.
- [ ] **Step 6: Commit** `J1.1 Journey engine package and types`.

---

### Task J1.2: Stage rules

**Files:**
- Create: `packages/journey/src/stages.ts`, `src/minimum.ts`, `src/variants.ts`, `test/stages.test.ts`, `test/fixtures/stage-{1..7}.json`, `test/fixtures/entry-{exploring,knows,applying,offers}.json`, `test/fixtures/edge-{split-submitted-preparing,rejected-everywhere,withdrawn-only,two-tracks}.json`
- Modify: `apps/web/lib/profile-completeness.ts` (re-export `profileChecklist` from `@uniguide/journey`; its existing tests must pass unchanged)

**Interfaces:**
- Produces: `computeStage(input): 1..7` (spec 4.2, with D5); `matchingMinimumMet(profile, track?)` (D4); `variantsFor(levels)` (D1); `STAGES[1..7] = { key, name, route, navItem, forText, doneWhen, usuallyTakes, parentNote }`, with copy from spec section 5.

- [ ] **Step 1: Write fixtures**, one snapshot JSON per stage and per entry path, plus the four edge cases above. Shape them like real `journey_snapshot` output, so J1.6 can reuse them.
- [ ] **Step 2: Write failing tests:**
  - every stage fixture gives its stage
  - entry paths: "exploring" with a short profile gives 2, "applying" with a preparing application gives 4, "offers" with an admitted decision gives 6
  - split submitted/preparing gives 4
  - rejected everywhere gives 5
  - withdrawn only falls back to the shortlist or profile rule
  - the minimum ignores test scores but needs research interests for `doctorate`
- [ ] **Step 3: Implement** the rules from 7 down to 1, first match wins, ignoring `withdrawn` applications and `withdrawn`/`deferred` decisions. "Open deadline" means the application's next unfinished checklist deadline is today or later, or no deadline is known. Move `profileChecklist` into `minimum.ts` without changing it, and add `matchingMinimumMet`.
- [ ] **Step 4: Run** `pnpm -r test`; expect pass, including the existing `profile-completeness.test.ts`.
- [ ] **Step 5: Commit** `J1.2 Stage rules with a fixture per stage and entry path`.

---

### Task J1.3: Step catalogue as data

**Files:**
- Create: `packages/journey/src/catalogue/stage1.ts` … `stage7.ts`, `catalogue/index.ts`, `catalogue/routes.ts`, `src/copy.ts`, `test/catalogue.test.ts`

**Interfaces:**
- Produces: `CATALOGUE: StepDef[]` (S1.01 to S7.08 in order), `ROUTES` (known routes with their anchors: `/app/profile` `#qualification #budget #targets #scores-section #cv #tracks`, `/app/tracker/[id]` `#checklist #scores #letters #supplemental #costs #notes #decision #portal`, `/app/sharing` `#family`, and every route in spec section 6.1 plus `/app/onboarding`, `/consent`, `/app/departure`, `/visas`, `/visas/funds`, `/courses/[slug]/arrival`, `/app/matching`, `/compare/countries`, `/english-tests`, `/app/match/what-if`). Also `COPY.en[key]` templates and `fit(text, max)`.
- Uses: the spec's section 5 tables, with corrections R3 to R11 and D7 to D12.

- [ ] **Step 1: Write failing tests:**
  - ids are unique and follow `S<stage>.<nn>`
  - every entry has an English title and reason template
  - every **available** entry's `href` resolves to a known route and anchor in `ROUTES`
  - the unavailable list matches "Deviations" above exactly (so flipping one on is deliberate)
  - titles are at most 60 and reasons at most 160 characters after filling with a 120-character course name
  - steps that may not be dismissed are exactly S1.06, S3.05 and S6.04
  - every step a parent may see has a `parentTitle`; no writing (S4.05–S4.08), grades or scores step (S1.04, S1.05, S2.05, S4.11, S4.12) has one
- [ ] **Step 2: Write fixture-driven tests**, per stage fixture, for the expected step ids, including:
  - S4.02 only for a verified rule; an unverified rule gives "Check this with the university" with an `unverified` `factRef`
  - S1.01 links to `/app/onboarding` only when `ai_processing` consent exists, and to `/app/profile#targets` otherwise
  - research-variant steps (S4.08) only for `doctorate`
  - a step for an application on a track carries that track's label
- [ ] **Step 3: Implement** the entries in `stage1.ts` … `stage7.ts`. Reasons quote only values that come with a fact (deadline `due_at` with its time zone, cost items, requirement minimums). Each quoted value adds a `factRefs` entry with its status. When an unverified or conflicting fact is involved, the wording becomes "check this on the official page", never "you meet" or "you don't meet". Default lead days: S4.03 21, S4.05 21, S4.11 30.
- [ ] **Step 4: Run** `pnpm --filter @uniguide/journey test`; expect pass.
- [ ] **Step 5: Commit** `J1.3 Step catalogue S1.01 to S7.08 as data`.

---

### Task J1.4: Ranking and stalled detection

**Files:**
- Create: `packages/journey/src/rank.ts`, `src/engine.ts`, `test/rank.test.ts`, `test/properties.test.ts`, `test/engine.test.ts`
- Modify: `packages/journey/src/index.ts`

**Interfaces:**
- Produces:
  - `rankSteps(steps, today)`: bands `urgent` (due within 14 days or overdue), `long_lead` (latest safe start within 14 days), `stage` and `carry_over`; then due date, soonest first; then catalogue order.
  - `applyStepState(steps, stepState, now)`
  - `isStalled(lastCompletedAt, steps, today)`: no step done in 14 days and a step due within 30 days.
  - `computeJourney(input): JourneyResult`, including `stageProgress`, `completed`, `urgentCount` and `urgentLabel`.

- [ ] **Step 1: Write failing example tests:**
  - band boundaries at 14 days and 0 days (due today and overdue are urgent)
  - `long_lead` uses `dueAt - leadDays`
  - a step for a non-current stage is `carry_over`
  - `stageProgress.label` reads "2 of 3 applications ready" in stage 4 and has a label for every stage
  - stalled at exactly 14 and 30 days
- [ ] **Step 2: Write property tests** with fast-check, over generated step sets and dates:
  - every `urgent` step comes before every non-urgent step
  - within a band, due dates never decrease
  - a dismissed dismissable step never appears; a snoozed one never appears before `until` and always appears after it
  - S1.06, S3.05 and S6.04 ignore snooze and dismiss
  - no reason contains a `factRefs` value whose status is not `verified` unless the step also carries the unverified label (`factRefs` status is passed through)
  - the result is deterministic for the same input
- [ ] **Step 3: Implement** `rank.ts` and `engine.ts`.
- [ ] **Step 4: Fixture test** (the milestone's "done when"): for every stage and entry-path fixture, `computeJourney` returns the expected stage and top three step ids, listed in `test/fixtures/expected.json`.
- [ ] **Step 5: Run** `pnpm -r test`; expect pass.
- [ ] **Step 6: Commit** `J1.4 Rank next steps and detect stalls`.

---

### Task J1.5: Migrations

**Files:**
- Create: `supabase/migrations/20270101000001_journey.sql`, `supabase/tests/database/400_journey.test.sql`
- Modify: `packages/db-types/src/database.types.ts`, `worker/src/uniguide_worker/db_enums.py` (via `pnpm db:types`), `supabase/seed.sql` (local cron token hash), `apps/web/lib/tracker.ts` and `packages/matching/src/checklist.ts` (carry `countryRuleId`; D7)

**Interfaces:**
- Produces:
  - **New column:** `profiles.entry_path text check (entry_path in ('exploring','knows','applying','offers'))`, nullable.
  - **`journey_state`:** `(user_id uuid pk, stage smallint 1–7, stage_progress jsonb, steps jsonb, completed jsonb default '[]', stalled bool, engine_version text, computed_at timestamptz)`.
  - **`journey_step_state`:** `(user_id, step_id text, state text check in ('snoozed','dismissed','done'), until timestamptz, updated_at, pk (user_id, step_id))`. `until` is required for `snoozed`.
  - **`journey_events`:** append-only, `(id, user_id, kind check in ('stage_entered','step_done'), stage smallint, catalogue_id text, step_id text, created_at)`.
  - **`journey_config`:** `(cron_token_hash text)`, readable by nobody.
  - **New column:** `checklist_items.country_rule_id uuid references country_rules on delete set null`.
  - **RPCs:**
    - `journey_snapshot(p_user uuid default null, p_token text default null) returns jsonb`. Security definer. With no token it is limited to `auth.uid()`; with a valid token, any user.
    - `save_journey_state(p_state jsonb, p_user uuid default null, p_token text default null)`. Upserts the state; appends `stage_entered` when the stage changes and `step_done` for each id newly in `completed`. Idempotent.
    - `journey_due_users(p_token text, p_after uuid default null, p_limit int default 200)`. Users with a sign-in in the last 90 days, ordered by id, for paging.
- RLS:
  - Students read their own rows in all three tables.
  - `journey_step_state` insert, update and delete are their own, with `can_process_personal_data`.
  - `journey_state` and `journey_events` have no direct student writes.
  - `notifier` gets `select` on `journey_state`.
  - Parents and counselors get no access (M4 adds a parent-safe RPC).

- [ ] **Step 1: Write pgTAP tests** in `400_journey.test.sql` (use `tests.create_user`):
  - a student reads only their own state, step state and events
  - a second student and a linked parent see nothing
  - direct insert or update of `journey_state` and `journey_events` as `authenticated` fails with 42501
  - the step-state check rejects an unknown state and a `snoozed` row without `until`
  - a student with pending parental consent cannot write step state
  - `entry_path` rejects other values
  - `journey_snapshot` with another user's id and no token raises 42501
  - with the local token it returns that user's document; with a wrong token, 42501
  - the snapshot contains the profile, tracks, applications with checklist, requirements, deadlines, documents, letters, costs and events, country rules with status, departure tasks, step state, `lastCompletedAt` and `parentLinked`
  - `save_journey_state` twice with the same input adds no events; a new stage adds one `stage_entered`; two new completed ids add two `step_done` rows
  - `journey_due_users` refuses without the token and pages by id
  - `notifier` can select `journey_state`
- [ ] **Step 2: Run** `pnpm db:test`; expect the new file to fail.
- [ ] **Step 3: Write the migration**, following `20261104000001_entitlements.sql` for the token pattern: SHA-256 of the token compared inside the function, and the config table revoked from everyone. `set search_path = ''` on every function. Grant execute on the three RPCs to `authenticated` and `anon`; the token or `auth.uid()` check inside decides access, as with `record_payment`. Seed the local token hash in `supabase/seed.sql` (`local-journey-token`).
- [ ] **Step 4: Carry the rule id onto checklist items:** add an optional `countryRuleId` to the checklist item type in `packages/matching/src/checklist.ts` and set it in `lib/tracker.ts`. Extend the existing checklist test to assert it.
- [ ] **Step 5: Run** `pnpm db:reset && pnpm db:test` (expect all pass), then `pnpm db:types`. Reload the placeholder seed courses (`uv run uniguide-worker seed load --publish-placeholders`).
- [ ] **Step 6: Commit** `J1.5 Journey state, step state and events with pgTAP tests`.

---

### Task J1.6: Snapshot loader in the web app

**Files:**
- Create: `apps/web/lib/journey-snapshot.ts`, `apps/web/lib/journey-snapshot.test.ts`

**Interfaces:**
- Produces:
  - `parseSnapshot(json): JourneyInput` (zod, strict on the fields the engine reads)
  - `loadJourney(supabase, today = utcToday()): Promise<JourneyResult>`: calls `journey_snapshot`, parses, runs `computeJourney`, calls `save_journey_state`, and returns the result. If saving fails, it still returns the result and logs; a failed save must not break a page.
  - `utcToday()`
- Uses: `@uniguide/journey`, the fixtures from J1.2.

- [ ] **Step 1: Write failing tests:**
  - every J1.2 fixture parses and gives the same result as passing the fixture straight to the engine
  - a snapshot missing an optional block (no tracks, no rules) parses with empty arrays
  - a malformed snapshot throws a clear error naming the field
  - `loadJourney` with a fake Supabase client calls `journey_snapshot` once and `save_journey_state` once with the result, and still returns the result when the save errors
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** `pnpm -r test`; expect pass.
- [ ] **Step 4: Commit** `J1.6 Load the journey snapshot and save the result`.

---

### Task J1.7: Daily recompute

**Files:**
- Create: `apps/web/app/api/cron/journeys/route.ts`, `apps/web/lib/journey-cron.ts`, `apps/web/lib/journey-cron.test.ts`
- Modify: `.github/workflows/scheduled.yml`, `.env.example`, `docs/SETUP.md`, `README.md` (I1 and the outdated statements noted above)

**Interfaces:**
- Produces:
  - `POST /api/cron/journeys` with `Authorization: Bearer $JOURNEY_CRON_TOKEN`. It processes up to 200 users per call, after an optional `after` cursor, and returns `{ processed, failed, next }` (`next` is null when done).
  - `recomputeBatch(supabase, token, after, today)` in `journey-cron.ts`.
  - A daily `scheduled.yml` job at `"29 2 * * *"` that calls the route until `next` is null, using `SITE_URL` and `JOURNEY_CRON_TOKEN` from Actions secrets.

- [ ] **Step 1: Write failing tests** for `recomputeBatch` with a fake client:
  - it pages until `journey_due_users` returns fewer than the limit
  - one user's snapshot error is counted in `failed` and does not stop the batch
  - every user gets one snapshot call and one save call with the token
- [ ] **Step 2: Implement** the route. Without the right bearer it returns 401 before touching the database; the RPCs check the token again. Then the job, the `.env.example` entry (`JOURNEY_CRON_TOKEN=local-journey-token`) and a `docs/SETUP.md` step for setting the hosted token and its hash.
- [ ] **Step 3: Add one Playwright check** in `e2e/journey-cron.spec.ts`:
  - a request without the token gets 401
  - with the local token, the seed student's `journey_state` is written with `engine_version` set, and the stage matches the seed data
- [ ] **Step 4: Run all suites:** `pnpm db:test`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter web lint`, `cd worker && uv run pytest`, `pnpm --filter web e2e`, `e2e:demo`, `e2e:community`.
- [ ] **Step 5: Docs.** Add a "Journey engine (M1)" row to `docs/FEATURES.md` (G7, built; G18 schema built, UI in M2). Add to `BACKLOG.md`: the decisions below, the unavailable steps with the milestone that turns each on, and "own applications cannot become catalogue courses" (spec question 4). Fix the outdated `README.md` statements.
- [ ] **Step 6: Commit** `J1.7 Daily journey recompute through a token-guarded route`.

---

## Decisions for the owner (defaults used if there is no answer)

1. Matching minimum without the test-score item (D4). **Default: yes.**
2. "Opened/viewed" done conditions become a student-marked `done` state; S2.07 and S3.06 stay off until view tracking is designed (D8). **Default: yes.**
3. "Today" is the UTC date until profiles store a time zone (D6). **Default: yes.**
4. The daily recompute is a token-guarded route called by GitHub Actions rather than a host cron (I1). **Default: yes.**
5. The spec's open questions in section 10 keep their bracketed defaults (no paywall, keep "UniGuide" in one constant, advise 6 to 10 shortlisted and never require it, lead times 21/30/21 for ranking only).

## Verification

- `packages/journey`: every stage and entry-path fixture gives the expected stage and top three steps. Property tests pass, and the route and anchor test passes for every available step.
- `pnpm db:test` passes with `400_journey.test.sql`. Students see only their own journey rows, parents see none, and the snapshot refuses other users without the token.
- Signed in as `student@uniguide.local`, a server call to `loadJourney` writes `journey_state`. Calling it again adds no events.
- `curl -X POST -H "Authorization: Bearer local-journey-token" http://localhost:3000/api/cron/journeys` returns `{processed, failed: 0, next: null}`, and the seed student's row has today's `computed_at`.
- CI passes on `Updated-developer-b`.
