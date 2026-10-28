# Architecture

A modular monolith (Next.js + Supabase) plus one Python worker. The app talks only to Postgres for facts and to the Claude API for profile extraction; the model never writes a fact a student sees.

## How a fact reaches a student

```
official page ──fetch (robots.txt, 1 req/5 s/host, hash)──▶ worker
worker ──Claude Haiku 5.5, strict schema, verbatim quote per field──▶ proposals
proposals ──validators: quote on page, intake year, date window, zone, currency, score range──▶ fact_versions (pending)
   ├─ invented quote ─────────────▶ auto_rejected (never shown)
   ├─ validator error ────────────▶ pending, blocked until a human decides
   └─ clean ── publish_extracted_version ──▶ fact row, status "unverified" (Extracted tier)
reviewer (admin) ── promote_fact_version ──▶ status "verified" (or "conflicting"), verified_at, verified_by
```

- **Typed fact rows plus an append-only log.** `requirements`, `deadlines` and `cost_items` hold one fact per row with its own source, quote, status, method and verified date. Every change arrives as a `fact_versions` row first. A missing row means "unknown".
- **Only RPCs change published facts.** `promote_fact_version` and `reject_fact_version` check `is_admin()`; `publish_extracted_version` refuses to overwrite a fact a human has verified and flags the disagreement instead.
- **Register data** (institution, title, level, duration) is published straight from official registers as the Listed tier. Requirements, deadlines and fees always go through the flow above.

## Matching (`packages/matching`)

Pure functions, versioned (`ALGORITHM_VERSION`), every run stored in `match_runs` with the profile snapshot and a hash of the facts used.

1. **Hard filters**: level, country, subject, format, deadline passed, base-case cost over budget × 1.25, a published requirement not met. Each exclusion carries its reason. Only verified facts can exclude.
2. **Eligibility**: meets / does not meet / needs checking per requirement. Unverified or conflicting facts never produce "meets" or "does not meet". No grade conversion between scales; exam versions must match.
3. **Costs**: low / base / high on the real basis (per credit × credits, per term, per year, per month). Only awarded aid is subtracted.
4. **Suitability (0–100)**: student-weighted subject, budget headroom, country preference and format. Missing program data scores 0, so it never helps. Not an admission chance.

## Security model

- RLS on every table (a pgTAP test fails if one is added without it). Students see only their own rows.
- The web app uses only the publishable key; elevation happens in narrow `SECURITY DEFINER` RPCs.
- The worker connects as `ingest_worker`, which has no access to profiles, scores, shortlists or the waitlist and cannot approve its own proposals.
- Fetched pages and pasted CVs are untrusted: the prompts fence them as data, and quotes are checked against the source text in code.

## Age and consent

- Sign-up asks birth month (not day) and country first. Age is computed on the server, assuming the latest possible birthday.
- Under 13: refused before anything reaches Supabase Auth. A database trigger refuses too.
- Below the country's age in `consent_age_rules` (EEA 13–16 by member state, India 18, default 13): the account is `pending_parental`. RLS then blocks saving grades, scores, AI runs, matches and shortlists until a parent confirms through a one-time emailed link and a button press.
- The CV reader needs its own `ai_processing` consent. Terms and privacy acceptance are recorded with the account.

Open legal questions are tracked in BACKLOG.md.
