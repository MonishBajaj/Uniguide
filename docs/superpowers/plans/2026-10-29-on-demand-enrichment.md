# On-demand course enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a student asks for universities, pick ~10 courses, fetch their facts from official pages with Gemini while a progress screen shows real stages, and reuse stored facts for later students.

**Architecture:** The web app calls an RPC that inserts a job; a long-running Python worker (`uniguide-worker serve`) claims jobs and runs the existing fetch -> extract -> validate -> publish-unverified pipeline per course, writing stage/status rows that the progress page polls. The extractor sits behind an interface so Gemini replaces Anthropic by setting.

**Tech Stack:** Postgres/Supabase (RLS, pgTAP), Python 3.13 (psycopg, pydantic, `google-genai`, selectolax, pytest), Next.js 16 + vitest + Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-on-demand-enrichment-design.md`

## Global Constraints

- Facts the LLM extracts are shown unverified, each with a verbatim quote and source link; the LLM never supplies a deadline, fee or requirement it did not read on the page.
- Freshness window `ENRICH_FRESH_DAYS` default `7`; one running item per course (partial unique index on `program_id` where `status = 'running'`).
- Settings: `EXTRACTOR=gemini|anthropic` (default `gemini`), `GEMINI_API_KEY`, `GEMINI_MODEL`.
- Crawl rules from `docs/DATA_SOURCES.md` stay: one request per 5 s per host, robots.txt, `UniguideBot` user agent.
- Students never write jobs directly; only `start_enrichment()` (security definer, rate-limited). Only the `ingest_worker` role updates jobs, items, sources.
- Stage names, in order: `optimizing_profile`, `selecting_universities`, `fetching_details`, `done`.
- Web migrations follow `supabase/migrations/2026*_name.sql`; after a migration run `pnpm db:types` and commit the generated types.

## Deviations from the spec (found while reading the code)

- **Polling, not realtime.** `pnpm db:start` excludes the realtime service, so the progress page polls every 2 s.
- **`profile_snapshot` on the job.** The worker role cannot read `profiles`; `start_enrichment` copies only target countries, levels and fields into the job so the fallback has what it needs without widening worker access.
- **Explicit trigger.** A "Find universities for me" button (profile page and end of onboarding) starts the job, instead of every profile save, so existing profile flows and tests are untouched and edits don't re-run jobs.
- **Fallback needs AI consent.** The job stores `allow_fallback = has_consent(uid, 'ai_processing')`; without it the profile snapshot never goes to Gemini.

## Review Focus

- Catalog has fewer than 10 fits and no AI consent: job ends `done` with the fits it has and a "no more matches" note, never stuck. (Task 3)
- Gemini returns a quote that is not on the page: fact dropped, item still finishes. (Task 2)
- Official page is 404, 403 or robots-refused: that item is `failed`, the others carry on. (Task 3)
- Worker dies mid-job: a job `running` with no heartbeat for 15 minutes is reclaimed. (Task 5)
- Gemini candidate URL on a look-alike host (`tum.de.evil.com`, `evil-tum.de`): rejected. (Task 4)

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261202000001_enrichment.sql` | tables, RLS, grants, `start_enrichment` RPC |
| `supabase/tests/database/380_enrichment.test.sql` | pgTAP for RLS, rate limit, dedup index |
| `worker/src/uniguide_worker/extract/base.py` | `Extractor` protocol |
| `worker/src/uniguide_worker/extract/gemini.py` | `GeminiExtractor` |
| `worker/src/uniguide_worker/extract/factory.py` | `make_extractor()` from settings |
| `worker/src/uniguide_worker/enrich/sources.py` | find a course's official pages on its own host |
| `worker/src/uniguide_worker/enrich/candidates.py` | Gemini fallback: propose, host-check, create rows |
| `worker/src/uniguide_worker/enrich/jobs.py` | claim, stage, item processing, freshness, dedup |
| `worker/src/uniguide_worker/enrich/serve.py` | polling loop, backoff, stale reclaim |
| `worker/Dockerfile` | worker image |
| `apps/web/lib/enrichment.ts` + `.test.ts` | stage/status mapping for the UI |
| `apps/web/app/app/matching/` | `actions.ts`, `page.tsx`, `progress.tsx` |

---

### Task 1: Schema, RLS and RPC

**Files:**
- Create: `supabase/migrations/20261202000001_enrichment.sql`, `supabase/tests/database/380_enrichment.test.sql`
- Modify: `packages/db-types/src/database.types.ts`, `worker/src/uniguide_worker/db_enums.py` (via `pnpm db:types`)

**Interfaces:**
- Produces: tables `enrichment_jobs(id, user_id, status, stage, profile_snapshot jsonb, allow_fallback bool, error, created_at, started_at, finished_at, heartbeat_at)` and `enrichment_items(id, job_id, program_id, status, detail, started_at, finished_at)`; enum `enrichment_status` (`queued|running|done|failed`); item status text check (`pending|waiting|running|extracted|skipped_fresh|failed`); RPC `public.start_enrichment(p_program_ids uuid[], p_profile jsonb) returns uuid`.
- Worker role gets `select, update` on jobs, `select, insert, update` on items, and `select, insert, update` on `program_sources` with a `"worker"` policy on each new table and on `program_sources`.

- [ ] **Step 1: Write pgTAP tests** in `380_enrichment.test.sql` (use `tests.create_user`): a student sees only their own job and items; a second student sees none; direct `insert` into `enrichment_jobs` as `authenticated` fails with 42501; `start_enrichment` returns the same id when a queued/running job exists; the 4th call within 24 hours raises `rate_limited`; `allow_fallback` is true only after an `ai_processing` consent; two `running` items for the same `program_id` violate the unique index; `ingest_worker` can update a job.
- [ ] **Step 2: Run** `pnpm db:test` and confirm the new file fails (relations missing).
- [ ] **Step 3: Write the migration.** Create the enum, both tables, `unique (job_id, program_id)`, the partial unique index `enrichment_items_one_running` on `(program_id) where status = 'running'`, an index on `(user_id, created_at desc)`, RLS (`owner read` for authenticated via `user_id = auth.uid()` and via the parent job for items; `worker` policies), revokes of insert/update/delete from `authenticated`, and `start_enrichment` (security definer, `set search_path = ''`). The RPC rejects an empty or >12-element array, returns an existing active job, enforces 3 jobs per 24 h, sets `allow_fallback` from `public.has_consent(auth.uid(), 'ai_processing')`, inserts the items as `pending`.
- [ ] **Step 4: Run** `pnpm db:reset && pnpm db:test`; expect all pass. Then `pnpm db:types`.
- [ ] **Step 5: Commit** `feat(db): enrichment jobs, items and start_enrichment RPC`.

---

### Task 2: Extractor interface and Gemini extractor

**Files:**
- Create: `worker/src/uniguide_worker/extract/base.py`, `gemini.py`, `factory.py`, `worker/tests/test_gemini_extractor.py`
- Modify: `extract/extractor.py`, `pipeline.py`, `config.py`, `cli.py`, `worker/pyproject.toml`, `.env.example`, `worker/tests/conftest.py`

**Interfaces:**
- Produces: `class Extractor(Protocol): version: str; def extract(self, url: str, cycle_label: str, page_text: str) -> ExtractionRun`; `GeminiExtractor(client=None, model: str | None = None)`; `make_extractor(settings: Settings) -> Extractor`; `Settings.extractor: str`, `gemini_api_key`, `gemini_model`, `enrich_fresh_days: int`.
- The existing Anthropic class keeps its name `AnthropicExtractor` (alias `Extractor` removed from `extractor.py`) and gains `version`; `pipeline.py` uses `extractor.version` instead of the `EXTRACTOR_VERSION` constant.

- [ ] **Step 1: Write failing tests** in `test_gemini_extractor.py` with a `FakeGenai` client (add to `conftest.py`) returning a canned `PageExtraction`: `test_returns_parsed_extraction_and_cost`, `test_failed_call_returns_error_run` (client raises -> `ExtractionRun.error` set, `extraction is None`), `test_version_names_model_and_prompt`. In `test_pipeline_db.py` add `test_quote_not_on_page_is_dropped` using the Gemini fake: a fact whose quote is absent ends `auto_rejected` and `extract_page` still returns `status == "extracted"`. Existing `test_extractor.py` must still pass after the rename.
- [ ] **Step 2: Run** `cd worker && uv run pytest tests/test_gemini_extractor.py -v`; expect FAIL (module missing).
- [ ] **Step 3: Implement** the protocol, `GeminiExtractor` (`google-genai`, `generate_content` with `response_mime_type="application/json"` and `response_schema=PageExtraction`, `PageExtraction.model_validate_json` on the text; 429/5xx -> failed run with `error` starting `rate_limited` so the serve loop can back off), the factory, settings from env, and the `pyproject.toml` dependency `google-genai`. Replace every `Extractor()` construction in `cli.py` with `make_extractor(get_settings())`. Add `EXTRACTOR`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `ENRICH_FRESH_DAYS` to `.env.example`.
- [ ] **Step 4: Run** `uv run pytest tests -q && uv run ruff check . && uv run mypy src`; expect pass.
- [ ] **Step 5: Commit** `feat(worker): pluggable extractor with Gemini backend`.

---

### Task 3: Per-course enrichment (sources, cycle, freshness, extraction)

**Files:**
- Create: `worker/src/uniguide_worker/enrich/__init__.py`, `enrich/sources.py`, `enrich/jobs.py`, `worker/tests/test_enrich_item.py`, `worker/tests/fixtures/course_page.html`

**Interfaces:**
- Consumes: `extract_page(conn, fetcher, extractor, url, cycle_id) -> PageReport`, `check_source`-style source registration from `monitor.py`.
- Produces:
  - `discover_sources(fetcher: Fetcher, official_url: str) -> list[tuple[str, str]]` returning `(source_kind, url)` for the course page plus same-host links whose text or path contains admissions, requirements, international, fees, tuition or deadlines; capped at 6.
  - `ensure_current_cycle(conn, program_id: UUID) -> UUID` (reuses `monitor.intake_cycle`, else inserts the next intake `YYYY-fall` with `is_current`).
  - `is_fresh(conn, program_id: UUID, days: int) -> bool` (true when every active source was checked within `days` and the cycle has at least one fact).
  - `process_item(conn, fetcher, extractor, item_id: UUID, *, fresh_days: int) -> str` returning the final item status and writing `detail`.

- [ ] **Step 1: Write failing tests** against the local DB using the `PageFetcher` pattern from `test_monitor.py`: `test_fresh_course_is_skipped` (no fetch calls, status `skipped_fresh`), `test_stale_course_is_extracted`, `test_missing_cycle_is_created`, `test_refused_page_fails_only_that_item` (fetcher raises `FetchRefused` -> `failed`, detail names the URL), `test_http_404_fails_item`, `test_running_duplicate_waits` (second item for same course while one is `running` -> status `waiting`, no fetch), `test_discover_sources_stays_on_host` using `course_page.html` with one same-host fees link and one off-host link.
- [ ] **Step 2: Run** `uv run pytest tests/test_enrich_item.py -v`; expect FAIL.
- [ ] **Step 3: Implement** `discover_sources` (selectolax link scan, `urlparse(...).hostname` equal to the course host, de-duplicated), `ensure_current_cycle`, `is_fresh`, and `process_item`: lock by setting the item `running` (the unique index makes the second claimer fail -> `waiting`), insert missing `program_sources` rows, return `skipped_fresh` if fresh, otherwise call `extract_page` for each source, set `extracted` if any page extracted, `failed` otherwise, always commit.
- [ ] **Step 4: Run** `uv run pytest tests/test_enrich_item.py -v`; expect pass.
- [ ] **Step 5: Commit** `feat(worker): per-course enrichment with freshness and dedup`.

---

### Task 4: Gemini candidate fallback

**Files:**
- Create: `worker/src/uniguide_worker/enrich/candidates.py`, `worker/tests/test_candidates.py`

**Interfaces:**
- Produces:
  - `host_matches_domain(url: str, domain: str) -> bool`: true only when the URL's hostname equals `domain` or ends with `"." + domain`.
  - `propose_candidates(client, model: str, snapshot: dict, limit: int) -> list[Candidate]` where `Candidate(institution: str, programme: str, level: str, url: str, domain: str)`.
  - `create_from_candidates(conn, candidates: list[Candidate], country: str) -> list[UUID]` returning program ids, creating `institutions` (with `official_domain`) and `programs` (`coverage_tier = 'extracted'`, `published = true`, unique slug) and skipping candidates whose host fails `host_matches_domain` or whose institution already has that programme.

- [ ] **Step 1: Write failing tests:** `test_host_matches_exact_and_subdomain` (`www.tum.de`, `tum.de` pass for `tum.de`), `test_lookalike_hosts_rejected` (`tum.de.evil.com`, `evil-tum.de`, `tum.de@evil.com`), `test_create_skips_bad_host_and_duplicates`, `test_snapshot_is_the_only_profile_data_sent` (the fake client's recorded prompt contains countries/levels/fields and no email or name).
- [ ] **Step 2: Run** `uv run pytest tests/test_candidates.py -v`; expect FAIL.
- [ ] **Step 3: Implement** the three functions using `google-genai` with a Pydantic response schema for `list[Candidate]`; slug is `slugify(institution + programme)` with a numeric suffix on collision.
- [ ] **Step 4: Run** the tests; expect pass.
- [ ] **Step 5: Commit** `feat(worker): Gemini candidate fallback with official-host check`.

---

### Task 5: Job runner and `serve` command

**Files:**
- Create: `worker/src/uniguide_worker/enrich/serve.py`, `worker/tests/test_enrich_job.py`, `worker/Dockerfile`
- Modify: `cli.py` (add `serve`), `docs/SETUP.md`, `worker/README.md`

**Interfaces:**
- Consumes: `process_item`, `propose_candidates`, `create_from_candidates`, `make_extractor`.
- Produces: `claim_job(conn) -> UUID | None` (`for update skip locked`; also reclaims `running` jobs whose `heartbeat_at` is older than 15 minutes); `run_job(conn, fetcher, extractor, client, job_id: UUID, *, fresh_days: int) -> None`; `serve(poll_seconds: int = 3) -> None`; CLI `uniguide-worker serve`.

- [ ] **Step 1: Write failing tests:** `test_job_moves_through_stages_in_order` (records `stage` values), `test_job_done_when_all_items_terminal`, `test_failed_item_does_not_fail_job`, `test_fewer_than_ten_without_consent_still_finishes` (`allow_fallback = false`, 6 items: no Gemini call, status `done`), `test_fallback_runs_when_allowed_and_short` (adds items from candidates), `test_stale_running_job_is_reclaimed`, `test_rate_limited_extraction_backs_off_and_retries` (first run returns `error="rate_limited…"`, item retried after the sleep stub, then succeeds).
- [ ] **Step 2: Run** `uv run pytest tests/test_enrich_job.py -v`; expect FAIL.
- [ ] **Step 3: Implement** `run_job`: set `running`/`started_at`, stage `optimizing_profile`, stage `selecting_universities` (fallback only if `allow_fallback` and items < 10), stage `fetching_details` processing items one at a time with `heartbeat_at = now()` after each, final stage `done`; wrap per-item errors so one failure never fails the job; on an unexpected error set job `failed` with `error`. Backoff doubles from 5 s to 60 s on `rate_limited`, at most 4 retries per item. `serve` loops `claim_job`, sleeping `poll_seconds` when idle, and reads `ENRICH_FRESH_DAYS`.
- [ ] **Step 4: Add** `worker/Dockerfile` (python:3.13-slim, `uv sync --frozen`, `CMD ["uv","run","uniguide-worker","serve"]`) and a "Run the enrichment worker" section in `docs/SETUP.md` (Fly.io/Railway/Render, env `WORKER_DATABASE_URL`, `GEMINI_API_KEY`, `CRAWLER_CONTACT`).
- [ ] **Step 5: Run** `uv run pytest tests -q && uv run ruff check . && uv run mypy src`; expect pass.
- [ ] **Step 6: Commit** `feat(worker): enrichment job runner and serve command`.

---

### Task 6: Web start action and progress page

**Files:**
- Create: `apps/web/lib/enrichment.ts`, `apps/web/lib/enrichment.test.ts`, `apps/web/app/app/matching/actions.ts`, `apps/web/app/app/matching/page.tsx`, `apps/web/app/app/matching/progress.tsx`, `apps/web/e2e/enrichment.spec.ts`
- Modify: `apps/web/app/app/profile/page.tsx` and `apps/web/app/app/onboarding/chat.tsx` (add the "Find universities for me" button)

**Interfaces:**
- Produces in `lib/enrichment.ts`: `STAGES` (the four stage names with the labels "Optimizing profile", "Selecting universities", "Getting deadlines and requirements", "Done"), `stageIndex(stage: string): number`, `itemLabel(status: string): { text: string; tone: "pending" | "working" | "ok" | "warn" }`.
- Produces in `actions.ts`: `findUniversities(): Promise<{ ok: boolean; message: string; jobId?: string }>` and `jobProgress(jobId: string): Promise<{ stage: string; status: string; items: { programId: string; title: string; institution: string; status: string; detail: string | null }[] }>`.

- [ ] **Step 1: Write failing vitest tests** in `enrichment.test.ts`: `stageIndex` returns 0..3 in order and -1 for unknown; `itemLabel("skipped_fresh")` is tone `ok`; `itemLabel("failed")` is tone `warn` with copy "Couldn't read the official page".
- [ ] **Step 2: Run** `pnpm --filter web test -- enrichment`; expect FAIL.
- [ ] **Step 3: Implement** `lib/enrichment.ts`; implement `findUniversities`: load the profile, run `matchPrograms` over `program_cards` filtered by the profile (reusing `loadCurrentCycles`, `toProgramInput`, `toStudentProfile` as in `match/actions.ts`), take the top 10 with at most 3 per institution, call `supabase.rpc("start_enrichment", { p_program_ids, p_profile })` with only `target_countries`, `target_levels`, `target_fields`; map `rate_limited` to "You've started enough searches today. Try again tomorrow."; if the catalog returns no fits and no consent, return a message that explains why. `page.tsx` shows the latest job; `progress.tsx` (client) polls `jobProgress` every 2 s until `done`/`failed`, renders the stage list with `aria-live="polite"`, animates with CSS that is disabled under `prefers-reduced-motion`, and shows each course card when its item is `extracted` or `skipped_fresh`, linking to `/app/match` at the end.
- [ ] **Step 4: Run** `pnpm --filter web test && pnpm typecheck && pnpm lint`; expect pass.
- [ ] **Step 5: Write the Playwright test** `enrichment.spec.ts`: sign in as the seeded student, click "Find universities for me", seed job and item rows through the operator connection as the worker would, assert the stage list advances and a course card appears.
- [ ] **Step 6: Run** `pnpm --filter web e2e -- enrichment`; expect pass.
- [ ] **Step 7: Commit** `feat(web): find-universities action and live progress page`.

---

### Task 7: Gemini accuracy check against the labelled pages

**Files:**
- Modify: `worker/evals/test_extraction_eval.py`, `worker/evals/README.md`

**Interfaces:**
- Consumes: `make_extractor`, the existing fixtures and `metrics.py`.

- [ ] **Step 1: Parametrise** the live eval over `["anthropic", "gemini"]` (marker `live`, skipped when the matching key is absent), reporting per-extractor precision and recall per subject.
- [ ] **Step 2: Run** `cd worker && uv run pytest -m live evals -v` with `GEMINI_API_KEY` set; record the numbers in `worker/evals/README.md` and note any subject where Gemini is below Anthropic.
- [ ] **Step 3: Commit** `test(worker): compare Gemini and Claude on the labelled pages`.

---

## Self-review

- **Spec coverage:** flow and stages (Tasks 1, 5, 6), freshness and in-flight dedup (Tasks 1, 3), Gemini extractor and validators unchanged (Task 2), fallback with host check (Task 4), data model and RLS (Task 1), web (Task 6), deployment (Task 5), eval (Task 7), out-of-scope items untouched.
- **Types:** `Extractor.version`, `process_item`, `run_job`, `start_enrichment(p_program_ids, p_profile)` and `STAGES` names match across tasks.
- **Proportion:** each task names signatures, tests and values; bodies are left to the implementer.
