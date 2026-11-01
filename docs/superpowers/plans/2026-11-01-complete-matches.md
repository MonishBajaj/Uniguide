# Complete matches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student's search tries universities in order, finds each one's real course pages, keeps only courses with a deadline, a cost and a requirement, skips and replaces the rest, and the matches page lists only complete courses.

**Architecture:** `start_enrichment` stores an ordered queue of institutions. The worker walks the queue: real courses come from a verified or earlier-discovered index, or from automatic discovery with the course lister; each course is read with the existing `process_item`, and `course_is_complete` decides whether a university is kept. The web app builds the queue from the Part 1 pool and shows only complete courses on the matches page.

**Tech Stack:** Postgres/Supabase migrations and pgTAP, Python 3.13 worker (psycopg, pytest, Ollama lister), Next.js/TypeScript with vitest.

**Spec:** `docs/superpowers/specs/2026-11-01-complete-matches-design.md`

## Global Constraints

- Constants: target 10 complete courses, at most 30 universities tried, at most 3 courses per university, 45-minute job budget, a discovered index needs at least 5 accepted courses, a failed discovery is not retried for 7 days.
- Complete = current intake has a published deadline of kind application or priority, a published cost item of kind tuition, and a published requirement; unverified facts count.
- Never run `pnpm db:reset`; apply migrations with `pnpm exec supabase migration up --local --include-all`.
- Run commands through `zsh -ic '...'` (pnpm and uv are not on a plain PATH). Do not touch the user's uncommitted files (`git status` shows many); commit only your own paths.
- Migrations: `20270108000001_complete_matches.sql`, `20270108000002_search_complete_only.sql`.
- Existing job tests (`worker/tests/test_enrich_job.py`) use jobs with items and no candidates: `run_job` keeps that legacy path unchanged when a job has no candidates.
- No new dependencies.

## Review Focus

- A university whose every course ends incomplete is skipped and the next one tried (Task 5).
- A page that lists only navigation ("Master's courses") must not be accepted as an index (Task 4).
- A discovery that raises (fetch error, model timeout) skips that university and does not fail the job (Task 5).
- A job whose universities are all skipped finishes `done` with `kept = 0` and an honest progress message (Tasks 5 and 6).
- A student with no fields chosen: real courses are not filtered by field, and the queue still builds (Tasks 4 and 6).

---

### Task 1: Queue tables, `course_is_complete` and the new `start_enrichment`

**Files:**
- Create: `supabase/migrations/20270108000001_complete_matches.sql`, `supabase/tests/database/550_complete_matches.test.sql`
- Modify: `supabase/tests/database/380_enrichment.test.sql` (the tests that call the old course-id `start_enrichment`)
- Modify (generated): `packages/db-types/src/database.types.ts` via `pnpm db:types`

**Interfaces:**
- Produces: tables `enrichment_candidates(id, job_id, position, institution_id, status, reason, courses, started_at, finished_at)` and `institution_discovery(institution_id pk, status, reason, index_url, checked_at)`; columns `enrichment_jobs.target_complete/max_tries/tried/kept`, `enrichment_items.candidate_id`; item status `'incomplete'`; `public.course_is_complete(p_program_id uuid) returns boolean`; `public.start_enrichment(p_institution_ids uuid[]) returns uuid`.

- [ ] **Step 1: Write the pgTAP test** `550_complete_matches.test.sql` (style of `390_index_crawl.test.sql`): `course_is_complete` is false with no facts, false with each of the three missing in turn, true with all three published and unverified, false when the facts belong to a non-current cycle; as a student, `start_enrichment(array[inst1, inst2])` creates a job and two candidates with positions 1 and 2 in that order, copies the profile targets, returns the same job on a second call while it is active, rejects more than 30 institutions with `22023`, rejects the fourth job in 24 hours with `rate_limited`; a student cannot insert or update candidates (`42501`) but reads their own and not another student's; `tests.as_worker()` can update candidate status and write `institution_discovery`.
- [ ] **Step 2: Run it and see it fail.** `zsh -ic 'pnpm exec supabase test db supabase/tests/database/550_complete_matches.test.sql'`. Expected: fails (relations and functions missing).
- [ ] **Step 3: Write the migration** per spec section 1 and 4. `start_enrichment` is dropped and recreated with parameter `p_institution_ids uuid[]` (null or more than 30 raises `bad_program_list` code `22023`; keep the advisory lock, the existing-active-job return, the 3-per-24-hours limit and the profile snapshot); it inserts `enrichment_candidates` with `position = ordinality` for the published institutions only. Candidate and discovery row security: owner-read for candidates, worker full access, no student writes; grants as for `enrichment_items`. `course_is_complete` is `stable`, security invoker, `search_path = ''`.
- [ ] **Step 4: Update `380_enrichment.test.sql`** where it calls the old `start_enrichment(program_ids)` so it passes institution ids and asserts candidates instead of items.
- [ ] **Step 5: Apply and run.** `zsh -ic 'pnpm exec supabase migration up --local --include-all; pnpm db:types; pnpm db:test'`. Expected: all pgTAP pass; `git diff packages/db-types` shows the new tables and function.
- [ ] **Step 6: Commit** `feat(db): enrichment queue, completeness check and institution-based start_enrichment`.

---

### Task 2: `search_programs(p_complete_only)`

**Files:**
- Create: `supabase/migrations/20270108000002_search_complete_only.sql`
- Modify: `supabase/tests/database/420_search_programs_ranking.test.sql` (new assertions at the end)
- Modify (generated): `packages/db-types/src/database.types.ts`

**Interfaces:**
- Consumes: `course_is_complete` (Task 1).
- Produces: `search_programs(..., p_rank_subjects, p_per_institution, p_complete_only boolean default false)`; with it true only complete courses are returned, in both branches (with and without `p_per_institution`).

- [ ] **Step 1: Write the failing pgTAP assertions.** With two courses at ranked institutions, one with all three facts and one with only a deadline: `p_complete_only => true` returns only the complete one, with and without `p_per_institution`; default false returns both; the cap counts only complete courses (a complete course ranked after three incomplete ones of the same university is still returned with `p_per_institution => 1`).
- [ ] **Step 2: Run and see it fail** (unknown argument).
- [ ] **Step 3: Write the migration.** Drop and recreate the function (the signature changes); copy the body of `20270101000005_search_programs_edition_order.sql`, add `and (not p_complete_only or public.course_is_complete(c.id))` to the `where` of both branches, before the window is computed.
- [ ] **Step 4: Apply, regenerate types, run `pnpm db:test`.** Expected: pass; `search_programs` explore callers unchanged (`230_search_filters.test.sql` passes).
- [ ] **Step 5: Commit** `feat(db): search_programs can return complete courses only`.

---

### Task 3: The lister reports a field, and index ingestion becomes reusable

**Files:**
- Modify: `worker/src/uniguide_worker/index/lister.py` (`ListedCourse`, `SYSTEM`), `worker/src/uniguide_worker/index/ollama_lister.py` (`repair_title` keeps `field`), `worker/src/uniguide_worker/index/crawl.py`
- Test: `worker/tests/test_ollama_lister.py`, `worker/tests/test_index_crawl.py`

**Interfaces:**
- Produces: `ListedCourse.field: str | None = None` (one of `"01"`..`"10"`); in `crawl.py`, `ingest_listed(conn, index: dict[str, Any], page_text: str, link_urls: set[str], courses: list[ListedCourse]) -> IndexReport` containing everything `crawl_index` does after the lister call (acceptance checks, upsert or create of programs, now also writing `isced_f` from `field`), and `crawl_index` calling it.

- [ ] **Step 1: Write failing tests.** `test_index_crawl.py`: a listed course with `field="06"` creates a program whose `isced_f` is `06`; a course with an unknown `field="99"` stores `isced_f` null; `ingest_listed` called directly with a fake listed course gives the same `IndexReport` counts as `crawl_index` did (reuse an existing crawl test's fixture). `test_ollama_lister.py`: a model answer carrying `"field": "06"` survives `repair_title`; a course without `field` still validates.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.** Add `field` (optional) to `ListedCourse` and a prompt rule: "field: the broad field code, one of 01 Education, 02 Arts and humanities, 03 Social sciences, journalism and information, 04 Business, administration and law, 05 Natural sciences, mathematics and statistics, 06 ICT, 07 Engineering, manufacturing and construction, 08 Agriculture, forestry, fisheries and veterinary, 09 Health and welfare, 10 Services; null when unsure". Extract `ingest_listed` out of `crawl_index` without changing its behaviour; validate `field` against the ten codes before storing.
- [ ] **Step 4: Run the whole worker suite, ruff and mypy.** Expected: pass (existing crawl tests unchanged).
- [ ] **Step 5: Commit** `feat(worker): course lister reports a field; crawl ingestion is reusable`.

---

### Task 4: Finding real courses (`enrich/discover.py`)

**Files:**
- Create: `worker/src/uniguide_worker/enrich/discover.py`, `worker/tests/test_enrich_discover.py`

**Interfaces:**
- Consumes: `ingest_listed`, `ListedCourse.field` (Task 3); `Fetcher` and `CourseLister`; `institution_discovery`, `institution_indexes` (Task 1).
- Produces:
  - `real_courses(conn, institution_id: UUID, fields: list[str], levels: list[str], limit: int = 3) -> list[UUID]` — published programs of the institution with an `official_url`, level in `levels`, `isced_f` starting with one of `fields` (no field filter when `fields` is empty), best coverage tier first.
  - `find_index_page(fetcher, lister, domain: str, levels: list[str]) -> tuple[str, str, set[str], list[ListedCourse]] | None` — `(url, page_text, link_urls, accepted_courses)` of the first candidate page with at least `MIN_ACCEPTED = 5` accepted courses, else `None`.
  - `discover(conn, fetcher, lister, institution_id: UUID, domain: str, fields, levels) -> Discovery` where `Discovery(status: Literal["found","none","blocked"], reason: str, program_ids: list[UUID])`; records the outcome in `institution_discovery` and skips a university whose `none`/`blocked` row is under 7 days old.

- [ ] **Step 1: Write failing tests** (fake `Fetcher` and `CourseLister` objects, `world` fixture style of `test_enrich_job.py`): `real_courses` filters by level and field, ignores unpublished programs and programs with no `official_url`, returns at most `limit`, and ignores field when `fields` is empty; `find_index_page` returns a page whose lister answer has 5 accepted courses and returns `None` when the best page has only 3 (navigation) or the page lists none; it scores candidate links by graduate or postgraduate words for master's and doctorate and by undergraduate words for bachelor's; `discover` stores an active unverified `institution_indexes` row and creates programs with real links and `isced_f`, returns `blocked` when the fetcher raises `FetchRefused`, returns `none` with a reason when nothing is found, does not call the fetcher again within 7 days of a `none`, and treats an exception from the lister as `none` with the error as its reason.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement** the three functions. `find_index_page` fetches the home page (`https://www.<domain>/`, then `https://<domain>/`), scores same-domain links by keyword (graduate, postgraduate, programs, degrees, a-z, courses; level-aware), fetches the best 4 and follows one more hop from each, and runs `lister.list_courses` on the 2 pages with the most links, accepting courses with the crawl's `_reject_reason` check. `discover` wraps it, creates the index row, calls `ingest_listed`, and commits. Cap the work per university at about 6 minutes by passing a monotonic deadline between steps.
- [ ] **Step 4: Run tests, ruff, mypy.** Expected: pass.
- [ ] **Step 5: Commit** `feat(worker): find a university's real course pages`.

---

### Task 5: The candidate loop

**Files:**
- Modify: `worker/src/uniguide_worker/enrich/serve.py` (`run_job` branches to `run_candidates` when the job has candidates; `serve()` passes the lister), `worker/src/uniguide_worker/enrich/jobs.py` (completeness result)
- Create: `worker/tests/test_enrich_candidates.py`

**Interfaces:**
- Consumes: `real_courses`, `discover` (Task 4); `process_item`; `course_is_complete` (Task 1).
- Produces: `run_candidates(conn, fetcher, extractor, lister, job_id: UUID, *, fresh_days: int, budget_seconds: float = 2700, sleep=time.sleep, now=time.monotonic) -> None`. For each pending candidate in position order until `kept >= target_complete`, `tried >= max_tries` or the budget is spent: mark it running; `ids = real_courses(...)`, falling back to `discover(...)` when empty; insert items (`candidate_id` set, at most 3); run `process_item` for each; set each item `extracted` if `course_is_complete`, else `incomplete`; the candidate becomes `kept` (with `courses` = its complete count) when at least one is complete, else `skipped` with a reason. `enrichment_jobs.tried` and `kept` (complete courses, at most 3 per university) are updated after every candidate; the job ends `done`, stage `done`, with unvisited candidates left `pending`. Any exception inside one candidate marks it `skipped` with the error name and continues.

- [ ] **Step 1: Write failing tests** with the `world` fixture and fakes (a fake lister, `PageFetcher` and a fake extractor that writes facts): the loop stops at 10 complete courses from 4 or more universities; a university whose courses end incomplete is skipped and the next tried; with 30 `max_tries` and no complete course the job stops after 30; a job whose universities are all skipped ends `done` with `kept = 0`; a discovery that raises skips that university only; the budget stops a job (pass a `now` that jumps); a course already fresh and complete counts as kept without a second fetch; at most 3 courses count per university; verified-index courses are used and the lister is not called for them; with empty `target_fields` in the snapshot, courses of any field are used.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement** `run_candidates` and the `run_job` branch (legacy path untouched when the job has no candidates). Item completeness: after `process_item` returns `extracted` or `skipped_fresh`, check `course_is_complete(program_id)` and write the final item status and `detail` ("deadline, cost or requirements missing" when incomplete).
- [ ] **Step 4: Run the whole worker suite, ruff, mypy.** Expected: pass, including the legacy job tests.
- [ ] **Step 5: Commit** `feat(worker): search universities in order and keep only complete courses`.

---

### Task 6: Web: build the queue, show only complete matches, honest progress

**Files:**
- Modify: `apps/web/lib/start-search.ts`, `apps/web/lib/match-data.ts`, `apps/web/lib/enrichment.ts`, `apps/web/app/app/match/page.tsx` (pass `completeOnly`), `apps/web/app/app/matching/actions.ts`, `apps/web/app/app/matching/progress.tsx`
- Test: `apps/web/lib/start-search.test.ts` (new), `apps/web/lib/match-data.test.ts`, `apps/web/lib/enrichment.test.ts` (if present, else create)

**Interfaces:**
- Consumes: `start_enrichment(p_institution_ids)` and `search_programs(p_complete_only)` (Tasks 1 and 2).
- Produces: `pickInstitutions(ranked: { programId: string; institutionId: string }[], limit: number): string[]` in `lib/enrichment.ts` (distinct institution ids in order, at most `limit`, constant `QUEUE = 30`); `loadMatchInputs(supabase, userId, track = null, options: { completeOnly?: boolean } = {})`, adding `p_complete_only: true` to the query when set; `Progress` gains `tried`, `kept`, `candidates: { institution: string; status: string; reason: string | null; courses: number }[]`; `itemLabel("incomplete")` is `{ text: "Read, but a deadline, cost or requirement is missing", tone: "warn" }`.

- [ ] **Step 1: Write failing tests.** `pickInstitutions`: keeps first-seen order, drops repeats, caps at 30, empty in gives empty out. `loadMatchInputs` with `{ completeOnly: true }` sends `p_complete_only: true` and without it sends nothing. `itemLabel("incomplete")`. A pure helper `progressSummary(p: { tried: number; kept: number; status: string }): string` returns "Checked 22 universities, kept 10 courses." while running or done above target, and "We found 4 complete courses after checking 30 universities." when done below 10, and "We could not find a university with complete information yet." when done with none.
- [ ] **Step 2: Run `zsh -ic 'cd apps/web && pnpm exec vitest run'` and see them fail.**
- [ ] **Step 3: Implement.** `startSearch` builds the ranked list as today, calls `pickInstitutions(ranked, QUEUE)` and `supabase.rpc("start_enrichment", { p_institution_ids })`; an empty queue keeps the existing no-courses message. `jobProgress` also selects the job's `tried`, `kept` and its candidates (with institution names). The matches page passes `{ completeOnly: true }`; `startSearch` and what-if do not. `progress.tsx` shows `progressSummary`, lists skipped universities with their reasons and shows an empty matches hint when `kept` is 0.
- [ ] **Step 4: Run web tests, `pnpm lint`, `pnpm typecheck`.** Expected: pass.
- [ ] **Step 5: Commit** `feat(web): queue universities for a search and list complete matches only`.

---

### Task 7: Live trial, docs and all suites

**Files:**
- Modify: `docs/SETUP.md`, `docs/FEATURES.md` (the matching and enrichment rows), `docs/DEMO_LOCAL.md` (what the search does and how long it takes)

- [ ] **Step 1: Apply migrations and run every suite.** `zsh -ic 'pnpm exec supabase migration up --local --include-all; pnpm db:types; pnpm db:test; pnpm test; pnpm lint; pnpm typecheck; cd worker && uv run pytest -q && uv run ruff check src tests scripts && uv run mypy src'`. Expected: all pass, no diff in `packages/db-types` after regeneration.
- [ ] **Step 2: Live trial.** Restart the worker (`uv run uniguide-worker serve`) so it loads the new code, sign in as `student@uniguide.local` on `http://localhost:3000`, save US, master's, Engineering, and watch the job through to `done`. Query `enrichment_candidates` and report universities tried, kept, skipped with reasons, the courses kept, the minutes taken, and what the matches page shows. Restore the student's profile and delete the trial job afterwards (as in earlier sessions: `update profiles ...`, `delete from enrichment_jobs where user_id = '00000000-0000-4000-a000-000000000002'`).
- [ ] **Step 3: Docs.** Describe the queue, the completeness rule, the 20 to 45 minute cold search, and the universities that are always skipped (JavaScript-only, blocked).
- [ ] **Step 4: Commit** `docs: how the search finds complete courses`.
