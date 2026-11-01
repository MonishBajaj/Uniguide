# Application assist (UniGuide Assist)

For developers. This explains how the UniGuide Assist browser extension helps a student fill in their own application on a portal, what it will never do, and how to change it safely.

**Background reading:**
- Spec: `docs/superpowers/specs/2026-10-31-application-assist-design.md`. Its section 4 rules are binding.
- Plan, gates and decisions: `docs/superpowers/plans/2026-10-31-application-assist-m7.md`
- REA evidence for each step: `docs/superpowers/reports/m7/` (milestone report in its `README.md`)
- Running it locally: `docs/SETUP.md`, section 9
- What's built: `docs/FEATURES.md`. What's waiting or accepted as a limit: `BACKLOG.md`

## The idea in one paragraph

The student signs in to the application portal themselves, in their own browser. The extension reads the page's field labels, matches each field to a fact in the student's UniGuide profile, and fills only facts the student has confirmed, exactly as entered. It never fills essays: it can paste the student's own final draft, only when told to and only where the course's verified AI policy allows it. Otherwise it offers the draft to copy. It has two modes:

- **Assisted fill:** field by field. The student presses Fill, Copy or "Leave for me" on each row of the side panel.
- **Guided apply:** the student presses Start. The run fills a page, presses the page's "Continue" through the guard, and pauses whenever something is uncertain or is the student's own to do. It stops at the portal's review page. The student submits.

It never clicks submit, pay, sign, certify or a final declaration. A guard enforces that even when an adapter is wrong.

## What it never does

These are the spec's section 4 rules as the code enforces them:

| Rule | Where it's enforced |
|---|---|
| Never handles a portal password; no server-side or headless sessions | No sign-in code for portals at all. The student signs in on the portal's own page. |
| The student starts every action, and can Pause or Stop | The guard refuses everything unless the run is active and the student started it. `GuidedRunner` checks the run before every field and every press. |
| Never presses submit, pay, sign, certify or declare | `guard.allowClick` denies by default (below). Build check: no `.click()`, `submit()`, `location` or key events anywhere but `guard.ts`. |
| Fills only confirmed facts, never converts | `resolveValue` (`resolve.ts`) returns a value only from `fill_profile`. A format the student hasn't entered pauses as `format_differs`. Choice fields use the adapter's `optionEquivalents` (the portal's name for the same answer), never a conversion. |
| Never writes essay text | `planPage` never puts an essay in `toFill`. Pasting is a separate panel action, offered only for a verified "allows" policy. An unknown policy counts as a ban: copy only. |
| Nothing while consent is pending or revoked | `fill_profile` and `start_assist_run` return nothing or refuse. The panel shows the consent message and a link to UniGuide. |
| Talks only to our Supabase project | `src/supabase.ts` is the only `fetch`. The content security policy's `connect-src` is the project. Build check on every build. |
| The log has no values | `assist_events` has no value column: kind, field role, page, source and reason only. |

## Where things live

| Path | What it is |
|---|---|
| `packages/portal-adapters/src/roles.ts` | The canonical roles (`contact.email`, `education.grade.value`, `essay.personal_statement`, …). Each has an action: `fill`, `confirm`, `student`, `pause` or `never`, and label synonyms for the rule matcher. |
| `packages/portal-adapters/src/format.ts` | The adapter format (`Adapter`, `PortalMap`) and `validateAdapter`. An adapter is a portal's pages in order, each field's role and how to find it, the next-page controls, the review and confirmation pages. `guided: true` only where the portal's terms allow navigation; `serves` names the application systems (deadline `owning_system`) it handles. |
| `packages/portal-adapters/src/match.ts` | `matchPage`: the map's own fields first, then label rules with a confidence |
| `packages/portal-adapters/src/resolve.ts` | `resolveValue`: one field's value from the fill profile, or why there isn't one |
| `packages/portal-adapters/src/guard.ts` | The guard: `allowClick`, `allowKey`, `allowFill`, `allowNavigate`, and the only click (`press`) and navigation (`navigate`) in the extension |
| `packages/portal-adapters/src/plan.ts` | `planPage`: what guided apply fills on a page, what it lists for the student, and whether it pauses and why |
| `packages/portal-adapters/src/run.ts` | The run state machine: `startRun`, `runStep(run, event)`, `nextAction(run)` |
| `packages/portal-adapters/src/practice/` | The practice portal's adapter, the only one so far |
| `apps/extension/src/background.ts` | The service worker: the UniGuide session (in `chrome.storage.session`), the current run, the audit log, messages from our web app |
| `apps/extension/src/content.ts`, `writer.ts` | The content script on portal pages: scans fields, fills one field (`writer.ts`, the only writer), presses and navigates through the guard |
| `apps/extension/src/panel/` | The side panel: assisted-fill rows, the guided run card (`guided.ts`, `GuidedRunner`), English and Hindi strings (`i18n.ts`) |
| `apps/extension/scripts/build.mjs`, `check.mjs` | The build (test, dev and store variants) and the build checks |
| `apps/practice-portal/` | Our own practice portal (port 4318), the only portal any test or REA run touches |
| `supabase/migrations/20270107000001_assist.sql` | `fill_profile`, `assist_runs`, `assist_events`, the run and log RPCs, `mark_application_submitted`, `application_portal`, `documents.final_version_id` and `program_ai_policies` |
| `supabase/functions/suggest-field-role/` | The Edge Function that suggests a role for one unmatched label (A1.6) |
| `apps/web/app/extension/connect/` | Where the student connects the extension to their account |
| `apps/web/app/app/tracker/[id]/apply-with-assist.tsx` | "Apply with UniGuide Assist" on the tracker |
| `apps/web/components/assist-log.tsx` | The assist log, on the application page and, read-only, for a counselor with a share |

## The guard

Every click and every navigation the content script makes goes through `guard.ts`. It denies by default. `allowClick` allows a press only when all of these hold:

1. The run is active and the student started it.
2. It's a button or a link in this page's own document: not a field, a checkbox or a radio (the guard never ticks or chooses), not disabled, and not in another frame.
3. It isn't on the adapter's never-click list.
4. The page still matches the adapter's map, and it's a form page or the dashboard (never the review or confirmation page).
5. The adapter declares this control on this page (next-page, or a harmless control such as "add another activity"), and lists it in its allowed clicks.
6. It goes nowhere off the portal's origin, and neither its words nor its address contain a never-word: submit, pay, sign, certify, declare, confirm, final and the like, in English and Hindi.
7. If it submits a form, the form isn't one the guard judges to be submitting, paying or signing.

`allowNavigate` allows an address only on the adapter's own origin, with no never-word in the address. Guided apply never navigates on its own: only the review summary's "Go to …" buttons do, when the student presses one.

A blocked action is logged as `blocked` with the reason `guard`, and the run pauses. `extension-guided-wrong.spec.ts` builds the extension with a deliberately wrong adapter that declares the portal's Submit as next-page, and checks the guard still refuses it.

## Guided apply

**Starting.** From the tracker, "Apply with UniGuide Assist" appears when the application's portal (`application_portal`, from the deadline's `owning_system`) is one an adapter `serves` with `guided: true`. The web app first asks the extension whether it's installed and connected (`uniguide.status`). Then `uniguide.apply` makes the extension open the portal in a new tab and leave the application for the panel to pick up. Only our own web origin can send these (`externally_connectable`, and the sender's origin is checked again). The student can also start from the panel on any supported portal page.

**The run.** `run.ts` is a pure state machine. `nextAction` gives one action at a time and `GuidedRunner` (panel) carries it out:

| Status | Meaning |
|---|---|
| `ready` | Waiting for Start |
| `filling` | Checking the page against the map, planning (`planPage`), filling one field at a time |
| `moving` | Pressing the page's next-page control through the guard, then waiting for the next page |
| `paused` | Waiting for the student, with a reason |
| `handed_back` | "I'll take it from here": the student carries on alone |
| `at_review` | On the portal's review page. The run stays open so the submission can be logged on it |
| `stopped`, `finished` | Ended (finished means the confirmation page or "I've submitted it") |

**Pause reasons**, in the order `planPage` picks them when several apply: `captcha`, `declaration`, `payment`, `fee_waiver`, `sign_in`, `no_match`, `format_differs`, `no_value`, `student`. The run state machine adds `page_differs` (the page doesn't match the map), `unexpected` (an unknown page, or the portal shows errors after Continue) and `guard`. Each pause is logged with its reason and shown in the panel with what the student needs to do. A run pauses rather than guesses, and never overwrites a field that already has a value. After 40 pages it pauses as `unexpected`.

**At the review page** the panel shows a summary: what was filled, what's left, what was skipped and where it paused, each with a "Go to …" button to that page (not for fee or declaration pages). The student checks the application and submits it on the portal. "I've submitted it", or the portal's confirmation page, calls `mark_application_submitted`, and the tracker shows the application as submitted, and how. Closing the panel at review ends the run as `review`.

## Data

- **`fill_profile(p_application_id)`**: security definer. Returns only the caller's own confirmed facts that the extension can fill, and nothing while consent is pending or revoked. Draft text comes separately, on request, from `final_draft_text`.
- **`assist_runs`**: portal, feature (`fill` or `guided`), adapter version, start and end, and the outcome (`review`, `stopped`, `paused`, `abandoned` or `submitted`).
- **`assist_events`**: kind (`filled`, `copied`, `skipped`, `left`, `paused`, `resumed`, `navigated`, `blocked`, `pasted_draft`, `copied_draft`, `took_over`, `submitted`), field role, page, source and reason. Never a value.
- Both are written only through RPCs (`start_assist_run`, `log_assist_event`, `end_assist_run`, `mark_application_submitted`). The student reads their own. A counselor with an active share reads them read-only. Parents can't.
- **`program_ai_policies`**: a sourced fact (allows, limited or bans), verified through the review pipeline. No verified row counts as a ban.

## Adding a portal

A real portal is added only after its gate clears (plan gates G1 to G7: permission or a positive lawyer's review). Then:

1. Make its map by hand, from the student-visible page with the owner's test account (plan, phase 3 note). REA runs on a real portal only within the gate's permission. Fixtures are our own structured data (identifiers and roles), never page captures.
2. Write the adapter in `packages/portal-adapters/src/<portal>/` and make `validateAdapter` pass. Set `guided: true` only if the permission covers navigation.
3. Add it to `apps/extension/src/adapters.ts` and its host to `scripts/build.mjs`, so the content script and host permission include it.
4. Add guard tests for that portal's final controls, and an e2e run against a fixture.
5. Run REA steps B and C (C on the owner's test accounts) and save the evidence under `docs/superpowers/reports/m7/`.
6. Add its `owning_system` to `NEXT_PUBLIC_GUIDED_SYSTEMS` for the tracker's Apply button.

## Tests

| What | Where |
|---|---|
| Roles, matcher, resolver, guard, plan and run state machine | `packages/portal-adapters/test/` (`pnpm --filter @uniguide/portal-adapters test`) |
| Panel runner, writer, state, nothing generated | `apps/extension/test/` (`pnpm --filter extension test`), plus the build checks against planted problems |
| Database | `supabase/tests/database/530_assist.test.sql`, `540_role_suggestions.test.sql` |
| The real extension in Chromium against the practice portal | `apps/web/e2e/extension-*.spec.ts` (`pnpm --filter web e2e:extension`). They need the local stack and sign in to UniGuide on one tab, then carry on in a fresh one: Chrome stops passing clicks to the tab that just sent a password form. |
| REA steps B and C | `docs/superpowers/reports/m7/C-A1.8/run-session.cjs` (assisted fill) and `C-A2.5/run-session.cjs` (guided apply) |
