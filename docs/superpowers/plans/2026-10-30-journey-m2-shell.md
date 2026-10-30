# Journey system M2: shell (navigation, home, steps, onboarding) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the journey visible. A signed-in student always lands on a home page that shows their stage, how far through it they are, and the three things to do next, each with a button to the exact place to do it. Navigation follows the seven stages on every `/app` page, on desktop and phone. A new student is asked where they are starting from and sent to the right place.

**Architecture:** Everything reads the M1 engine (`@uniguide/journey`). No page works out a stage or a next step on its own. Each `/app` request reads the snapshot once: `getJourney()` in `lib/journey-request.ts` is wrapped in React `cache()`, so the navigation and the page share one result. The home and the steps page then save that result; the navigation never saves. Public pages make no snapshot read. Snooze, dismiss and "mark done" are server actions writing `journey_step_state`, and each one revalidates `/app` so the badge updates. Copy goes through `apps/web/lib/i18n` from the first component, so Hindi follows the existing 15.4 setup.

**Tech Stack:** Next.js 16 server components and server actions, Tailwind 4 with the existing tokens in `app/globals.css`, the M1 engine, Postgres (one small migration), vitest, Playwright with axe.

**Spec:** `docs/superpowers/specs/2026-10-30-journey-system-design.md`: 6.1 navigation, 6.2 home, 6.4 onboarding, 7.1 (G2, G3, G5, G6, G18), and the M2 build plan in section 9.

**Builds on:** M1 (`docs/superpowers/plans/2026-10-30-journey-m1-engine.md`), pushed to `Updated-developer-b` (`d8f3778`).

**Branch:** `Updated-developer-b`. One commit per task, starting with its ID (`J2.3 Journey home`), plain messages, no co-author line.

## Global Constraints

- The M1 product rules still hold:
  - The model never writes a fact.
  - Unverified or conflicting facts never produce "you meet".
  - No grade conversion, no admission percentage, no ghostwriting.
  - Step titles and reasons come only from the engine's templates.
- **Every step card has one working link.** It is the step's `href`, which M1 already checks against real routes and anchors. A card never shows without it.
- **Every fact a card quotes shows its status:**
  - Verified: a tick.
  - Unverified or conflicting: the label in the existing `FactBadge` colours, with a link to the source.
- **Accessibility (WCAG 2.1 AA, as 15.2):**
  - A skip link.
  - `aria-current` on the current navigation item and the current stage.
  - Visible focus.
  - Touch targets of at least 44 by 44 px on the phone bar.
  - Every page added to the axe audit, which must stay at zero serious or critical issues.
  - Text size, high contrast, reduced motion and low-bandwidth settings keep working.
- **Design system.** Keep UniGuide's tokens (`--accent #2f6b57`, the verified/unverified/conflicting colours, Geist, `.btn`). The ui-ux-pro-max generated styles did not fit in M1 and are not used.
- **Copy:**
  - Sentence case, plain, every number with its unit (spec section 1).
  - Through `lib/i18n` (en and hi).
  - Hindi strings stay marked "needs native-speaker review".
- **Migrations** start at `20270102`, with pgTAP tests, RLS on every table, then `pnpm db:types`.
- **Suites to run before the milestone is done:**
  - `pnpm db:test`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter web lint`
  - `cd worker && uv run pytest`
  - `pnpm --filter web e2e`, `e2e:demo`, `e2e:community`
  - screenshots of every new screen at desktop and phone widths

## Where the spec and the code disagree

Checked against `Updated-developer-b` at `d8f3778` on 30 October 2026.

| # | Spec says | Code has | Resolution |
|---|---|---|---|
| N1 | "Today the student area has no navigation" (6.1) | `components/site-header.tsx` shows signed-in students a row of links: My matches, Shortlist, Tracker, Offers, Writing, Profile, Updates, Display. | Rework that header for students into the journey navigation (M1 plan, R1). Guests, parents, counselors and staff keep today's header. Writing, CV, recommenders and portfolio move under Applications, as spec 6.1 lists. |
| N2 | Home matches "the canvas mockup" (6.2, 6.4) | There is no mockup in the repository or in what was shared. | Design from the spec's text with the existing tokens. The review page for this plan shows mockups of each screen for approval before any code. If a canvas exists, share it and J2.3/J2.6 follow it instead. |
| N3 | The home loads "in one server request using the snapshot query" | `loadJourney` makes two calls (snapshot, then save) and returns only the result. "Coming up" needs deadlines, and "shared with" needs names, which the result doesn't carry. The navigation would make a second snapshot read on the same request. | `lib/journey-request.ts` gives each request one snapshot read: `getJourney()` (wrapped in React `cache()`) returns `{ result, input }`, and `saveJourney()` saves that same result without reading again. The engine adds a pure `upcomingDeadlines(input, 3)`. The snapshot adds `sharedWith` (J2.1). An `/app` page makes one snapshot read, plus one save on the home and the steps page. |
| N4 | Fact status "with link to the source" | `NextStep.factRefs` has table, id and status, but no link. | The engine adds `NextStep.source` (`/courses/[slug]` for a course's facts, `/visas` for country rules). Engine version 0.2.0. |
| N5 | "Get help" opens a side panel (6.3) | The help panel is G4, planned for M4. | In M2, "Get help" opens a small panel with the current stage's explainer (for, done when, usually takes) and links to `/guide` and the glossary. M4 replaces it with the full panel and per-page help. |
| N6 | Onboarding's short profile asks for intake (3.2) | No control writes `profiles.intake_year`, so step S1.03 is switched off (M1 R3). Students may already update the column (`grant update (… intake_year …)` in `20261028000006_rls.sql`); only the control is missing. | J2.1 adds the `/app/profile#intake` field and switches S1.03 on in the same commit, so the step never links to an anchor that doesn't render (the M1 test that checks every `ROUTES` anchor against the page files would fail otherwise). J2.6 reuses the field in the onboarding form. This is the intake part of J3.6, brought forward. |
| N7 | "I'm already applying": "add the courses you're applying to"; "I have offers": "add your offers" (3.2) | Applications can only be added for catalogue courses (from a course page or the shortlist). Own applications are G1, in M3. | M2 sends "applying" to `/app/tracker` and "offers" to `/app/offers`. Each shows a short "find your course" prompt with course search. Courses outside the catalogue wait for M3 (G1), and the prompt says so plainly. |
| N8 | After sign-in the student lands on the home | `safeNext` falls back to `/app/profile`. Demo mode's User home is `/app/profile`, and `/consent` redirects there. | Change all three to `/app`. `/app` checks consent first: only when `consent_state` is `not_required` or `granted`, the stage is 1 and `entry_path` is empty does it send the student to `/app/onboarding`. |
| N9 | `/app/steps` shows snoozed and dismissed handling | The engine drops hidden steps, so nothing could bring one back. `NextStep` doesn't say whether a step can be marked done. A step marked done moves to `result.completed`, so it is in neither the open steps nor any hidden list. | The engine adds `JourneyResult.hidden` (id, title, state, until), `JourneyResult.marked` (ids in `completed` that are done only because the student marked them) and `NextStep.markable`. Engine version 0.2.0. |
| N10 | Bottom bar on phones: Home, Explore, Applications, Help, More (6.1) | No mobile navigation exists; the header scrolls sideways. | Build it. More opens a sheet with Shortlist, Offers, Visa and departure, and the account items. |
| N11 | Navigation lives in the student area (6.1, `app/app/layout.tsx`) | `SiteHeader` is rendered by the root layout (`app/layout.tsx`) on every page, so the `/app` layout can't be the only place that decides whether to read the journey, and nothing tells the header which path it is on. | `proxy.ts` forwards the request path as an `x-ug-path` request header, always set from the real request path and overwriting any `x-ug-path` the client sent, so a crafted header can't make a public page read the snapshot or hide a banner. `SiteHeader` calls `getJourney()` only when that path is under `/app` and the user is a student. Elsewhere, signed-in students see the student links without the badge, and no snapshot is read. Public pages already render per request (the header reads the session cookie), so no static caching is lost. |
| N12 | The entry answer is saved as `profiles.entry_path` (6.4) | The "own profile update" policy requires `can_process_personal_data`, so the write fails while consent is `pending_parental` or `revoked`. | Students without consent are never sent to onboarding, and `/app/onboarding` sends them back to `/app` (N8). |
| N13 | Fact status "with link to the source" (6.2) | The snapshot doesn't carry source URLs. Requirements and deadlines point at `sources` through `source_id`; country rules have their own `link` and a `source_id`. | J2.1 adds `sourceUrl` to each requirement, deadline and country rule in `journey_snapshot`. `NextStep.source` links to the official page, with `/courses/[slug]` (or `/visas` for a rule) as the fallback. |
| N14 | Stage copy goes through `lib/i18n` (7.2) | `lib/i18n/en.ts` reaches the browser through `components/locale.tsx` (a client component). Importing the package index from it would put the whole engine in the browser bundle. | The journey package adds a subpath export, `@uniguide/journey/stages`, and `en.ts` imports the stage text from there. |
| N15 | A new student is sent to onboarding; a student with a preparing application lands on stage 4 | `supabase/seed.sql` gives the seed student (`student@uniguide.local`, the demo "User" account) only a birth month and residence: no subjects, no applications and no `entry_path`, so it is in stage 1. M1's cron e2e check expects exactly that (stage 1, S1.01 first). With N8, demo mode's User would land on onboarding every time, and no seed account is in stage 4. Seed courses are loaded by the worker after `seed.sql` runs, so `seed.sql` can't create an application. | `seed.sql` sets the seed student's `entry_path` to `exploring` and leaves it otherwise unchanged, so M1's check and the specs that call `resetStudent()` still hold. A second seed student, `applicant@uniguide.local`, gets a full profile (master's, GB and DE, subject 0613, grade 8.4 on a 10-point scale, budget 60,000 USD, intake 2027) and `entry_path = applying`. A new e2e helper, `resetApplicant()`, gives it one preparing application on the first published placeholder course before each test (J2.3). |
| N16 | The home shows S1.06 to a student waiting for consent | `app/app/layout.tsx` already shows a consent banner on every `/app` page while consent is `pending_parental`, so the home would say the same thing twice. | For pending consent, the banner is left out on `/app` itself (read from `x-ug-path`), where the S1.06 card says it; other `/app` pages keep it. For revoked consent the banner shows on every `/app` page, `/app` included (N17). |
| N17 | M1 plan D3: only `pending_parental` triggers S1.06 | The engine disagrees with D3. S1.06 applies whenever consent isn't `not_required`, so a `revoked` student gets S1.06, and every other step is blocked. S1.06 links to `/consent`, which sends any student who isn't pending back out, so a revoked student would get a step that can't be done. Nothing sets `revoked` today, but the enum allows it and a parent withdrawal flow would. | J2.1 makes S1.06 apply only to `pending_parental`, as D3 says. A revoked student gets no steps, since nothing personal may be processed. `/app` shows the revoked banner ("A parent or guardian withdrew consent for this account. Until they confirm again, we don't save or use your personal details.") in place of the cards, with no "you're up to date" message and no onboarding redirect. A way for a parent to consent again doesn't exist; it goes in BACKLOG.md. |

## Deviations from the spec (decisions M2 takes)

- **Engine 0.2.0.** It adds `NextStep.source`, `NextStep.markable`, `JourneyResult.hidden`, `JourneyResult.marked` and `upcomingDeadlines()`, switches S1.03 on, and changes S1.01's link (N4, N6, N9, N13). `expected.json` is regenerated deliberately and the version bumped.
- **S1.01 links to the short profile.** In M1 it linked to `/app/onboarding` (the chat) only with AI consent, otherwise to `/app/profile#targets`. In M2 `/app/onboarding` is the three-screen flow for everyone, so S1.01 links to `/app/onboarding?screen=3`, the short profile, which skips the entry question; that screen offers the chat when AI consent exists. A doctorate student whose only gap is research interests still goes to `/app/profile#research`. The reason becomes "Your level, subjects and countries decide which courses we look at. One short form covers them."
- **S1.06 is for pending consent only** (N17). M1's engine also showed it for revoked consent, against M1 D3; J2.1 brings the engine back in line, and revoked students see a banner instead of a step.
- **Undoing "mark done" keeps its event.** Bring back deletes the `done` row, but the `step_done` event already logged stays, and it counts for the stalled timer. Marking a step done and undoing it is still activity, `journey_events` stays append-only, and no time window is needed. The step reopens on the next compute.
- **"Get help" is a small stage panel until M4** (N5).
- **No own applications in onboarding until M3** (N7).
- **One snapshot read per `/app` request, shared by the navigation and the page** (N3, N11). The navigation never saves; the home and the steps page save the shared result, as do step actions (through the page they revalidate) and the daily recompute. This keeps the badge current without filling `journey_events` with page views. Public pages read no snapshot, and their navigation has no badge.
- **Onboarding can be skipped.** "Skip for now" on screens 1 and 2 saves `entry_path = exploring` and goes to `/app`, so a student who leaves early isn't sent back on every visit.

## Review Focus

- **A brand-new student** signs up, answers "Just exploring", fills the short form and lands on their first matches. The next visit to `/app` shows stage 2 and "Look through your matches". (J2.6, J2.7)
- **A student with a preparing application** (the seed `applicant@uniguide.local`, given one by `resetApplicant()`) signs in and lands on `/app`, which shows stage 4. Its progress reads "0 of 1 application ready" until the checklist is done. (J2.3)
- **A student whose consent was revoked** opens `/app`, isn't redirected, sees the revoked banner and no step cards, and the engine gives no S1.06. (J2.1, J2.3)
- **A failed journey read** on `/app` or `/app/steps` shows an error state with a "Try again" link, not a crashed page; the navigation shows no badge. Tests trigger it with a test-only cookie that works only when the server runs with `E2E=1`. (J2.1, J2.2, J2.3, J2.4)
- **A crafted `x-ug-path` header** has no effect: the proxy overwrites it from the real path. (J2.2)
- **A student waiting for parental consent** opens `/app`, isn't redirected to onboarding, and sees only "Ask a parent to confirm your account", with no snooze or dismiss. Opening `/app/onboarding` directly sends them back to `/app`. (J2.1, J2.3, J2.6)
- **One snapshot read per `/app` request**, shared by the navigation and the page; none on public pages; a failed read leaves the navigation without a badge and the page still loads. (J2.1, J2.2)
- **Onboarding never strands a student:** "Skip for now" lands on `/app`, and finishing with a profile matching can't use yet lands on `/app`, where the stage 1 steps say what is missing. (J2.6)
- **Navigation:**
  - On every `/app` page, on desktop and phone, exactly one item is marked current.
  - Items for stages not reached are quieter, but still links.
  - The Applications badge reads as one sentence to screen readers. (J2.2)
- **Snooze, dismiss and mark done:**
  - A dismissed step leaves the home and the steps page, and "Undo" brings it back.
  - A snoozed step returns on its date.
  - "Mark done" exists only on steps the student completes themselves (D8).
  - Bring back works on snoozed, dismissed and marked-done steps, and only on the student's own. (J2.4)
- **No step card without a working link or a fact without its status label.** (J2.3)
- **Parents:** a linked parent visiting `/app` still goes to `/parent` and never sees `/app/steps`. (J2.2)
- **The axe audit** passes on `/app`, `/app/steps` and every onboarding screen, at desktop and phone widths. (J2.7)

## UI design (ui-ux-pro-max)

Checked with `ui-ux-pro-max/scripts/search.py --domain ux`. Each guideline maps to a concrete choice:

| Guideline (skill) | M2 choice |
|---|---|
| Progress indicators: "Step 2 of 4", never nothing | The stage path: an ordered list of 7 stages. The current one has `aria-current="step"` and its progress label ("2 of 3 applications ready"). Earlier stages show a tick; later ones are muted. |
| Active state: highlight the current navigation item | Bold text and a 2 px underline in `--accent`, plus `aria-current="page"`. Section membership follows the route table in spec 6.1, so `/app/tracker/123` highlights Applications. |
| Contextual live badge updates: one atomic sentence, not a bare number | The Applications badge shows the number visually and reads `urgentLabel` ("2 steps due this fortnight") to screen readers. |
| Empty states: a helpful message and an action | Every stage has at least one step from an empty account (M1 fixture test). If a student has no open steps at all, the home says what they finished and links to the stage's page. |
| Skip links on navigation-heavy pages | "Skip to main content" is the first focusable element on `/app` pages. |
| Touch target size (web: 24 CSS px minimum; native guidance 44pt/48dp) | Bottom-bar items and card buttons are at least 44 px tall, comfortably above the web minimum. |
| Fixed positioning: account for safe areas | The bottom bar uses `padding-bottom: env(safe-area-inset-bottom)`, and the page gets matching bottom padding so nothing hides under it. |
| Back button: keep history predictable | The onboarding screens are separate URLs (`?screen=1..3`), so the browser's back button goes back a screen. |
| Truncation: keep the full text reachable | Titles are already at most 60 characters. The full course name shows under the title as the application label, wrapping and never clipped. |
| Undo for destructive actions | Dismiss shows "Dismissed. Undo" in a status message; snooze shows "Back on {date}. Undo". |
| Content jumping: reserve space | Cards have a fixed structure (band, label, title, reason, facts, actions), so pages don't shift as they load. |

**Layout:**

- **Desktop `/app`:** a two-column grid at `lg`. Main column: greeting and summary line, stage path, "Your next steps" (3 cards), "See all steps". Side column: stage explainer, Coming up, Also open, Shared with.
- **Phones:** one column in the same order, with the side column after the cards.

The review page for this plan has mockups of each screen.

## File Structure

| File | Responsibility |
|---|---|
| `packages/journey/src/engine.ts`, `types.ts`, `catalogue/*`, `version.ts`, `package.json` | `source`, `markable`, `hidden`, `marked`, `upcomingDeadlines`, S1.03 on, S1.01's new link, version 0.2.0, `./stages` subpath export |
| `supabase/migrations/20270102000001_journey_shell.sql` + `supabase/tests/database/410_journey_shell.test.sql` | `sharedWith` and fact `sourceUrl` in `journey_snapshot` |
| `apps/web/lib/journey-snapshot.ts` | `parseSnapshot` reads the new fields |
| `apps/web/lib/journey-request.ts` + `.test.ts` | `getJourney()` (one snapshot read per request, React `cache()`), `saveJourney()` |
| `apps/web/proxy.ts` | Forwards the request path as `x-ug-path` |
| `supabase/seed.sql` | Seed student's `entry_path`; new seed student `applicant@uniguide.local` with a full profile |
| `apps/web/lib/request-path.ts` + `.test.ts` | `withPathHeader()`: sets `x-ug-path` from the real path |
| `apps/web/components/journey/journey-error.tsx` | Error state with "Try again", shared by `/app` and `/app/steps` |
| `apps/web/lib/journey-nav.ts` + `.test.ts` | Route → navigation section (spec 6.1 table), reached sections by stage |
| `apps/web/components/journey/student-nav.tsx`, `bottom-bar.tsx`, `help-panel.tsx` | Desktop top bar, phone bar with More sheet, small stage help panel |
| `apps/web/components/site-header.tsx` | Uses the student navigation for signed-in students |
| `apps/web/app/app/page.tsx` | Journey home (G2) |
| `apps/web/components/journey/stage-path.tsx`, `step-card.tsx`, `coming-up.tsx` | Home building blocks, reused by `/app/steps` |
| `apps/web/app/app/steps/page.tsx`, `apps/web/app/app/steps/actions.ts` | All steps by band; snooze, dismiss, mark done, undo (G18) |
| `apps/web/lib/i18n/en.ts`, `hi.ts` | `journey` section: navigation, stage explainers, bands, home and onboarding copy (G5) |
| `apps/web/app/app/profile/forms.tsx` | `#intake` field (J2.1) |
| `apps/web/app/app/onboarding/page.tsx`, `entry.tsx`, `short-profile.tsx`, `actions.ts` | Three screens, skip, and routing by entry path (G6) |
| `apps/web/lib/age.ts`, `lib/demo-mode.ts`, `app/consent/page.tsx` | Landing on `/app` |
| `apps/web/e2e/journey-home.spec.ts`, `journey-onboarding.spec.ts`, `journey-nav.spec.ts`, `a11y.spec.ts` | Flows and audit |

---

### Task J2.1: Engine, snapshot and request loader for the shell

**Files:**
- Modify:
  - `packages/journey/src/types.ts`, `engine.ts`, `rank.ts`, `copy.ts`, `catalogue/index.ts`, `catalogue/routes.ts`, `catalogue/stage1.ts`, `version.ts`, `package.json`
  - `test/*`, `test/fixtures.ts`, `test/fixtures/expected.json`
  - `apps/web/lib/journey-snapshot.ts` + test
  - `apps/web/app/app/profile/forms.tsx`, `apps/web/app/app/profile/actions.ts` (`#intake`)
- Create:
  - `supabase/migrations/20270102000001_journey_shell.sql`, `supabase/tests/database/410_journey_shell.test.sql`
  - `apps/web/lib/journey-request.ts` + `.test.ts`
- Modify for the failure switch: `apps/web/playwright.config.ts` (`E2E: "1"` in `webServer.env`), `.github/workflows/ci.yml` (`E2E=1` in the e2e env file)

**Interfaces:**
- **Snapshot (`journey_snapshot`, replaced):**
  - `sharedWith: { parents: string[], counselors: string[] }`: names of active parent links and of organisations with an active share
  - `sourceUrl` on each requirement and deadline (from `sources.url`) and on each country rule (its `link`, else `sources.url`)
- **`NextStep.source?: { href: string }`:**
  - the first fact's `sourceUrl` (the official page)
  - otherwise `/courses/{slug}` for a course's facts, or `/visas` for a country rule
  - absent when the step quotes no fact, so steps for M3's own applications (no slug) work
- **`NextStep.markable: boolean`**
- **`JourneyResult.hidden: { id, catalogueId, title, state: "snoozed" | "dismissed", until }[]`**
- **`JourneyResult.marked: string[]`**: ids in `completed` that are done only because the student marked them (D8)
- **`upcomingDeadlines(input, limit)`:** the next published deadlines of active applications, each `{ applicationId, label, dueAt, timezone, status, factRef, sourceUrl }`
- **S1.03 available**, linking to `/app/profile#intake`, with `intake` added to `ROUTES`. In the same commit, `/app/profile` gets an `#intake` year select (this year to five years ahead) that saves `intake_year`.
- **S1.01:**
  - links to `/app/onboarding?screen=3` whatever the AI consent, or to `/app/profile#research` when research interests are the only gap
  - new reason (see Deviations)
- **S1.06** applies only when consent is `pending_parental` (M1 D3, N17). Every other step stays blocked under `pending_parental` and `revoked`, so a revoked student gets no steps.
- **`ENGINE_VERSION = "journey-0.2.0"`**
- **`@uniguide/journey/stages`** subpath export (`STAGES` only), for the i18n files (N14)
- **`lib/journey-request.ts`:**
  - `getJourney()`: React `cache()` around one `journey_snapshot` read plus `computeJourney`. It returns `{ result, input }` and never saves.
  - `saveJourney()`: saves the cached result with `save_journey_state`, reading nothing again.
  - Both are built on `journeyRequest(rpc, today)`, a plain memo that the unit test drives with a fake client.
  - **Test-only failure switch:** `getJourney()` throws when `failureInjected(env, cookie)` is true, which needs both `process.env.E2E === "1"` and the cookie `ug_e2e_journey_fail=1`. The Playwright web server runs with `E2E=1` (set in `playwright.config.ts` and the CI env file); production never sets it. This replaces revoking database grants in the error-state tests, which would break specs running alongside and leave the grant revoked if a run is killed.
  - `loadJourney` stays for the daily recompute.

- [ ] **Step 1: Write failing tests:**
  - **Engine and catalogue:**
    - `source` is set exactly when `factRefs` is non-empty. It is the fact's `sourceUrl` when there is one, otherwise a `/courses/[slug]` or `/visas` route that resolves in `ROUTES`.
    - `markable` matches the catalogue.
    - A dismissed step appears in `hidden` with its title; a marked-done step appears in `marked`.
    - `upcomingDeadlines` skips past, unknown-status and withdrawn ones, ordered soonest first.
    - S1.03 shows when the intake is missing.
    - S1.01 links to `/app/onboarding?screen=3` both with and without AI consent, and to `/app/profile#research` for a doctorate student missing only research interests (this replaces the M1 test "S1.01 links to onboarding only with AI consent").
  - **Pending consent:** a new fixture, `edge-pending-consent-with-application`, has a full profile, a preparing application and `consent_state = pending_parental`. It gives stage 4 and only S1.06. The engine already blocks every other step under pending or revoked consent (`evaluateCatalogue` in M1, with the existing `edge-pending-consent` test); this fixture proves it holds with real data too.
  - **Revoked consent:** a new fixture, `edge-revoked-consent`, has the same data with `consent_state = revoked`. It gives no steps, and S1.06 is neither open nor completed. Both new fixtures go into `expected.json` (the revoked one with an empty top three).
  - **The M1 anchor check:** "lists only routes and anchors that exist in the web app" must pass with `#intake`, which proves the field renders.
  - **pgTAP:**
    - `sharedWith` lists an active parent and an active counselor organisation, and not revoked ones.
    - `sourceUrl` is the source's URL for a requirement and deadline, and the rule's link for a country rule.
  - **Request loader:** `getJourney` called twice and `saveJourney` called once in one request make one `journey_snapshot` call and one `save_journey_state` call with the same result. `getJourney` with a failing snapshot rejects, and the caller decides what to show (J2.2).
  - **Failure switch:** `failureInjected` is true only with `E2E=1` and the cookie set to `1`. With the cookie but no `E2E` (or `E2E` set to anything else), it is false and the loader reads the snapshot normally.
- [ ] **Step 2: Implement**, bump the version, and regenerate `expected.json`.
- [ ] **Step 3: Check the change by hand.** `expected.json` holds only the stage and top three ids, so a link change doesn't show in it. Compare the full `computeJourney` output for every fixture before and after with a throwaway script. The only allowed differences are:
  - S1.03 appearing (and the steps it moves down)
  - S1.01's `href` and reason
  - the new `source`, `markable`, `hidden` and `marked` fields
- [ ] **Step 4: Run** `pnpm db:reset && pnpm db:test`, `pnpm db:types` and `pnpm -r test`.
- [ ] **Step 5: Commit** `J2.1 Engine, snapshot and request loader for the shell`.

---

### Task J2.2: Student navigation (G3)

**Files:**
- Create: `apps/web/lib/journey-nav.ts` (+ test), `components/journey/student-nav.tsx`, `bottom-bar.tsx`, `help-panel.tsx`
- Modify:
  - `components/site-header.tsx`
  - `proxy.ts` and new `lib/request-path.ts` (`x-ug-path`, always overwritten)
  - `app/app/layout.tsx` (skip link target, bottom padding)
  - `lib/i18n/en.ts`, `hi.ts`

**Interfaces:**
- **`navSection(pathname)`** returns `"home" | "explore" | "shortlist" | "applications" | "offers" | "departure" | "account" | null`, following the spec 6.1 table.
- **`reachedSections(stage)`** gives the sections whose stage the student has entered. Home and account are always reached.
- **`headerJourney(path, isStudent, getJourney)`** decides what the navigation shows:
  - **Under `/app`:** stage and badge from `getJourney()`. A thrown error gives `{ badge: null, stage: null }` and is logged, so the page still renders.
  - **Elsewhere:** no badge and no stage, without calling `getJourney`.
- **Desktop items:** Home, Explore, Shortlist, Applications (badge), Offers, Visa and departure. Then "Get help" and an account menu (Profile, Sharing, Updates with its unread count, Display, Sign out).
- **Phone items (below `md`):** Home, Explore, Applications, Help, More.
  - The top bar keeps only the logo and the account menu.
  - More opens a sheet with Shortlist, Offers, Visa and departure.
- **Unknown stage** (public pages, or a failed read): every section shows at normal weight, with no badge.
- **Labels and sentences** come from new `t.journey.nav` keys from the first commit, never inline strings.

- [ ] **Step 1: Write failing unit tests:**
  - every route in the spec 6.1 table maps to its section
  - `/app/tracker/abc` and `/app/writing/x` map to applications
  - `/courses/foo` maps to explore
  - unknown routes give null
  - stage 1 reaches home only; stage 4 reaches home, explore, shortlist and applications
  - `headerJourney("/courses/x", true, spy)` never calls `spy` and gives no badge
  - `headerJourney("/app/tracker", true, failing)` gives no badge and doesn't throw
  - `withPathHeader(request)` (the proxy's header step, exported from `lib/request-path.ts` so it can be tested) sets `x-ug-path` to the request's real path, and replaces a client-sent `x-ug-path: /app` on a `/courses/x` request
- [ ] **Step 2: Implement:**
  - Unreached sections use `text-muted`, with no badge, and stay links.
  - The badge is `aria-hidden`; its sentence (`urgentLabel`) is in visually hidden text inside the link.
  - "Get help" opens a disclosure panel: stage explainer, `/guide`, glossary.
  - Add the skip link.
  - Guests, parents, counselors and staff keep today's header unchanged.
- [ ] **Step 3: Playwright:**
  - a signed-in student on `/courses/[slug]` sees the student links and no badge
  - the same request sent with `x-ug-path: /app` still shows no badge
  - the same student on `/app/tracker` sees the badge
- [ ] **Step 4: Screenshots** at 1280 and 390 px wide, for stages 1, 4 and 6.
- [ ] **Step 5: Commit** `J2.2 Journey navigation on desktop and phone`.

---

### Task J2.3: Journey home `/app` (G2)

**Files:**
- Create:
  - `apps/web/app/app/page.tsx`
  - `components/journey/stage-path.tsx`, `step-card.tsx`, `coming-up.tsx`
- Modify:
  - `lib/age.ts` (`safeNext` fallback `/app`)
  - `lib/demo-mode.ts` (User home `/app`)
  - `app/consent/page.tsx` (redirect to `/app`)
  - `app/app/layout.tsx` (no consent banner on `/app` itself, N16)
  - `supabase/seed.sql` (seed student's `entry_path = exploring`; new seed student `applicant@uniguide.local`, N15)
  - `e2e/helpers.ts` (`APPLICANT`, `resetApplicant()`)
  - `app/app/layout.tsx` (revoked banner on every `/app` page, N17)
  - `lib/i18n/en.ts`, `hi.ts` (`t.journey.home`, `t.journey.bands`)

**Interfaces:**
- **Page:** `getJourney()`, then `saveJourney()`, then render top to bottom:
  - greeting (display name) and summary line ("You're in stage 4 of 7: Prepare. 2 of 3 applications ready.")
  - stage path
  - "Your next steps": the first 3 steps
  - "See all steps"
- **Side column:**
  - **Stage explainer:** for, done when, usually takes.
  - **Coming up:** `upcomingDeadlines(input, 3)`, each with its date in the deadline's time zone, its status label and a link to its source. Plus "Add to calendar" (`/app/tracker/calendar.ics`).
  - **Also open:** the number of carry-over steps, linking to `/app/steps#carry_over`.
  - **Shared with:** parent and counselor names, linking to `/app/sharing`; when empty, an invite line linking to `/app/sharing#family`.
- **Step card:**
  - band label ("Due soon", "Start soon", "This stage", "Also open")
  - application label and track label, when the step has them
  - title (h3) and reason
  - fact status (`FactBadge` with a link to `source`)
  - one action button (the step's `href`)
  - **no snooze, dismiss or mark-done buttons yet**: J2.4 adds them with their actions
- **Redirect order:**
  1. Linked parents keep going to `/parent` (existing layout rule).
  2. A student whose `consent_state` is `pending_parental` stays on `/app` and sees the S1.06 card only (the engine gives nothing else).
  3. A student whose `consent_state` is `revoked` stays on `/app` and sees the revoked banner and no cards (N17).
  4. Only a student whose consent is `not_required` or `granted`, who is in stage 1 and whose `entry_path` is empty, goes to `/app/onboarding`.
- **No open steps** (consent not revoked): "You're up to date in this stage" with a link to the stage's page (`STAGES[stage].route`).
- **When `getJourney()` fails:** the page catches it, logs it and shows an error state ("We couldn't load your next steps just now.") with a "Try again" link to the same URL. Nothing is saved. The rest of the layout, including the navigation without a badge, still renders. The shared `JourneyError` component (in `components/journey/`) is reused by `/app/steps`.
- **Copy:** every string through `t.journey` keys from the first commit.

- [ ] **Step 1: Write the Playwright spec first** (`journey-home.spec.ts`):
  - `applicant@uniguide.local`, after `resetApplicant()`, lands on `/app` after sign-in
  - the page shows stage 4 and three cards, each with a link that responds with 200
  - a student with `consent_state = pending_parental` and no `entry_path` opens `/app`, stays on `/app`, and sees one card, S1.06, with no snooze or dismiss, and no second consent banner
  - a student with consent and no `entry_path` in stage 1 is sent to `/app/onboarding`
  - a student with `consent_state = revoked` opens `/app`, stays there, sees the revoked banner and no step cards
  - with the test-only cookie `ug_e2e_journey_fail=1` set on that browser context only, `/app` shows the error state and a working "Try again" link, and the navigation renders without a badge; after clearing the cookie, "Try again" loads the home
  - the seed student (`student@uniguide.local`) lands on `/app` in stage 1 and is not sent to onboarding
  - an unverified deadline shows its label and a source link
- [ ] **Step 2: Implement** the components and the page, change the three landing targets, and update the seed: the seed student's `entry_path`, and the new applicant account. Update existing e2e specs that expect `/app/profile` after sign-in.
- [ ] **Step 3: Screenshots** of stages 1, 2, 4, 6 and 7, pending consent, revoked consent and the error state, at both widths.
- [ ] **Step 4: Commit** `J2.3 Journey home`.

---

### Task J2.4: All steps, snooze, dismiss and mark done (G18)

**Files:**
- Create: `apps/web/app/app/steps/page.tsx`, `apps/web/app/app/steps/actions.ts` (+ `actions.test.ts` for the guard)
- Modify: `components/journey/step-card.tsx` (adds the step buttons, on the home and the steps page), `lib/i18n/en.ts`, `hi.ts` (`t.journey.steps`)

**Interfaces:**
- **Page:**
  - `getJourney()`, then `saveJourney()`. When `getJourney()` fails, the page shows the shared `JourneyError` state with "Try again" instead of crashing.
  - Groups steps by band, with the headings "Due soon" (`#urgent`), "Start soon" (`#long_lead`), "This stage" (`#stage`) and "Also open" (`#carry_over`).
  - A closed `<details>` at the end lists "Snoozed and dismissed" from `result.hidden`, each with "Bring back".
- **Card buttons** (added to `step-card.tsx`, so the home gets them too):
  - "Snooze 7 days" and "Dismiss" on dismissable steps
  - "Mark done" on markable steps
- **Actions** (server actions with a `stepId`):
  - `snooze` upserts `snoozed` until today + 7 days
  - `dismiss` upserts `dismissed`
  - `markDone` upserts `done`
  - `restore` deletes the row
- **Guard, `allowedAction(result, stepId, action)`:**
  - **Snooze, dismiss and mark done** accept only ids in `result.steps`. Snooze and dismiss also refuse undismissable steps; mark done also refuses steps that aren't markable.
  - **Restore** accepts only ids in `result.hidden` or `result.marked`.
  - Anything else, including another student's ids, is refused.
- **After each write:** `revalidatePath("/app", "layout")`, so the home, the steps page and the navigation badge recompute on the next render.
- **Feedback:**
  - a `role="status"` message with Undo (restore) after snooze, dismiss or mark done
  - undoing mark done reopens the step; its `step_done` event stays (Deviations)

- [ ] **Step 1: Write failing tests:**
  - **Unit (`allowedAction`):**
    - unknown ids are refused for every action
    - undismissable steps refuse snooze and dismiss
    - mark done is refused on unmarkable steps
    - restore accepts an id that is only in `result.hidden`, and one that is only in `result.marked`
    - restore refuses an id in `result.steps`
  - **Playwright:**
    - dismiss a step, then it's gone from home and steps; Undo, then it's back
    - snooze, then the "Back on {date}" message appears and the row's `until` is 7 days ahead; Bring back from the list returns it
    - mark S2.03 done, then a `step_done` event is recorded; Undo reopens it
    - after dismissing an urgent step, the Applications badge count drops on the next page
    - with the test-only failure cookie set (as in J2.3), `/app/steps` shows the error state and a "Try again" link to `/app/steps`
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Commit** `J2.4 All steps with snooze, dismiss and mark done`.

---

### Task J2.5: Hindi journey copy and the copy checks (G5)

**Files:**
- Modify: `apps/web/lib/i18n/en.ts`, `hi.ts`, `i18n.test.ts`

**Interfaces:**
- **`t.journey`:**
  - `nav`, `bands`, `home` and `steps`: added by J2.2–J2.4 as they are built
  - `onboarding`: added by J2.6
  - `stages[1..7]`: name, for, done when, usually takes
- **English stage text is not copied.** `en.ts` builds `t.journey.stages` from `STAGES` (`@uniguide/journey/stages`), so the engine stays the one source.
- **This task writes the Hindi strings for everything above**, marked "needs native-speaker review". J2.2–J2.4 may use the English text for Hindi until then.
- **Step titles and reasons stay the engine's English** until M6 translates by copy key (Decisions 6).

- [ ] **Step 1: Write failing tests:**
  - en/hi key parity, with no empty strings (existing test, now covering `t.journey`)
  - Hindi `t.journey` strings differ from the English ones, so none were left untranslated. An exception list in the test allows identical strings for:
    - brand names (UniGuide)
    - test and exam names (IELTS, TOEFL iBT, GRE and the rest of `EXAM_NAMES`)
    - strings made only of placeholders, numbers and punctuation (for example `{count}` or `{done} / {total}`)
    - any other entry needs a comment saying why
  - no hard-coded English in `components/journey` (a grep test for text nodes outside `t.`)
- [ ] **Step 2: Write the Hindi strings.**
- [ ] **Step 3: Commit** `J2.5 Hindi journey copy and copy checks`.

---

### Task J2.6: Onboarding with the entry question (G6)

**Files:**
- Modify: `apps/web/app/app/onboarding/page.tsx`, `actions.ts`, `lib/i18n/en.ts`, `hi.ts`
- Create: `apps/web/app/app/onboarding/entry.tsx`, `short-profile.tsx`

**Interfaces:**
- **Screen 1, "How UniGuide works":**
  - The three tiers (Listed, Extracted, Verified) with the existing `TierBadge`.
  - "Every fact links to its official page."
  - Continue, and "Skip for now".
- **Screen 2, "Where are you right now?":**
  - Four radio cards: Just exploring, I know roughly what and where, I'm already applying, I have offers.
  - Saving writes `profiles.entry_path`.
  - Back, Continue, and "Skip for now".
- **"Skip for now"** saves `entry_path = exploring` and goes to `/app`, so the student isn't sent back on later visits.
- **Screen 3, short profile:**
  - **The form:** level, subjects, countries, budget with currency, and intake year (reusing J2.1's year select). It reuses the profile form's fields and validation.
  - **The chat:** offered instead when the student has AI consent.
  - S1.01 links here directly, so screen 3 works without screens 1 and 2.
- **Where it ends:**
  - **Exploring or knows, with matching's minimum met** (`matchingMinimumMet`): starts the first search (existing `startFirstSearch`), then goes to `/app/match`. "Knows" also shows the shortlist prompt.
  - **Exploring or knows, minimum not met:** `/app`, where the stage 1 steps say what is missing.
  - **Applying:** `/app/tracker`, with "Find the courses you're applying to" and course search. Courses outside the catalogue are named as coming soon (M3).
  - **Offers:** `/app/offers`, with the same prompt.
- **Consent:** a student whose consent is `pending_parental` or `revoked` who opens `/app/onboarding` is sent to `/app` (N12).
- **Screen URLs:** `?screen=1|2|3`. A student who already has an `entry_path` can still revisit them from the profile.

- [ ] **Step 1: Write the Playwright spec first** (`journey-onboarding.spec.ts`):
  - a new sign-up lands on screen 1, and Back works between screens
  - "Just exploring" plus a complete short form ends on `/app/match` with a search started
  - "Just exploring" plus a short form without a budget ends on `/app`, showing "Set your budget"
  - "I have offers" ends on `/app/offers`
  - "Skip for now" on screen 1, and separately on screen 2, ends on `/app` with `entry_path = exploring`, and a second visit to `/app` doesn't redirect
  - `entry_path` and `intake_year` are stored
  - a pending-consent student opening `/app/onboarding` is sent to `/app`
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Screenshots** of all three screens at both widths.
- [ ] **Step 4: Commit** `J2.6 Onboarding with the entry question`.

---

### Task J2.7: Audit, end-to-end flows and docs

**Files:**
- Modify: `apps/web/e2e/a11y.spec.ts`, `journey-nav.spec.ts` (new), `docs/FEATURES.md`, `BACKLOG.md`, `README.md`

- [ ] **Step 1: Navigation spec:**
  - for every `/app` route in the spec 6.1 table, the page has the journey navigation and exactly one `aria-current="page"` item
  - at 390 px the bottom bar shows, and More opens and closes with the keyboard
  - a linked parent opening `/app` lands on `/parent`
- [ ] **Step 2: Axe audit:** add `/app`, `/app/steps` and the onboarding screens at both widths.
- [ ] **Step 3: Spec 9 "done when" check:**
  - every `/app` page has navigation
  - a new student goes from sign-up to first matches
  - a student with a preparing application lands on a home showing stage 4
- [ ] **Step 4: Run every suite** (Global Constraints).
- [ ] **Step 5: Docs:**
  - **FEATURES.md:** journey rows G2, G3, G5, G6 Built; G18 Built.
  - **BACKLOG.md:** S1.03 on, N5/N7 waiting for M4/M3, the two accepted limits from Decisions 6 and 7 (English step titles for Hindi users until M6; Offers under More on phones), and the missing flow for a parent to consent again after revoking (N17).
  - **README.md:** the student area line.
- [ ] **Step 6: Commit** `J2.7 Journey shell audit and docs`.

---

## Decisions (defaults used unless the owner says otherwise)

1. **Mockups instead of the canvas** (N2). No canvas mockup is in the repository. The screens follow the spec text and the mockups on this plan's review page. **Default: build from the reviewed mockups; switch to the canvas if it is shared.**
2. **The header for students becomes the journey navigation** (N1). Writing, CV, recommenders and portfolio move under Applications, and Courses and the requirements table under Explore. **Default: yes.**
3. **"Get help" in M2 is a small stage panel**, and the full help panel comes in M4 (N5). **Default: yes.**
4. **The navigation badge is computed live without saving**, from the same snapshot read the page uses (one read per `/app` request, none on public pages, N3 and N11). The alternative is to read the stored `journey_state`, which can be up to a day old. **Default: live.**
5. **The intake field is added now** and S1.03 switched on, since onboarding asks for it (N6). **Default: yes.**
6. **Hindi users see English step titles and reasons until M6.** The interface around them (navigation, stage explainers, home, onboarding) is in Hindi from J2.5; step text comes from the engine's English templates, keyed for M6 to translate. **Default: accept, and note it in BACKLOG.md.**
7. **Offers sits under More on phones, even in stage 6.** The spec's phone bar is fixed at Home, Explore, Applications, Help and More, so a student choosing between offers reaches them through More, or from the home's step cards, which link straight to `/app/offers`. **Default: accept, and note it in BACKLOG.md.**

## Verification

- Every `/app` page shows the journey navigation, with the current section marked, on desktop and phone.
- Signing in lands on `/app`, which shows the student's stage, progress and up to three next steps, each with a working link and fact status.
- `/app/steps` lists every step by band, and snooze, dismiss, mark done and undo work and persist.
- A new student goes from sign-up through the entry question to their first matches.
- All suites pass, the axe audit shows no serious or critical issues on the new pages, and the screenshots are attached to the milestone report.
