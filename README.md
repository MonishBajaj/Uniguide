# Uniguide

A verified, source-linked course finder, requirements and deadline tool for students going abroad to study any course, at any level, in any country.

Every fact a student sees comes from Postgres with a source link, a verified date, an effective intake cycle and a status. Each course carries a coverage tier: **Listed** (in an official register), **Extracted** (read from official pages by software, shown as unverified) or **Verified** (checked by a person). The LLM extracts, coaches and explains; it never generates a deadline, fee or requirement at runtime.

## What is in it

| For | Features |
|---|---|
| Students | A journey home (`/app`) with their stage, next steps and deadlines, navigation by stage, an all-steps page with snooze and dismiss, and onboarding by "Where are you right now?"; explore without an account; course pages with sources, quotes and freshness; requirements table; matching with eligibility, cost scenarios and suitability; what-if simulator; shortlist; tracker with checklists, country rules (for example APS for Indian applicants to Germany), calendar export and email reminders; offers comparison with true cost and a decision matrix; writing coach (story bank, outlines, authorship record, linter, rubric review, draft comparison, never ghostwriting); faculty dossiers for research degrees; course Q&A grounded in facts; optional low-confidence bands; sharing with a counselor |
| Parents | Consent by email link and a button press for students below their country's consent age |
| Reviewers | Demand-ordered review queue, student reports, country rules and admit rates; per-country verifiers with their own tally |
| Consultancies | Read-only dashboard of students who chose to share, revocable at any time |
| Research | Consented, de-identified outcomes; outcome report with small-group suppression; hierarchical admission model that is shown only after it passes a holdout and calibration gate |

Payments are built but need provider accounts and keys before they go live (see docs/SETUP.md, Payments). Until then, writing reviews after the first free one use credits from accepted "report outdated information" submissions or an admin grant.

## Repository

| Path | What |
|---|---|
| `apps/web` | Next.js 16 app (public pages, student app under `/app`, reviewer pages under `/admin`, counselor pages under `/agency`) and the Playwright suite in `e2e/` |
| `packages/matching` | Deterministic engine: filters, eligibility, costs, score, checklist, bands, admission estimate |
| `packages/journey` | Journey engine: the student's stage (1 to 7), ranked next steps and stall detection, from one database snapshot |
| `packages/db-types` | TypeScript types generated from the database |
| `supabase` | SQL migrations, RLS policies, RPCs, pgTAP tests, local seed |
| `worker` | Python: register importers, official-page extraction (Claude Haiku 5.5), monitor, reminders, research, seed loader, evals |
| `data/seed` | Hand-verified course files in `courses/`, fictional ones in `placeholders/` and shared test fixtures |
| `docs` | [Setup](docs/SETUP.md), [architecture](docs/ARCHITECTURE.md), [data sources](docs/DATA_SOURCES.md) |
| `BACKLOG.md` | What is left, what is deferred or cut, and open legal items |

## Local development

Needs Node 22, pnpm 10, Python 3.13 with uv, and Docker.

```bash
pnpm install
```

```bash
pnpm db:start      # local Supabase: Postgres, Auth, REST and Mailpit at http://127.0.0.1:54324
```

```bash
cp .env.example apps/web/.env.local && cp .env.example worker/.env
```

Put the publishable key printed by `pnpm db:start` into `apps/web/.env.local`, then:

```bash
cd worker && uv sync && uv run uniguide-worker seed load --publish-placeholders
```

```bash
pnpm dev           # http://localhost:3000
```

Local accounts from `supabase/seed.sql`, all with password `password123`:

| Email | Role |
|---|---|
| `admin@uniguide.local` | Admin reviewer |
| `student@uniguide.local` | Student |
| `verifier@uniguide.local` | Verifier for Germany |
| `counselor@uniguide.local` | Counselor at "Example Consultancy (local)", invite code `local-agency` |

Sign-in and sign-up are switched off while `AUTH_DISABLED=true` in `apps/web/.env.local`; the navbar then switches between Guest, User (`student@uniguide.local`) and Parent (`parent@uniguide.local`, linked read-only to the student). Set it to `false` to use real sign-in, and before running the Playwright suite. It only works against a local Supabase.

Optional: import official registers (`uv run uniguide-worker import au-cricos`, `import nl-duo`, see `--help`), and set `ANTHROPIC_API_KEY` for extraction and the AI features.

## Tests

```bash
pnpm db:test                       # 595 pgTAP tests: RLS on every table, isolation, consent, roles, review RPCs
```

```bash
pnpm -r test                       # matching engine (property tests, 30-case eligibility eval) and web unit tests
```

```bash
cd worker && uv run pytest         # worker, DB integration, admission model, offline extraction evals
```

```bash
pnpm --filter web e2e              # Playwright flows against the local stack (needs the seed loaded)
```

```bash
cd worker && uv run pytest -m live # extraction evals against the Claude API
```

After changing a migration, regenerate types with `pnpm db:types`; CI fails on drift.
