# Architecture

A modular monolith (Next.js + Supabase) plus one Python worker. The app reads facts only from Postgres; the Claude API is used to read official pages, coach writing and explain results, and the model never writes a fact a student sees.

## How a fact reaches a student

```
official page ──fetch (robots.txt, 1 req/5 s/host, hash)──▶ worker
worker ──Claude Haiku 5.5, strict schema, verbatim quote per field──▶ proposals
proposals ──validators: quote on page, intake year, date window, zone, currency, score range──▶ fact_versions (pending)
   ├─ invented quote ─────────────▶ auto_rejected (never shown)
   ├─ validator error ────────────▶ pending, blocked until a human decides
   └─ clean ── publish_extracted_version ──▶ fact row, status "unverified" (Extracted tier)
reviewer ── promote_fact_version ──▶ status "verified" (or "conflicting"), verified_at, verified_by
```

- **Typed fact rows plus an append-only log.** `requirements`, `deadlines` and `cost_items` hold one fact per row with its own source, quote, status, method and verified date. Every change arrives as a `fact_versions` row first. A missing row means "unknown".
- **Only RPCs change published facts.** `promote_fact_version` and `reject_fact_version` accept admins and the active verifiers for the course's country (`can_review_cycle`). `publish_extracted_version` refuses to overwrite a fact a human has verified and flags the disagreement instead.
- **Register data** (institution, title, level, duration) is published straight from official registers as the Listed tier. Requirements, deadlines and fees always go through the flow above; register fees (CRICOS) arrive as unverified proposals.
- **Demand decides what is verified first.** `verification_demand` orders the queue by shortlists, then the nearest deadline. The monitor re-fetches pages in the same order, re-extracts only when the content hash changes, and tells students who shortlisted the course.
- **Country rules and admit rates** (`country_rules`, `program_stats`) carry a source and a quote, start unverified and are verified by an admin. Rules feed tracker checklists; only verified admit rates feed the optional bands.

## Matching (`packages/matching`)

Pure functions, versioned (`ALGORITHM_VERSION`), every run stored in `match_runs` with the profile snapshot and a hash of the facts used.

1. **Hard filters**: level, country, subject, format, deadline passed, base-case cost over budget × 1.25, a published requirement not met. Each exclusion carries its reason. Only verified facts can exclude.
2. **Eligibility**: meets / does not meet / needs checking per requirement. Unverified or conflicting facts never produce "meets" or "does not meet". Grades and degree credits are compared only on the same scale or credit system; exam versions must match; a conditional waiver needs checking.
3. **Costs**: low / base / high on the real basis (per credit × credits, per term, per year, per month). Only awarded aid is subtracted, which is also how the offers page totals each offer.
4. **Suitability (0–100)**: student-weighted subject, budget headroom, country preference and format. Missing program data scores 0, so it never helps. Not an admission chance.
5. **Optional bands** (off by default): reach / target / likely from a verified published admit rate and the student's self-reported class standing. Never a percentage.
6. **Admission estimate** (off by default, and only when a model has passed its gate): see Research below.

## Roles and security model

- RLS on every table (a pgTAP test fails if one is added without it, and another if a view does not run with the caller's permissions). Students see only their own rows.
- The web app uses only the publishable key; elevation happens in narrow `SECURITY DEFINER` RPCs.

| Who | How they connect | What they can do |
|---|---|---|
| Student | Supabase Auth | Own rows only; personal-data writes blocked while parental consent is pending |
| Admin | Supabase Auth, row in `admins` | Review everything, manage rules, verifiers and organisations |
| Verifier | Supabase Auth, row in `verifiers` | See and review proposals for courses in their countries only |
| Counselor | Supabase Auth, row in `org_members` | Read (never write) profile, scores, shortlist and tracker of students with an active share; never writing drafts |
| `ingest_worker` | Postgres role | Catalogue and proposals; no student data; cannot approve its own proposals |
| `notifier` | Postgres role | What reminder and update emails need, recipients through a function, never `auth.users` |
| `analyst` | Postgres role | `research_outcomes` only: consented outcomes without user or application ids; publishes admission model runs |

Fetched pages and pasted CVs are untrusted: the prompts fence them as data, and quotes are checked against the source text in code.

## Age and consent

- Sign-up asks birth month (not day) and country first. Age is computed on the server, assuming the latest possible birthday.
- Under 13: refused before anything reaches Supabase Auth. A database trigger refuses too.
- Below the country's age in `consent_age_rules` (EEA 13–16 by member state, India 18, default 13): the account is `pending_parental`. RLS then blocks saving grades, scores, AI runs, matches, shortlists, decision matrices and sharing until a parent confirms through a one-time emailed link and a button press.
- Separate, revocable consents: `ai_processing` (all AI features), `outcomes_research` (sharing decisions for research) and `agency_sharing` (one per organisation, withdrawn when the student stops sharing).

## AI features

| Feature | Model | Guard |
|---|---|---|
| Page extraction (worker) | Haiku 5.5, structured output | Verbatim quote per field, deterministic validators, human review |
| CV reader, setup chat | Haiku 5.5 | Each value needs a quote from the student's text; the student confirms field by field |
| Match explanations | Haiku 5.5 | Every number must appear in the scorer's output, otherwise the scorer's own words are shown |
| Course Q&A | Haiku 5.5 | Claims with numbers cite fact ids; "verified" claims are stripped |
| Writing review and comparison | Sonnet 5.5 | Rubric with quoted evidence, never rewritten sentences; a guard rejects ghostwritten wording |

AI features need the `ai_processing` consent and an API key, are capped at 30 runs per student per day, and log tokens and cost in `ai_runs` without storing the raw input.

## Research and the admission model

Students can share a decision for research with its own consent. The worker's analyst role reads only consented, de-identified rows.

- `research outcomes` reports admit shares by destination and course, suppressing any group under 10.
- `research train-admission` fits a logistic model of admitted vs rejected with grade standardised within its own scale (never converted) and partially pooled country and course offsets. It trains on earlier intakes and is scored on the latest intake it has not seen. A run is published only if it has at least 500 training and 100 holdout outcomes, beats the base rate's Brier score by 5% and has an expected calibration error of 0.05 or less. Courses with fewer than 20 outcomes get no estimate. Failing runs are stored with their reasons and stay hidden.
- The web app reads only the active, passing model (RLS) and computes the estimate with the same formula as the worker; a shared fixture keeps the two in step.

Open legal questions are tracked in BACKLOG.md.
