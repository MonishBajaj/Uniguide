# Backlog

What is left after building the plan through months 6–12. Feature numbers refer to the Feature Bible. **Nothing leaves "Deferred" or "Cut" without a go/no-go decision.**

## Built

Weeks 1–4 foundation; weeks 5–6 tracker, checklists, reminders, .ics, outcome sharing, source register, monitor, demand-ordered queue, student reports with credits, freshness labels, per-intake SEO pages, ROR and CRICOS fees, field crosswalks; weeks 7–12 writing coach (story bank, outlines, authorship record, linter, rubric review, pairwise comparison, writing eval), faculty matcher, course Q&A, match explanations, what-if, onboarding chat; months 4–6 offers and true cost, decision matrix, visa pages and country rules (APS), Netherlands register, credit checks for master's applicants, optional bands, outcome analytics; months 6–12 per-country verifiers with tallies, consultancy dashboards with student-granted sharing, Wave 3 destinations, hierarchical admission model behind its gate; Playwright suite in CI and scheduled jobs.

## Left to do

| Item | Notes |
|---|---|
| **Payments: provider setup** (Stripe season pass USD 19, Razorpay INR 1,499) | Built and tested locally (see docs/SETUP.md, Payments); needs provider accounts, keys and a webhook endpoint. The original note: not built, by the owner's decision. Writing review credits exist (`credit_ledger`) and are earned through accepted reports or granted by an admin; a payment provider would add a third source |
| Replace placeholder seed courses with 50 hand-verified real ones | real courses go in `data/seed/courses`; clearly marked placeholders on example.org live in `data/seed/placeholders`; the loader refuses them in a hosted database |
| Hand-label 200 official pages for the extraction eval | Fixture format in `worker/evals` |
| Replace placeholder human scores in the writing eval with two raters | `apps/web/lib/writing/eval` |
| Confirm unverified importers against live responses | College Scorecard (needs a key), Discover Uni columns, OpenAlex (needs a key) |
| **Verify the 50 index URLs** (`data/seed/indexes/us` 30, `data/seed/indexes/de` 20) | Written from memory, never opened; each needs a person to confirm it and add `verified_by` / `verified_at`. Then run the first live crawl and check its courses. Other countries next, same format |
| Hochschulkompass importer | Waits for HRK partner access; the stub refuses to run |
| France and New Zealand registers | Extraction only for now (API resets, bot challenge) |
| Gulf visa links | Add from the admin rules page after checking the official pages |
| Admission model goes live | Needs at least two intakes of consented outcomes and a passing gate; runs weekly and stays hidden until then |
| Hosted setup | Follow docs/SETUP.md: Supabase, Vercel, role passwords, Actions secrets |
| **Native-speaker review of the Hindi interface** (15.4) | `apps/web/lib/i18n/hi.ts`, written plainly but not yet reviewed; the footer says so in Hindi. Not yet translated: the profile forms, application pages, writing coach and server messages. Country and level names, and dates, are still in English |
| **Legal review before switching on community features** (11.1, 11.3, 11.4, 11.6) | Built behind `COMMUNITY_ENABLED` (off). Before turning it on: terms for user posts, moderation policy and response times, takedown contact, defamation risk in reviews, and a privacy-policy update. Every post is pre-moderated, adults only, pseudonymous, with contact details blocked |

## Journey system (after M6)

M1 (the engine), M2 (navigation, home, steps page, onboarding), M3 (panels, "I'm applying", own applications, test plans, empty states), M4 (help panel, parent and counselor views, journey emails), M5 (enrollment, edge paths and arrival) and M6 (Hindi steps, one accessibility audit, data saver, verification demand, `docs/JOURNEY.md`) are built; how it works is in `docs/JOURNEY.md`, and the plans are `docs/superpowers/plans/2026-10-30-journey-m1-engine.md`, `2026-10-30-journey-m2-shell.md`, `2026-10-30-journey-m3-wiring.md`, `2026-10-31-journey-m4-help-parent.md`, `2026-10-31-journey-m5-enrollment.md` and `2026-10-31-journey-m6-polish.md`. Decisions taken by the owner on 30 October 2026: students can explore without a test score; "opened" and "viewed" steps are marked done by the student; "today" is the UTC date until profiles store a time zone; the daily recompute is a token-guarded route called by GitHub Actions. The spec's open questions keep their defaults (no paywall, "UniGuide" in one constant, advise 6 to 10 shortlisted courses and never require it, lead times 21/30/21 for ranking only and never shown).

Catalogue steps written but switched off until the piece they need exists:

| Steps | Waiting for | Milestone |
|---|---|---|
| S2.07, S3.06 | Course and parent-view tracking, which the spec does not define yet | Needs a decision |

- Own applications (G1) never become catalogue courses; a reviewer cannot convert one (spec open question 4). Record any request for that here.
- "Today" in the student's own time zone needs a time zone on the profile.
- **Accepted limits from M2 (owner, 30 October 2026):** on phones, Offers sits under More even in stage 6 (the step cards link straight to it). (Step titles in Hindi came with M6.)
- **Accepted limits from M6 (defaults in the M6 plan):**
  - All Hindi, including the step templates in `packages/journey/src/copy-hi.ts` and `parent-copy.ts`, needs a native speaker's review.
  - Dates inside step reasons, and fact labels such as "Unverified, confirm on the official page", stay in English for Hindi readers. Hindi dates would need the engine to pass raw dates as parameters. The parent page outside its journey section, and the counselor pages, are English only.
  - Emails stay English until profiles store a language.
  - Verification demand counts journeys from the last 14 days. It counts deadlines, requirements and country rules, which are the facts steps quote.
- **Accepted limits from M5 (defaults in the M5 plan):**
  - No country has housing, health insurance or registration rules yet, so S7.03 (without housing facts), S7.04 and S7.08 stay quiet until a verifier adds and verifies them in `/admin/rules`. S7.04 and S7.08 use verified rules only, like the other rule steps (plan R7).
  - Interview times are kept as the student typed them and shown in UTC until profiles store a time zone. Logged interviews and portal notes can't be deleted, only a "missing" note marked sorted.
  - The intake choice offers intakes whose deadline is unverified too, each with its status badge.
  - Arrival also stops the parent's weekly email.
- **Accepted limits from M4 (defaults in the M4 plan):**
  - Emails are English only until profiles store a language.
  - The parent view, the parent digest and the counselor view read the journey as the student last saw it (saved on each `/app` visit and by the daily recompute), with its date.
  - The help panel links to a course's Q&A instead of embedding a second form; an own application has none.
  - The updates page lists stage changes and urgent steps, not every completed step.
- **Accepted limits from M3 (defaults in the M3 plan):**
  - S2.05 only checks courses the student is tracking, because match results aren't in the snapshot. The score goals panel on `/app/match` covers every match.
  - S3.01 only counts the shortlist (fewer than 6). The imbalance warnings stay on the advice panel.
  - Own applications' dates are the student's: they count for the stage rules, ranking and the calendar export, but never start a deadline reminder email or the weekly parent digest, and the home's "Coming up" lists published deadlines only.
  - The three panels' own wording (advice messages, comparison verdicts, score gaps) is still English on Hindi pages; their headings and introductions are translated.
  - A counselor sees a student's own applications, with the label; there are no counselor statistics that could count them.
- **Consent again after a withdrawal:** a student whose parental consent was revoked sees a banner and no steps, but there is no way yet for a parent to confirm again. Needs a flow (and a decision on who can start it) before any withdrawal flow goes live.
- **Native-speaker review of the journey Hindi** (`apps/web/lib/i18n/hi.ts`, the `journey` section, and the page help in `apps/web/content/help/hi/`), along with the rest of the Hindi interface. The parent note on the parent view is English (engine text, like step titles). Still English on Hindi journey pages: step titles and reasons and the stage progress line (engine text, M6), and the fact status labels ("Verified", "Unverified, confirm on the official page") from the shared `FactBadge`, which the 15.4 first pass didn't cover.
- **Known failing e2e specs (accepted by the owner, 30 October 2026).** These fail on `develop` without any journey code and were accepted as known failures at the M2 exit gate:
  - `course-filters.spec.ts` "3.4 filter by open deadline and by published yearly tuition" (3 cards instead of 2)
  - `enrichment.spec.ts` "the first complete profile save starts the search by itself" (never reaches `/app/matching`)
  - `suggested-courses.spec.ts`, two specs: the test reads booleans as `t`/`f`, but the query returns `true`/`false`

## Follow-ups

- Extract fee waivers from official pages with the model. Today fee waivers arrive only through hand-verified seed files and admin review.

## Deferred to year 2

- Scholarships and loans (8.x). No ethnicity / religion / health filters without separate explicit consent.
- Counselor marketplace (12). If needed earlier: Cal.com + payment link with 3–5 partner counselors.
- Peer match (3.8).

## Cut

- Multi-source rankings aggregation (3.2): QS, THE and US News terms forbid it. Link out; show open signals only.
- Percentage admission predictor without own data. The admission model shows "about N in 10" only after it passes its calibration gate, and never for thin courses.
- AI-detection scanner (5.8): detectors misflag non-native essays.
- SOP ghostwriting and SOP translation aid (5.9).
- Exam roadmap (2.1–2.3): replaced by a test-requirement flag on each card.
- Gantt and heatmap views in the tracker.
- Community forums, mobile apps, white-label, public API, gamification.
- Push notifications and SMS.
- Visa interview content beyond truthful preparation and official links.

## Needs a decision or review before launch

- [ ] **Legal: parental consent mechanism.** The current flow emails the parent a one-time link and requires a button press. That may not count as *verifiable* parental consent under India's DPDP rules or strict GDPR Art. 8 readings. Counsel review before marketing to under-18s.
- [ ] **Legal: consent ages in `consent_age_rules`.** Seeded from public summaries of GDPR Art. 8 national choices, COPPA and DPDP; confirm each value.
- [ ] **Legal: consultancy sharing.** Data processing terms with each organisation; confirm the sharing consent text.
- [ ] **Legal: verifier contracts.** Contractors see unpublished proposals for their countries only; confidentiality terms.
- [ ] **Research ethics.** Outcomes research consent text, retention period and suppression threshold (currently 10).
- [ ] Terms of service with liability limits; privacy policy stating real API retention (up to 30 days by default).
- [ ] F-1/OPT: confirm with the DSO that operating the business is allowed.
- [ ] New product and assistant name (UniGuide and Sage are taken); trademark and domain check.
- [ ] Vercel Hobby is non-commercial: move to Pro before charging.
