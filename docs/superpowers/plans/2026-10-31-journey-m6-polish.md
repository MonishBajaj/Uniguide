# Journey system M6: polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The journey works as well in Hindi and on a slow connection as it does in English on broadband. Its accessibility is checked in one place on every push, and reviewers verify first the facts that students' next steps depend on.

M6 adds no new student features. It finishes what M1 to M5 left open:
- step titles and reasons in Hindi (they are English for Hindi users today)
- one accessibility audit in CI that covers every journey page
- a low-bandwidth check of the journey home and the help panel
- verification demand from students' next steps (G25)
- `docs/JOURNEY.md`, so the next developer can find their way round the journey

**Architecture:**
- **Engine:** it still decides every step and still writes English. The web app translates each step by its message key (`step.copy.key` and `step.copy.params`), which every step has carried since M1 for this purpose. The Hindi templates live next to the English ones in `packages/journey`, so one test can check that both have the same keys and placeholders.
- **What stays English:** the saved journey (`journey_state`), the emails and the counselor's export. Emails are English until profiles store a language (M4 accepted limit).
- **Verification demand:** a count per course of the students whose saved next steps quote an unverified or conflicting fact from it. It's computed in the database from `journey_state.steps[].factRefs`, and only counts ever leave the function, never who.

**Tech Stack:** Next.js 16 server components, Postgres with RLS and pgTAP, the journey engine, the Python worker (source monitor), vitest, pytest, Playwright with axe.

**Spec:** `docs/superpowers/specs/2026-10-30-journey-system-design.md`:
- section 9 (M6: J6.1 to J6.5)
- section 7 (G25)
- section 2 (the reviewer's one new input)

**Builds on:** M1 to M5, pushed to `Updated-developer-b`. The M5 exit gate was met on 31 October 2026, with CI green apart from the four accepted e2e failures. The draft pull request is [MonishBajaj/Uniguide#4](https://github.com/MonishBajaj/Uniguide/pull/4).

**Branch:** `Updated-developer-b`. One commit per task, starting with its ID (`J6.2 Step titles and reasons in Hindi`), plain messages, no co-author line.

## Global Constraints

The M1 to M5 constraints still hold:
- The model never writes a fact or a translation. Every Hindi string is written into the code by hand and marked for native-speaker review.
- Course names, university names and quoted facts are never translated; they stay in the language of their source.
- Interface copy goes through `lib/i18n` in English and Hindi.
- WCAG 2.1 AA, with the axe audit at zero serious or critical issues on every journey page, at 1280 and 390 px.
- Migrations start at `20270106`, with pgTAP tests and RLS on every table. Run `pnpm db:types` after each.
- Parents never see writing, grades or scores.
- Every spec sets up and removes its own data, and waits for each save before reading the result (the lesson from the M5 CI run).

## Where the spec and the code disagree

Checked against `Updated-developer-b` at `d672ff6` on 31 October 2026.

| # | Spec says | Code has | Resolution |
|---|---|---|---|
| R1 | J6.1: "Add the new pages to the axe accessibility audit in CI" | Every e2e spec already runs in CI. The journey pages' axe checks are spread over about a dozen feature specs (`journey-enrollment`, `journey-edges`, `journey-waiting`, `journey-intake`, `journey-no-offers` and others), each with its own setup. `a11y.spec.ts` covers only the home, the steps page and onboarding from the journey. | J6.1 adds one "journey pages" audit to `a11y.spec.ts`. It sets up one student with data in every journey state, then audits every journey page at both widths in English and Hindi, with the help panel open on one page. The per-feature audit tests are removed so CI doesn't run the same audit twice (Decisions 3). |
| R2 | J6.2: "Hindi strings for all journey copy" | Pages, buttons, stage explainers and help are in English and Hindi. Step titles and reasons (69 templates in `packages/journey/src/copy.ts`), parent titles (in the catalogue) and the stage progress line ("2 of 3 applications ready") come from the engine in English. `COPY` is typed `Record<"en", …>`, and `render` reads only English. | J6.2 adds `hi` templates for every key in the journey package. It adds a pure `renderStep(locale, key, params)`, which the web app uses wherever a step is shown. Parent titles get Hindi templates too: `parent_journey()` also returns each step's catalogue id and its course name, which the parent already sees in the English title. The progress line is built in `lib/i18n` from the stage, done and total. |
| R3 | J6.3: "Low-bandwidth mode check for home and help panel" | Data saver (15.3) turns off motion and prefetching and shortens long lists. `low-bandwidth.spec.ts` checks public pages only. Six journey components (`step-card`, `side-column`, `help-panel`, `student-header`, `welcome-prompt` and the home page) import `next/link` directly, so they still prefetch with data saver on. | J6.3 switches them to `AppLink`, which doesn't prefetch in data-saver mode. A new spec checks the home and the help panel with `Save-Data: on`: no prefetch requests, no transitions, the panel opens and closes by keyboard, and the home stays within a transfer budget (Decisions 4). |
| R4 | G25: "Steps that depend on unverified facts raise verification demand" | `verification_demand()` ranks courses by shortlist count, then the nearest deadline. The review queue (`/admin/review`) and the worker's source monitor read it. Steps carry `factRefs` (table, id, status), saved in `journey_state.steps`, but nothing reads them for demand. | J6.4 adds `journey_steps` to `verification_demand()`: for each course, the number of students whose journey from the last 14 days has a next step quoting an unverified or conflicting fact of that course (its deadlines and requirements; country rules are counted separately). Courses are ranked by that count first, then shortlists, then the deadline. The review queue shows "N students' next steps need this". On `/admin/rules`, unverified rules that steps quote are listed first, with the same count. |
| R5 | J6.5: "Write `docs/JOURNEY.md`" | No such file. How the journey works is spread across the spec, five plans, code comments and FEATURES.md. | J6.5 writes `docs/JOURNEY.md` for a developer: the stages, how a step is defined, ranked and translated, the snapshot, saving and events, emails, the parent and counselor views, how to add a step, and how to test it. |

## Deviations from the spec (decisions M6 takes)

- **The saved journey stays English** (R2). Translation happens where a step is shown, so emails and saved states don't change shape.
- **Per-feature audit tests move into `a11y.spec.ts`** (R1).
- **Engine:** `ENGINE_VERSION` moves to `journey-0.5.0`, because hidden steps gain their message key so the "Snoozed and dismissed" list can be translated. `diff-fixtures` is read before the update.

## File Structure

| File | What changes |
|---|---|
| `packages/journey/src/copy.ts`, `copy-hi.ts` (new) | Hindi templates; `renderStep(locale, key, params)` |
| `packages/journey/src/catalogue/*`, `parent-copy.ts` (new) | Parent titles by catalogue id, in English and Hindi |
| `packages/journey/src/types.ts`, `engine.ts` | Hidden steps carry `copy`; 0.5.0 |
| `packages/journey/test/copy.test.ts` (new) | Key and placeholder parity; lengths |
| `apps/web/lib/journey-copy.ts` (new) | The web's translator for a step, a hidden step and a parent step |
| `apps/web/components/journey/*`, `app/app/page.tsx`, `steps/page.tsx`, `notifications/page.tsx`, `tracker/[id]/page.tsx`, `agency/[student]/page.tsx`, `parent/page.tsx` | Show translated steps; `AppLink` for no prefetch |
| `apps/web/lib/i18n/en.ts`, `hi.ts` | The progress line by stage |
| `supabase/migrations/20270106000001_parent_journey_copy.sql` + `510_parent_journey_copy.test.sql` | `parent_journey()` returns catalogue id and course |
| `supabase/migrations/20270106000002_journey_demand.sql` + `520_journey_demand.test.sql` | `verification_demand()` gains `journey_steps`; `rule_demand()` |
| `apps/web/app/admin/review/page.tsx`, `app/admin/rules/page.tsx` | Show and sort by journey demand |
| `worker/src/uniguide_worker/monitor.py` | Recheck sources by journey demand first |
| `apps/web/e2e/a11y.spec.ts`, `journey-lite.spec.ts` (new), `journey-hindi.spec.ts` (new), `verification-demand.spec.ts` (new) | Audit, low bandwidth, Hindi steps, demand |
| `docs/JOURNEY.md` (new), `docs/FEATURES.md`, `BACKLOG.md`, `README.md` | Docs |

---

The tasks keep the spec's numbers but are built in this order: J6.2, J6.3, J6.4, J6.1, J6.5. The audit (J6.1) runs once the Hindi steps and data-saver changes it checks are in place.

### Task J6.2: Step titles and reasons in Hindi

**Files:** `packages/journey/src/copy.ts`, `copy-hi.ts`, `parent-copy.ts`, `types.ts`, `engine.ts`; `apps/web/lib/journey-copy.ts`; the components and pages that show steps; `lib/i18n`; the parent migration.

**Interfaces:**
- **`renderStep(locale: "en" | "hi", key, params)`** returns `{ title, reason }` within the same 60 and 160 character limits. A key with no Hindi template falls back to English; a test makes sure none is missing.
- **Parameters are left as they are.** Course and university names, exam names and country names come from the database or official names. Dates keep the engine's format (Decisions 5).
- **Shown in Hindi:**
  - steps on the home, the steps page (including "Snoozed and dismissed"), the application page and `/app/notifications`
  - the stage progress line
  - parent titles on `/parent`
  - the counselor's view follows the counselor's language
- **`copy-hi.ts` header:** "Hindi translations written by the developer, awaiting native-speaker review", as in `lib/i18n/hi.ts`.

- [x] **Steps:**
  - failing tests:
    - **unit (journey):** every English key has a Hindi template with the same placeholders, and each fills within the limits with a 120-character course name; the same for parent titles
    - **unit (web):** the translator uses Hindi for `hi` and English otherwise, and keeps the course name untouched
    - **pgTAP:** `parent_journey()` returns catalogue id and course, and still nothing for a step without a parent title
    - **Playwright (`journey-hindi.spec.ts`):** with the Hindi cookie, the home, steps page and parent view show Hindi step titles with the course name in its own language; the "Snoozed and dismissed" list too
  - `diff-fixtures`, then implement, take screenshots of the home and parent view in Hindi at both widths, and commit `J6.2 Step titles and reasons in Hindi`

---

### Task J6.3: Low-bandwidth check for the home and help panel

**Files:** the six journey components that import `next/link`; `apps/web/e2e/journey-lite.spec.ts`.

**Interfaces:**
- **Journey links** use `AppLink`, so they don't prefetch with data saver on.
- **The help panel** opens and closes with the keyboard and with a click, shows its content straight away, and has no transitions.
- **Transfer budget:** the bytes the browser downloads for `/app` with data saver on are measured once, and the test fails above that figure plus 20%. The figure goes in the test with the date it was measured (Decisions 4).

- [x] **Steps:**
  - **Playwright, with `Save-Data: on`:**
    - `/app` has `data-lite`
    - no prefetch requests while the page loads or the pointer moves over step links
    - no transitions on step cards or the help panel
    - the panel works by keyboard
    - the transfer stays within budget
  - implement and commit `J6.3 Low-bandwidth check for the journey home and help`

---

### Task J6.4: Steps raise verification demand (G25)

**Files:** the demand migration; `app/admin/review/page.tsx`, `app/admin/rules/page.tsx`; `worker/src/uniguide_worker/monitor.py`.

**Interfaces:**
- **`verification_demand()`** returns `journey_steps` as well. This is the number of distinct students whose journey was computed in the last 14 days and whose saved next steps quote an unverified or conflicting deadline or requirement of the course.
  - Ordering: `journey_steps` first, then shortlists, then the nearest deadline.
  - Who may call it is unchanged (admins, operators, verifiers, the ingest worker).
  - It returns counts only.
- **`rule_demand()`** gives the same count for country rules. It's for admins and verifiers only.
- **Review queue:** "N students' next steps need this" beside each course in "Wanted next". The pending facts are sorted by the new order.
- **`/admin/rules`:** unverified rules that steps quote come first, with their count.
- **Worker:** the source monitor rechecks pages by journey demand first.

- [x] **Steps:**
  - failing tests:
    - **pgTAP:** a saved journey quoting an unverified deadline counts once per student; a verified fact, an old journey and a parent count nothing; a student can't call it
    - **pytest:** the monitor's order
    - **Playwright (`verification-demand.spec.ts`):** a student's step quotes an unverified deadline; the admin's review queue lists that course first with "1 student's next steps need this"
  - implement and commit `J6.4 Steps raise verification demand`

---

### Task J6.1: One accessibility audit for every journey page

**Files:** `apps/web/e2e/a11y.spec.ts`; the feature specs whose audit tests move.

**Interfaces:**
- **One setup** gives the seed student a course in every state: shortlisted with two intakes, preparing, submitted with an interview and a missing note, an offer accepted with conditions, another to decline, and a doctorate application.
- **Pages audited** at 1280 and 390 px, in English and Hindi:
  - `/app` (and "You made it")
  - `/app/steps`, onboarding
  - `/app/match`, `/app/shortlist`, `/app/tracker` and each application state's page
  - `/app/offers`, `/app/next-intake`, `/app/departure`, `/app/profile`, `/app/notifications`
  - the help panel open on `/app`
  - `/parent`, and `/agency/[student]` for a counselor with a share
- **The per-feature audit tests** in the journey specs are removed. Their flows stay.

- [x] **Steps:**
  - write the audit and check that it fails if a known issue is put back (for example, an unlabelled input)
  - remove the duplicates; full e2e run
  - commit `J6.1 One accessibility audit for every journey page`

---

### Task J6.5: `docs/JOURNEY.md` and the M6 exit gate

- [x] **`docs/JOURNEY.md`** covers:
  - the seven stages and how a stage is worked out
  - a step's definition (subjects, done, applies, href, parent title, markable, dismissable)
  - ranking and stalled detection
  - copy keys and translation
  - the snapshot and how to add a field (and the zod parser that drops unknown keys)
  - saving, events and `ENGINE_VERSION`
  - emails, parent and counselor views, verification demand
  - how to add a step, from catalogue to route anchor to tests
  - the test commands
- [x] **FEATURES.md:** G25 built, and the M2 note "Step titles stay English until M6" removed. **BACKLOG.md:** the M2 accepted limit about English step titles removed, and any M6 limits added. **README.md.**
- [x] **Run every suite** (Verification), fill in this plan's exit gate, update the PR description, and commit `J6.5 Journey docs and M6 exit gate`.

## Decisions (defaults used unless the owner says otherwise)

1. **Translate where shown; keep the saved journey and emails in English.** **Default: yes.** Emails follow when profiles store a language.
2. **Parent titles are translated too** (`parent_journey()` returns the catalogue id and the course name, which the parent already sees). **Default: yes.**
3. **Move the per-feature axe checks into `a11y.spec.ts`** instead of keeping both. **Default: yes.** This saves CI time, and the coverage is in one place.
4. **Transfer budget** is the size measured with data saver on, plus 20%, recorded in the test. **Default: yes.**
5. **Dates inside step reasons** keep the engine's English format ("15 January 2027") in Hindi for now. **Default: yes.** Hindi dates would need the engine to pass raw dates as parameters, which changes the saved journey's shape. Recorded in BACKLOG.
6. **Journey demand window** is journeys computed in the last 14 days, so old accounts don't skew it. **Default: 14 days.**
7. **Conflicting facts count as demand** as well as unverified ones. **Default: yes.**

## Verification

- **Spec "done when"** (section 9, M6): the journey reads fully in Hindi, the new pages are in the CI audit, the home and help panel pass the low-bandwidth check, steps raise verification demand, and `docs/JOURNEY.md` exists.
- **Suites:**
  - `pnpm db:test`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter web lint`
  - worker `pytest`, `ruff` and `mypy`
  - `pnpm --filter web e2e`, `e2e:demo` and `e2e:community`
  - `diff-fixtures` after the engine change
- **CI on #4** is green apart from the four accepted e2e failures.
- **Screenshots** of the Hindi home, steps page and parent view, and of the review queue with journey demand, at both widths.

## Finishing M6: exit gate (31 October 2026)

- **Spec "done when": met.**
  - **Hindi:** the journey reads in Hindi, covering steps, hidden steps, the progress line, and the parent's stage, note and steps (`journey-hindi.spec.ts`).
  - **Accessibility:** every journey page is in the CI audit, with a course in every state, at both widths and in both languages (`a11y.spec.ts`). The audit fails on a planted unlabelled input.
  - **Data saver:** the home and help panel pass the low-bandwidth check (`journey-lite.spec.ts`).
  - **Verification demand:** steps raise it, and the review queue puts those courses first (`verification-demand.spec.ts`, `520_journey_demand.test.sql`).
  - **Docs:** `docs/JOURNEY.md` exists.
- **Local results:**

  | Suite | Result |
  |---|---|
  | pgTAP | 713 pass |
  | Unit tests | journey 258, matching 124, web 313 pass |
  | Typecheck, lint | Clean |
  | Worker | pytest 398 pass; ruff and mypy clean |
  | e2e (app) | 123 pass; only the four failures accepted at the M2 gate. There are fewer tests than at M5 because the per-feature audit tests moved into one audit. |
  | e2e demo | 3 pass |
  | e2e community | 6 pass |
  | `diff-fixtures` | One deliberate change: `engineVersion` to `journey-0.5.0` |

- **CI on #4** (`031efe8`): end-to-end 127 pass with the four accepted failures; database and web green. The worker check fails only on `ruff format --check` for 7 files that exist only on `develop` (the QS-rankings importer and the Ollama lister, with their tests). It's explained on the pull request and needs fixing on `develop`.
- **Deviations from this plan:**
  - **Prefetching (J6.3):** the dev server the specs run against never prefetches. A browser check would pass either way, so a source test (`lib/journey-links.test.ts`) makes sure journey pages link with `AppLink`. The page-size budget measures the home page itself (69.8 KB, plus 20%), since dev-mode scripts aren't what a student downloads.
  - **Counselor pages (J6.2):** these are English only, like the rest of `/agency`, so their step lists stay English. Recorded in BACKLOG.
  - **Already-saved journeys (J6.2):** parent titles saved before M6 have no catalogue id, so they stay English until the student's journey is next saved.
- **Fixed on the way (own commits):**
  - `resetStudent` merged with `develop`'s change into a statement that set `target_fields` twice. This branch now writes that line as `develop` does.
  - The 6.4 portfolio spec signed the counselor in before the share had saved.
