# Curated index crawl Implementation Plan

> **For agentic workers:** executed natively, task by task, TDD.

**Goal:** Crawl curated US university course-index pages into the catalog; keep long-tail Gemini suggestions hidden until approved.
**Spec:** `docs/superpowers/specs/2026-10-29-curated-index-crawl-design.md`
**Stack:** Postgres (RLS, pgTAP), Python (worker), Next.js (admin page).

## Global Constraints

- Index with no `verified_by` is inactive. Course URL host must match the institution's recorded domain. Quote must be found on the page.
- Suggested courses: `published = false`, `suggestion_status = 'pending'`.

## Tasks

1. **Schema** (`supabase/migrations/20261202000002_index_crawl.sql`, `supabase/tests/database/390_index_crawl.test.sql`): table `institution_indexes` (RLS: admins read, worker all); `programs.suggestion_status text check in ('pending','approved','rejected')`; admin read policy on unpublished programs; RPC `review_suggested_course(p_program uuid, p_approve boolean)` (admin only, sets published/status). Update generated types.
2. **Seeds and loader** (`worker/src/uniguide_worker/index/seed.py`, `data/seed/indexes/us/*.yaml` x30, CLI `index load`): pydantic `IndexSeed`; tests: every shipped file valid, 30 US files, unverified loads inactive, verified loads active, load is idempotent.
3. **Crawl** (`index/lister.py`, `index/crawl.py`, CLI `index crawl`, scheduled workflow job): `GeminiCourseLister.list_courses(url, text) -> CourseListRun`; `crawl_index(conn, fetcher, lister, index_row) -> IndexReport`. Tests with recorded pages: accepted, quote missing, wrong host, bad level, unchanged hash skipped, duplicate title.
4. **Reviewed long tail** (`enrich/candidates.py`, `apps/web/app/app/matching/actions.ts`): fallback creates `published=false, suggestion_status='pending'`; student progress card shows "Suggested course, being checked by our team" when the program is hidden.
5. **Admin screen** (`apps/web/app/admin/suggested`): list pending suggestions, approve/reject via the RPC; link in the admin area; Playwright test written.
6. **Docs**: `docs/DATA_SOURCES.md`, `docs/SETUP.md`, `BACKLOG.md`.
