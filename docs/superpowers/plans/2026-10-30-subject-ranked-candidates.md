# Subject-aware, QS-ordered candidate pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the course pool a student's matches are ranked from subject-filtered and ordered by QS subject rank, instead of the first 200 courses by university name.

**Architecture:** A new `institution_rankings` table is filled by a worker importer that reads the QS workbook. `search_programs` gets an optional `p_rank_subjects` argument that adds rank to its ordering. The web app maps the student's fields to QS subjects and passes both fields and subjects to the query. `packages/matching` is untouched.

**Tech Stack:** Postgres/Supabase migrations and pgTAP, Python 3.13 worker (typer, psycopg, pytest, stdlib `zipfile`/`xml.etree`), Next.js/TypeScript with vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-subject-ranked-candidates-design.md`

## Global Constraints

- No new dependencies in the worker or the web app (read the xlsx with `zipfile` and `xml.etree`).
- The QS workbook is never committed; only code, the aliases file and subject names are.
- QS data is never shown in the UI; no web query selects `institution_rankings` directly.
- `coverage_tier desc` stays the first ordering key in `search_programs`; with `p_rank_subjects` null the order is exactly today's.
- The function's `limit least(greatest(p_limit, 1), 200)` is unchanged.
- Never run `pnpm db:reset` (it erases the imported US, AU, UK and NL data). Apply migrations with `pnpm exec supabase migration up --local`.
- Migrations: `20270101000002_institution_rankings.sql` then `20270101000003_search_programs_ranking.sql`.
- Worker imports run as the `ingest_worker` role; the web query runs as the student.

## Review Focus

- A student with no fields chosen: the query must not filter or reorder (Tasks 2 and 5).
- A field code with no mapping (for example `99`): treated as no ranking, not an error (Task 5).
- Rank text other than plain numbers or `N-N` (`=7`, `501+`): parsed, not crashed on (Task 3).
- Two QS rows that match one institution in the same subject, or a QS name that matches two institutions: keep the better rank, and skip and report the ambiguous name instead of guessing (Task 4).
- Re-importing the same edition twice, or a second edition: no duplicate rows, and other editions are kept (Task 4).

---

### Task 1: `institution_rankings` table

**Files:**
- Create: `supabase/migrations/20270101000002_institution_rankings.sql`
- Test: `supabase/tests/database/410_institution_rankings.test.sql`

**Interfaces:**
- Produces: table `public.institution_rankings(id, institution_id, subject, rank_low, rank_high, edition, source_id)` with unique `(institution_id, subject, edition)`.

- [ ] **Step 1: Write the pgTAP test** following `390_index_crawl.test.sql` (`begin; \ir _helpers.psql; select no_plan();`). Assertions: `tests.as_worker()` can insert and delete a row; a second insert of the same `(institution_id, subject, edition)` throws `23505`; `rank_high < rank_low` throws check violation `23514`; after `reset role; tests.authenticate_as(student)` a `select count(*)` sees the row; an `insert` as that student throws `42501`; `tests.as_anon()` can also read.
- [ ] **Step 2: Run it and see it fail.** `pnpm exec supabase migration up --local` then `pnpm db:test` filtered to the new file (`pnpm exec supabase test db supabase/tests/database/410_institution_rankings.test.sql`). Expected: fail, relation does not exist.
- [ ] **Step 3: Write the migration.** Table per spec section 1, with `check (rank_low >= 1 and rank_high >= rank_low)`, `institution_id` cascade, index on `(institution_id, subject)`. RLS enabled; `"public read"` select policy for `anon, authenticated`; grant `select, insert, update, delete` to `ingest_worker` with a `"worker"` all policy (pattern of `20261028000008_worker_role.sql`); the `analyst`/`notifier` roles get nothing.
- [ ] **Step 4: Apply and re-run the test.** Expected: all assertions pass.
- [ ] **Step 5: Commit** `feat(db): institution_rankings table`.

---

### Task 2: `search_programs` orders by rank

**Files:**
- Create: `supabase/migrations/20270101000003_search_programs_ranking.sql`
- Test: `supabase/tests/database/420_search_programs_ranking.test.sql`
- Modify (generated): `packages/db-types/src/database.types.ts`, `worker/src/uniguide_worker/db_enums.py` via `pnpm db:types`

**Interfaces:**
- Consumes: Task 1 table.
- Produces: `search_programs(..., p_rank_subjects text[] default null)`, same return type `setof program_cards`. Ordering with it set: `coverage_tier desc, best_rank asc nulls last, institution_name, title`, where `best_rank = min(rank_low)` of the course's institution over `p_rank_subjects`.

- [ ] **Step 1: Write the pgTAP test.** Build four published master's programs with `isced_f` `0613` at institutions named so that name order differs from rank order (`A Unranked U`, `B Rank 50 U`, `C Rank 3 U`, `D Rank 9 in other subject U`), plus one `07` course. Rows in `institution_rankings`: Rank 50 U has `Computer Science` rank 50; Rank 3 U has `Data Science and Artificial Intelligence` rank 3; the D institution has only `Law` rank 9. Assertions with `results_eq` on institution names from `search_programs(p_fields => '{06}', p_rank_subjects => '{"Computer Science & Information Systems","Data Science and Artificial Intelligence"}')`: order is `C Rank 3 U, B Rank 50 U, A Unranked U, D Rank 9 in other subject U` (the `07` course is absent); with `p_rank_subjects` null the order is `A, B, C, D` (by name); a program with higher `coverage_tier` but no rank still comes before a lower-tier ranked one; a subject list that no institution has gives name order.
- [ ] **Step 2: Run it and see it fail** (unknown argument).
- [ ] **Step 3: Write the migration.** `drop function public.search_programs(text, public.program_level[], text[], text[], public.delivery_mode[], integer, integer, boolean, numeric, char)` then recreate with the existing body plus `p_rank_subjects text[] default null`. Order clause:

```sql
order by c.coverage_tier desc,
         case when p_rank_subjects is null or cardinality(p_rank_subjects) = 0 then null else (
           select min(r.rank_low) from public.institution_rankings r
           where r.institution_id = c.institution_id and r.subject = any (p_rank_subjects)) end nulls last,
         c.institution_name, c.title
```

- [ ] **Step 4: Apply, run the new test and `230_search_filters.test.sql`.** Expected: both pass (old callers unchanged).
- [ ] **Step 5: Regenerate types** with `pnpm db:types`; `git diff` shows only the new argument. Run `pnpm typecheck`.
- [ ] **Step 6: Commit** `feat(db): order search_programs by subject rank`.

---

### Task 3: QS workbook parser

**Files:**
- Create: `worker/src/uniguide_worker/importers/qs_rankings.py` (parser half), `worker/tests/qs_workbook.py` (fixture builder)
- Test: `worker/tests/test_qs_rankings_parse.py`

**Interfaces:**
- Produces:
  - `parse_rank(text: str) -> tuple[int, int]`
  - `normalize_name(name: str) -> str`
  - `COUNTRY_ISO: dict[str, str]` (QS country name to ISO code for the destination countries US, GB, CA, AU, DE, IE, NL, FR, NZ, SG, JP, KR, AE, QA)
  - `@dataclass(frozen=True) RankedRow(institution: str, country: str, rank_low: int, rank_high: int)`
  - `@dataclass(frozen=True) SubjectSheet(subject: str, rows: list[RankedRow])`
  - `@dataclass(frozen=True) Workbook(edition: str, sheets: list[SubjectSheet])`
  - `read_workbook(path: str) -> Workbook`
- `tests/qs_workbook.py` produces `write_workbook(path, sheets: dict[str, tuple[str, list[list[str]]]]) -> None` building a minimal xlsx (shared strings, `Index` and `methodology` sheets first) so tests need no real QS data.

- [ ] **Step 1: Write the failing tests** in `test_qs_rankings_parse.py`: `parse_rank("7") == (7, 7)`, `("751-850") == (751, 850)`, `("=7") == (7, 7)`, `("501+") == (501, 501)`, `("") ` raises `ValueError`; `normalize_name("Massachusetts Institute of Technology (MIT)") == normalize_name("Massachusetts Institute of Technology")`; accents (`"Universität Potsdam"` equals `"Universitat Potsdam"`); `"Georgia Institute of Technology-Main Campus"` equals `"Georgia Institute of Technology"`; `"The University of Newcastle, Australia (UON)"` normalises without the bracket text. `read_workbook` on a built fixture: edition `"2026"` from the title cell, subject name taken from the second row (not the truncated tab name), a band row, an unknown-country row dropped, `Index`/`methodology` ignored.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement the parser.** Approach: parse `xl/workbook.xml` for sheet order, resolve the sheet part through `xl/_rels/workbook.xml.rels`, read shared strings, rows as lists of cell strings; data starts after the header row that contains `INSTITUTION`. Use the column positions of the `INSTITUTION` and `COUNTRY/TERRITORY` header cells and the first column for the rank. Before coding `COUNTRY_ISO`, print the workbook's distinct country names (`python -c` over `read_workbook` once the reader works) and use those exact spellings.
- [ ] **Step 4: Run tests, `ruff check`, `mypy src`.** Expected: pass.
- [ ] **Step 5: Commit** `feat(worker): read the QS subject rankings workbook`.

---

### Task 4: Import into `institution_rankings`

**Files:**
- Modify: `worker/src/uniguide_worker/importers/qs_rankings.py`, `worker/src/uniguide_worker/cli.py`
- Create: `data/seed/rankings/aliases.yaml` (starts as `{}` with a header comment), `worker/tests/test_qs_rankings_import.py`

**Interfaces:**
- Consumes: Task 3 parser; `register_source` and `ImportStats` from `importers/base.py`.
- Produces:
  - `run(conn: Connection, *, file: str, aliases_file: str | None = None) -> ImportStats`. `stats.institutions` counts matched institutions, `stats.programs` counts rank rows written, `stats.skipped` counts unmatched QS institutions, `stats.notes` lists unmatched institutions ranked 200 or better (`"<name> (<country>) best rank <n>"`) and ambiguous names.
  - CLI `uniguide-worker import qs-rankings --file PATH [--aliases PATH]` (default aliases file `data/seed/rankings/aliases.yaml`).

- [ ] **Step 1: Write the failing DB tests** using the `worker` fixture (rolled back) and `write_workbook`: matched institution gets rows for each of its subjects with the right `rank_low/high` and `edition`; matching is within country (same name in another country is not touched); an alias entry matches a name the normaliser misses; a QS name matching two institutions is skipped and noted, not written; two QS rows resolving to one institution in one subject keep the lower `rank_low`; running twice leaves the same row count; a run for edition `2027` leaves edition `2026` rows alone and replaces only `2027`; unmatched rank-200-or-better names appear in `notes`, worse ones do not.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement `run`.** Load institutions for the countries in the workbook once into `{(country, normalize_name(name)): [ids]}`; resolve each QS row by alias first, then normalised name; delete the edition's rows then insert in one transaction; `register_source(conn, url="https://www.topuniversities.com/subject-rankings", owner="QS Quacquarelli Symonds", rights_note="Used only to order courses; not displayed or redistributed.", content_hash=sha256 of the file)`. Wire the CLI command beside `import_uk_discover_uni`, using `_with_run("import:qs_rankings", ...)`.
- [ ] **Step 4: Run all worker tests, ruff, mypy.** Expected: pass.
- [ ] **Step 5: Commit** `feat(worker): import QS subject rankings`.

---

### Task 5: Field to QS subject mapping and query parameters

**Files:**
- Create: `apps/web/lib/qs-subjects.ts`, `apps/web/lib/ranking-subjects.ts`
- Test: `apps/web/lib/ranking-subjects.test.ts`

**Interfaces:**
- Produces:
  - `QS_SUBJECTS_2026: readonly string[]` — the full subject names from the workbook, names only.
  - `FIELD_TO_QS_SUBJECTS: Record<string, readonly string[]>` — the spec's table for fields `01` to `10`.
  - `rankingSubjects(fields: string[]): string[]` — merged, de-duplicated; unknown codes ignored.
  - `candidateFilters(p: { target_levels: string[]; target_countries: string[]; target_fields: string[] }): { p_levels; p_countries; p_fields; p_rank_subjects }` where `p_fields` and `p_rank_subjects` are `undefined` when empty.

- [ ] **Step 1: Write the failing tests:** each of `"01"`..`"10"` maps to at least one subject; every mapped subject is in `QS_SUBJECTS_2026`; `rankingSubjects(["06"])` equals the two ICT subjects; `rankingSubjects(["03","04"])` has `Economics & Econometrics` once; `rankingSubjects(["99"])` is `[]`; `candidateFilters` with no fields returns `p_fields` and `p_rank_subjects` both `undefined`; with `["06"]` returns `p_fields: ["06"]` and the two subjects; an unknown field `["99"]` gives `p_fields: ["99"]` and `p_rank_subjects: undefined`.
- [ ] **Step 2: Run `pnpm --filter web exec vitest run lib/ranking-subjects.test.ts`** and see it fail.
- [ ] **Step 3: Implement.** Fill `QS_SUBJECTS_2026` from the `Task 3` reader (`python -c` printing `sheet.subject` for all sheets) and the mapping from the spec table, using exactly those spellings.
- [ ] **Step 4: Run the test, `pnpm --filter web lint` and `typecheck`.** Expected: pass.
- [ ] **Step 5: Commit** `feat(web): map fields to QS subjects`.

---

### Task 6: Use the filters when loading match inputs

**Files:**
- Modify: `apps/web/lib/match-data.ts:19-24`
- Test: `apps/web/lib/match-data.test.ts` (new, if no test file exists for this module)

**Interfaces:**
- Consumes: `candidateFilters` from Task 5; the regenerated `search_programs` types from Task 2.

- [ ] **Step 1: Write the failing test.** With a fake supabase client whose `from("profiles")...single()` returns a profile with `target_fields: ["07"]` and whose `rpc` records its arguments, `loadMatchInputs(fake, "u1")` calls `rpc("search_programs", ...)` with `p_fields: ["07"]` and a `p_rank_subjects` containing `Engineering & Technology`, `p_limit: 200`; with `target_fields: []` neither key is set.
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Replace the inline arguments** in the `search_programs` call with `{ ...candidateFilters(profile), p_limit: 200 }`.
- [ ] **Step 4: Run `pnpm --filter web test`, lint, typecheck.** Expected: all pass.
- [ ] **Step 5: Commit** `feat(web): rank the match pool by subject`.

---

### Task 7: Load the real data, tune aliases, check the result, update docs

**Files:**
- Modify: `data/seed/rankings/aliases.yaml`, `docs/DATA_SOURCES.md`, `docs/DEMO_LOCAL.md`, `docs/superpowers/specs/2026-10-30-subject-ranked-candidates-design.md` (test section: the e2e line becomes the SQL check below, because CI seed data has six placeholder courses and cannot show ranking)

- [ ] **Step 1: Apply migrations to the running local database** with `pnpm exec supabase migration up --local` (no reset).
- [ ] **Step 2: Import your workbook:** `uv run uniguide-worker import qs-rankings --file "$HOME/Downloads/QS World University Rankings by Subject 2026 - Public Results v1.4 (qs.com)_7.xlsx"` from `worker/`. Expected: a JSON report; `select count(*), count(distinct subject) from institution_rankings` shows many rows and the same number of subjects as `QS_SUBJECTS_2026`.
- [ ] **Step 3: Add aliases** for the unmatched top-200 institutions in the report (US, GB, AU); re-run the import; the unmatched list for rank 200 or better shrinks. Stop when the remaining ones are institutions we hold no courses for.
- [ ] **Step 4: Check the pool.** As the demo student's parameters (US, master, field 07), run in `psql` via `docker exec supabase_db_uniguide psql -U postgres`: `select institution_name, title, isced_f from search_programs(p_levels => '{master}', p_countries => '{US}', p_fields => '{07}', p_rank_subjects => '{"Engineering & Technology"}', p_limit => 30)`. Expected: every `isced_f` starts with `07`, and the first universities are QS-ranked ones (MIT, Stanford and similar), not alphabetical.
- [ ] **Step 5: Check it in the app.** Sign in as the student with US, master's, Engineering; the matches page shows only engineering courses at recognisable universities. Report what you see.
- [ ] **Step 6: Docs.** Amend the line in `docs/DATA_SOURCES.md` that bans ranking sites to say QS subject rankings are loaded from a downloaded workbook and used only to order courses, never displayed, and need a QS licence beyond a demo; add the import command to `docs/DEMO_LOCAL.md` step 4.
- [ ] **Step 7: Run everything:** `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm db:test`, and in `worker/` `uv run pytest`, `ruff check`, `mypy src`. Expected: all pass.
- [ ] **Step 8: Commit** `docs: QS ordering signal and import`.
