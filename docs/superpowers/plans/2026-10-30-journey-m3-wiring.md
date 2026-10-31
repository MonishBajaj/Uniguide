# Journey system M3: explore, shortlist and prepare wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every step in stages 1 to 4 links to a working control, and a student who is already applying can track a course that isn't in the catalogue. M3 places the three panels that are built but shown nowhere, gives "I'm applying" one clear button, adds own applications and test plans, gives the empty pages something to do, and switches on the catalogue steps that were waiting for these.

**Architecture:** Same as M1 and M2. The engine (`packages/journey`) stays the only place that decides steps; M3 adds data to the snapshot, switches steps on in the catalogue, and bumps `ENGINE_VERSION` to 0.3.0. Every step switched on must pass the existing route and anchor test, so it can't go live before its control renders. Engine changes are checked with `pnpm --filter @uniguide/journey diff-fixtures` (J2.7).

**Tech Stack:** Next.js 16 server components and actions, Postgres with RLS and pgTAP, the M1 engine, `packages/matching` (the panels' logic), vitest, Playwright with axe.

**Spec:** `docs/superpowers/specs/2026-10-30-journey-system-design.md`: section 9 (M3: J3.1 to J3.6), section 7 (G1, G8, G10, G11, G19), section 8 (data model), section 5 (stages 1 to 4).

**Builds on:** M1 and M2, pushed to `Updated-developer-b` (M2 exit gate met on 30 October 2026, draft pull request [MonishBajaj/Uniguide#4](https://github.com/MonishBajaj/Uniguide/pull/4)). New commits go to the same branch, so they appear in that pull request and run its CI.

**Branch:** `Updated-developer-b`. One commit per task, starting with its ID (`J3.2 I'm applying`), plain messages, no co-author line.

## Global Constraints

The M1 and M2 constraints still hold:
- The model never writes a fact, and unverified or conflicting facts never produce "you meet".
- No grade conversion, no admission percentage, no ghostwriting.
- Copy goes through `lib/i18n` in English and Hindi, and passes the J2.5 checks (no hard-coded words in journey components).
- WCAG 2.1 AA, with the axe audit at zero serious or critical issues on every new or changed page, at 1280 and 390 px.
- Migrations start at `20270103`, with pgTAP tests, RLS on every table, then `pnpm db:types`.

Two additions for M3:
- **Own applications are the student's own words, never facts.** They are labelled "added by you, not checked" wherever they appear, carry no fact labels, and never feed matching, outcomes research, verification demand or counselor statistics (spec section 8).
- **Known failures stay known.** The four e2e specs accepted at the M2 gate, and the worker mypy errors that also fail on `develop` (see Decisions 6), are reported, not hidden.

Before each commit, run the suites in Verification. Take screenshots of every new screen at both widths.

## Where the spec and the code disagree

Checked against `Updated-developer-b` at `2edc8db` on 30 October 2026.

| # | Spec says | Code has | Resolution |
|---|---|---|---|
| P1 | G10: "I'm applying to this" sets `preparing` **and builds the checklist** | Shortlisting a course already creates its application, with status `shortlisted` and its checklist (`ensureApplication`, called from `app/app/shortlist/actions.ts`). Moving to `preparing` exists only as the status menu on the tracker board. | J3.2 is a single clear action: "I'm applying to this" on the shortlist card and the application page sets `preparing`. The checklist already exists; the action rebuilds nothing. If the application was deleted, it calls `ensureApplication` first. |
| P2 | G8: place `ScoreGoals` on `/app/match`, `ShortlistAdvice` and `ProfileComparison` on `/app/shortlist` | The components exist (`components/score-goals.tsx`, `shortlist-advice.tsx`, `profile-comparison.tsx`), and so does their logic in `packages/matching` (`scoreGoals`, `shortlistAdvice`, `compareProfile`). No page calls either. | J3.1 places them, each in a section with an anchor (`#score-goals`, `#advice`, `#comparison`), so steps can link to them. |
| P3 | S2.05: "a score is below a published verified minimum" | The engine can't see match results, only what the snapshot carries: the shortlist and applications. Snapshot requirements carry no minimum score. | The snapshot adds `minTotal` and `examVersion` to requirements. S2.05 checks the student's tracked courses (shortlisted applications): it applies when a verified minimum is above their best score in that exam, and links to `/app/match#score-goals`. Unverified minimums never start S2.05. |
| P4 | S3.01: "fewer than 6 shortlisted, or advice flags an imbalance" | The imbalance rules live in `packages/matching` (`shortlistAdvice`), which the engine doesn't import. | S3.01 applies when fewer than 6 courses are shortlisted, links to `/app/shortlist#advice`, and the student can mark it done. The imbalance warnings show on the panel only. This follows the spec's open question: advise 6 to 10, never require. |
| P5 | S3.03: "course cost scenario on `/app/shortlist`" (M1 R10) | Cost scenarios exist on `/app/match` and `/app/offers` (`costScenarios` in `packages/matching`), but not on the shortlist. | J3.1 adds each course's cost range against the budget to the shortlist cards, with a `#costs` section, and switches S3.03 on. The student can mark it done. |
| P6 | S3.04: "more than one open cycle → cycle chosen" (M1 D11) | `shortlists.cycle_id` exists but is never set. `ensureApplication` always takes the current cycle, and there is no way to choose another. | S3.04 stays off. A cycle chooser is new UI with little demand while the catalogue has one current cycle per course. Moved to M5 (Decisions 4). |
| P7 | G1: `applications.cycle_id` nullable, plus `own_institution`, `own_title`, `own_country`, `own_due_at` (spec 8, size M) | Every application is assumed to have a catalogue course. The assumption is read by:<br>• 17 migrations' functions and policies<br>• about 20 web files that join `program_cycles`: tracker, offers, departure, writing, recommenders, the parent view, agency pages, the calendar export, the share card<br>• the worker's notifier and lifecycle emails<br>• `outcomes` (`program_id` and `cycle_id` are required) | The spec's shape is kept (Decisions 1), with every consumer checked in J3.3:<br>• inner joins keep excluding own applications where they must (outcomes, research, counselor statistics, verification demand)<br>• pages that must show them switch to left joins with an "added by you" label<br>• sharing an outcome is refused for own applications<br>Size: **L**, not M. J3.3 is split into a database commit and a web commit. |
| P8 | G1 in the journey engine | `ApplicationSnapshot.program` is required (`id`, `slug`, `title`, `institution`, `country`, `level`). `journey_snapshot` inner-joins `program_cycles`, so an own application would disappear from the journey. | The snapshot left-joins and adds `own: boolean`. For an own application, `program` takes `slug: null` and `level: null`, with title, institution and country from the `own_*` columns. `own_due_at` counts as an open deadline for the stage rules, but is never quoted as a fact. Steps for own applications carry no `source` (J2.1 already allows this). |
| P9 | G11 test plans: "not taken yet" and "booked" | `test_scores` exists, but nothing records a planned or booked test. S1.05's "not taken yet" and S4.11 are switched off. | J3.4 adds `test_plans`, a "Planned tests" part of `/app/profile#scores-section`, and `testPlans` in the snapshot, then switches on S1.05's "not taken yet" and S4.11 (30-day lead time). |
| P10 | G19: empty states for matches, shortlist and tracker | Matches, shortlist and tracker each have a plain empty message, but none tells a student what to do while the catalogue is small. | J3.5 rewrites the three empty states:<br>• **Matches:** "We're adding courses for your subject", with "Find universities for me", what-if and browse<br>• **Shortlist:** links to matches and search<br>• **Tracker:** "Find the courses you're applying to", plus "Add a course that isn't listed" (J3.3)<br>The welcome prompts from J2.6 are reused. |
| P11 | J3.6: add anchors `#budget`, `#tests`, `#scores`, `#history`, `#decision` | `#budget`, `#intake`, `#scores` and `#decision` already exist. The spec's `#tests` is `#scores-section` and its `#history` is `#portal` (M1 R4, R7). The route and anchor test already fails on a missing anchor. | J3.6 adds only the anchors J3.1 and J3.2 create. It adds no aliases. It adds the spec's "done when" check: a Playwright spec that opens every stage 1 to 4 step's link for a fixture student and confirms it lands on a control. |

## Deviations from the spec (decisions M3 takes)

- **Engine 0.3.0:**
  - S2.05, S3.01, S3.02 and S3.03 switch on, plus S1.05 "not taken yet" and S4.11.
  - S3.05 links to the new "I'm applying" button.
  - Own applications are added to the snapshot and stage rules.
  - `expected.json` and `test/fixtures/output.json` are regenerated deliberately, after reading the `diff-fixtures` output.
- **S3.01** only counts the shortlist (P4). **S2.05** only checks tracked courses (P3).
- **S3.04 stays off until M5** (P6).
- **G1 is size L**, and J3.3 has two commits (P7).

## Review Focus

- **"I'm applying"** on a shortlisted course moves it to stage 4 in one click. The home then shows its checklist step, and S3.05 is gone. (J3.2)
- **An own application:**
  - It appears in the tracker, on the home and in the journey, labelled "added by you, not checked", with no fact labels and no source links.
  - It never reaches matching, outcomes research, counselor statistics or verification demand.
  - Sharing its outcome is refused. (J3.3)
- **A student who is already applying** (entry path "applying") can finish onboarding and add a course that isn't in the catalogue. That is the spec's M3 "done when". (J3.3, J3.6)
- **S2.05 never appears from an unverified minimum**, and its reason quotes the verified minimum with its source. (J3.1)
- **Test plans:** marking an exam "not taken yet" completes S1.05. Booking a date completes S4.11. S4.11 ranks as "start soon" 30 days before the deadline. (J3.4)
- **Empty states** give a next action on matches, shortlist and tracker, at both widths. (J3.5)
- **Every stage 1 to 4 step link** opens a page with the control it names. (J3.6)

## File Structure

As built, the migrations are `20270103000001_journey_score_minimums.sql` (J3.1), `20270103000002_own_applications.sql` (J3.3a) and `20270103000003_test_plans.sql` (J3.4). Each replaces `journey_snapshot` for its own change, rather than sharing one snapshot migration. Their pgTAP files are `420_journey_score_minimums`, `430_own_applications` and `440_test_plans`. The panels also needed `lib/shortlist-panels.ts`; own applications needed `lib/own-application.ts` and `components/own-badge.tsx`.

| File | Responsibility |
|---|---|
| `supabase/migrations/20270103000001_own_applications.sql` + `420_own_applications.test.sql` | `applications` own columns, check, policies; every function that joins `program_cycles` reviewed |
| `supabase/migrations/20270103000002_test_plans.sql` + `430_test_plans.test.sql` | `test_plans` with RLS |
| `supabase/migrations/20270103000003_journey_snapshot_m3.sql` | Snapshot: `minTotal`, `examVersion`, own applications (left join), `testPlans` |
| `packages/journey/src/types.ts`, `stages.ts`, `catalogue/*`, `version.ts`, tests, fixtures | The steps switched on, own applications, test plans, 0.3.0 |
| `apps/web/app/app/shortlist/page.tsx` | Advice, comparison and cost panels; "I'm applying" on each card |
| `apps/web/app/app/match/page.tsx` | Score goals panel; the empty state |
| `apps/web/app/app/tracker/page.tsx`, `tracker/[id]/page.tsx`, `tracker/actions.ts` | "I'm applying"; own applications (add form, labels); the empty state |
| `apps/web/app/app/profile/page.tsx`, `profile/actions.ts` | Planned tests |
| `apps/web/lib/journey-snapshot.ts` | Parse the new snapshot fields |
| Pages that join `program_cycles` (P7 list) | Left join and label where own applications show; unchanged where they must not |
| `worker/src/uniguide_worker/notify.py`, `lifecycle.py` | Confirm own applications are left out of fact-based reminders (inner join), with a test |
| `apps/web/e2e/journey-m3.spec.ts`, `a11y.spec.ts` | Flows and audit |

---

### Task J3.1: Place the score goals, shortlist advice and comparison panels (G8)

**Files:**
- Modify:
  - `app/app/match/page.tsx` (`#score-goals`)
  - `app/app/shortlist/page.tsx` (`#advice`, `#comparison`, `#costs`)
  - `lib/i18n/en.ts`, `hi.ts`
  - `packages/journey` (S2.05, S3.01, S3.02, S3.03)
  - `supabase/migrations/20270103000003_journey_snapshot_m3.sql` (requirements' `minTotal`, `examVersion`)
- Uses: `scoreGoals`, `shortlistAdvice`, `compareProfile`, `costScenarios` from `packages/matching`, and the existing components.

**Interfaces:**
- **Match page:** a "Score goals" section listing, for the student's matches with a verified minimum, the gap between their best score and the minimum. It shows nothing without a test score.
- **Shortlist page:**
  - an advice panel (from `shortlistAdvice`)
  - a profile comparison table (from `compareProfile`)
  - each card's cost range against the budget (from `costScenarios`)
- **Steps:**
  - **S2.05:** tracked courses with a verified minimum above the best score. Reason: "{course} asks for {minimum} in {exam}; your best is {score}." The minimum is listed as a fact reference, with its source.
  - **S3.01:** fewer than 6 shortlisted. Markable.
  - **S3.02:** a shortlisted course with published minimums. Markable.
  - **S3.03:** a shortlisted course and a budget. Markable.
  - All of these were written in M1 with `available: false`.

- [x] **Step 1: Write failing tests:**
  - **Engine:**
    - S2.05 appears for a verified minimum above the best score, and never for an unverified one
    - S3.01 appears below 6 shortlisted courses
    - S3.02 and S3.03 appear and can be marked done
    - the `UNAVAILABLE` list loses the four
  - **pgTAP:** the snapshot's requirements carry `minTotal` and `examVersion`.
  - **Playwright:** the three panels render with content for the seed student, and each step's link lands on its panel.
- [x] **Step 2: Implement**, then run `diff-fixtures` and check that only the four steps and the new fields changed. Save the new output.
- [x] **Step 3: Screenshots** of the match and shortlist pages at both widths.
- [x] **Step 4: Commit** `J3.1 Score goals, shortlist advice and comparison panels`.

---

### Task J3.2: "I'm applying to this" (G10)

**Files:**
- Modify:
  - `app/app/tracker/actions.ts` (`startApplying`)
  - `app/app/shortlist/page.tsx`, `tracker/[id]/page.tsx` (button, `#applying`)
  - `lib/i18n`
  - `packages/journey` (S3.05 link)

**Interfaces:**
- **`startApplying(programId | applicationId)`:**
  - sets `status = preparing`
  - calls `ensureApplication` first if the course is shortlisted but its application was deleted
  - refuses withdrawn or decided applications
  - revalidates `/app`
  - after the action, the student lands on the application page with "You're applying. Here's the checklist."
- **The button** appears on each shortlist card and in an `#applying` section on a shortlisted application's page.
- **S3.05** links to `/app/tracker/[id]#applying`.

- [x] **Step 1: Write failing tests:**
  - unit: the action's guard
  - **Playwright:**
    - "I'm applying" on a shortlist card moves the student to stage 4
    - the home shows the course's checklist step and no S3.05
    - the tracker shows the card under Preparing
- [x] **Step 2: Implement.**
- [x] **Step 3: Commit** `J3.2 I'm applying to this`.

---

### Task J3.3: Own applications for courses not in the catalogue (G1)

Two commits, because the database change touches many functions.

**J3.3a: database**

**Files:**
- `supabase/migrations/20270103000001_own_applications.sql`, `420_own_applications.test.sql`
- the journey snapshot migration (left join)
- `pnpm db:types`

**Interfaces:**
- **New columns on `applications`:**
  - `cycle_id` becomes nullable
  - `own_institution`, `own_title` (1 to 200 characters), `own_country` (two letters) and `own_due_at` (timestamptz, nullable) are added
  - check: either `cycle_id` is set and every `own_*` field is null, or `cycle_id` is null and `own_institution`, `own_title` and `own_country` are set
- **The existing unique constraint on (`user_id`, `cycle_id`)** is unaffected: rows with a null cycle never conflict.
- **Every function and policy that reads `applications`** (P7 list) is reviewed:
  - research, outcomes, counselor statistics and verification demand keep inner joins, so own applications never count
  - `outcomes` stays catalogue-only: sharing an own application's outcome raises an error
- **Snapshot:** own applications carry `own: true`, `program.slug: null` and `ownDueAt`.

- [x] **Steps:**
  - pgTAP first:
    - the check refuses a half-filled own application
    - a student can add and read only their own applications, and a parent sees titles only
    - own applications never appear in outcome views, research views or counselor statistics
    - sharing an outcome is refused
  - Then the migration, then `pnpm db:types`.
  - Commit `J3.3a Own applications in the database`.

**J3.3b: web and engine**

**Files:**
- `app/app/tracker/page.tsx`, `tracker/[id]/page.tsx`, `tracker/actions.ts` (`addOwnApplication`)
- the onboarding "applying" and "offers" endings, the tracker empty state, `WelcomePrompt`
- every page in the P7 list that must show own applications: tracker, application page, costs, offers, departure, recommenders, writing, calendar export
- `packages/journey` (own applications in `types`, `stages`, `catalogue`)
- `lib/journey-snapshot.ts`

**Interfaces:**
- **"Add a course that isn't listed"** asks for institution, course title, country and, optionally, the deadline the student was given.
- **Own applications show everywhere** with an "added by you, not checked" label. They show no fact labels, no requirements and no country-rule checklist items. The student adds their own checklist items.
- **Engine:**
  - own applications count for stages 3 to 7 like any other
  - `ownDueAt` counts as an open deadline, but is never quoted as a fact
  - steps for them carry no `source` and no fact references
- **Pages that must not show own applications** keep inner joins: course pages, counselor statistics, the review queue.

- [x] **Steps:**
  - Failing tests first:
    - **engine fixtures:** `edge-own-application-preparing` (stage 4, with steps that have no `source`), and an own application whose own deadline has passed
    - **Playwright:**
      - a student who answers "I'm already applying" adds an unlisted course from the tracker prompt; it shows on the home and the tracker with its label
      - its outcome can't be shared
      - the calendar export includes its own deadline, marked as the student's date
  - Implement, run `diff-fixtures`, and commit `J3.3b Own applications in the tracker and the journey`.

---

### Task J3.4: Test plans (G11)

**Files:**
- `supabase/migrations/20270103000002_test_plans.sql`, `430_test_plans.test.sql`
- `app/app/profile/page.tsx`, `actions.ts` (a "Planned tests" part of `#scores-section`)
- the snapshot migration (`testPlans`)
- `packages/journey` (S1.05 "not taken yet", S4.11)
- `lib/i18n`

**Interfaces:**
- **`test_plans`:** `id`, `user_id`, `exam`, `exam_version`, `status` (`not_taken` or `booked`), `booked_for` (date, required when booked).
  - RLS: own rows only, and no writes while consent is pending.
- **S1.05** is done when a score is saved, or when a plan says "not taken yet" for that exam.
- **S4.11** applies when a required test has no score and no booking. Its lead time is 30 days, used for ranking only and never shown. It is done when a booking or a score exists.

- [x] **Steps:**
  - Failing tests first:
    - **pgTAP:** RLS, consent, and the check that a booked plan has a date
    - **engine:** S1.05 is done when the exam is "not taken yet"; S4.11 is "start soon" from 30 days before the deadline and gone once booked
    - **Playwright:** add a "not taken yet" plan and a booking on the profile
  - Then implement and commit `J3.4 Test plans`.

---

### Task J3.5: Empty states while the catalogue is small (G19)

**Files:** `app/app/match/page.tsx`, `shortlist/page.tsx`, `tracker/page.tsx`, `lib/i18n`

**Interfaces:**
- **Matches, when nothing fits:** "We're adding courses for your subject." The actions:
  - Find universities for me (the existing enrichment, if it hasn't run)
  - Try what-if
  - Browse all courses
- **Matches, when there's no profile yet:** link to the short profile (`/app/onboarding?screen=3`) rather than the profile page.
- **Shortlist:** see matches; search courses.
- **Tracker:**
  - "Find the courses you're applying to"
  - "Add a course that isn't listed" (J3.3)
- **Copy** comes from `lib/i18n` with Hindi; the welcome prompts from J2.6 are reused where they say the same thing.

- [x] **Steps:**
  - Playwright for each empty state's actions, at both widths, plus the axe audit.
  - Then implement and commit `J3.5 Empty states while the catalogue is small`.

---

### Task J3.6: Every stage 1 to 4 step lands on its control

**Files:**
- `packages/journey/src/catalogue/routes.ts` (the anchors from J3.1 and J3.2)
- `apps/web/e2e/journey-step-links.spec.ts`

**Interfaces:**
- A Playwright spec builds one student per stage (1 to 4) from fixtures. For each open step, it opens the link and checks that the page responds and that the anchor, if any, is an element on the page.
- No anchor aliases (P11).

- [x] **Steps:** write the spec, fix any link it finds broken, and commit `J3.6 Every stage 1 to 4 step lands on its control`.

---

### Task J3.7: Audit, end-to-end flows and docs

- [x] **Spec "done when":**
  - every step in stages 1 to 4 links to a working control (J3.6)
  - the "already applying" entry path works for a course outside the catalogue (J3.3)
- [x] **Axe audit:** add the match, shortlist and tracker pages with their new panels and empty states, and the add-own-course form, at both widths, in English and Hindi.
- [x] **Run every suite** (Verification).
- [x] **Docs:**
  - FEATURES.md: G1, G8, G10, G11 and G19 built
  - BACKLOG.md: the switched-off table loses the steps M3 turned on; S3.04 moves to M5
  - README.md: the student area line
  - this plan's checkboxes and exit gate
- [x] **Commit** `J3.7 Journey wiring audit and docs`.

## Decisions (defaults used unless the owner says otherwise)

1. **Own applications use the spec's shape:** `applications.cycle_id` becomes nullable, with `own_*` columns. The alternative is a separate `own_applications` table, which would need its own checklist, costs, letters and documents tables, or a second foreign key on each of them. **Default: the spec's shape**, with every consumer reviewed (P7).
2. **S2.05 only looks at tracked courses**, because the engine can't see match results (P3). The match page's score goals panel still shows every match. **Default: yes.**
3. **S3.01 only counts the shortlist (fewer than 6)**, and the imbalance warnings stay on the panel (P4). **Default: yes.**
4. **S3.04 (choosing an intake per course) stays off until M5** (P6). **Default: yes.**
5. **Own applications' deadlines are the student's dates.** They count for the stage rules and the calendar export, but they're never shown as facts and never start a fact-based reminder email. **Default: yes.**
6. **The worker's mypy errors**: 38 errors in 5 test files, the same on `develop`, and the reason the Worker CI check is red on #4. Either fix them in a separate commit before J3.1 (test typing only, no behaviour change), or leave them to the enrichment work's owner. **Default: fix them first, in their own commit**, so the pull request's CI can go green apart from the four accepted e2e specs.

## Verification

- **Spec "done when":** every step in stages 1 to 4 links to a working control, and the "already applying" path works for a course outside the catalogue.
- **Suites:**
  - `pnpm db:test`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter web lint`
  - `cd worker && uv run pytest` and `uv run mypy src tests scripts evals`
  - `pnpm --filter web e2e`, `e2e:demo` and `e2e:community`
  - `pnpm --filter @uniguide/journey diff-fixtures` after each engine change, with the saved output updated deliberately
- **CI** on #4 is green apart from the four accepted e2e failures (and the worker check, if Decision 6 says leave it).
- **Screenshots** of every new or changed screen at both widths, sent at the end of J3.1, J3.3 and J3.5.

## Finishing M3: exit gate (30 October 2026)

- **Spec "done when": met.**
  - `journey-step-links.spec.ts` opens every step link for students in stages 1 to 4 (24 links). Each page responds and has its anchor.
  - `journey-own.spec.ts` takes a student from "I'm already applying" to an unlisted course on the tracker, the home and the journey.
- **Local results:**

  | Suite | Result |
  |---|---|
  | pgTAP | 633 pass |
  | Unit tests | journey 128, matching 124, web 284 pass |
  | Typecheck, lint | Clean |
  | Worker | pytest 387 pass; ruff and mypy clean |
  | e2e (app) | 92 pass; only the four failures accepted at the M2 gate |
  | e2e demo | 3 pass |
  | e2e community | 6 pass |
  | Axe audit | No serious or critical issues on every new or changed page, at 1280 and 390 px, in English and Hindi |

- **CI:**
  - The Worker check is green again after the mypy fix (Decision 6).
  - On the J3.7 commit, CI's e2e run found one more failure. The panels spec depended on an IELTS score left in the local database by another spec; the seed has no scores. The J3.1, J3.4 and J3.6 specs now set up and remove their own scores. All 58 journey and score specs pass from a clean database.
- **Engine:** 45 of the 60 catalogue steps are on (40 after M2). `diff-fixtures` showed only the planned changes at each step: the version, S3.01 in `stage-3-shortlisted`, and the new fixtures.

## Handing over to M4

M4 (help panel, parent view on the journey, journey emails) builds on:
- **Own applications' titles:** the parent view shows titles only (spec 8).
- **`journey_state`,** which the notifier already reads (M1 I7).
- **The small "Get help" panel from M2,** which M4 replaces.

The M4 plan is drafted while J3.7 runs.
