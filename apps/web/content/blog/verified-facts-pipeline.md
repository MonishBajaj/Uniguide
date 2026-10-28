---
title: "Keeping an LLM away from the deadline: how Uniguide turns official pages into checked facts"
date: 2026-10-28
description: "How Uniguide reads official university pages with a model, then checks every deadline, fee and requirement before a student sees it, and the evals that keep it honest."
---

*Numbers are from the October 2026 build.*

Study-abroad students make expensive decisions on three kinds of fact: whether they qualify, what it costs, and when to apply. Chat assistants answer all three fluently and often wrongly. Uniguide's rule is that **facts come from Postgres, never from the model**. The model reads official pages and explains results; it never produces a deadline, a fee or a requirement that a student sees.

This post covers the pipeline that makes that rule practical, and the evals that keep it honest.

## The trust layer

Every requirement, deadline and cost is a typed row (not a JSON blob) with its own provenance: source URL, a verbatim evidence quote, the intake it applies to, who verified it and when, and a status: `verified`, `unverified`, `conflicting` or `unknown`. A missing row is "unknown", and unknown never counts in a student's favour.

Every change arrives first as a row in an append-only `fact_versions` log. Only three Postgres functions change what students see:

- `publish_extracted_version` shows a clean extraction as **unverified** (the "Extracted" tier). It refuses to overwrite anything a person has verified, and flags the disagreement instead.
- `promote_fact_version` marks a fact **verified** or **conflicting**. Only admins, and verifiers for that course's country, can call it.
- `reject_fact_version` takes an extraction down.

Row-level security covers every table. A pgTAP test fails the build if a table is added without it, and 180 database tests check cross-user isolation, consent gates and role limits. The extraction worker connects as its own Postgres role and cannot read any student data.

## From page to proposal

1. **Fetch politely.** The worker respects robots.txt (an unreadable robots.txt means "stay away") and waits five seconds between requests to the same host. It uses conditional GETs, refuses aggregators and login walls, and stores a hash of the normalised text, never a copy of the page.
2. **Extract with a schema.** Claude Haiku 5.5 runs at low effort with a strict JSON schema. Every item must carry `quote`, a verbatim copy of the sentence that states it. Page text is fenced as untrusted data.
3. **Validate deterministically.** This is where most of the safety lives:
   - The quote must appear in the page text after normalisation. An invented quote is auto-rejected and never reaches the review queue.
   - The page must describe the intake being collected: last year's page is an error, not a warning.
   - Dates must fall in a plausible window for the intake.
   - Time zones come from the page or the institution's province or state, with a warning where a state spans two zones.
   - Currencies, and score ranges per exam version, are checked. TOEFL iBT moved to a 1–6 band scale in January 2026, so a "100" and a "4.5" are both valid, on different scales.
   - Values that changed since the last cycle are flagged for the reviewer.
4. **Review by demand.** A person approves every deadline, eligibility rule and fee before it shows as verified. The queue is ordered by how many students shortlisted the course, then by the nearest deadline. Verification effort follows demand, not catalogue size.
5. **Monitor.** Weekly in season, pages are re-fetched by demand. A page is re-extracted only when its hash changes, and students who shortlisted the course are told when a published value changes.

Breadth comes from official registers rather than scraping. The Australian CRICOS export alone gives 18,607 current tertiary courses at 1,105 providers in about 15 seconds. Those courses are "Listed": they exist, but nobody has checked their details yet, and the UI says so.

## Matching without pretending

The matcher is four pure TypeScript functions:

1. **Hard filters.** Each exclusion carries a reason.
2. **Eligibility.** Every published requirement is checked as meets / does not meet / needs checking.
3. **Costs.** Low, base and high totals, worked out on the real basis (per credit × credits, per term, per year).
4. **Suitability score.** It ranks only the feasible list.

Two properties are enforced with property-based tests: removing a known fact never raises a score, and a larger budget never lowers one. Nothing concludes "meets" or "does not meet" from unverified or conflicting data, and grades are never silently converted between scales.

The model explains these results but cannot change them. Any number in an explanation must appear in the scorer's output, or the explanation is replaced with the scorer's own words.

## Evals as the contract

| Suite | What it checks | Gate |
|---|---|---|
| Extraction (Python, recorded and live) | Deadline and fee exact match against hand labels, and published facts that match no label. Includes a prompt-injection page whose hidden text asks for a 2099 deadline | ≥ 95% exact match, 0 false publications |
| Eligibility (TypeScript) | 30 synthetic students across six countries and five levels. Covers A-levels, IB, CBSE, ATAR, TOEFL old and new, conditional waivers, and conflicting and stale sources | Every expected verdict and reason |
| Grounding (TypeScript) | Course Q&A: every claim with a number cites a real fact id, and nothing asserts verification status | 100% cited, 0 false "verified" |
| Writing rubric (TypeScript) | Spearman against two human raters, test-retest variance, position flips in pairwise comparison, and a guard against ghostwritten wording | ρ ≥ 0.6, variance ≤ 0.25, flips ≤ 25% |

Writing these evals found real bugs before users did:

- A date-only US deadline at 23:59 Eastern rendered as the next day in UTC.
- A conditionally waived GRE counted as "meets".
- An unquoted YAML province code, `ON`, parsed as boolean `true`.

## What is next

- Hand-label 200 pages across countries and levels.
- Replace the placeholder human scores in the writing eval with two raters.
- After one full cycle of consented outcomes, test whether a hierarchical admission model is calibrated enough to show anyone. The model already exists but is hidden behind its own gate.
