# Developer A roadmap: data and platform

**Source:** `docs/FEATURES.md` (the 36 rows owned by Developer A). This roadmap sequences them; each milestone has its own task-level plan in this folder:

| Milestone | Plan | Status |
|---|---|---|
| M1 Launch readiness | `2026-10-28-developer-a-m1-launch-readiness.md` | Code done (branch `feat/a-m1-launch-readiness`). Left: X1 the 50 courses, X2 importer runs, X4 hosted setup (need the owner's accounts, keys and data); X3 waits on a decision. Deferred minors are Task 1 of M2. |
| M2 Course-level data | `2026-10-28-developer-a-m2-course-level-data.md` | Planned |
| M3 Country-level data | `2026-10-28-developer-a-m3-country-level-data.md` | Planned |
| M4 Payments and email | `2026-10-28-developer-a-m4-payments-and-email.md` | Planned (assumes price, pass length and refund policy; see its header) |
| M5 Depth (P2) | `2026-10-28-developer-a-m5-depth.md` | Planned |
| M6 Decision-gated (P3) | `2026-10-28-developer-a-m6-decision-gated.md` | Gated on owner decisions listed in the plan |

**Ground rules (every milestone):** only official sources; every new table has RLS and pgTAP tests; migrations use timestamps starting `202611`; run `pnpm db:types` after schema changes; plain commit messages with no Claude co-author line; one branch per feature row (`feat/<id>-<name>`).

## Order and why

Real data comes first because every page Developer B builds looks empty without it, and because most of your later features are more sourced facts flowing through the same pipeline. The two contracts B depends on (payments and fee waivers) ship as stubs in week 1, so B never waits.

| Milestone | Rows | Rough size | Exit criterion |
|---|---|---|---|
| **M1 Launch readiness** (P0) | X1, X2, X3, X4, X5, plus seed tooling and B's contracts | 4 to 5 weeks, mostly X1 | 50 real verified courses load into the hosted database; site live on Vercel Pro; importers confirmed; B unblocked |
| **M2 Course-level reference data** (P1) | 4.4 fee waivers, 3.11 deadline calendar, 3.5 detail page gaps, 2.6 English guide | 3 to 4 weeks | Fee waivers flow through `fact_versions` like other facts; `/deadlines` and the English guide are public pages |
| **M3 Country-level reference data** (P1) | 3.10 country comparison, 9.1 visa checklists, 9.2 visa money calculator, 9.4 post-graduation routes | 3 to 4 weeks | One sourced `country_rules` model feeds all four pages; every number has a source and quote |
| **M4 Platform** (P1) | X6 payments, 14.1 email lifecycle | 3 weeks | Stripe and Razorpay webhooks grant `entitlements`; welcome series and weekly digest send from the worker |
| **M5 Depth** (P2) | 1.3, 3.9, 7.2, 7.3, 10.2, 10.3, 10.4, 13.4, 13.5, 16.4, X7, X8, X9 | 6 to 8 weeks | Pick by demand once M1 to M4 ship |
| **M6 Only if time allows** (P3 and decisions) | 2.4, 2.7, 7.5, 7.6, 13.3, 14.3, 16.1, 16.5 | n/a | Each needs an owner decision or a data source first |

## M1 Launch readiness

| Row | What you do | Kind |
|---|---|---|
| Seed tooling | Separate placeholder files from real ones (today a hosted load refuses the whole folder because placeholders sit in it); enforce official sources and a second look on critical facts; a `seed status` command for coverage and stale deadlines | Code |
| B's contracts | Stub `my_entitlement()` and `course_fee_waivers(program)` so B builds the paywall and card badges against real signatures | Code |
| X5 | CI already runs e2e with real sign-in. Make local runs fail with a clear message when `AUTH_DISABLED=true` | Code |
| X4 | Follow `docs/SETUP.md`; never set `AUTH_DISABLED` on Vercel; move to Vercel Pro | Operations |
| X2 | Confirm Scorecard, Discover Uni and OpenAlex against live responses with real keys | Operations, code only if a mismatch appears |
| X1 | 50 hand-verified courses in batches of 10, chosen by waitlist demand | Data work |
| X3 | **Blocked on a decision** (see below) | n/a |

**X3 decision needed.** `docs/DATA_SOURCES.md` says "never page copies", but each eval case stores a full `page.html`. Labelling 200 real pages means committing copies of university pages. Options: (a) keep real fixtures in a private store outside the repository and fetch them in the live eval only; (b) store labels and URLs only and accept that pages change under the labels; (c) keep synthetic pages written in the style of real ones. Recommendation: (a). Do not start X3 until this is decided.

## M2 to M4 notes for later plans

- **4.4 fee waivers** should be a fourth fact subject next to `requirement`, `deadline` and `cost_item`, so it gets proposals, review, freshness and the monitor for free. Implement `course_fee_waivers(program)` (stubbed in M1) on top of it. B's card badge then lights up without B changing anything.
- **3.11 deadline calendar** is a read model over `deadlines` with filters (country, level, intake). No new facts.
- **M3** starts by extending `country_rules` with typed amounts (currency, period, basis) so 9.2 can compute from verified numbers instead of text.
- **X6 payments** replaces the `my_entitlement()` stub body; the signature does not change. Stripe for USD, Razorpay for INR, webhooks verified, entitlements written by a `SECURITY DEFINER` function only.
- **14.1** reuses the `notifier` role and `worker/src/uniguide_worker/notify.py`; each new email type gets an unsubscribe and a consent check.
