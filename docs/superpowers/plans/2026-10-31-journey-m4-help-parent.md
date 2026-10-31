# Journey system M4: help, parent view and emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- A student who gets stuck finds help where they are.
- A linked parent sees progress in the same terms as the student, without anything private.
- The helpers the student shares with see the same stage and steps.
- A student who goes quiet gets a weekly nudge.

M4 replaces M2's small "Get help" panel with the full one. It adds the journey to the parent view, the counselor view and the updates page, and moves the weekly emails onto the stored journey.

**Architecture:**
- **Engine:** unchanged. M4 only reads what the engine already stores in `journey_state` and `journey_events`.
- **Parents** read through a new security-definer RPC, `parent_journey`. It returns only parent-safe fields.
- **Counselors** read `journey_state` under the existing `counselor_can_see` rule.
- **The worker's emails** read `journey_state` as the `notifier` role. They take stage names and parent notes from a JSON copy of the engine's `STAGES`, generated and checked by a test, so the TypeScript stays the single source.

**Tech Stack:** Next.js 16 server components, Postgres with RLS and pgTAP, the Python worker and its mailer (Mailpit locally), vitest, pytest, Playwright with axe.

**Spec:** `docs/superpowers/specs/2026-10-30-journey-system-design.md`:
- section 9 (M4: J4.1 to J4.4)
- section 6.3 (help panel), 6.5 (parent view) and 6.6 (emails)
- section 3.5 (the parent journey) and 3.6 (counselors)
- section 7 (G4, G16, G17, G22, G24)
- section 8 (`parent_journey`)

**Builds on:** M1 to M3, pushed to `Updated-developer-b`. The M3 exit gate was met on 30 October 2026, and the draft pull request is [MonishBajaj/Uniguide#4](https://github.com/MonishBajaj/Uniguide/pull/4).

**Branch:** `Updated-developer-b`. One commit per task, starting with its ID (`J4.2 Parent view on the journey`), plain messages, no co-author line.

## Global Constraints

The M1 to M3 constraints still hold:
- The model never writes a fact; unverified or conflicting facts never produce "you meet".
- No grade conversion, no admission percentage, no ghostwriting.
- Interface copy goes through `lib/i18n` in English and Hindi, and passes the J2.5 checks.
- WCAG 2.1 AA: the axe audit stays at zero serious or critical issues on every new or changed page, at 1280 and 390 px.
- Migrations start at `20270104`, with pgTAP tests and RLS on every table, then `pnpm db:types`.
- Own applications stay the student's words, never facts. The four e2e failures accepted at the M2 gate stay reported.

Two additions for M4:
- **Parents never see private work.** A parent never receives:
  - a step without a `parentTitle`
  - a step's reason, link, facts or due date
  - anything about essays, drafts, grades or scores (spec 3.5)

  The RPC enforces this, and pgTAP tests it.
- **Emails never quote a fact without its status** and never quote an own application's date as a fact. They link to the page; they don't reproduce it.

Before each commit, run the suites in Verification. Take screenshots of every new screen at both widths.

## Where the spec and the code disagree

Checked against `Updated-developer-b` at `1d8a92b` on 31 October 2026.

| # | Spec says | Code has | Resolution |
|---|---|---|---|
| Q1 | Help for the current page "stored in `apps/web/content/help/<route>.md`" (6.3) | There's no `content/help`. M2's "Get help" (`components/journey/help-panel.tsx`) shows the stage explainer and links to the guide and glossary. The interface must be in English and Hindi. | J4.1 adds `content/help/en/<route>.md` and `content/help/hi/<route>.md` for every route in the navigation table (`lib/journey-nav.ts`, 17 routes). A unit test fails when a route has no file in either language. Hindi files are marked for native review, like `hi.ts` (Decisions 1). |
| Q2 | The panel shows "course Q&A when the page belongs to a course or application" | Course Q&A is the `CourseQuestion` form on the public course page (`/courses/[slug]#ask`). On `/app`, only the application page belongs to a course. | On a catalogue application's page, the panel links to "Ask about this course" (`/courses/[slug]#ask`) rather than embedding a second form. Own applications get no link, since they have no facts to answer from (Decisions 2). |
| Q3 | `parent_journey(p_student)` returns stage, progress and parent-safe steps | The engine runs in the web app, not in Postgres. `journey_state` is saved when the student opens `/app` and by the daily recompute, so it can be a day old. Parents can't read `journey_state` (RLS: the student and `notifier` only). | The RPC reads the stored `journey_state` for an active `parent_links` row. It returns the stage, the progress label, the computed time and `parentTitle`s only. The parent view says when it was last updated. With no state yet, it says progress appears once the student opens UniGuide (Decisions 3). |
| Q4 | Emails and the parent digest show the stage and the parent note | Stage names and parent notes live in the TypeScript engine (`packages/journey/src/stages.ts`). The worker is Python. | `packages/journey/stages.json` is generated from `STAGES` by a script. A vitest check fails if it drifts, and the worker reads it. There's one source and no hand-copied text. |
| Q5 | Weekly student digest "replaces the generic Monday digest for students with a journey" | `lifecycle.py` sends a Monday "Your deadlines in the next 30 days" digest from checklist deadlines. `lifecycle_log.kind` only allows `welcome_1` to `welcome_3`, `digest` and `reengage`. The `notifier` role can read `journey_state` but not `journey_events`. | A migration adds `journey_digest` and `stage_change` to `lifecycle_log.kind`, and grants `notifier` read access to `journey_events`. A student whose `journey_state` was computed in the last 8 days gets the journey digest. Anyone else keeps the old one, so a stale journey never drives an email (Decisions 5). |
| Q6 | Stage change email "when the student enters stages 4, 6 and 7" | `save_journey_state` already logs `stage_entered` in `journey_events` when the stage changes. | One email per `stage_entered` event for stages 4, 6 and 7, logged with the event id. Only events from the last 7 days count, so switching emails on doesn't send old news (Decisions 6). |
| Q7 | Stalled nudge: "the digest leads with the most urgent step and a one-line 'you haven't checked in for a while'" | `journey_state.stalled` is set by the engine (14 days without a completed step, with something due within 30 days). | The journey digest leads with the nudge when `stalled` is true. The milestone's "done when" checks this in the local Mailpit. |
| Q8 | Counselors: "the journey shows them the student's stage and next steps (read-only)" (3.6, G22) | `/agency/[student]` shows applications and checklists. `journey_state` has no counselor policy. | A `journey_state` policy uses the existing `counselor_can_see(user_id)`. `/agency/[student]` shows the stage path and the open steps' titles and reasons, with no buttons (Decisions 7). |
| Q9 | Notifications page shows "journey events (stage changes, urgent steps)" (G24) | `/app/notifications` lists rows from `notifications` (course changes). | A "Your journey" section lists stage changes from `journey_events` (last 90 days) and the urgent steps from the current journey (`getJourney`, already read on `/app` pages). It links to `/app/steps`. Individual "step done" events aren't listed (Decisions 8). |
| Q10 | Emails in the student's language | Profiles don't store a language. It's a cookie. | Emails stay English until profiles store a language. Recorded in BACKLOG (Decisions 4). |

## Deviations from the spec (decisions M4 takes)

- **Help files** come in two languages (Q1). Course Q&A in the panel is a link, not a second form (Q2).
- **The parent view and parent digest** read the stored journey, with its date (Q3).
- **The journey digest** replaces the old digest only for a recently computed journey (Q5). Stage change emails only cover the last 7 days (Q6).
- **The engine doesn't change.** `ENGINE_VERSION` stays `journey-0.3.0`, and `diff-fixtures` must show no change.

## Review Focus

- **The help panel:**
  - opens from "Get help" on every `/app` page, as a side panel on desktop and a sheet on phones
  - traps focus, closes with Escape, and returns focus to the button
  - shows, in order: the stage explainer; this page's help; "Ask about this course" on a catalogue application; the guide and glossary; "Ask a parent to follow along"; "Share with a counselor" (J4.1)
- **The parent view:**
  - shows the stage path, the summary line, "How you can help right now" with the stage's parent note, and "What {name} is working on" from `parentTitle`s only
  - shows no writing, grade or score step, no reason and no link (J4.2)
  - a revoked link sees nothing
- **Emails:**
  - a stalled student's digest leads with "You haven't checked in for a while" and the most urgent step (in Mailpit)
  - entering stage 4, 6 or 7 sends one short email
  - the parent digest has the stage, summary line, parent note and parent-safe titles (J4.3)
- **Counselor and updates pages:** a counselor sees the stage and steps read-only; the updates page lists stage changes and urgent steps (J4.4).

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/content/help/{en,hi}/*.md`, `apps/web/lib/help.ts` (+ test) | Per-route help, loaded by route |
| `apps/web/components/journey/help-panel.tsx`, `student-header.tsx`, `bottom-bar.tsx` | The side panel and phone sheet |
| `supabase/migrations/20270104000001_parent_journey.sql` + `450_parent_journey.test.sql` | `parent_journey` RPC; the counselor policy on `journey_state` |
| `supabase/migrations/20270104000002_journey_emails.sql` + `460_journey_emails.test.sql` | `lifecycle_log` kinds; `notifier` read on `journey_events` |
| `apps/web/app/parent/page.tsx` | Stage path, parent note, parent-safe steps |
| `packages/journey/scripts/stages-json.ts`, `packages/journey/stages.json` | Stage text for the worker |
| `worker/src/uniguide_worker/lifecycle.py`, `notify.py`, tests | Journey digest, stalled nudge, stage change, parent digest |
| `apps/web/app/agency/[student]/page.tsx`, `apps/web/app/app/notifications/page.tsx` | Counselor journey; journey events |
| `apps/web/e2e/journey-help.spec.ts`, `journey-parent.spec.ts`, `journey-agency.spec.ts`, `a11y.spec.ts` | Flows and audit |

---

### Task J4.1: Help panel with per-route help (G4)

**Files:**
- `content/help/{en,hi}/*.md`, `lib/help.ts`
- `components/journey/help-panel.tsx`, `student-header.tsx`, `bottom-bar.tsx`
- `lib/i18n`

**Interfaces:**
- **`helpFor(path, locale)`** returns the page's help as trusted Markdown, rendered with `marked` like the blog. It returns the route pattern's file (`/app/tracker/[id]` reads `app-tracker-id.md`) and falls back to English when Hindi is missing.
- **The panel** is a dialog (`role="dialog"`, labelled "Help"). It's a right-hand panel from 768 px and a bottom sheet below.

- [ ] **Step 1: Write failing tests:**
  - **unit:** every navigation route has a help file in both languages; route patterns resolve; Hindi falls back to English
  - **Playwright:** the panel opens on three pages; focus moves in, stays in, and returns on Escape; the tracker application page shows "Ask about this course" for a catalogue course and not for an own application
- [ ] **Step 2: Write the help files.** Short: what the page is for, what to do first, and where facts come from. No new facts.
- [ ] **Step 3: Implement**, then take screenshots at both widths, in English and Hindi.
- [ ] **Step 4: Commit** `J4.1 Help panel with per-page help`.

---

### Task J4.2: Parent view on the journey (G16)

**Files:**
- `supabase/migrations/20270104000001_parent_journey.sql`, `450_parent_journey.test.sql`
- `app/parent/page.tsx`
- `pnpm db:types`

**Interfaces:**
- **`parent_journey(p_student uuid) returns jsonb`** is security definer and requires an active `parent_links` row for `auth.uid()`. It returns:
  - `stage`
  - `progress` (the label only)
  - `computedAt`
  - `steps`: `[{ parentTitle, stage }]`, taken from `journey_state.steps` where `parentTitle` is present, top 5 in rank order

  It never returns `title`, `reason`, `href`, `factRefs`, `source` or `dueAt`.
- **The parent page**, per student, adds the stage path (shared `StagePath`), the summary line, "How you can help right now" (`STAGES[stage].parentNote` with the student's name) and "What {name} is working on". It keeps everything that's there today.

- [ ] **Step 1: pgTAP first:**
  - a parent receives only steps that have `parentTitle`, and only those keys
  - a revoked link and an unlinked parent get an error
  - a student can't call it for someone else
  - no state yet gives `null`
- [ ] **Step 2: Playwright:**
  - the seed parent sees the stage path, the note and parent-safe titles
  - no step titled with "essay", "statement", "score" or "grade" appears
  - a revoked link shows nothing
- [ ] **Step 3: Implement, take screenshots, commit** `J4.2 Parent view on the journey`.

---

### Task J4.3: Journey emails (G17)

**Files:**
- `packages/journey/scripts/stages-json.ts`, `stages.json` (+ vitest drift check)
- `supabase/migrations/20270104000002_journey_emails.sql`, `460_journey_emails.test.sql`
- `worker/src/uniguide_worker/lifecycle.py`, `notify.py`, tests
- `docs/SETUP.md` (how to see emails in Mailpit)

**Interfaces:**
- **Journey digest** (Mondays; replaces `digest` for a journey computed in the last 8 days):
  - the stage name
  - the top 3 steps' titles
  - the next 3 published deadlines, quoted with their status
  - a link to `/app`

  When `stalled` is true, it opens with "You haven't checked in for a while" and the most urgent step. Logged as `journey_digest` for the ISO week.
- **Stage change:** one email per `stage_entered` event for stage 4, 6 or 7 from the last 7 days. It says what the stage is for and what done looks like, from `stages.json`. Logged as `stage_change` with the event id.
- **Parent digest:** adds the stage, the summary line, the parent note and up to 5 parent-safe titles above today's application list. Still no grades or scores.
- **Preferences:** every email obeys the existing `email_preferences` (`digest` for digests, `tips` for stage changes) and ends with the unsubscribe link.

- [ ] **Step 1: Failing tests first:**
  - **pytest:**
    - a stalled student's digest leads with the nudge
    - a stale journey falls back to the old digest
    - a stage change is sent once, and only for 4, 6 and 7 within 7 days
    - the parent digest never contains a step without `parentTitle`
    - unsubscribed students get nothing
  - **pgTAP:** the new kinds; `notifier` can read `journey_events` but can't write
  - **vitest:** `stages.json` matches `STAGES`
- [ ] **Step 2: Implement**, then run the worker against the local stack with Mailpit. Take a screenshot of the stalled digest in Mailpit: this is the spec's "done when".
- [ ] **Step 3: Commit** `J4.3 Journey emails`.

---

### Task J4.4: Counselor view and updates page (G22, G24)

**Files:**
- the migration from J4.2 (counselor policy on `journey_state`)
- `app/agency/[student]/page.tsx`, `app/app/notifications/page.tsx`
- `lib/i18n`

**Interfaces:**
- **`/agency/[student]`** gains "Stage" (the stage path and summary line) and "Next steps" (titles and reasons of the top 5, read-only, no buttons). The data is the stored journey with its computed date.
- **`/app/notifications`** gains "Your journey": stage changes from the last 90 days ("You reached stage 4: Prepare", with the date) and the current urgent steps, linking to `/app/steps`.

- [ ] **Step 1: Failing tests first:**
  - **pgTAP:** a counselor with an active share reads `journey_state`, and one without can't
  - **Playwright:**
    - the seed counselor sees the shared student's stage and steps
    - the updates page lists a stage change and an urgent step
- [ ] **Step 2: Implement, take screenshots, commit** `J4.4 Journey for counselors and on the updates page`.

---

### Task J4.5: Audit, end-to-end flows and docs

- [ ] **Spec "done when":**
  - a linked parent sees the stage path and parent note (J4.2)
  - a stalled student receives a nudge in the local Mailpit (J4.3)
- [ ] **Axe audit:** the help panel open, on three pages; the parent view; `/agency/[student]`; `/app/notifications`. At both widths, in English and Hindi where the page is translated.
- [ ] **Run every suite** (Verification). Check that `diff-fixtures` shows no engine change.
- [ ] **Docs:**
  - FEATURES.md: G4, G16, G17, G22 and G24 built
  - BACKLOG.md: English-only emails; help files awaiting native review
  - README.md
  - SETUP.md: Mailpit
  - this plan's checkboxes and exit gate
- [ ] **Update the pull request description and commit** `J4.5 Help, parent and emails audit and docs`.

## Decisions (defaults used unless the owner says otherwise)

1. **Help files in English and Hindi**, one per navigation route, with Hindi marked for native review. The alternative is English help only, which would break the rule that the interface is in both languages. **Default: both.**
2. **Course Q&A from the panel is a link** to the course page's existing form, shown only for catalogue applications. **Default: yes.**
3. **The parent view and parent digest read the stored journey**, which can be a day old. The page shows when it was updated, and says progress will appear once the student opens UniGuide. **Default: yes.**
4. **Emails stay in English** until profiles store a language. **Default: yes.** Recorded in BACKLOG.
5. **The journey digest replaces the old Monday digest** only when the journey was computed in the last 8 days. Anyone else keeps the old one. **Default: yes.**
6. **Stage change emails** cover stages 4, 6 and 7, once per event, and only for events from the last 7 days. **Default: yes.**
7. **Counselors see step titles and reasons**, since the student chose to share and counselors already read their applications and scores. The alternative is parent-safe titles only. **Default: titles and reasons, no buttons.**
8. **The updates page lists stage changes and urgent steps, not every completed step.** **Default: yes.**

## Verification

- **Spec "done when":** a linked parent sees the stage path and parent note, and a stalled student receives a nudge in the local Mailpit.
- **Suites:**
  - `pnpm db:test`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter web lint`
  - `cd worker && uv run pytest`, `uv run ruff check .`, `uv run mypy src tests scripts evals`
  - `pnpm --filter web e2e`, `e2e:demo` and `e2e:community`
  - `pnpm --filter @uniguide/journey diff-fixtures`, which must show no difference
- **Every new or changed spec sets up and removes its own data.** It never relies on what another spec left behind (the lesson from the M3 exit gate).
- **CI on #4** is green apart from the four accepted e2e failures.
- **Screenshots** of every new or changed screen at both widths, sent at the end of J4.1, J4.2, J4.3 (Mailpit) and J4.4.

## Handing over to M5

M5 (enrollment and edge paths) builds on:
- the stage change email (stage 6 and 7 steps it will add)
- the parent view's parent-safe steps (new M5 steps need `parentTitle` where safe)
- S3.04 (choosing an intake per course), moved there from M3
