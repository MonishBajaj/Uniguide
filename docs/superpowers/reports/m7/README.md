# M7 milestone report: application assist, phases 1 and 2

**Date:** 1 November 2026. **Branch:** `Updated-developer-b`, draft pull request MonishBajaj/Uniguide#5.

**Scope:** the UniGuide Assist browser extension, with assisted fill (phase 1, A1.1 to A1.8) and guided apply (phase 2, A2.1 to A2.5), built and tested on our own practice portal only. No real portal was touched, no real personal data was entered, and nothing was ever submitted. No competitor product was used, installed or observed.

- How it works: `docs/APPLICATION_ASSIST.md`
- Spec: `docs/superpowers/specs/2026-10-31-application-assist-design.md`
- Plan: `docs/superpowers/plans/2026-10-31-application-assist-m7.md`
- What's waiting and the accepted limits: `BACKLOG.md`, "Application assist"

## What was built

| Phase | Task | What |
|---|---|---|
| 1 | A1.1 | `fill_profile`, the assist log tables and RPCs (no values), "Use as final draft", AI policy as a reviewed fact |
| 1 | A1.2 | Our practice portal and its map |
| 1 | A1.3 | Canonical roles, the adapter format, the map-first matcher, the resolver that never converts |
| 1 | A1.4 | The guard: deny by default, its own tests |
| 1 | A1.5 | The Manifest V3 extension, connecting it, assisted fill in the side panel |
| 1 | A1.6 | Suggested roles for unmatched fields, through our Edge Function, labels only |
| 1 | A1.7 | Final drafts and AI-policy mode in the panel, the assist log on the web |
| 1 | A1.8 | Exit gate: REA steps B and C, store listing and privacy drafts |
| 2 | A2.1 | The run state machine |
| 2 | A2.2 | Guided apply through the guard, with its pauses |
| 2 | A2.3 | Essays and AI-policy mode in guided apply |
| 2 | A2.4 | "Apply with UniGuide Assist" on the tracker, the review summary, submitted status |
| 2 | A2.5 | Exit gate: REA steps B and C, every suite, the docs and this report |

## REA evidence

REA ran only on our own build and our own practice portal.

| Step | What it checked | Evidence | Result |
|---|---|---|---|
| **A. Portal mapping** | The practice portal's pages, controls and fixtures, recorded while a script walked it | `A-practice/` | 18 states mapped into the practice adapter. Real-portal maps will be made by hand (plan, phase 3). |
| **B. Static audit** | Permissions, network destinations, click, submit and navigation paths, third-party code | `B-A1.5/`, `B-A1.6/`, `C-A1.8/rea-B-final.json`, `C-A2.5/rea-B-final.json` | Every build: 5 network sites, all to the Supabase project; no click path besides the guard's `press`; no third-party code; store builds carry no portal. Since A2.4, REA also flags the guard's own navigate call (the review summary's "Go to …" buttons), which only goes to the portal's own pages. |
| **C. Runtime** | Fields touched, navigations, network requests, where it stopped | `C-A1.8/` (assisted fill), `C-A2.5/` (guided apply) | Assisted fill: 10 fields, only by the student's presses, stopped at review. Guided apply: below. |

### Guided apply (step C, A2.5)

One run from the tracker's Apply button to the review page, watched by REA, the browser's request log, a recorder of every scripted event on the portal's pages, and the content security policy.

| Required | Result |
|---|---|
| Stops at the review page | Yes. Still there 4 seconds later; not submitted; the run ended `review` |
| Pauses on the changed page | Yes, `page_differs`, before filling anything |
| Pauses on the CAPTCHA stand-in, the fee and the declaration | Yes: `captcha`, `payment`, `declaration` |
| Never clicks submit, pay, sign or certify | Yes. Its only clicks: the dashboard link and "Save and continue" on five pages. Nothing on the security check, fee, declaration or review pages |
| Network | 36 service-worker requests, all to the Supabase project; the panel made none; the portal tab only reached the portal |
| Essays | The AI policy was unknown, so the run offered the student's own final draft to copy. The student pasted it. The run never wrote in the field |
| Audit log | 32 events, none with a value |

Details: `C-A2.5/README.md` and `C-A2.5/session.json`.

## Suites

Run locally on the final code, 1 November 2026:

| Suite | Result |
|---|---|
| `pnpm db:test` | 782 tests, all pass |
| `pnpm -r typecheck` | pass |
| `pnpm -r test` | 952 pass, 1 skipped: journey 258, matching 125, portal adapters 154, extension 90, web 325 |
| `pnpm --filter web lint` | pass |
| Extension build checks (`check.mjs`) on the dev, test and store builds | pass: Supabase only, nothing outside the guard |
| `pnpm --filter web e2e:extension` | 16 pass, with axe at 1280 and 390 px on the panel and the tracker card |
| `pnpm --filter web e2e` | still running when this was committed; the result follows in the next commit |
| `pnpm --filter web e2e:demo` | still running when this was committed; the result follows in the next commit |
| `pnpm --filter web e2e:community` | still running when this was committed; the result follows in the next commit |
| Worker: ruff check, mypy, pytest | pass; 463 tests. `ruff format --check` flags 7 files from `develop`, fixed separately in MonishBajaj/Uniguide#6 |

**CI on #5 for A2.4** (the last code change): the extension suite passed (16); the app suite failed only the four accepted specs below; the worker job failed only on the `ruff format` issue above.

**Accepted known failures** (owner, 30 October 2026; they fail on `develop` without this work):
- `course-filters.spec.ts` "3.4 filter by open deadline and by published yearly tuition"
- `enrichment.spec.ts` "the first complete profile save starts the search by itself"
- `suggested-courses.spec.ts`, two specs

## What happens next

Nothing more ships until the owner clears a gate:

- **G3, clean-room review:** then A2.6, the store submission.
- **G2 UCAS and G1 Common App:** written permission or a positive lawyer's review, both being pursued. Then A3.1 and A3.2.
- **G4 to G7:** Slate, OUAC, uni-assist and Studielink, each the same way.
