# M7 Application assist: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students fill their own college applications faster and more accurately from their UniGuide data, in two features:

1. **Assisted fill:** a side panel with fill, copy and skip for each field.
2. **Guided apply:** a run that works through the application page by page and stops at the portal's review page.

Both work only in the student's own browser, never submit, and never write anything the student didn't prepare.

**Architecture:**
- **The extension:** a Chrome Manifest V3 extension (`apps/extension`).
- **Adapters:** one per portal, in a pure, testable package (`packages/portal-adapters`). It also holds the field matcher and the guard rules.
- **Supabase:** one RLS-protected profile RPC, an audit log, and an Edge Function for optional model help.
- **Practice portal:** we build and own one, so all development and REA work can go ahead before any real portal is cleared.

**Tech stack:**
- TypeScript, Chrome Manifest V3 (side panel, service worker, content script)
- Supabase (Postgres with RLS and pgTAP, auth, one Edge Function)
- Next.js 16 web app
- vitest, and Playwright with the extension loaded
- REA (static JavaScript analysis and browser observation) for steps A to C

**Spec:** `docs/superpowers/specs/2026-10-31-application-assist-design.md`. Its section 3 (portal terms) and section 4 (rules) are binding.

**Competitor source:** `docs/research/behavioural-spec.md` only, plus ideas from their arXiv paper and public repo, re-expressed in our own way, with no code copied.

**Builds on:** M1 to M6, on `Updated-developer-b` (`0706418`).

**Branch:** `Updated-developer-b`. One commit per task, starting with its ID (for example `A1.1 Fill profile, audit log and final drafts`). Plain messages, no co-author line.

## Global constraints

- **Rules first:** everything in spec section 4 holds, on every task. Above all:
  - the student starts every action
  - pause on anything uncertain
  - a never-click guard that doesn't depend on the adapter
  - confirmed facts only, grades as entered
  - the student's own final draft only, after confirmation
  - AI-policy mode
  - no features while consent is pending or revoked
  - an audit log
- **No REA on competitors.** REA and every other tool stay off EZCollegeApp and any other competitor's products. Nobody signs up for or installs them.
- **No REA on real portals until cleared.** REA runs on a real portal only after that portal's gate (G1, G2, G4 to G7) is cleared, and only within what the permission allows. Until then it runs on the practice portal, and real-portal maps are made by hand.
- **Network:** our Supabase project only.
- **Host permissions:** cleared portals only.
- **Real-portal fixtures** contain no portal page copy, scripts or assets.
- **The usual project rules:**
  - migrations start at `20270107`, with pgTAP and RLS on every table, then `pnpm db:types`
  - interface copy through `lib/i18n` in English and Hindi
  - WCAG 2.1 AA, with axe on new pages at 1280 and 390 px
  - every spec sets up and removes its own data, and waits for each save before reading the result
- **Failing tests first** on every task.

## Where the spec and the code (or the instructions and the portal terms) disagree

Checked on 31 October 2026, against `Updated-developer-b` at `0706418`.

| # | The instructions or spec say | What we found | Resolution |
|---|---|---|---|
| R1 | REA step A: map each portal with REA's browser observation on the owner's test account | **Common App:** terms (b) forbid reverse-engineering "or use any other means to attempt to discover … applications underlying the Solution", and (j) forbid data-gathering and extraction tools. **UCAS:** 4.1.1 forbids extracting and reverse-engineering the website. REA's observation captures page structure, scripts and network. | **Gates G1 and G2.** No REA on a real portal without written permission or counsel's sign-off. Until then, step A runs on the **practice portal** (A1.2). The real-portal mapping tasks (A3.x) wait for their gate. |
| R2 | Save the maps as test fixtures | **UCAS 4.1.3:** no "portion of the Website in any other software program". **Common App (d):** no derivative works. | Real-portal fixtures hold only what's needed to find fields (identifiers and roles) as our own structured data, with no page copy, scripts or assets. Subject to counsel at G2. Practice-portal fixtures can be full captures. |
| R3 | REA step C on the owner's portal test accounts | Attaching REA to a portal page observes the portal itself, so the same terms apply as R1. | Step C runs on the practice portal for every build (A1.8, A2.5). It runs on a real portal only after its gate (A3.x). |
| R4 | Guided apply across portals | **Common App (j)** bans "bots". An extension that moves through the application for the student is close to that. | **Common App guided apply goes on the "don't support" list** unless written permission covers it. Common App assisted fill waits for G1. |
| R5 | Model help only for unmatched fields; network only to our Supabase project | There are no Supabase Edge Functions; model calls run on the Next.js server (`lib/assistant.ts`), which would fail step B's destination rule. | A new **Supabase Edge Function** suggests a role for one unmatched field. It receives only that field's visible label and our role list, never student data, and holds the provider key server-side (A1.6). |
| R6 | Per-course AI-policy mode | No AI-policy fact exists on courses. | A new sourced fact, `program_ai_policies` (allows, limited or bans, with a quote, source and status), through the existing review pipeline. **Unknown counts as "bans"** (decision 4). |
| R7 | Paste the student's own final draft | Writing has documents and versions but no "final" marker. | Add `documents.final_version_id`, set by the student with "Use as final draft" in the editor (A1.7). Only that version can be pasted. |
| R8 | Know each application's portal | There's no portal column on applications. The cycle's deadlines carry `owning_system` (`common_app`, `ucas` and others). | Take the portal from the application deadline's `owning_system`. Own applications choose a portal when created. No new column. |
| R9 | Profile data through a new RLS-protected RPC like `journey_snapshot` | `journey_snapshot` returns the whole journey input, which is far more than filling needs. | A new `fill_profile(p_application_id)` with only fill fields and final-draft ids (no text), returning nothing while consent is pending or revoked (A1.1). |
| R10 | Grades exactly as entered | Profiles store `grade_value` and `grade_scale`. A portal may ask for another scale or format. | Fill uses the stored value and scale only. If the portal's options or format don't match, **pause and ask**. There's no conversion anywhere in the extension. |
| R11 | The tracker application moves to submitted on confirmation | `applications.status` already has `submitted`, and status changes are logged in `application_events`. | The extension calls an RPC that sets `submitted` on the student's own application and logs how it was confirmed (portal confirmation page, or the student's word). The journey recomputes on the next visit. |
| R12 | "Apply" from a course in the tracker | The tracker has no way to talk to an extension. | `externally_connectable` limited to our web app's origin. The Apply button checks that the extension is installed and signed in (otherwise it links to install), then opens the portal and hands the run to the extension (A2.4). |
| R13 | A clean-room source about the competitor | The agent writing this plan also did the analysis behind `behavioural-spec.md`, using only public material the owner approved. | Disclosed in spec section 2. **An independent review before store submission** (G3) checks that the product's wording, interface and names don't echo the competitor's. |
| R14 | Chrome Manifest V3 sign-in through our Supabase auth | The web app uses Supabase sessions in cookies; an extension can't share them. | A sign-in page on our site hands a session to the extension through `externally_connectable`. The extension keeps it in `chrome.storage.session`, never on the page and never in `localStorage` (A1.5). |

| R15 | Fill contact details | Profiles hold a display name (which may be a nickname), a birth month, a residence country and the sign-in email. They hold no legal name, full date of birth, address or phone number. | `fill_profile` returns the email and residence country only. Fields asking for a legal name, date of birth, address or phone are left for the student (logged as `left`). We don't start collecting more personal data for this; that's a later owner decision (A1.1). |

## Deviations from the instructions (decisions M7 takes)

- **The practice portal comes first** (R1, R3). All of phases 1 and 2 are built and verified against it. Real portals are phase 3, each behind its gate.
- **Common App guided apply is not supported** without written permission (R4).
- **Real-portal fixtures** are our own structured data, not page captures (R2).

## Gates (owner actions, not code)

| Gate | What clears it | What it unlocks |
|---|---|---|
| G1 Common App | Either Common App's written permission or a positive lawyer's review. The owner is pursuing both in parallel, and G1 stays open until one comes back positive. | A3.2 (Common App assisted fill). Guided apply stays off unless the permission covers navigation. |
| G2 UCAS | As G1, for UCAS: both features, the hand-made map and fixture format (R2), and any REA use | A3.1 (UCAS adapter, both features) |
| G4 Slate, per university | The university's graduate admissions office gives permission, or a lawyer gives a positive review, for that university's portal. First: UW–Madison, University of Georgia, University of Missouri. | A4.x for that university |
| G5 OUAC | First, a person reads the full terms and declaration (our fetch was blocked by a bot challenge). Then permission or a positive lawyer's review. | A5.1 |
| G6 uni-assist | Permission, or a positive lawyer's review | A6.1 |
| G7 Studielink | Permission, or a positive lawyer's review | A7.1 |
| G3 Clean-room review | Someone who hasn't read the competitor material compares our extension's wording, interface and names with `docs/research/behavioural-spec.md` and the competitor's public store listing, and signs off | Store submission (A2.6) |

## Review focus

- **The guard:**
  - Can any code path click, submit, press Enter or tick a declaration outside the guard?
  - Does the guard block a submit or pay control even when the adapter calls it next-page? (A1.4 tests, and REA step B.)
- **Pausing:** every "pause" reason in spec rule 3 has a test that pauses, and no path continues by guessing.
- **Data:**
  - `fill_profile` returns nothing while consent is pending or revoked.
  - Audit events never contain values.
  - The Edge Function never receives student data.
- **Network:** a REA step B report shows only our Supabase project.
- **Essays:**
  - Nothing is generated.
  - A paste needs a final draft and a confirmation.
  - Courses that ban AI help, or whose policy is unknown, are never touched.
- **Stopping:** each run stops at the review page, as REA step C evidence shows.

## File structure

| Path | What |
|---|---|
| `supabase/migrations/20270107000001_assist.sql` + `530_assist.test.sql` | `fill_profile`, `assist_runs`, `assist_events`, logging and submit RPCs, `documents.final_version_id`, `program_ai_policies` |
| `supabase/functions/suggest-field-role/` | Edge Function: one unmatched label in, a suggested role out |
| `packages/portal-adapters/` | The canonical roles, the adapter format, the rule matcher, the guard rules, adapters (`practice` first), fixtures |
| `apps/practice-portal/` | Our own test portal, served locally for tests and REA |
| `apps/extension/` | Manifest V3 extension: service worker, content script, side panel; build and network-allowlist checks |
| `apps/web/app/extension/connect` | The extension sign-in handoff page |
| `apps/web/app/app/tracker/[id]/*` | The Apply button; the assist log |
| `apps/web/app/app/writing/[id]/*` | "Use as final draft" |
| `apps/web/app/courses/[slug]/*`, `app/admin/*` | The AI-policy fact and its review |
| `docs/superpowers/reports/m7/` | REA evidence: maps (A), static audits (B), runs (C) |
| `docs/research/behavioural-spec.md` | The clean-room source (already in place) |

---

## Phase 1: Assisted fill (ships first)

### Task A1.1: Fill profile, audit log, final drafts and AI policy (database)

**Interfaces:**
- **`fill_profile(p_application_id)`:**
  - Returns the email and residence country (R15), education with grades as entered, test scores, activities from the CV, the course's portal and AI policy, and final-draft ids.
  - Only for the caller's own application, and nothing while consent is pending or revoked.
- **`log_assist_event(...)`, `start_assist_run(...)`, `end_assist_run(...)`:** events record the field role, kind and source, never a value.
- **`mark_application_submitted(p_application_id, p_how)`:** for the caller's own application only.
- **`documents.final_version_id`:** set through the existing update policy, and only to one of the document's own versions.
- **`program_ai_policies`:** public read of published rows; changes go through the review RPCs.

- [ ] **Failing pgTAP first:**
  - isolation
  - consent pending or revoked returns nothing
  - parents get nothing; counselors with a share can read runs
  - an event can't carry a value
  - a final version must belong to its document
  - an unknown AI policy reads as "bans"
- [ ] Implement, run `pnpm db:types`, and commit `A1.1 Fill profile, audit log, final drafts and AI policy`.

### Task A1.2: Practice portal and its map (REA step A on our own portal)

**Interfaces:** `apps/practice-portal`, a small site with our own invented wording:
- its own sign-in, which stays separate from UniGuide
- four sections over six pages
- required and conditional fields, repeated activity groups, a grade field with its own scale options, an essay field
- a CAPTCHA stand-in, a fee page with a waiver checkbox, a declaration
- a review page and a confirmation page

**Steps:**
- [ ] Build the portal, with Playwright smoke tests.
- [ ] **REA step A (practice portal):**
  - Start Chromium with a debugging port and a dedicated profile.
  - Sign in with the synthetic test student.
  - With REA observing (`observe_web_session`, `inspect_web_page`), click through every page. Record:
    - section and page order
    - each field's label and identifier
    - required and conditional fields
    - the review and confirmation pages
    - every submit, pay, sign and certify control
- [ ] Save the map as `packages/portal-adapters/practice/map.json` and the captures as fixtures, plus the evidence in `docs/superpowers/reports/m7/A-practice/`.
- [ ] **Show the map to the owner before writing the adapter.**
- [ ] Commit `A1.2 Practice portal and its map`.

### Task A1.3: Adapter format, canonical roles and the rule matcher

**Interfaces:**
- **Canonical roles:** our own field schema, for example `contact.email`, `education.grade`, `activity[n].role`.
- **Adapter format:** sections, pages, fields with how to find them, roles, types and required or conditional flags, never-click controls, next-page controls, review and confirmation pages, and a version.
- **Matcher:**
  - the adapter's map first
  - then visible label and section against our synonym lists
  - returns a role and a confidence, or "unmatched"
- **Value resolver:** turns the `fill_profile` output into a value and its source for each role. It returns "needs the student" when a format doesn't match. It never converts.

- [ ] **Failing tests first, against the A1.2 fixtures:**
  - every mapped field gets its role
  - conditional fields count only when visible
  - repeated groups match in order
  - a grade whose scale isn't among the portal's options returns "needs the student"
  - an unknown field is unmatched
- [ ] Implement the practice adapter from its map, and commit `A1.3 Adapter format, roles and rule matcher`.

### Task A1.4: The guard

**Interfaces:** `guard.allowClick(control, context)` and `guard.allowKey(...)`.
- Deny by default.
- Allow only an adapter-declared next-page or "add another" control that passes the adapter-independent checks (spec 7.2).
- Never: form submit, Enter in text fields, declaration ticks, payment or third-party frames, or controls whose words appear on the never-click list (English and Hindi).

- [ ] **Failing tests first, independent of any adapter.** Each of these must be blocked:
  - a submit button labelled next-page by a deliberately wrong adapter
  - a pay link
  - a "certify" checkbox
  - a confirm button inside a frame
  - Enter in a text field
  - a never-click control whose text is changed at runtime
- [ ] Implement, and commit `A1.4 The guard, deny by default`.

### Task A1.5: Extension shell, sign-in and assisted fill

**Interfaces:**
- **Manifest V3:**
  - permissions: `storage`, `sidePanel`, `scripting`, `activeTab`
  - host permissions: the Supabase project, plus the practice portal in test builds only
  - content security policy: `connect-src` the Supabase project only
- **Sign-in:** through `/extension/connect` on our site. The session is kept in `chrome.storage.session`; sign-out clears everything.
- **Consent:** pending or revoked shows only the reason.
- **Side panel:** fields with suggested value, source, confidence and fill, copy and skip (spec 5.3). Every fill goes through the content script's single writer, which uses the guard for anything other than typing into a field.
- **Logging:** every action is logged through the RPCs.
- **Build checks (our own, besides REA):**
  - a network allowlist test over the built bundle
  - a check that no file outside the guard uses `click(`, `submit(`, `requestSubmit(`, `dispatchEvent` with click or submit, `location` assignment, or Enter key events

- [ ] **Failing tests first:**
  - unit tests for the panel state
  - Playwright, with the extension loaded, against the practice portal:
    - sign in, then fill one field, copy one, skip one
    - the overwrite prompt
    - a choice field with no exact option does nothing
    - consent pending shows nothing to fill
  - the build checks fail on a planted `fetch` to another host, and on a planted `.click()` outside the guard
- [ ] **REA step B:** run `analyze_javascript_application` on the built `apps/extension/dist`. Report:
  - declared permissions
  - every network destination candidate
  - any path that can click, submit or navigate
  - third-party code

  Fail if a destination isn't our Supabase project, or a click path reaches a never-click control. Save the report in `docs/superpowers/reports/m7/B-A1.5/`.
- [ ] Commit `A1.5 Extension shell, sign-in and assisted fill`.

### Task A1.6: Model help for unmatched fields

**Interfaces:**
- **Edge Function `suggest-field-role`:**
  - input: one visible label and our role list; output: a suggested role, or none
  - no student data accepted (anything else is rejected)
  - the provider key stays server-side
  - rate-limited per user
- **In the panel:** "Suggest what this asks" on an unmatched field. The answer shows with a "suggested" badge, and the student must confirm before a fill.

- [ ] **Failing tests first:**
  - the function rejects a request carrying anything but a label and the role list
  - the panel never fills on a suggestion without confirmation
  - REA step B still shows only the Supabase project
- [ ] Implement, and commit `A1.6 Suggested roles for unmatched fields`.

### Task A1.7: Web app (final draft, AI policy, extension page, assist log)

**Interfaces:**
- "Use as final draft" in the writing editor
- the AI-policy fact on course pages, with its status and source, and in admin review
- `/extension/connect`
- "Assist log" on the application page: runs and events, with nothing filled shown as a value

All copy goes through `lib/i18n` in English and Hindi.

- [ ] **Failing tests first:**
  - pgTAP covered by A1.1
  - Playwright: mark a final draft; see the policy fact; read a run's log
  - axe at both widths
- [ ] Implement, and commit `A1.7 Final drafts, AI policy and the assist log`.

### Task A1.8: Assisted fill exit gate (REA steps B and C on the practice portal)

- [ ] **Full e2e:** a practice-portal session in which the student fills, copies and skips across all pages, with the run logged.
- [ ] **REA step C (practice portal):** observe a full assisted-fill session. Record fields touched, navigations (the student's own only) and network requests. The page session, the extension's request log and the content security policy together must show only our Supabase project. Save the evidence in `docs/superpowers/reports/m7/C-A1.8/`.
- [ ] REA step B on the final build.
- [ ] Draft the Chrome Web Store listing and privacy disclosure (spec 7.8).
- [ ] Every suite, then commit `A1.8 Assisted fill audit and docs`.

## Phase 2: Guided apply

### Task A2.1: The run state machine

**Interfaces:** pure states and transitions, as in spec 6.2:
- pause reasons: no confident match; required field without a confirmed value; page doesn't match; CAPTCHA or security check; sign-in screen; payment, fee waiver or declaration; unexpected
- Pause, Stop and resume, hand-back, and stop at review

- [ ] **Failing tests first:** each pause reason pauses; Stop takes effect before the next action; at review the run stops and can't move on.
- [ ] Commit `A2.1 Guided-apply run states`.

### Task A2.2: Moving through pages (guard, page checks, pauses)

**Interfaces:**
- On each page: check the page against the map, fill confident fields, list the rest, decide whether to pause.
- Move only through the guard, using the adapter's next-page control, then wait for the next page.

- [ ] **Failing Playwright tests first** (practice portal, extension loaded):
  - a full run reaches the review page and stops
  - a changed page pauses
  - the CAPTCHA stand-in pauses
  - the fee and declaration pages pause
  - a missing required value pauses
  - Stop in mid-page stops before the next action
  - a deliberately wrong practice adapter cannot get past the guard to submit
- [ ] Commit `A2.2 Guided apply through the guard`.

### Task A2.3: Essays and AI-policy mode

**Interfaces:**
- **Essay fields:** with a final draft and a verified "allows" policy, offer to paste it, and paste only after confirmation. With no final draft, leave the field and list it.
- **Courses that ban AI help, or whose policy is unknown:**
  - never paste
  - offer "Copy my final draft" to the clipboard, so the student can paste it themselves
  - list the field for the student

- [ ] **Failing tests first:**
  - no paste without confirmation
  - no paste without a final draft
  - a banning or unknown-policy course is never pasted into, but its final draft can be copied to the clipboard
  - nothing is ever generated: there's no code path from the Edge Function to an essay field
- [ ] Commit `A2.3 Essays and AI-policy mode`.

### Task A2.4: Apply from the tracker, review summary and submitted

**Interfaces:**
- **The Apply button** shows only for portals that support guided apply. It checks the extension is installed and signed in, opens the portal, and hands over the run.
- **At review:** the summary (filled, left, skipped, pauses, each linked).
- **Submitted:** on detecting the confirmation page, or when the student presses "I've submitted", call `mark_application_submitted`.

- [ ] **Failing tests first:**
  - Playwright: Apply → run → review summary → the student submits on the practice portal → the tracker shows submitted, and the log says how
  - the Apply button is absent for unsupported portals
- [ ] Commit `A2.4 Apply from the tracker and submitted status`.

### Task A2.5: Guided apply exit gate (REA steps B and C on the practice portal)

- [ ] **REA step C:** run guided apply end to end on the practice portal with REA observing. Record every field touched, every navigation, every network request, and where it stopped. Required results:
  - it stops at the review page
  - it pauses on the changed page, the CAPTCHA stand-in and the fee and declaration pages
  - it never clicks submit, pay, sign or certify

  Save the evidence in `docs/superpowers/reports/m7/C-A2.5/`.
- [ ] REA step B on the final build.
- [ ] Every suite, axe, docs (FEATURES, BACKLOG, README, `docs/APPLICATION_ASSIST.md`), and the milestone report with the A to C evidence.
- [ ] Commit `A2.5 Guided apply audit and docs`.

### Task A2.6: Store submission (after G3)

- [ ] **Independent clean-room review (G3)** signed off.
- [ ] Listing, privacy disclosure, single-purpose statement, screenshots of our own interface only.
- [ ] Commit `A2.6 Store submission`.

## Phase 3: Real portals (each behind its gate)

### How real-portal maps are made (all of phases 3 to 7)

- **By hand.** The owner records field labels and identifiers by hand while using their own test account normally, with the synthetic profile only.
  - Never submit, and never enter real data.
  - No REA capture.
- **Our own structured data.** The map is written as our own data in the adapter's map format (spec 7.3 and 7.4):
  - section and page order
  - each field's role, our short wording for its label, and the identifier needed to find it
  - required and conditional fields
  - the review and confirmation pages
  - every submit, pay, sign, certify and declaration control
- **REA on a real portal** runs only after that portal's gate is cleared, and only within what the permission allows. If the permission covers observation, REA steps A and C may then check the hand-made map and record runs. If it doesn't, runtime evidence comes from the extension's own run log, the guard's log and the build's static audit (step B).
- **Owner review.** The map is shown to the owner before its adapter is written.

### Task A3.1: UCAS (after G2)

- [ ] Hand-made map, shown to the owner.
- [ ] UCAS adapter with failing fixture tests first, and host permission added.
- [ ] REA step B on the new build.
- [ ] **Runtime evidence** on the owner's test account: an assisted fill session, then a guided-apply run that must stop at the review page and pause on unknown pages. Recorded with REA step C only if the G2 permission allows it, otherwise from the run and guard logs. Save the evidence.
- [ ] Commit `A3.1 UCAS adapter`.

### Task A3.2: Common App assisted fill (after G1)

- [ ] Same as A3.1 for assisted fill only.
- [ ] Guided apply stays unsupported unless the G1 permission explicitly covers moving through the application.
- [ ] Commit `A3.2 Common App assisted fill`.

## Later phases: more portals, in target-country order

The order follows the documented Wave 1 country order (US, GB, CA, AU, DE, IE, then NL), as no live user figures exist yet. Re-order once real usage data exists. Each phase is the same shape as A3.1:
- a hand-made map, shown to the owner
- an adapter with failing fixture tests first
- REA step B on the build
- runtime evidence on the owner's test account
- REA only within the gate's permission

Each phase supports assisted fill, plus guided apply where the permission allows it.

### Phase 4: Slate-hosted graduate applications (US), per university, after G4

- [ ] **A4.1 UW–Madison**, then **A4.2 University of Georgia**, then **A4.3 University of Missouri.**
  - Each university's form is different, so each gets its own adapter. They share a Slate base: common page furniture and never-click controls.
  - Commit `A4.n Slate: <university>`.

### Phase 5: OUAC (CA), after G5

- [ ] **A5.1:** a person reads OUAC's terms and applicant declaration first. Its third-party-content rule fits our paste-own-draft-only rule.
- [ ] Commit `A5.1 OUAC adapter`.

### Phase 6: uni-assist (DE), after G6

- [ ] **A6.1:** stops before uni-assist's fee payment. Never converts grades: uni-assist does its own conversion.
- [ ] Commit `A6.1 uni-assist adapter`.

### Phase 7: Studielink (NL), after G7

- [ ] **A7.1:** never touches sign-in (including DigiD).
- [ ] Commit `A7.1 Studielink adapter`.

## Decisions (owner's answers of 31 October 2026 included)

- **G1 and G2:** the owner is emailing Common App and UCAS for written permission, and having a lawyer review the terms findings at the same time. Each gate stays open until one of those comes back positive for that portal.
- **Later portals:** uni-assist, Studielink, OUAC and Slate (three universities first) were checked (spec 3.3) and added as phases 4 to 7.
- **Real-portal maps** are made by hand (phase 3 note). REA runs on real portals only within a cleared gate's permission.



1. **Clean-room review before store submission (G3).** The same agent wrote both the research and this plan, so a person who hasn't read the competitor material checks the result. **Default: yes.**
2. **Practice portal first;** real portals only after their gates. **Default: yes.**
3. **Common App guided apply:** not supported without written permission. **Default: yes.**
4. **Unknown AI policy counts as a ban.** Factual fill still works. The student can copy their own final draft to the clipboard and paste it themselves. Only automatic paste is disabled. **Owner: yes.**
5. **No "fill all" in assisted fill.** Filling a whole page in one go is guided apply's job, with its pauses. **Default: yes.**
6. **Model help through a Supabase Edge Function,** labels only, opt-in per field, confirmed by the student. **Default: yes.**
7. **Real-portal fixtures** are our own structured data (identifiers and roles), not page captures. **Default: yes.**
8. **The audit log** keeps actions, roles and sources, never values. **Default: yes.**
9. **Counselors with an active share** can read the assist log, read-only, without values (values are never stored). Parents can't. **Owner: yes.**
10. **Session storage:** the extension's Supabase session lives in `chrome.storage.session`, so it's cleared when the browser closes, and the student signs in again per browser session. **Default: yes.**

## Verification

- **Suites:**
  - `pnpm db:test`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter web lint`
  - the extension's unit tests and build checks
  - Playwright with the extension loaded against the practice portal
  - `pnpm --filter web e2e`, `e2e:demo` and `e2e:community`
  - worker pytest, ruff and mypy
- **REA evidence** in `docs/superpowers/reports/m7/`:
  - A: every map, shown to the owner before its adapter
  - B: a static audit per build
  - C: assisted-fill and guided-apply runs
- **CI on #4:** green apart from the four accepted e2e failures and the worker format issue from `develop`.
