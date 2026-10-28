# Developer A, Milestone 1: Launch readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get 50 real, hand-verified courses into a hosted database safely, unblock Developer B with stable contracts, and make local e2e runs fail clearly instead of mysteriously.

**Architecture:** The seed loader (`worker/src/uniguide_worker/seed/`) gains file-level quality gates (official sources, a second look on critical facts) and a status report, and placeholder files move to their own folder so a hosted load can run. Two `SECURITY DEFINER` SQL functions ship as stubs with their final signatures for B. The remaining rows (X1, X2, X4) are operational checklists that use the new tooling.

**Tech Stack:** Python 3.13 with uv, typer, jsonschema, pytest, ruff, mypy; Postgres via Supabase with pgTAP; Playwright.

**Spec:** `docs/FEATURES.md` (rows X1 to X5) and `docs/superpowers/plans/2026-10-28-developer-a-roadmap.md` (Milestone 1). The verification protocol is in `data/seed/README.md`.

## Global Constraints

- Sources: only official pages (university or government). Never the domains in `BLOCKED_DOMAINS` (`worker/src/uniguide_worker/fetch/fetcher.py`).
- Critical facts (deadlines, entry qualification and language test requirements, tuition) need a second look before loading (`data/seed/README.md`, protocol step 6).
- Re-check any deadline not verified in the last 30 days (`data/seed/README.md`).
- Placeholder courses never load into a hosted database.
- Every new SQL function or table: RLS where it applies, explicit grants, a pgTAP test. Migrations start with `202611`.
- After any migration: `pnpm db:types`, and commit the regenerated `packages/db-types/src/database.types.ts` and `worker/src/uniguide_worker/db_enums.py`.
- Worker checks before each commit: `uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest` (run in `worker/`).
- Commit messages are plain sentences in the repository's style, with **no** `Co-Authored-By: Claude` line (the owner's rule for this project).

## Review Focus

1. **A real course file accidentally marked `placeholder: true`, or a placeholder left in the real folder.** A hosted load must refuse. Pinned in Task 1 (`test_real_folder_rejects_placeholder_files`).
2. **A source on a university's second domain** (for example fees on `finance.uni.ac.uk` when `official_domain` is `uni.ac.uk`). Subdomains must pass, and other official domains must be declarable. Pinned in Task 2 (`test_subdomains_and_declared_domains_pass`).
3. **One person doing both checks on the same day.** That is not a second look. The same person on a later date is acceptable for a solo verifier. Pinned in Task 3 (`test_same_person_same_day_is_not_a_second_look`).
4. **A deadline verified exactly 30 days ago.** It is still fresh; 31 days is stale. Pinned in Task 4 (`test_stale_boundary_is_thirty_days`).
5. **A running dev server with `AUTH_DISABLED=true` reused by Playwright.** Tests must stop with a message saying so, not time out. Pinned in Task 6, Step 3.

---

### Task 1: Separate placeholder files from real seed files

Today the six placeholders sit in `data/seed/courses/`, and `check_placeholders(hosted=True)` refuses the whole folder, so no real course can ever load into a hosted database while they are there.

**Files:**
- Move: `data/seed/courses/<cc>/*.yaml` (all six placeholder files) to `data/seed/placeholders/<cc>/` with `git mv`
- Create: `data/seed/courses/.gitkeep`
- Modify: `worker/src/uniguide_worker/seed/loader.py` (constants, `read_seed_files`, `load`)
- Modify: `worker/src/uniguide_worker/cli.py:225-262` (`seed load`, `seed check`)
- Modify: `data/seed/README.md` (folder layout)
- Test: `worker/tests/test_seed.py`

**Interfaces:**
- Produces: `SEED_ROOT: Path` (`REPO_ROOT / "data" / "seed" / "courses"`) and `PLACEHOLDER_ROOT: Path` (`REPO_ROOT / "data" / "seed" / "placeholders"`) in `loader.py`; `read_seed_files(*roots: Path) -> list[tuple[Path, dict[str, Any]]]`; `load(conn: Connection, roots: Sequence[Path], *, hosted: bool, publish_placeholders: bool = False) -> SeedReport`.

- [ ] **Step 1: Write the failing tests**

In `worker/tests/test_seed.py`, replace `SEEDS` with imports of `SEED_ROOT` and `PLACEHOLDER_ROOT`, point the three existing placeholder tests at `PLACEHOLDER_ROOT`, and add:

```python
def test_real_folder_rejects_placeholder_files(tmp_path: Path) -> None:
    shutil.copy(next(PLACEHOLDER_ROOT.rglob("*.yaml")), tmp_path / "x.yaml")
    with pytest.raises(SeedError, match="placeholder"):
        check_placeholders(read_seed_files(tmp_path), hosted=True)


def test_repository_real_folder_holds_no_placeholders() -> None:
    check_placeholders(read_seed_files(SEED_ROOT), hosted=True)


def test_read_seed_files_reads_several_roots() -> None:
    assert len(read_seed_files(SEED_ROOT, PLACEHOLDER_ROOT)) == len(read_seed_files(PLACEHOLDER_ROOT)) + len(read_seed_files(SEED_ROOT))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd worker && uv run pytest tests/test_seed.py -v`
Expected: FAIL with `ImportError: cannot import name 'SEED_ROOT'`

- [ ] **Step 3: Implement**

`git mv` the six files. In `loader.py`, add the two constants, make `read_seed_files` take `*roots` and read each root in order, and make `load` take `roots`. In `cli.py`, `seed load` drops its `--root` option and passes `[SEED_ROOT, PLACEHOLDER_ROOT]` when `--publish-placeholders` is set, otherwise `[SEED_ROOT]`. `seed check` validates both roots and always runs `check_placeholders(read_seed_files(SEED_ROOT), hosted=True)`; its `--hosted` flag skips the placeholder root. Update the `seed load` docstring and `data/seed/README.md` (placeholders now live in `data/seed/placeholders/`; without `--publish-placeholders` a local load reads only real files).

- [ ] **Step 4: Run the tests and the CLI**

Run: `uv run pytest tests/test_seed.py -v && uv run uniguide-worker seed check`
Expected: all pass; CLI prints `6 seed files valid (6 placeholders)`.

Run: `uv run uniguide-worker seed load --publish-placeholders` against the local stack, then open `http://localhost:3000/courses`
Expected: the same six placeholder courses are listed (CI's e2e step uses this command unchanged).

- [ ] **Step 5: Commit**

```bash
git add -A data/seed worker/src/uniguide_worker/seed/loader.py worker/src/uniguide_worker/cli.py worker/tests/test_seed.py
git commit -m "Move placeholder seed files to their own folder so real courses can load into a hosted database"
```

### Task 2: Reject non-official sources in real seed files

**Files:**
- Modify: `worker/src/uniguide_worker/seed/schema.json` (institution: add `extra_official_domains`)
- Modify: `worker/src/uniguide_worker/seed/loader.py`
- Modify: `worker/src/uniguide_worker/cli.py` (`seed check` calls it)
- Test: `worker/tests/test_seed.py`

**Interfaces:**
- Consumes: `is_blocked(url: str) -> bool` from `uniguide_worker.fetch.fetcher`.
- Produces: `check_sources(docs: list[tuple[Path, dict[str, Any]]]) -> None`, raising `SeedError` that names every offending file and URL. Skips docs with `placeholder: true`. `load` calls it after `check_placeholders`.

- [ ] **Step 1: Write the failing tests**

Add a helper `_doc(official_domain: str | None, url: str, extra: list[str] | None = None) -> tuple[Path, dict]` that builds a one-fact real document, then:

```python
def test_blocked_aggregator_sources_are_rejected() -> None:
    with pytest.raises(SeedError, match="yocket.com"):
        check_sources([_doc("uni.ac.uk", "https://yocket.com/uni/msc")])

def test_sources_off_the_official_domain_are_rejected() -> None:
    with pytest.raises(SeedError, match="not an official domain"):
        check_sources([_doc("uni.ac.uk", "https://other.edu/msc")])

def test_real_files_need_an_official_domain() -> None:
    with pytest.raises(SeedError, match="official_domain"):
        check_sources([_doc(None, "https://uni.ac.uk/msc")])

def test_subdomains_and_declared_domains_pass() -> None:
    check_sources([_doc("uni.ac.uk", "https://finance.uni.ac.uk/fees")])
    check_sources([_doc("uni.ac.uk", "https://www.gov.uk/student-visa", extra=["gov.uk"])])

def test_lookalike_domains_do_not_pass() -> None:
    with pytest.raises(SeedError):
        check_sources([_doc("uni.ac.uk", "https://fakeuni.ac.uk/msc")])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/test_seed.py -k sources -v`
Expected: FAIL with `ImportError: cannot import name 'check_sources'`

- [ ] **Step 3: Implement `check_sources` in `loader.py`**

A host passes when it equals an allowed domain or ends with `"." + domain`, where the allowed set is `official_domain` plus `extra_official_domains` (an array of strings in the schema). Blocked hosts fail even when declared. Collect every problem and raise once.

- [ ] **Step 4: Run the tests**

Run: `uv run pytest tests/test_seed.py -v && uv run uniguide-worker seed check`
Expected: PASS; placeholders are skipped, so the CLI output is unchanged.

- [ ] **Step 5: Commit**

```bash
git add worker/src/uniguide_worker/seed worker/src/uniguide_worker/cli.py worker/tests/test_seed.py
git commit -m "Reject seed facts whose source is an aggregator or outside the institution's official domains"
```

### Task 3: Require a second look on critical facts

**Files:**
- Modify: `worker/src/uniguide_worker/seed/schema.json` (fact: optional `second_checked_by` string, `second_checked_at` date)
- Modify: `worker/src/uniguide_worker/seed/loader.py`, `worker/src/uniguide_worker/cli.py`
- Modify: `data/seed/README.md` (protocol step 6 names the two fields and the rule)
- Test: `worker/tests/test_seed.py`

**Interfaces:**
- Produces: `is_critical(fact: dict[str, Any]) -> bool` and `check_second_look(docs: list[tuple[Path, dict[str, Any]]]) -> None`. Critical means `subject == "deadline"`, or `subject == "requirement"` with `fields.kind` in `{"entry_qualification", "language_test"}`, or `subject == "cost_item"` with `fields.kind == "tuition"`. Skips placeholder docs. `load` and `seed check` call it.

- [ ] **Step 1: Write the failing tests**

```python
def test_critical_fact_without_second_look_is_rejected() -> None:
    with pytest.raises(SeedError, match="second look"):
        check_second_look([_fact_doc("deadline", {"date": "2027-01-15"}, second=None)])

def test_second_look_by_another_person_passes() -> None:
    check_second_look([_fact_doc("deadline", {"date": "2027-01-15"}, second=("Asha", "2026-11-02"))])

def test_same_person_same_day_is_not_a_second_look() -> None:
    with pytest.raises(SeedError, match="second look"):
        check_second_look([_fact_doc("deadline", {"date": "2027-01-15"}, verified=("Harman", "2026-11-02"), second=("Harman", "2026-11-02"))])

def test_same_person_on_a_later_day_passes() -> None:
    check_second_look([_fact_doc("deadline", {"date": "2027-01-15"}, verified=("Harman", "2026-11-02"), second=("Harman", "2026-11-03"))])

def test_non_critical_facts_need_no_second_look() -> None:
    check_second_look([_fact_doc("cost_item", {"kind": "living"}, second=None)])
```

`_fact_doc(subject, fields, verified=("Harman", "2026-11-02"), second=...)` builds a one-fact real document.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/test_seed.py -k second -v`
Expected: FAIL with `ImportError: cannot import name 'check_second_look'`

- [ ] **Step 3: Implement**

A second look passes when `second_checked_by` and `second_checked_at` are both present and either the person differs from `verified_by` or `second_checked_at` is later than `verified_at`.

- [ ] **Step 4: Run the tests**

Run: `uv run pytest tests/test_seed.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add worker/src/uniguide_worker/seed worker/src/uniguide_worker/cli.py worker/tests/test_seed.py data/seed/README.md
git commit -m "Require a second look on deadlines, entry and language requirements and tuition before loading"
```

### Task 4: `seed status`: coverage and stale deadlines

**Files:**
- Create: `worker/src/uniguide_worker/seed/status.py`
- Modify: `worker/src/uniguide_worker/cli.py` (new `seed status` command)
- Test: `worker/tests/test_seed_status.py`

**Interfaces:**
- Produces: `@dataclass(frozen=True) class StaleFact: path: Path; slug: str; cycle: str; verified_at: date`; `@dataclass(frozen=True) class SeedStatus: total: int; target: int; by_country: dict[str, int]; stale: list[StaleFact]`; `seed_status(docs: list[tuple[Path, dict[str, Any]]], today: date, *, stale_days: int = 30, target: int = 50) -> SeedStatus`. Counts real docs only. A deadline is stale when `(today - verified_at).days > stale_days`; use `second_checked_at` instead when it is later.

- [ ] **Step 1: Write the failing tests**

```python
def test_counts_real_courses_by_country() -> None:
    s = seed_status([_course("GB"), _course("GB"), _course("US"), _placeholder("DE")], date(2026, 11, 2))
    assert (s.total, s.by_country, s.target) == (3, {"GB": 2, "US": 1}, 50)

def test_stale_boundary_is_thirty_days() -> None:
    fresh = _course("GB", deadline_verified="2026-10-03")
    stale = _course("US", deadline_verified="2026-10-02")
    assert [f.slug for f in seed_status([fresh, stale], date(2026, 11, 2)).stale] == [stale[1]["program"]["slug"]]

def test_later_second_look_refreshes_a_deadline() -> None:
    doc = _course("GB", deadline_verified="2026-09-01", second_checked="2026-10-20")
    assert seed_status([doc], date(2026, 11, 2)).stale == []
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/test_seed_status.py -v`
Expected: FAIL with `ModuleNotFoundError: uniguide_worker.seed.status`

- [ ] **Step 3: Implement `seed_status` and the CLI command**

`uniguide-worker seed status [--stale-days 30]` reads `SEED_ROOT`, calls `seed_status` with `date.today()` and prints `Real courses: 12 of 50`, one line per country sorted by code, then each stale deadline as `path · slug · cycle · verified 2026-10-02`. Exit code 0 even when stale (it is a report).

- [ ] **Step 4: Run the tests and the command**

Run: `uv run pytest tests/test_seed_status.py -v && uv run uniguide-worker seed status`
Expected: PASS; the command prints `Real courses: 0 of 50` and no stale facts.

- [ ] **Step 5: Commit**

```bash
git add worker/src/uniguide_worker/seed/status.py worker/src/uniguide_worker/cli.py worker/tests/test_seed_status.py
git commit -m "Add seed status: real course coverage by country and deadlines due for re-checking"
```

### Task 5: Contracts for Developer B: entitlement and fee waivers

Ship the final signatures now with stub bodies, so B builds the paywall (X10) and the card badge (3.3) against real types. M2 and M4 replace the bodies only.

**Files:**
- Create: `supabase/migrations/20261101000001_contracts_for_web.sql`
- Create: `supabase/tests/database/130_contracts.test.sql`
- Modify (generated): `packages/db-types/src/database.types.ts`
- Modify: `docs/FEATURES.md` ("Where the two tracks touch": say the contracts exist and name them)

**Interfaces:**
- Produces:
  - `public.my_entitlement() returns text`: `'none'` for anon, `'free'` for any signed-in user. Later value `'season_pass'`. `stable security definer set search_path = ''`. Execute granted to `anon, authenticated`.
  - `public.course_fee_waivers(p_program uuid) returns table (kind text, amount numeric, currency char(3), conditions text, source_url text, status public.fact_status, verified_at timestamptz)`: returns no rows for now. `kind` values later: `'automatic'`, `'event'`, `'need_based'`, `'on_request'`; `amount` null means the full fee is waived. Execute granted to `anon, authenticated`.

- [ ] **Step 1: Write the failing pgTAP test**

```sql
select tests.create_user('payer@test.dev') as payer \gset
select tests.as_anon();
select is(public.my_entitlement(), 'none', 'anonymous visitors have no entitlement');
select tests.authenticate_as(:'payer');
select is(public.my_entitlement(), 'free', 'signed-in users are free until payments ship');
select is_empty($$ select * from public.course_fee_waivers(gen_random_uuid()) $$, 'no fee waivers until M2');
select has_function('public', 'course_fee_waivers', array['uuid'], 'the signature B builds against exists');
```

Wrap in `begin; \ir _helpers.psql select no_plan(); ... select * from finish(); rollback;` like the other test files.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm db:test`
Expected: `130_contracts.test.sql` fails with `function public.my_entitlement() does not exist`

- [ ] **Step 3: Write the migration, apply, regenerate types**

Comment each function with "Contract for apps/web; the body changes in M4 (payments) / M2 (fee waivers), the signature does not."

Run: `pnpm exec supabase migration up && pnpm db:types`

- [ ] **Step 4: Run the tests**

Run: `pnpm db:test && pnpm -r typecheck`
Expected: all database tests pass (191 before plus the new ones); typecheck passes.

- [ ] **Step 5: Commit, then tell Developer B**

```bash
git add supabase/migrations/20261101000001_contracts_for_web.sql supabase/tests/database/130_contracts.test.sql packages/db-types worker/src/uniguide_worker/db_enums.py docs/FEATURES.md
git commit -m "Add the entitlement and fee waiver functions B builds against, as stubs"
```

### Task 6 (X5): Make local e2e runs refuse a sign-in-disabled server

**Files:**
- Modify: `apps/web/playwright.config.ts` (webServer `env`)
- Modify: `apps/web/e2e/helpers.ts` (`signIn`)
- Modify: `docs/FEATURES.md` (X5 row: CI already runs with real sign-in; local guard added)

**Interfaces:**
- Produces: `signIn(browser, email)` keeps its signature; it throws `Error("Sign-in is switched off: the dev server has AUTH_DISABLED=true. Stop it and rerun, or set AUTH_DISABLED=false.")` when `/login` lands on `/`.

- [ ] **Step 1: Implement**

In `playwright.config.ts` add `env: { AUTH_DISABLED: "false" }` to `webServer` (process variables beat `.env.local` in Next, so a server Playwright starts always has sign-in on). In `signIn`, after `page.goto("/login")`, check `new URL(page.url()).pathname === "/"` and throw the error above.

- [ ] **Step 2: Verify with no server running**

Run: `pnpm --filter web e2e e2e/student.spec.ts` with nothing on port 3000
Expected: PASS (Playwright starts its own server with sign-in on).

- [ ] **Step 3: Verify the guard with a demo-mode server running**

Start `pnpm dev` (with `AUTH_DISABLED=true` in `.env.local`), then run the same command.
Expected: FAIL fast with the "Sign-in is switched off" message, not a 90-second timeout.

- [ ] **Step 4: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/e2e/helpers.ts docs/FEATURES.md
git commit -m "Run Playwright's own server with sign-in on, and fail clearly when a demo-mode server is reused"
```

### Task 7 (X4): Hosted setup

Operational, following `docs/SETUP.md`. One code change: the docs.

- [ ] **Step 1:** In `docs/SETUP.md` section 4 (Vercel), add to the environment variable list: "Do not set `AUTH_DISABLED`. It switches sign-in off; the mode switcher refuses a non-local database, so a hosted site with it set has no way to sign in." Commit: `Warn against AUTH_DISABLED on hosted deployments`.
- [ ] **Step 2:** Supabase project in an EU region, `pnpm exec supabase link` and `db push`, Auth URLs, SMTP provider (SETUP sections 1 to 2).
- [ ] **Step 3:** Worker role passwords and GitHub Actions secrets (SETUP sections 2 and 5).
- [ ] **Step 4:** Vercel project on the **Pro** plan, root `apps/web`, production env vars.
- [ ] **Step 5:** First admin (SETUP section 3). Check: sign up on the live site, confirm the email, open `/admin/review`.
- [ ] **Step 6:** `uniguide-worker seed load` with the hosted `OPERATOR_DATABASE_URL`. Expected: loads 0 courses without error (proves Task 1 unblocked hosted loads).

### Task 8 (X2): Confirm importers against live responses

Operational. Code changes only if a mismatch appears, and then as a new small plan.

- [ ] **Step 1:** Get a data.gov key (`DATA_GOV_API_KEY`) and an OpenAlex key (`OPENALEX_API_KEY`); download the current Discover Uni files.
- [ ] **Step 2:** Run against the local stack: `uv run uniguide-worker import us-scorecard --state MA --limit 20`, `import uk-discover-uni --limit 20 ...`, `import openalex-faculty --limit 10`.
- [ ] **Step 3:** For each, compare five records by hand with the official site. Expected: titles, levels and institutions match; the importer did not fail on missing columns.
- [ ] **Step 4:** Record each result in the "Status in code" column of `docs/DATA_SOURCES.md` ("confirmed against a live response, November 2026") and commit: `Record live confirmation of the Scorecard, Discover Uni and OpenAlex importers`.

### Task 9 (X1): 50 hand-verified courses

Data work in five batches of 10, one pull request per batch. Uses Tasks 1 to 4.

- [ ] **Step 1: Choose the 50 by demand.** Against the hosted database, run `select unnest(destination_countries) c, target_level, count(*) from signups group by 1, 2 order by 3 desc;` Split the 50 across the top country and level pairs in proportion, at least 5 per Wave 1 country (US, GB, CA, AU, DE, IE). Write the list into the batch PR description.
- [ ] **Step 2: Per course.** Follow `data/seed/README.md`: official pages only, verbatim quote per fact, intake-year check. Save as `data/seed/courses/<cc>/<slug>.yaml` without `placeholder`. Get the second look on critical facts (Task 3 rule).
- [ ] **Step 3: Per batch.** Run `uv run uniguide-worker seed check --hosted && uv run uniguide-worker seed status`. Expected: no errors; the course count rises by 10.
- [ ] **Step 4: Load.** After the batch PR merges, run `seed load` against the hosted database, then open three of the new courses on the live site and check each fact's quote against its official page.
- [ ] **Step 5: Weekly.** Run `seed status`; re-verify every stale deadline it lists.

### Not in this milestone: X3 (blocked)

Labelling 200 real pages conflicts with "never page copies" (`docs/DATA_SOURCES.md`), because each eval case stores `page.html`. The owner chooses: (a) real fixtures in a private store, used only by the live eval (recommended); (b) labels and URLs only; (c) synthetic pages. Write the X3 plan after that decision.
