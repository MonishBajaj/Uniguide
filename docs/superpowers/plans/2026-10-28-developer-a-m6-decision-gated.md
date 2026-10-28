# Developer A, Milestone 6: Decision-gated rows (P3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Do not start a task until its gate is cleared and recorded in `docs/FEATURES.md`.**

**Goal:** Build Developer A's eight P3 rows once their owner decisions or data sources are settled: score goal setter (2.4), GPA converter (2.7), WhatsApp alerts (14.3), career outcomes (13.3), student life guide (7.5), city explorer (7.6), university partner dashboard (16.1) and school counselor panel (16.5).

**Architecture:** Each row reuses an existing pattern rather than inventing one: sourced facts with provenance (`country_rules`, `institution_facts` from Milestone 5), importers in the worker for official open data, pure functions in `packages/matching` for anything computed, and the read-only, consent-granted sharing model of consultancies for any new third-party role.

**Tech Stack:** As Milestones 2 to 5.

**Spec:** `docs/FEATURES.md` P3 rows for Developer A and the "Decisions the owner needs to make first" list; `docs/ARCHITECTURE.md`; `docs/DATA_SOURCES.md`.

## Global Constraints

- Everything in Milestones 2 to 5's constraints still applies (official sources, RLS and pgTAP, no `Co-Authored-By: Claude` line, migrations start with `20261106`).
- The product shows no admission percentages and never ghostwrites (landing page promises). No row here may weaken either.
- A university pays for nothing that changes the order of results (landing page promise: "No commissions").

## Review Focus

1. **A converted grade shown next to a requirement** could be read as eligibility. 2.7 must never feed matching or eligibility. Pinned in Task 2 (`conversion never reaches eligibility`).
2. **A partner university editing its own facts** must not publish them unreviewed. Pinned in Task 7 (`partner edits arrive as pending versions`).
3. **A school counselor seeing a student who never shared** must be impossible. Pinned in Task 8 (`no share, no access`).
4. **Salary figures without a source year** must not render. Pinned in Task 4 (`outcomes need a source year`).
5. **WhatsApp messages to a number without opt-in** must not send. Pinned in Task 3 (`no opt-in, no message`).

---

## Gates (decide these first)

| Row | Gate | My recommendation |
|---|---|---|
| 2.4 Score goal setter | Does predicting an exam score fit a product that avoids predictions? | Build it as a **goal setter only**: show each shortlisted course's published minimum and the gap from the student's latest score. No predicted score. |
| 2.7 GPA converter | The product rule is "grades stay on their own scale, never converted". | Do not build a converter. If anything, link to each country's official credential-evaluation guidance (WES, Anabin, UK ENIC) from the profile page. |
| 14.3 WhatsApp alerts | Consent model and provider cost. | Defer until email open rates show a problem. If yes: deadline reminders only, explicit opt-in, Meta's official Cloud API. |
| 13.3 Career outcomes | Data source. | Build from official outcome data only: College Scorecard field-of-study earnings (US) and Discover Uni / LEO (UK). Nothing for other countries until an official source exists. |
| 7.5 Student life guide | A non-forum source. | Build only from the university's own pages (international office, societies list) as `institution_facts`; skip anything that needs opinion. |
| 7.6 City explorer | Map tiles and place data licence. | Defer. Revisit with OpenStreetMap data (ODbL attribution) if students ask for it. |
| 16.1 University partner dashboard | Legal and the "No commissions" promise. | Build only "claim and correct": a verified university staff member proposes corrections that go through the normal review queue. No paid placement. |
| 16.5 School counselor panel | Consent and data processing terms (same open legal item as consultancies). | Extend the consultancy model: an organisation of kind `school`, student-granted sharing, read only. |

## Tasks (each starts only when its gate is cleared)

### Task 1 (2.4): Score goal setter

**Files:** `packages/matching/src/score-goals.ts` and test; `apps/web/components/score-goals.tsx` (Developer B places it on the profile page).

**Interfaces:** `scoreGoals(scores: TestScore[], requirements: { programId: string; title: string; exam: string; examVersion: string | null; minTotal: number | null; minSections: Record<string, number> | null }[]): { programId: string; exam: string; gapTotal: number | null; gapSections: Record<string, number>; met: boolean }[]`. Same exam and version only; otherwise no row.

- [ ] Vitest: met, gap in total, gap in one section, different version ignored. FAIL, implement, checks. **Commit** `Add score goals: the gap to each shortlisted course's published minimum`

### Task 2 (2.7): Credential evaluation links (if the gate keeps "no converter")

**Files:** `country_rules` kind `credential_evaluation` (migration); `apps/web/components/credential-evaluation.tsx` (B places it).

- [ ] pgTAP for the kind; Vitest `conversion never reaches eligibility` (the component takes no grade input and `packages/matching` has no import of it). **Commit** `Link to official credential evaluation services per destination`

### Task 3 (14.3): WhatsApp deadline reminders

**Files:** migration adding `whatsapp_opt_in (user_id pk, phone_e164, verified_at, opted_in_at)`; `worker/src/uniguide_worker/whatsapp.py` sender behind the same interface as `Mailer`; `notify.py` sends reminders to opted-in, verified numbers; opt-in page under `apps/web/app/app/settings` (Developer B builds the page against the table).

- [ ] pytest: `no opt-in, no message`; one message per reminder (reuses `reminder_log`). **Commit** `Send deadline reminders over WhatsApp to students who opted in`

### Task 4 (13.3): Career outcomes from official data

**Files:** `worker/src/uniguide_worker/importers/us_scorecard.py` (fields of study earnings), `uk_discover_uni.py` (LEO earnings and employment); migration `program_outcomes (program_id, metric, value, currency, year_label, source_id, evidence_quote, status)`; section in `course-view.tsx`.

- [ ] Fixture-based importer tests; Vitest `outcomes need a source year`. **Commit** `Show official earnings and employment outcomes where governments publish them`

### Task 5 (7.5): Student life from university pages

Adds kinds `international_office`, `student_societies`, `faith_and_culture_facilities` to `institution_facts`; a "Student life" section. pgTAP and Vitest as in Milestone 5 Task 3. **Commit** `Add sourced student life facts from university pages`

### Task 6 (7.6): City explorer

Re-plan when the gate clears; expected shape: a static map with OpenStreetMap tiles and a list of sourced `institution_facts` with coordinates. No task until then.

### Task 7 (16.1): University claim and correct

**Files:** migration `university_staff (user_id, institution_id, verified_by, verified_at)`, verified by an admin from an official-domain email; RPC `propose_university_correction(...)` that inserts a `pending` `fact_versions` row with `created_by = 'university'` (added to that column's check constraint); `apps/web/app/university/page.tsx`.

- [ ] pgTAP: `partner edits arrive as pending versions` (never published until a reviewer promotes); unverified staff cannot propose. **Commit** `Let verified university staff propose corrections through the review queue`

### Task 8 (16.5): School counselor panel

**Files:** migration adding `kind text check (kind in ('consultancy','school')) default 'consultancy'` to `organizations`; reuse `agency_shares`, `counselor_can_see` and the `/agency` pages with a school label; flags for deadlines within 7 days with incomplete checklists.

- [ ] pgTAP: `no share, no access`; school counselors read the same tables consultancies do and nothing else. **Commit** `Let schools follow the students who share with them`

### After each task

Update `docs/FEATURES.md` (status and totals) and record the gate decision in the row's note.
