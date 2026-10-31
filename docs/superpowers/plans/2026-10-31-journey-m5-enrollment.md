# Journey system M5: enrollment and edge paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student can go from "admitted" to "arrived" with a step for every task, and a student rejected everywhere has a clear way back.

M5 adds what happens after accepting an offer:
- conditions, the deposit and the admission document
- declining the other offers
- housing, health insurance and registration after arrival

It also adds the edges of the journey:
- interviews and expected decision dates
- a portal note that something is missing
- document readiness and supervisor contacts
- choosing an intake per course
- a kind "no offers yet" path that rolls over to the next intake
- a short "you made it" state that ends the journey emails

**Architecture:**
- **Engine:** same as M1 to M4. The engine stays the only place that decides steps. M5 adds student-entered dates and country-rule data to the snapshot, and switches on steps that were written in M1 with `available: false`. `ENGINE_VERSION` moves to `journey-0.4.0`, and every engine change is checked with `diff-fixtures`.
- **Student-entered dates:** conditions met, deposit paid, document received, interview and expected decision. These are the student's own records, never facts.
- **Country rule lead times:** these are facts, with a quote and a status. They only count for ranking when verified.

**Tech Stack:** Next.js 16 server components and actions, Postgres with RLS and pgTAP, the journey engine, the Python worker (emails), vitest, pytest, Playwright with axe.

**Spec:** `docs/superpowers/specs/2026-10-30-journey-system-design.md`:
- section 9 (M5: J5.1 to J5.6)
- section 5 (stages 4 to 7: S3.04, S4.09, S4.13, S5.02 to S5.06, S6.05 to S6.08, S7.01, S7.03, S7.04, S7.08)
- section 7 (G9, G12, G13, G14, G20, G21, G23, G26)
- section 8 (data model)

**Builds on:** M1 to M4, pushed to `Updated-developer-b`. The M4 exit gate was met on 31 October 2026, with CI green apart from the four accepted e2e failures. The draft pull request is [MonishBajaj/Uniguide#4](https://github.com/MonishBajaj/Uniguide/pull/4).

**Branch:** `Updated-developer-b`. One commit per task, starting with its ID (`J5.1 After you accept`), plain messages, no co-author line.

## Global Constraints

The M1 to M4 constraints still hold:
- The model never writes a fact; unverified or conflicting facts never produce "you meet".
- No grade conversion, no admission percentage, no ghostwriting. Supervisor contacts get no AI-written emails.
- Interface copy goes through `lib/i18n` in English and Hindi.
- WCAG 2.1 AA, with the axe audit at zero serious or critical issues on every new or changed page, at 1280 and 390 px.
- Migrations start at `20270105`, with pgTAP tests, RLS on every table, and writes blocked while consent is pending. Run `pnpm db:types` after each.
- Parents never see writing, grades or scores. New steps get a `parentTitle` only when it's safe.
- Every spec sets up and removes its own data.

Two additions for M5:
- **Dates the student enters are labelled as theirs** wherever they're shown, the way own applications' dates are. Expected decision dates, interview dates, the passport expiry and the conditions text are never quoted as facts and never start a fact-based reminder.
- **Country rule lead times are facts:** a number of days, a quote from the official page and a status. Only a verified lead time changes ranking or the departure timeline. Otherwise the existing defaults apply.

## Where the spec and the code disagree

Checked against `Updated-developer-b` at `164575c` on 31 October 2026.

| # | Spec says | Code has | Resolution |
|---|---|---|---|
| R1 | G13: "Enrollment columns and an 'After you accept' panel on `/app/offers`": conditions, deposit, admission document, housing | `applications` has `offer_accepted_at`, `deposit_due_at`, `awarded_aid` and `decision`, but no conditions or "paid" or "received" dates. `/app/offers` compares offers and has the decision-day timer and matrix. S6.05, S6.06 and S6.08 are switched off. | J5.1 adds `conditions` (text, the student's words), `conditions_met_at`, `deposit_paid_at` and `admission_document_received_at`. An "After you accept" panel (`/app/offers#after-accept`) appears for the accepted offer. S6.05, S6.06 and S6.08 switch on. Housing is the departure task "Arrange somewhere to live" (R7), not another column. |
| R2 | S6.08: "destination needs one (I-20, CAS, admission letter)" | No data says which destinations need which document. | Every destination needs some admission document for a student visa, so S6.08 applies to every accepted offer. Its copy names no country's document as a fact; the help text gives examples (Decisions 1). |
| R3 | S7.01 shows when "accepted, admission document received" | S7.01 shows for every accepted offer. | S7.01 waits for the admission document, as the spec says, and S6.08 links to it (Decisions 2). |
| R4 | G14: "Decline other offers"; accepting one offer "moves the others to 'decline pending' and shows S6.07" | No declined state. `set_accepted_offer` marks one offer accepted; the other admitted and waitlisted applications stay as they were. | J5.2 adds `applications.declined_at` and an "I've declined this offer" action. A declined application stops counting for the stage rules and steps. S6.07 is one step per other admitted or waitlisted application, and it completes when that application is declined or withdrawn. |
| R5 | G12 and S4.13: passport valid, "expiry missing or within 18 months of intake" | No `readiness_items`. The profile has `intake_year`; a course's start comes from `program_cycles.starts_on` or the intake. | J5.3 adds `readiness_items` (passport, transcript, translation, other) with "ready" and an optional expiry, on the profile (`#readiness`). S4.13 asks when the passport is missing or expires before the intake start plus 18 months. The 18 months only decides when to ask; it's never stated as a requirement (Decisions 8). |
| R6 | G9 and S4.09: supervisor contacts for "level research" | No `supervisor_contacts`. Faculty profiles exist for research degrees (5.5). | J5.3 adds `supervisor_contacts` (name, institution, contacted on, reply, note; optional application and faculty profile). It's shown on a doctorate application's page (`#supervisors`). S4.09 switches on for the research variant and completes with one contact logged. There are no AI-written emails. |
| R7 | G23: rule kinds `health_insurance`, `residence_registration`, `housing`, plus `lead_days` "with its own `evidence_quote`"; the admin rules page can enter them | `country_rules.kind` allows `aps_certificate`, `visa_info`, `proof_of_funds`, `visa_step`, `post_study_work`, `work_hours`, `banking` and `other`. The departure timeline gives each rule a fixed number of weeks (`RULE_WEEKS`). S7.03, S7.04 and S7.08 are switched off. | J5.5 adds the three kinds, plus `lead_days` with `lead_days_quote` (both or neither). `/admin/rules` can enter them. A verified lead time sets the departure task's due date and the step's ranking. S7.04 and S7.08 switch on from verified or unverified rules, with an unverified one saying "check". S7.03 applies when there's a housing rule or the institution publishes housing facts (7.3), and completes with the "Arrange somewhere to live" task. No rules are invented in the seed. |
| R8 | G26: interview events, and expected decision dates "a fact, sourced" (stage 5) but "student-entered" in section 8 | `application_events.kind` allows `created`, `status`, `decision`, `portal_check` and `note`. There's no expected decision date. S5.03 and S5.04 are switched off. | J5.6 adds kind `interview` with `occurs_at`, and `applications.expected_decision_on`. The decision date is student-entered, as section 8 says, and labelled as the student's (Decisions 5). S5.03 shows until the interview date passes. S5.04 shows once the expected date passes with no decision. |
| R9 | S5.02: "portal check noted 'missing'", done when "note resolved" | Portal checks are `application_events` rows with a free-text note and no resolved state. | J5.6 adds `missing boolean` and `resolved_at` to portal checks: "The portal says something is missing", and later "Sorted". S5.02 switches on. |
| R10 | S3.04: "shortlisted course has more than one open cycle", done when "cycle chosen" (M3 moved it here) | `shortlists.cycle_id` exists but is never set. `ensureApplication` always takes the current cycle. | J5.7 adds an intake choice on the shortlist card. It appears only when a course has more than one cycle with an application deadline still ahead. Choosing sets `shortlists.cycle_id`, and a still-shortlisted application moves to that cycle with its checklist rebuilt. A course already being prepared keeps its intake (Decisions 9). S3.04 switches on. |
| R11 | G20 and G21: a kind "no offers yet" path, and rolling a track over to the next year while keeping the profile | S5.06 ("Plan for the next intake", every decision rejected) links to `/app/profile#tracks`. Tracks have no intake. The engine keeps a rejected-everywhere student in stage 5 (M1 D5), so rolling over can't move them back. | J5.4 adds `/app/next-intake`. It has supportive copy and three ways forward: start planning for the next intake (keeping the profile), change what or where to study, and see what opens up with what-if. Starting adds `profiles.intake_rolled_at` and moves `intake_year` on by one. Rejected applications created before the rollover then stop counting, so the student is back in stage 2 or 3 with their shortlist intact. S5.06 links to the page and completes on rollover (Decisions 4). |
| R12 | Stage 7: "after arrival the home shows a short 'you made it' state with links to student life facts, and stops sending journey emails" | Nothing marks arrival. Journey emails go to every student with a recent journey. | J5.8 adds `JourneyResult.arrived`: the accepted course's start date has passed, or the student pressed "I've arrived" on the departure page (`departure_tasks` key `arrived`). `journey_state` gains `arrived`. The home shows "You made it" with the course's arrival and student-life links. The worker sends no journey digest or stage email to an arrived student (Decisions 6). |

## Deviations from the spec (decisions M5 takes)

- **S6.08 applies to every accepted offer**, and S7.01 waits for it (R2, R3).
- **Expected decision dates are student-entered**, not sourced facts (R8).
- **Rolling over is a profile action:** rejected applications from before it stop counting (R11). Tracks don't gain an intake.
- **Arrival:** the start date passing, or the student saying so (R12).
- **Engine:** `journey-0.4.0`. The `diff-fixtures` output is read before each fixture update.

## Review Focus

- **Admitted to arrived:** accept an offer, then:
  - the conditions, deposit and admission document steps appear, then go as each is marked
  - the other offers get "Let {university} know", until each is declined
  - the visa step appears once the document is in
  - housing, insurance and registration come from the departure timeline and country rules
  - "You made it" shows once the course has started (J5.1, J5.2, J5.5, J5.8)
- **Rejected everywhere:**
  - the "no offers yet" page is kind, never empty, and offers three ways forward
  - starting the next intake keeps the profile and shortlist, and takes the student back to stage 2 or 3
  - the old rejections stay in the tracker, but don't hold them in stage 5 (J5.4)
- **Student-entered dates are labelled as theirs:** expected decision, interview, passport expiry and conditions. A verified lead time is quoted with its source, and an unverified one never changes a due date (J5.3, J5.5, J5.6).
- **Choosing an intake** only offers cycles with a deadline ahead, and never moves an application already being prepared (J5.7).
- **Parents** see "Paying the deposit", "Applying for housing" and similar, never conditions text, scores or decision details beyond what they see today.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20270105000001_enrollment.sql` + `470_enrollment.test.sql` | `applications`: `conditions`, `conditions_met_at`, `deposit_paid_at`, `admission_document_received_at`, `declined_at`, `expected_decision_on`; `profiles.intake_rolled_at`; `application_events` kind `interview`, `occurs_at`, `missing`, `resolved_at`; `journey_state.arrived`; snapshot additions |
| `supabase/migrations/20270105000002_readiness_supervisors.sql` + `480_readiness_supervisors.test.sql` | `readiness_items`, `supervisor_contacts` |
| `supabase/migrations/20270105000003_country_rule_kinds.sql` + `490_country_rule_kinds.test.sql` | the three rule kinds; `lead_days`, `lead_days_quote` |
| `packages/journey/src/*`, `catalogue/stage3.ts` to `stage7.ts`, tests, fixtures | The steps switched on; `arrived`; the rollover rule; 0.4.0 |
| `apps/web/app/app/offers/*` | "After you accept"; declining |
| `apps/web/app/app/next-intake/page.tsx`, `actions.ts` | The "no offers yet" path |
| `apps/web/app/app/profile/*` | Document readiness (`#readiness`) |
| `apps/web/app/app/tracker/[id]/*` | Supervisor contacts, interview, expected decision, "missing" portal notes |
| `apps/web/app/app/shortlist/*` | The intake choice |
| `apps/web/app/app/departure/*`, `lib/departure.ts` | Verified lead times; "I've arrived" |
| `apps/web/app/app/page.tsx` | "You made it" |
| `apps/web/app/admin/rules/*` | The new kinds and lead times |
| `worker/src/uniguide_worker/lifecycle.py` | No journey emails after arrival |
| `apps/web/e2e/journey-enrollment.spec.ts`, `journey-no-offers.spec.ts`, `journey-edges.spec.ts` | Flows and audit |

---

### Task J5.1: After you accept (G13)

**Files:**
- the enrollment migration (columns and snapshot)
- `app/app/offers/page.tsx`, `actions.ts`
- `packages/journey` (S6.01 conditions, S6.05, S6.06, S6.08, S7.01)
- `lib/i18n`

**Interfaces:**
- **Offer details (S6.01)** gain "Conditions of your offer" (optional text).
- **"After you accept" (`#after-accept`)**, for the accepted offer:
  - conditions with "Mark conditions met"
  - the deposit, with its due date (the student's or the published deposit deadline) and "Mark paid"
  - the admission document, with "Mark received" and help text giving examples (I-20, CAS, admission letter)
  - a link to the departure timeline's housing task
- **Steps:**
  - **S6.05:** conditions saved and not met
  - **S6.06:** accepted, with a deposit date or a published deposit deadline, and not paid. Its parent title is "Paying the deposit".
  - **S6.08:** accepted, document not received
  - **S7.01:** waits for the document

- [x] **Step 1: Failing tests:**
  - **engine:** each step appears and completes; S7.01 waits for S6.08
  - **pgTAP:** columns, and that RLS and consent are unchanged
  - **Playwright:** accept an offer, mark each item, and watch the steps go
- [x] **Step 2: Implement, run `diff-fixtures`, take screenshots, commit** `J5.1 After you accept`.

---

### Task J5.2: Decline other offers (G14)

**Files:** the enrollment migration (`declined_at`), `app/app/offers/*`, `app/app/tracker/[id]/*`, `packages/journey` (S6.07, stage rules).

**Interfaces:**
- **"I've declined this offer"** appears on each other admitted or waitlisted application on `/app/offers` and on its page. It sets `declined_at`, and can be undone the same day.
- **A declined application:**
  - counts as finished for the stage rules
  - shows "Declined" in the tracker
  - keeps its outcome sharing
- **S6.07** is one step per other open offer or waitlist after an acceptance, linking to `/app/offers#others`.

- [x] **Steps:**
  - failing tests:
    - **engine:** S6.07 per other offer; a declined offer drops out
    - **Playwright:** decline from the offers page; the tracker shows it
  - then implement, run `diff-fixtures`, and commit `J5.2 Decline other offers`

---

### Task J5.3: Document readiness and supervisor contacts (G12, G9)

**Files:**
- the readiness and supervisors migration
- `app/app/profile/*` (`#readiness`), `app/app/tracker/[id]/*` (`#supervisors`)
- `packages/journey` (S4.13, S4.09)
- `lib/i18n`

**Interfaces:**
- **`readiness_items`:**
  - columns: `kind` (`passport`, `transcript`, `translation` or `other`), `ready`, `expires_on`, `note`
  - one passport row per student; no uploads
- **`supervisor_contacts`:**
  - columns: name, institution, `contacted_on`, `reply` (`none`, `positive` or `negative`), note
  - optional links to an application and a faculty profile
  - only on doctorate applications
- **S4.13:** a destination is chosen, and the passport expiry is missing or before the intake start plus 18 months. The intake start is the earliest tracked course start, or 1 September of the intake year, as an approximation.
- **S4.09:** a doctorate application being prepared with no contact logged.

- [x] **Steps:**
  - failing tests:
    - **pgTAP:** RLS; parents can't see either table
    - **engine:** both steps appear and complete
    - **Playwright:** save a passport expiry; log a contact
  - then implement and commit `J5.3 Document readiness and supervisor contacts`

---

### Task J5.4: No offers yet, and the next intake (G20, G21)

**Files:**
- the enrollment migration (`profiles.intake_rolled_at`, snapshot)
- `app/app/next-intake/page.tsx`, `actions.ts`
- `packages/journey` (stage rule, S5.06)
- `lib/i18n`

**Interfaces:**
- **`/app/next-intake`** opens with "Not this time. Many students get in on their second round." It offers three choices:
  - **Plan for {year + 1}:** keeps the profile and shortlist, sets `intake_rolled_at`, and moves `intake_year` on
  - **Change what or where you study:** links to the short profile
  - **See what opens up:** links to what-if

  The rejected applications stay listed, with no outcome blame.
- **Engine:** a rejected application created before `intake_rolled_at` doesn't count. S5.06 links to `/app/next-intake` and completes on rollover.

- [x] **Steps:**
  - failing tests:
    - **engine fixture** `edge-rolled-over-after-rejections`, which lands in stage 3 with its shortlist
    - **Playwright:** rejected everywhere, then the page, then "Plan for {year}", then the home shows stage 3
    - **axe** on the page
  - then implement, run `diff-fixtures`, and commit `J5.4 No offers yet, and the next intake`

---

### Task J5.5: Country rule kinds and lead times (G23)

**Files:**
- the country rule kinds migration
- `app/admin/rules/*`, `lib/departure.ts`, `app/app/departure/*`
- `packages/journey` (S7.03, S7.04, S7.08; ranking from a verified `lead_days`)

**Interfaces:**
- **Rule kinds:** `health_insurance`, `residence_registration` and `housing` are added.
- **Lead time:** `lead_days` (1 to 365) with `lead_days_quote`, both set or both empty.
- **`/admin/rules`** shows the new kinds and the lead time fields.
- **Departure timeline:** a verified lead time sets the rule task's due date, shown with "from the official page". Otherwise it uses the existing weeks.
- **Steps:**
  - **S7.04 and S7.08:** from their rules, built like the existing rule steps
  - **S7.03:** a housing rule, or published housing facts (7.3); done with the "Arrange somewhere to live" task

- [x] **Steps:**
  - failing tests:
    - **pgTAP:** kinds; lead time with its quote
    - **unit:** the departure timeline uses only a verified lead time
    - **engine:** the three steps
    - **Playwright:** an admin adds a health insurance rule with a lead time; it shows on the student's departure page
  - then implement and commit `J5.5 Country rule kinds and lead times`

---

### Task J5.6: Interviews, expected decisions and "something is missing" (G26)

**Files:**
- the enrollment migration (`application_events` kind `interview`, `occurs_at`, `missing`, `resolved_at`; `applications.expected_decision_on`)
- `app/app/tracker/[id]/*`
- `packages/journey` (S5.02, S5.03, S5.04)

**Interfaces:**
- **On the application page:**
  - "Add an interview" (date and time)
  - "When do you expect a decision?" (a date, labelled as the student's)
  - on a portal check, "The portal says something is missing", with "Sorted" later
- **Steps:**
  - **S5.02:** an unresolved "missing" note
  - **S5.03:** an interview not yet passed
  - **S5.04:** the expected date passed with no decision

- [x] **Steps:**
  - failing tests:
    - **engine:** each step
    - **pgTAP:** the kinds, and that only the owner writes
    - **Playwright:** log an interview, an expected date and a missing note
  - then implement and commit `J5.6 Interviews, expected decisions and missing documents`

---

### Task J5.7: Choose the intake for each course (S3.04)

**Files:** `app/app/shortlist/*`, `lib/tracker.ts` (ensure for a chosen cycle), `packages/journey` (S3.04 and the snapshot's shortlist cycle).

**Interfaces:**
- **The intake choice** appears on a shortlist card when the course has more than one cycle with an application deadline ahead.
- **Choosing an intake:**
  - sets `shortlists.cycle_id`
  - while the application is still shortlisted, moves it to that cycle and rebuilds its checklist, after asking when ticked items would be lost
  - leaves an application already being prepared where it is
- **S3.04** shows until an intake is chosen.

- [x] **Steps:**
  - failing tests:
    - **unit:** which cycles count as open
    - **engine:** S3.04
    - **Playwright:** a test course with two open cycles; choose the second; the tracker card shows its intake
  - then implement and commit `J5.7 Choose the intake for each course`

---

### Task J5.8: You made it (stage 7 done)

**Files:**
- the enrollment migration (`journey_state.arrived`, `save_journey_state`)
- `packages/journey` (`arrived`)
- `app/app/page.tsx`, `app/app/departure/*` ("I've arrived")
- `worker/src/uniguide_worker/lifecycle.py`

**Interfaces:**
- **`arrived`** is true when the accepted course's start date has passed, or the student pressed "I've arrived".
- **The home** then shows "You made it" with the course's arrival guide and student-life links, and no step list.
- **The worker** sends no journey digest or stage email to an arrived student.

- [x] **Steps:**
  - failing tests:
    - **engine:** `arrived`
    - **pytest:** no emails once arrived
    - **Playwright:** "I've arrived" shows the state
  - then implement and commit `J5.8 You made it`

---

### Task J5.9: Step links, audit, end-to-end flows and docs

- [x] **Spec "done when":**
  - `journey-enrollment.spec.ts` walks one student from admitted to arrived. It checks that a step exists for every task and that each completes.
  - `journey-no-offers.spec.ts` takes a rejected-everywhere student to the next intake.
- [x] **Step links:** extend `journey-step-links.spec.ts` to stages 5, 6 and 7.
- [x] **Axe:** the offers page with "After you accept", `/app/next-intake`, the profile's readiness, the application page's new parts, the departure page and "You made it". At both widths, in English and Hindi.
- [x] **Run every suite** (Verification).
- [x] **Docs:**
  - FEATURES.md: G9, G12, G13, G14, G20, G21, G23 and G26 built
  - BACKLOG.md: the switched-off table should be down to S2.07 and S3.06
  - README.md
  - this plan's exit gate
  - the pull request description
- [x] **Commit** `J5.9 Enrollment and edge paths audit and docs`.

## Decisions (defaults used unless the owner says otherwise)

1. **The admission document step applies to every accepted offer.** Its help text gives examples (I-20, CAS, admission letter) without saying which one a country needs. **Default: yes.**
2. **The visa step (S7.01) waits for the admission document**, as the spec says. The alternative is to show it from acceptance, as today. **Default: wait.**
3. **Housing (S7.03)** shows when a housing rule or published housing facts exist, and is done by the departure housing task. **Default: yes.**
4. **The next intake is a profile rollover:** `intake_rolled_at`, with `intake_year` moved on by one. Rejected applications from before it stop counting, but stay in the tracker. Tracks don't gain an intake. **Default: yes.**
5. **Expected decision dates are student-entered and labelled as theirs** (section 8), not sourced facts. **Default: yes.**
6. **Arrival** is the accepted course's start date passing, or "I've arrived". After it, no journey emails. **Default: yes.**
7. **Supervisor contacts** are only for doctorate applications, with no AI-written emails. **Default: yes.**
8. **Passport check:** missing, or expiring before the intake start plus 18 months, used only to decide when to ask. It's never stated as a country's rule. **Default: yes.**
9. **Choosing an intake** only moves an application that is still shortlisted, after asking if ticked checklist items would be lost. **Default: yes.**

## Verification

- **Spec "done when":** a student can go from admitted to arrived with a step for every task, and a rejected-everywhere student has a clear way back.
- **Suites:**
  - `pnpm db:test`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter web lint`
  - worker `pytest`, `ruff` and `mypy`
  - `pnpm --filter web e2e`, `e2e:demo` and `e2e:community`
  - `diff-fixtures` after each engine change, with the saved output updated deliberately
- **Every spec sets up and removes its own data.**
- **CI on #4** is green apart from the four accepted e2e failures.
- **Screenshots** of every new or changed screen at both widths, sent at the end of J5.1, J5.4, J5.6 and J5.8.

## Handing over to M6

M6 (polish) builds on:
- the axe coverage from J5.9
- the Hindi copy, including the step titles still in English
- the low-bandwidth check
- unverified facts raising `verification_demand` (G25)
