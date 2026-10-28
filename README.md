# Uniguide

A verified, source-linked course finder, requirements and deadline tool for students going abroad to study any course, at any level, in any country.

Every fact a student sees comes from Postgres with a source link, a verified date, an effective intake cycle and a status. Each course carries a coverage tier: **Listed** (in an official register), **Extracted** (read from official pages by software, shown as unverified) or **Verified** (checked by a person). The LLM extracts and explains; it never generates a deadline, fee or requirement at runtime.

## Repository

| Path | What |
|---|---|
| `apps/web` | Next.js 16 app: landing and waitlist, explore, course pages, auth with age and parental consent, profile, matches, shortlist, admin review queue |
| `packages/matching` | Deterministic matching engine: hard filters, eligibility, cost scenarios, suitability score |
| `packages/db-types` | TypeScript types generated from the database |
| `supabase` | SQL migrations, RLS policies, RPCs, pgTAP tests, local seed |
| `worker` | Python: register importers, official-page extraction (Claude Haiku 5.5), validators, seed loader, evals |
| `data/seed` | Hand-verified course files (placeholders for now) |
| `docs` | [Setup](docs/SETUP.md), [architecture](docs/ARCHITECTURE.md), [data sources](docs/DATA_SOURCES.md) |
| `BACKLOG.md` | Everything deliberately not built yet, and open legal items |

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

Local accounts from `supabase/seed.sql` (password `password123`): `admin@uniguide.local` (reviewer) and `student@uniguide.local`.

Optional: import the Australian CRICOS register (about 18,600 courses) with `uv run uniguide-worker import au-cricos`, and set `ANTHROPIC_API_KEY` to try the CV reader and page extraction.

## Tests

```bash
pnpm db:test                       # 96 pgTAP tests: RLS on every table, cross-user isolation, consent, review RPCs
```

```bash
pnpm -r test                       # matching engine (incl. property tests) and web unit tests
```

```bash
cd worker && uv run pytest         # worker, DB integration and offline extraction evals
```

```bash
cd worker && uv run pytest -m live # extraction evals against the Claude API
```

After changing a migration, regenerate types with `pnpm db:types`; CI fails on drift.
