# The journey system

For developers. This explains how UniGuide works out where a student is and what to do next, and how to change it.

**Background reading:**
- Spec: `docs/superpowers/specs/2026-10-30-journey-system-design.md`
- How each part was built: the plans `docs/superpowers/plans/2026-10-3*-journey-m*.md`
- What's built: `docs/FEATURES.md`
- What's switched off or accepted as a limit: `BACKLOG.md`

## The idea in one paragraph

Every signed-in student is in one of seven stages, from setting up to arriving. The journey engine reads one snapshot of the student's own data and returns:
- the stage and its progress
- a ranked list of next steps, each with a reason, the facts it relies on and a link to the exact place to act
- whether the student has stalled
- whether they've arrived

The engine is pure TypeScript with no database or network access: the same input always gives the same output. The model never writes a step, a reason or a fact.

## Where things live

| Path | What it is |
|---|---|
| `packages/journey/src/stages.ts` | The seven stages (`STAGES`: name, explainer, parent note, route) and `computeStage`. `activeApplications` decides which applications count: not withdrawn, deferred or declined, and not rejected before a next-intake rollover. |
| `packages/journey/src/catalogue/stage1.ts` … `stage7.ts` | The step catalogue: 61 step definitions (`StepDef`), 59 switched on |
| `packages/journey/src/catalogue/index.ts` | `evaluateCatalogue`: runs each definition against the snapshot and returns the open and completed steps |
| `packages/journey/src/catalogue/routes.ts` | `ROUTES`: every page and anchor a step may link to. A test checks each anchor exists in the web app as `id="…"`. |
| `packages/journey/src/rank.ts` | Bands (urgent, start soon, this stage, also open), ordering, snooze and dismiss, stalled detection |
| `packages/journey/src/copy.ts`, `copy-hi.ts`, `parent-copy.ts` | Step titles and reasons by message key, in English and Hindi; Hindi parent titles |
| `packages/journey/src/engine.ts` | `computeJourney`, `stageProgress`, `hasArrived`, `upcomingDeadlines` |
| `packages/journey/src/version.ts` | `ENGINE_VERSION`, saved with every journey |
| `supabase/migrations/2027010*` | The snapshot RPC, `journey_state`, `journey_events`, `journey_step_state`, parent and counselor reads, verification demand |
| `apps/web/lib/journey-snapshot.ts` | Loads the snapshot and parses it with zod |
| `apps/web/lib/journey-request*.ts` | One journey per request, saved by pages |
| `apps/web/lib/journey-copy.ts` | Shows steps in the reader's language |
| `apps/web/components/journey/*` | Home, step cards, stage path, navigation, help panel |
| `worker/src/uniguide_worker/lifecycle.py`, `notify.py`, `journey.py` | Journey emails |

## Stages

`computeStage` checks from the end backwards:

| Stage | When |
|---|---|
| 7 Go | An offer is accepted |
| 6 Decide | An admission or waitlist place |
| 5 Submit and wait | Something submitted or decided, with no application still being prepared before an open deadline |
| 4 Prepare | Something being prepared |
| 3 Shortlist | Something shortlisted |
| 2 Explore | The profile has what matching needs |
| 1 Set up | Otherwise |

A student who has arrived (the accepted course has started, or they pressed "I've arrived") gets "You made it" on the home and no more journey emails.

## A step

Each step is a `StepDef` in `catalogue/stageN.ts`:

```ts
{
  id: "S5.03",                 // the catalogue id; its copy uses the same key
  stage: 5,
  dismissable: true,
  available: true,             // false keeps a written step switched off (listed in BACKLOG.md)
  markable: true,              // the student can mark it done
  parentTitle: "Preparing for an interview for {course}",  // only when safe for a parent to see
  subjects: (ctx) => appSubjects(ctx.apps.filter(...)),    // one step per subject, e.g. per application
  applies: (ctx, s) => ...,    // optional extra condition
  done: (ctx, s) => ...,
  href: (ctx, s) => `/app/tracker/${s.app!.id}#interviews`,
  params: (ctx, s) => ({ course: courseLabel(s.app!) }),
  dueAt: (ctx, s) => ...,      // from a fact only, never from a date the student typed
  factRefs: (ctx, s) => ref("deadlines", id, status),      // the facts the reason quotes
}
```

The rules every step follows:
- **Facts:** a step quotes only facts from the database, each with its status. Unverified and conflicting facts are labelled as such and never produce "you meet".
- **Student-entered dates** (expected decision, interview, passport expiry) never become a due date or start a reminder.
- **Writing, grade and score steps** never get a `parentTitle`.
- **Titles and reasons** fit 60 and 160 characters. `fillWithin` shortens a long course name before it cuts the sentence.

## Ranking and stalled

- **urgent:** due within 14 days
- **long_lead (start soon):** its lead time has begun
- **stage:** in the current stage
- **carry_over (also open):** from an earlier stage, or another application's stage

Within a band, steps are ordered by due date, then catalogue order. Snoozed (7 days) and dismissed steps are hidden, and listed under "Snoozed and dismissed".

A student is **stalled** when they've completed nothing for 14 days while a step is due within 30. The weekly email then leads with a nudge.

## Copy and languages

- **English:** titles and reasons are templates in `copy.ts`, keyed by catalogue id or a variant key (`S1.05.check`).
- **Hindi:** templates with the same keys and placeholders are in `copy-hi.ts`; `parent-copy.ts` holds the Hindi parent titles.
- **Translation happens where a step is shown.** The engine saves English, and `apps/web/lib/journey-copy.ts` translates a copy for display. Saved journeys, emails and the counselor's export stay English. Course names, university names and facts are never translated.
- **Stage text** (names, explainers, parent notes, the progress line) is in `apps/web/lib/i18n`. English comes from `STAGES`, so there's one source.
- **Review:** all Hindi is waiting for a native speaker's review (BACKLOG.md).

## Data: snapshot, saving and events

**1. The snapshot.** `journey_snapshot()` returns everything the engine reads as one JSON document: profile, tracks, shortlist, applications with their facts, test scores, country rules, step state and more. It is security definer and reads only the caller's own rows (or, with a token, a student's for the daily recompute).

To add a field:
1. Add it to the SQL in a new migration (`create or replace function public.journey_snapshot`).
2. Add it to the engine's types (`types.ts`).
3. **Add it to the zod parser in `apps/web/lib/journey-snapshot.ts`.** The parser drops keys it doesn't know, so a field missing there reaches the engine as `undefined`.
4. Update the pgTAP test that pins the own-application snapshot (`430_own_applications.test.sql`).

**2. Saving.** Pages (never the navigation) save what they computed with `save_journey_state()`. It writes:
- `journey_state`: stage, progress, steps, stalled, arrived and the engine version
- `journey_events`: `stage_entered` on a change of stage, and `step_completed` for newly done steps

`POST /api/cron/journeys` recomputes every recently active student daily, with a token (`docs/SETUP.md`).

**3. Who reads it:**
- **Parents** read through `parent_journey()`: stage, progress and parent-safe titles only, with the catalogue id and the `course`, `rule` and `date` values for translation.
- **Counselors** with an active share read `journey_state` read-only.
- **Reviewers and the source monitor** read `verification_demand()` and `rule_demand()`. These count, per course or rule, the students whose recent next steps quote an unverified or conflicting fact. Only counts leave them.

**4. Changing the engine.**
1. Bump `ENGINE_VERSION` on any change to stage rules, the catalogue, ranking or the saved shape.
2. Run `pnpm diff-fixtures` in `packages/journey` and read every difference.
3. Save with `UPDATE=1 pnpm diff-fixtures`.

## Emails

- **Weekly journey digest** (`lifecycle.py`): the stage, the urgent steps and coming deadlines. It leads with a nudge when the student is stalled.
- **Stage email:** one on reaching stage 4, 6 or 7. A student's first journey also logs the stage it starts in, and that doesn't count as reaching it.
- **Parent's weekly email** (`notify.py`): the stage, the parent note and parent-safe titles.
- **After arrival:** none of these go out.
- **Language:** emails are English until profiles store a language.
- **Locally:** set `MAILPIT_URL` and they arrive in Mailpit at http://127.0.0.1:54324.

## Adding a step

1. **Definition:** write the `StepDef` in the right `stageN.ts`, using `appSubjects` for per-application steps.
2. **Copy:** add the English title and reason to `copy.ts`, and the Hindi to `copy-hi.ts` with the same placeholders. Add a Hindi parent title to `parent-copy.ts` if the step has a `parentTitle`.
3. **Link:** make sure its page and anchor are in `ROUTES` and exist in the web app (`id="…"`).
4. **Engine tests:** add a test in `packages/journey/test/catalogue.test.ts`, covering when it appears, when it's done, its link and its due date. If the step is new to the "everything" scenario, make it open there with a 120-character course name.
5. **Data:** if the step needs new data, follow "To add a field" above.
6. **Version and fixtures:** bump `ENGINE_VERSION`, run `diff-fixtures`, read the differences and save.
7. **Browser test:** add a Playwright test that makes the step appear, follows its link, does the task and sees the step go.
8. **Step links:** extend `e2e/journey-step-links.spec.ts` if it's in a stage that spec doesn't cover yet.
9. **Accessibility:** add any new page or state to the journey audit in `e2e/a11y.spec.ts`.

## Tests

| What | Command |
|---|---|
| Engine | `pnpm --filter @uniguide/journey test`, and `pnpm diff-fixtures` in `packages/journey` |
| Web units | `pnpm --filter web test` |
| Database | `pnpm db:test`, or one file with `npx supabase test db supabase/tests/database/<file>` |
| Worker | `cd worker && uv run pytest`, plus `ruff check`, `ruff format --check` and `mypy src tests scripts evals` |
| Browser | `pnpm --filter web e2e`, then `e2e:demo` and `e2e:community` |
| Accessibility | The journey audit in `e2e/a11y.spec.ts`: every journey page with a course in every state, at 1280 and 390 px, in English and Hindi |
| Data saver | `e2e/journey-lite.spec.ts`, plus `lib/journey-links.test.ts` (journey links use `AppLink`) |

Every e2e spec sets up and removes its own data. Each one waits for a save to show on the page before it reads the result elsewhere.
