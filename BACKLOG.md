# Backlog

What is left after building the plan through months 6–12. Feature numbers refer to the Feature Bible. **Nothing leaves "Deferred" or "Cut" without a go/no-go decision.**

## Built

Weeks 1–4 foundation; weeks 5–6 tracker, checklists, reminders, .ics, outcome sharing, source register, monitor, demand-ordered queue, student reports with credits, freshness labels, per-intake SEO pages, ROR and CRICOS fees, field crosswalks; weeks 7–12 writing coach (story bank, outlines, authorship record, linter, rubric review, pairwise comparison, writing eval), faculty matcher, course Q&A, match explanations, what-if, onboarding chat; months 4–6 offers and true cost, decision matrix, visa pages and country rules (APS), Netherlands register, credit checks for master's applicants, optional bands, outcome analytics; months 6–12 per-country verifiers with tallies, consultancy dashboards with student-granted sharing, Wave 3 destinations, hierarchical admission model behind its gate; Playwright suite in CI and scheduled jobs.

## Left to do

| Item | Notes |
|---|---|
| **Payments** (Stripe season pass USD 15–29, Razorpay INR 999–1,999) | Not built, by the owner's decision. Writing review credits exist (`credit_ledger`) and are earned through accepted reports or granted by an admin; a payment provider would add a third source |
| Replace placeholder seed courses with 50 hand-verified real ones | real courses go in `data/seed/courses`; clearly marked placeholders on example.org live in `data/seed/placeholders`; the loader refuses them in a hosted database |
| Hand-label 200 official pages for the extraction eval | Fixture format in `worker/evals` |
| Replace placeholder human scores in the writing eval with two raters | `apps/web/lib/writing/eval` |
| Confirm unverified importers against live responses | College Scorecard (needs a key), Discover Uni columns, OpenAlex (needs a key) |
| Hochschulkompass importer | Waits for HRK partner access; the stub refuses to run |
| France and New Zealand registers | Extraction only for now (API resets, bot challenge) |
| Gulf visa links | Add from the admin rules page after checking the official pages |
| Admission model goes live | Needs at least two intakes of consented outcomes and a passing gate; runs weekly and stays hidden until then |
| Hosted setup | Follow docs/SETUP.md: Supabase, Vercel, role passwords, Actions secrets |

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
