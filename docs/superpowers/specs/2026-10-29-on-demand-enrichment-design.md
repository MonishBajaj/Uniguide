# On-demand course enrichment (Gemini)

## Goal

When a student finishes their profile, pick about 10 matching courses and fetch their
requirements, deadlines and fees from official pages while the student watches a progress
screen. Nothing is bulk-loaded. Facts are stored once and reused by every later student.

## Decisions (agreed)

- **Catalog source**: official registers first (CRICOS, Scorecard, Discover Uni, DUO). For
  countries without a register (for example Germany), Gemini proposes candidates as a fallback.
- **Extraction**: Google Gemini (Flash tier, configurable) replaces the Anthropic extractor behind a
  shared interface. Anthropic stays selectable.
- **Execution**: a job queue table in Postgres, processed by a long-running Python worker. The
  web app never runs extraction.
- **Cache**: facts live in Postgres; a course with fresh facts is never re-fetched.
- **Trust model unchanged**: extracted facts are shown as unverified, each carries a verbatim
  quote and source link, and the LLM never supplies a deadline, fee or requirement it did not
  read on an official page.

## Flow

1. Profile saved -> server action `startEnrichment()` runs `matchPrograms` over the catalog,
   picks the top 10 spread across institutions, and calls RPC `start_enrichment(program_ids)`.
2. The RPC rate-limits per user (same pattern as `aiBlocked` / `logRun`) and inserts an
   `enrichment_jobs` row plus one `enrichment_items` row per course.
3. The worker (`uniguide-worker serve`) claims jobs with `for update skip locked` and runs:
   - **optimizing_profile**: normalise the profile, pick the target intake.
   - **selecting_universities**: if fewer than 10 courses fit the student's countries and
     fields, run the Gemini candidate fallback (below).
   - **fetching_details**: per course, ensure `program_sources` rows exist, ensure a current
     non-`any` `program_cycles` row (the monitor skips courses without one), skip if fresh,
     otherwise fetch -> extract -> validate -> publish unverified via the existing
     `extract_page` pipeline.
   - **done**.
4. Each stage and each item writes status to its row. The progress screen subscribes (Supabase
   realtime, polling fallback) and animates the real stages. A course card appears as soon as
   its item finishes. A failed course shows "couldn't read the official page" with its link;
   the other courses are unaffected.

## Shared cache

- **Freshness window**: an item is `skipped_fresh` when every registered source for the course
  was checked within `ENRICH_FRESH_DAYS` (default 7) and has extracted facts. The daily monitor
  keeps shortlisted courses current.
- **In-flight dedup**: `enrichment_items` has a partial unique index on `program_id` where
  `status = 'running'`. A second job that needs the same course waits (item status `waiting`)
  and then reuses the result.

## Gemini extractor

- Extract an `Extractor` protocol from `worker/src/uniguide_worker/extract/extractor.py`:
  `extract(url, cycle_label, page_text) -> ExtractionRun`.
- Add `GeminiExtractor` using the `google-genai` SDK with `PageExtraction` as the response
  schema. Settings: `EXTRACTOR=gemini|anthropic` (default `gemini`), `GEMINI_API_KEY`,
  `GEMINI_MODEL`.
- The validators in `validate/quotes.py` and `validate/checks.py` run unchanged. An
  extraction whose quotes are not found verbatim on the page is dropped.
- Free-tier rate limits are absorbed by the queue: the worker handles one item at a time and
  backs off on 429 instead of failing the item.

## Gemini candidate fallback

Used only when the register-backed catalog yields fewer than 10 fits.

- Gemini receives the profile and returns up to N candidates: institution name, programme
  title, official URL.
- A candidate is accepted only if the URL host matches the institution's official domain
  (from ROR where known, otherwise the institution's recorded domain). Others are discarded.
- Accepted candidates become `institutions` / `programs` rows at the "Extracted" coverage tier
  and go through the normal extraction. Gemini supplies no fact beyond the identity of the course.

## Data model (new migration)

- `enrichment_jobs`: `id`, `user_id`, `status` (`queued|running|done|failed`), `stage`,
  `error`, `created_at`, `started_at`, `finished_at`.
- `enrichment_items`: `id`, `job_id`, `program_id`, `status`
  (`pending|waiting|running|extracted|skipped_fresh|failed`), `detail`, timestamps.
- RLS: a student can select only their own job and its items. Inserts go through
  `start_enrichment()` (security definer, rate-limited). Updates are limited to the worker role.
- Regenerate types with `pnpm db:types`; pgTAP tests cover RLS and the rate limit.

## Web

- `app/app/matching/` (new): progress page reading the job, stage animation tied to
  `jobs.stage`, per-course cards from `enrichment_items`, link to `/app/match` when done.
- Onboarding completion calls `startEnrichment()`.
- Accessible: stage list uses `aria-live="polite"`, animation respects `prefers-reduced-motion`.

## Deployment

- `worker/Dockerfile` and a short section in `docs/SETUP.md` for Fly.io / Railway / Render.
- Env: `WORKER_DATABASE_URL`, `GEMINI_API_KEY`, `CRAWLER_CONTACT`.

## Out of scope

- Pre-loading the whole catalog or bulk crawling.
- Auto-promoting facts to "Verified" (stays with human review).
- Rule-based per-university parsers (possible later, behind the same interface).
- Hochschulkompass import (waits for an HRK export).

## Testing

- Worker: pytest with a fake extractor and fixture pages, covering freshness skip, in-flight
  dedup, 429 backoff, and fallback host-matching accept/reject.
- Extraction eval: run the existing labelled-page fixtures in `worker/evals` against
  `GeminiExtractor` (marked `live`) and compare with the Anthropic baseline before making it
  the default.
- DB: pgTAP for RLS and the rate limit.
- Web: unit test for stage mapping; Playwright for the progress flow against a stubbed worker.
