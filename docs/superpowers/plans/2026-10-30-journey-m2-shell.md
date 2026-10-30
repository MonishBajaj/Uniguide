# Journey system M2: shell (navigation, home, steps, onboarding) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the journey visible. A signed-in student always lands on a home page that shows their stage, how far through it they are, and the three things to do next, each with a button to the exact place to do it. Navigation follows the seven stages on every `/app` page, on desktop and phone. A new student is asked where they are starting from and sent to the right place.

**Architecture:** Everything reads the M1 engine (`@uniguide/journey`) through `loadJourney`. No page works out a stage or a next step on its own. The home and the steps page recompute and save the journey on every visit. The navigation computes it without saving, so its badge is always current. Snooze, dismiss and "mark done" are server actions writing `journey_step_state`. Copy goes through `apps/web/lib/i18n`, so Hindi follows the existing 15.4 setup.

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
| N3 | The home loads "in one server request using the snapshot query" | `loadJourney` makes two calls (snapshot, then save) and returns only the result. "Coming up" needs deadlines, and "shared with" needs names, which the result doesn't carry. | `loadJourney` also returns the parsed snapshot. The engine adds a pure `upcomingDeadlines(input, 3)`. The snapshot adds `sharedWith` (J2.1). The page still makes one snapshot read plus one save. |
| N4 | Fact status "with link to the source" | `NextStep.factRefs` has table, id and status, but no link. | The engine adds `NextStep.source` (`/courses/[slug]` for a course's facts, `/visas` for country rules). Engine version 0.2.0. |
| N5 | "Get help" opens a side panel (6.3) | The help panel is G4, planned for M4. | In M2, "Get help" opens a small panel with the current stage's explainer (for, done when, usually takes) and links to `/guide` and the glossary. M4 replaces it with the full panel and per-page help. |
| N6 | Onboarding's short profile asks for intake (3.2) | No control writes `profiles.intake_year`, so step S1.03 is switched off (M1 R3). | Add an intake year control to the onboarding form and to `/app/profile#intake`, then switch S1.03 on. This is the intake part of J3.6, brought forward because onboarding needs it. |
| N7 | "I'm already applying": "add the courses you're applying to"; "I have offers": "add your offers" (3.2) | Applications can only be added for catalogue courses (from a course page or the shortlist). Own applications are G1, in M3. | M2 sends "applying" to `/app/tracker` and "offers" to `/app/offers`. Each shows a short "find your course" prompt with course search. Courses outside the catalogue wait for M3 (G1), and the prompt says so plainly. |
| N8 | After sign-in the student lands on the home | `safeNext` falls back to `/app/profile`. Demo mode's User home is `/app/profile`, and `/consent` redirects there. | Change all three to `/app`. `/app` sends a student whose `entry_path` is empty and who is still in stage 1 to `/app/onboarding`. |
| N9 | `/app/steps` shows snoozed and dismissed handling | The engine drops hidden steps, so nothing could bring one back. `NextStep` doesn't say whether a step can be marked done. | The engine adds `JourneyResult.hidden` (id, title, state, until) and `NextStep.markable`. Engine version 0.2.0. |
| N10 | Bottom bar on phones: Home, Explore, Applications, Help, More (6.1) | No mobile navigation exists; the header scrolls sideways. | Build it. More opens a sheet with Shortlist, Offers, Visa and departure, and the account items. |

## Deviations from the spec (decisions M2 takes)

- **Engine 0.2.0.** It adds `NextStep.source`, `NextStep.markable`, `JourneyResult.hidden` and `upcomingDeadlines()`, and switches S1.03 on (N4, N6, N9). `expected.json` is regenerated deliberately and the version bumped.
- **"Get help" is a small stage panel until M4** (N5).
- **No own applications in onboarding until M3** (N7).
- **The navigation computes the journey without saving it.** It takes one snapshot read per page, so the urgent badge is always current. Saving happens on the home, the steps page, after step actions and in the daily recompute, which keeps `journey_events` from filling with page views.

## Review Focus

- **A brand-new student** signs up, answers "Just exploring", fills the short form and lands on their first matches. The next visit to `/app` shows stage 2 and "Look through your matches". (J2.6, J2.7)
- **A student with a preparing application** signs in and lands on `/app`, which shows stage 4. Its progress reads "0 of 1 application ready" until the checklist is done. (J2.3)
- **A student waiting for parental consent** sees only "Ask a parent to confirm your account", with no snooze or dismiss. (J2.3, J2.4)
- **Navigation:**
  - On every `/app` page, on desktop and phone, exactly one item is marked current.
  - Items for stages not reached are quieter, but still links.
  - The Applications badge reads as one sentence to screen readers. (J2.2)
- **Snooze, dismiss and mark done:**
  - A dismissed step leaves the home and the steps page, and "Undo" brings it back.
  - A snoozed step returns on its date.
  - "Mark done" exists only on steps the student completes themselves (D8). (J2.4)
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
| `packages/journey/src/engine.ts`, `types.ts`, `catalogue/*`, `version.ts` | `source`, `markable`, `hidden`, `upcomingDeadlines`, S1.03 on, version 0.2.0 |
| `supabase/migrations/20270102000001_journey_shell.sql` + `supabase/tests/database/410_journey_shell.test.sql` | `sharedWith` in `journey_snapshot` |
| `apps/web/lib/journey-snapshot.ts` | `loadJourney` returns `{ result, input }`; `peekJourney` computes without saving |
| `apps/web/lib/journey-nav.ts` + `.test.ts` | Route → navigation section (spec 6.1 table), reached sections by stage |
| `apps/web/components/journey/student-nav.tsx`, `bottom-bar.tsx`, `help-panel.tsx` | Desktop top bar, phone bar with More sheet, small stage help panel |
| `apps/web/components/site-header.tsx` | Uses the student navigation for signed-in students |
| `apps/web/app/app/page.tsx` | Journey home (G2) |
| `apps/web/components/journey/stage-path.tsx`, `step-card.tsx`, `coming-up.tsx` | Home building blocks, reused by `/app/steps` |
| `apps/web/app/app/steps/page.tsx`, `apps/web/app/app/steps/actions.ts` | All steps by band; snooze, dismiss, mark done, undo (G18) |
| `apps/web/lib/i18n/en.ts`, `hi.ts` | `journey` section: navigation, stage explainers, bands, home and onboarding copy (G5) |
| `apps/web/app/app/onboarding/page.tsx`, `entry.tsx`, `short-profile.tsx`, `actions.ts` | Three screens and routing by entry path (G6) |
| `apps/web/app/app/profile/forms.tsx` | `#intake` field |
| `apps/web/lib/age.ts`, `lib/demo-mode.ts`, `app/consent/page.tsx` | Landing on `/app` |
| `apps/web/e2e/journey-home.spec.ts`, `journey-onboarding.spec.ts`, `journey-nav.spec.ts`, `a11y.spec.ts` | Flows and audit |

---

### Task J2.1: Engine and snapshot additions for the shell

**Files:**
- Modify:
  - `packages/journey/src/types.ts`, `engine.ts`, `rank.ts`, `catalogue/index.ts`, `catalogue/stage1.ts`, `version.ts`
  - `test/*`, `test/fixtures/expected.json`
  - `apps/web/lib/journey-snapshot.ts` + test
- Create: `supabase/migrations/20270102000001_journey_shell.sql`, `supabase/tests/database/410_journey_shell.test.sql`

**Interfaces:**
- **`NextStep.source?: { href: string }`:**
  - the course page (`/courses/{slug}`) when a fact ref is a requirement or deadline
  - `/visas` when it is a country rule
  - absent when the step quotes no fact
- **`NextStep.markable: boolean`**
- **`JourneyResult.hidden: { id, catalogueId, title, state: "snoozed" | "dismissed", until }[]`**
- **`upcomingDeadlines(input, limit)`:** the next published deadlines of active applications, each `{ applicationId, label, dueAt, timezone, status, factRef }`.
- **S1.03 available**, with `href` `/app/profile#intake` (`#intake` added to `ROUTES`).
- **`ENGINE_VERSION = "journey-0.2.0"`**
- **`journey_snapshot`** adds `sharedWith: { parents: string[], counselors: string[] }`: names of active parent links and organisations with an active share.
- **`loadJourney`** returns `{ result, input }`.
- **`peekJourney(supabase, today)`** runs the snapshot and engine without saving.

- [ ] **Step 1: Write failing tests:**
  - `source` is set exactly when `factRefs` is non-empty, and resolves in `ROUTES`
  - `markable` matches the catalogue
  - a dismissed step appears in `hidden` with its title
  - `upcomingDeadlines` skips past, unknown-status and withdrawn ones, ordered soonest first
  - S1.03 shows when the intake is missing
  - pgTAP: `sharedWith` lists an active parent and an active counselor organisation, and not revoked ones
- [ ] **Step 2: Implement**, bump the version, regenerate `expected.json`, and check its diff by hand (only S1.03 may appear).
- [ ] **Step 3: Run** `pnpm db:reset && pnpm db:test`, `pnpm db:types` and `pnpm -r test`.
- [ ] **Step 4: Commit** `J2.1 Engine and snapshot additions for the shell`.

---

### Task J2.2: Student navigation (G3)

**Files:**
- Create: `apps/web/lib/journey-nav.ts` (+ test), `components/journey/student-nav.tsx`, `bottom-bar.tsx`, `help-panel.tsx`
- Modify: `components/site-header.tsx`, `app/app/layout.tsx` (skip link target, bottom padding), `lib/i18n/en.ts`, `hi.ts`

**Interfaces:**
- **`navSection(pathname)`** returns `"home" | "explore" | "shortlist" | "applications" | "offers" | "departure" | "account" | null`, following the spec 6.1 table.
- **`reachedSections(stage)`** gives the sections whose stage the student has entered. Home and account are always reached.
- **Desktop items:** Home, Explore, Shortlist, Applications (badge), Offers, Visa and departure. Then "Get help" and an account menu (Profile, Sharing, Updates with its unread count, Display, Sign out).
- **Phone items (below `md`):** Home, Explore, Applications, Help, More.
  - The top bar keeps only the logo and the account menu.
  - More opens a sheet with Shortlist, Offers, Visa and departure.

- [ ] **Step 1: Write failing unit tests:**
  - every route in the spec 6.1 table maps to its section
  - `/app/tracker/abc` and `/app/writing/x` map to applications
  - `/courses/foo` maps to explore
  - unknown routes give null
  - stage 1 reaches home only; stage 4 reaches home, explore, shortlist and applications
- [ ] **Step 2: Implement:**
  - Use `peekJourney` for the stage and `urgentLabel`.
  - Unreached sections use `text-muted`, with no badge, and stay links.
  - The badge is `aria-hidden`; its sentence is in visually hidden text inside the link.
  - "Get help" opens a disclosure panel: stage explainer, `/guide`, glossary.
  - Add the skip link.
  - Guests, parents, counselors and staff keep today's header unchanged.
- [ ] **Step 3: Screenshots** at 1280 and 390 px wide, for stages 1, 4 and 6.
- [ ] **Step 4: Commit** `J2.2 Journey navigation on desktop and phone`.

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

**Interfaces:**
- **Page:** `loadJourney`, then render top to bottom:
  - greeting (display name) and summary line ("You're in stage 4 of 7: Prepare. 2 of 3 applications ready.")
  - stage path
  - "Your next steps": the first 3 steps
  - "See all steps"
- **Side column:**
  - **Stage explainer:** for, done when, usually takes.
  - **Coming up:** `upcomingDeadlines(input, 3)`, each with its date in the deadline's time zone, its status label and a link to the course. Plus "Add to calendar" (`/app/tracker/calendar.ics`).
  - **Also open:** the number of carry-over steps, linking to `/app/steps#carry_over`.
  - **Shared with:** parent and counselor names, linking to `/app/sharing`; when empty, an invite line linking to `/app/sharing#family`.
- **Step card:**
  - band label ("Due soon", "Start soon", "This stage", "Also open")
  - application label and track label, when the step has them
  - title (h3) and reason
  - fact status (`FactBadge` with a link to `source`)
  - action button (the step's `href`)
  - "Snooze 7 days" when the step can be dismissed (J2.4 action)
- **Redirects:**
  - a student whose `entry_path` is empty and who is in stage 1 goes to `/app/onboarding`
  - linked parents keep going to `/parent` (existing layout rule)
- **No open steps:** "You're up to date in this stage" with a link to the stage's page (`STAGES[stage].route`).

- [ ] **Step 1: Write the Playwright spec first** (`journey-home.spec.ts`):
  - the seed student with a preparing application lands on `/app` after sign-in
  - the page shows stage 4 and three cards, each with a link that responds with 200
  - pending consent shows only S1.06, with no snooze
  - an unverified deadline shows its label and a source link
- [ ] **Step 2: Implement the components and the page**, and change the three landing targets. Update existing e2e specs that expect `/app/profile` after sign-in.
- [ ] **Step 3: Screenshots** of stages 1, 2, 4, 6 and 7 plus pending consent, at both widths.
- [ ] **Step 4: Commit** `J2.3 Journey home`.

---

### Task J2.4: All steps, snooze, dismiss and mark done (G18)

**Files:**
- Create: `apps/web/app/app/steps/page.tsx`, `apps/web/app/app/steps/actions.ts`
- Modify: `components/journey/step-card.tsx`

**Interfaces:**
- **Page:**
  - Groups steps by band, with the headings "Due soon" (`#urgent`), "Start soon" (`#long_lead`), "This stage" (`#stage`) and "Also open" (`#carry_over`).
  - A closed `<details>` at the end lists "Snoozed and dismissed" from `result.hidden`, each with "Bring back".
- **Actions** (server actions with a `stepId`):
  - `snooze` upserts `snoozed` until today + 7 days
  - `dismiss` upserts `dismissed`
  - `markDone` upserts `done`, only for markable steps
  - `restore` deletes the row
- **Checks in every action:**
  - The step must be in the student's current result, so random ids are refused.
  - Undismissable steps refuse snooze and dismiss.
  - After the write, the page recomputes and saves.
- **Feedback:** a `role="status"` message with Undo (restore) after snooze or dismiss.

- [ ] **Step 1: Write failing tests:**
  - unit: the action guard refuses unknown ids, undismissable steps, and mark done on unmarkable steps
  - Playwright:
    - dismiss a step, then it's gone from home and steps; Undo, then it's back
    - snooze, then the "Back on {date}" message appears and the row's `until` is 7 days ahead
    - mark S2.03 done, then a `step_done` event is recorded
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Commit** `J2.4 All steps with snooze, dismiss and mark done`.

---

### Task J2.5: Stage explainers and journey copy through i18n (G5)

**Files:**
- Modify: `apps/web/lib/i18n/en.ts`, `hi.ts`, `i18n.test.ts`, and the J2.2–J2.4 components (no inline strings)

**Interfaces:**
- **`t.journey`:**
  - `nav`
  - `stages[1..7]`: name, for, doneWhen, usuallyTakes
  - `bands`
  - `home` (greeting, summary, side column titles, empty states)
  - `steps` (actions, undo messages)
  - `onboarding`
- **Step titles and reasons stay the engine's English** until M6 translates by copy key.

- [ ] **Step 1: Write failing tests:**
  - the English stage copy equals the engine's `STAGES` text, so there is one source of truth
  - en/hi key parity, with no empty strings (existing test)
  - no hard-coded English in the journey components (a grep test over `components/journey`)
- [ ] **Step 2: Move the strings**, and write Hindi marked "needs native-speaker review" (BACKLOG already tracks this).
- [ ] **Step 3: Commit** `J2.5 Journey copy through i18n`.

---

### Task J2.6: Onboarding with the entry question (G6)

**Files:**
- Modify: `apps/web/app/app/onboarding/page.tsx`, `actions.ts`, `app/app/profile/forms.tsx` (`#intake`)
- Create: `apps/web/app/app/onboarding/entry.tsx`, `short-profile.tsx`

**Interfaces:**
- **Screen 1, "How UniGuide works":**
  - The three tiers (Listed, Extracted, Verified) with the existing `TierBadge`.
  - "Every fact links to its official page." Then Continue.
- **Screen 2, "Where are you right now?":**
  - Four radio cards: Just exploring, I know roughly what and where, I'm already applying, I have offers.
  - Saving writes `profiles.entry_path`.
- **Screen 3, short profile:**
  - **The form:** level, subjects, countries, budget with currency, intake year. It reuses the profile form's fields and validation.
  - **The chat:** offered instead when the student has AI consent.
- **Where it ends:**
  - **Exploring or knows:** starts the first search when the profile is complete enough (existing `startFirstSearch`), then goes to `/app/match`. "Knows" also shows the shortlist prompt.
  - **Applying:** `/app/tracker`, with "Find the courses you're applying to" and course search. Courses outside the catalogue are named as coming soon (M3).
  - **Offers:** `/app/offers`, with the same prompt.
- **Screen URLs:** `?screen=1|2|3`. A student who already has an `entry_path` can still revisit them from the profile.
- **Profile `#intake`:** a year select (this year to five years ahead).

- [ ] **Step 1: Write the Playwright spec first** (`journey-onboarding.spec.ts`):
  - a new sign-up lands on screen 1
  - Back works between screens
  - "Just exploring" plus the short form ends on `/app/match` with a search started
  - "I have offers" ends on `/app/offers`
  - `entry_path` and `intake_year` are stored
  - `/app` no longer redirects to onboarding afterwards
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
  - **BACKLOG.md:** S1.03 on, and N5/N7 waiting for M4/M3.
  - **README.md:** the student area line.
- [ ] **Step 6: Commit** `J2.7 Journey shell audit and docs`.

---

## Decisions (defaults used unless the owner says otherwise)

1. **Mockups instead of the canvas** (N2). No canvas mockup is in the repository. The screens follow the spec text and the mockups on this plan's review page. **Default: build from the reviewed mockups; switch to the canvas if it is shared.**
2. **The header for students becomes the journey navigation** (N1). Writing, CV, recommenders and portfolio move under Applications, and Courses and the requirements table under Explore. **Default: yes.**
3. **"Get help" in M2 is a small stage panel**, and the full help panel comes in M4 (N5). **Default: yes.**
4. **The navigation badge is computed live without saving** (one snapshot read per `/app` page). The alternative is to read the stored `journey_state`, which can be up to a day old. **Default: live.**
5. **The intake field is added now** and S1.03 switched on, since onboarding asks for intake (N6). **Default: yes.**

## Verification

- Every `/app` page shows the journey navigation, with the current section marked, on desktop and phone.
- Signing in lands on `/app`, which shows the student's stage, progress and up to three next steps, each with a working link and fact status.
- `/app/steps` lists every step by band, and snooze, dismiss, mark done and undo work and persist.
- A new student goes from sign-up through the entry question to their first matches.
- All suites pass, the axe audit shows no serious or critical issues on the new pages, and the screenshots are attached to the milestone report.
