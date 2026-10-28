# Backlog

Everything from the Feature Bible that is not in the current scope. **Nothing leaves this file until a go/no-go gate is passed** (Nov 24 and Jan 19 reviews). Feature numbers refer to the Bible.

## Next phases (planned)

| Item | Bible | Phase | Notes |
|---|---|---|---|
| Tracker: kanban + table, checklist seeded from requirements (UCAS, uni-assist, Common App steps) | 4.1, 4.2 | Weeks 5–6 | Tables `applications` and `checklist_items` already exist |
| Email + .ics deadline reminders (Resend + daily cron) | 4.3 | Weeks 5–6 | No push or SMS |
| Outcome-report form with separate, revocable consent | 13.1 prep | Weeks 5–6 | `consent_kind = outcomes_research` exists |
| Paste-in SOP / personal statement review v0 (rubric, quoted evidence, no rewriting) | 5.3, 5.4 | Weeks 5–6 | Sonnet 5.5; behind the "writing coach" fake door |
| Season pass: Stripe (USD 15–29) and Razorpay (INR 999–1,999) | Payments | Weeks 5–6 | One-time passes, not subscriptions |
| Shortlist-driven verification queue ordering (by shortlists × nearest deadline) | — | Weeks 5–6 | Review queue currently orders by age |
| Canada and Ireland extraction | — | Weeks 5–6 | |
| SEO page per course-cycle | 3.6 | Weeks 5–6 | |
| OpenAlex faculty matcher (pgvector) and "why this university" dossier | 5.5 | Weeks 7–12 | Research degrees |
| Story mining questions, outline structure, authorship log, cliché/specificity linter | 5.1, 5.2, 5.8 | Weeks 7–12 | Replaces the AI-detection scanner |
| Pairwise draft comparison; writing eval set in CI | 5.4 | Weeks 7–12 | |
| What-if simulator (re-run the scorer with new inputs) | 3.7 | Weeks 7–12 | `packages/matching` is already pure |
| Change alerts for watched courses | 3.9 | Weeks 7–12 | Falls out of content-hash monitoring |
| Per-user AI credits and paywall on writing tools | — | Weeks 7–12 | |
| Offer and true-cost comparison, decision matrix | 7.1, 7.4, 7.7 | Months 4–6 | Never deduct unawarded assistantships |
| Wave 2 countries (NL, FR, NZ, other EU English-taught); deeper Germany (APS, uni-assist, ECTS) | — | Months 4–6 | |
| Rules-based Reach/Target/Likely band, labelled "low confidence" | 13.1 | Months 4–6 | Only if testing shows users need it |
| Wave 3 countries (SG, JP, KR, Gulf, on request) with per-country contractors | — | Months 6–12 | |
| Consultancy dashboard for small agencies | 16.4 | Months 6–12 | After ~1k weekly actives |
| Hierarchical admission model | 13.1 | After one full cycle | Brier score + calibration; never trained on GradCafe |
| Hochschulkompass importer | — | When HRK grants access | Stub raises `AccessPendingError` |
| ROR importer for institution identifiers | — | Weeks 5–6 | `institutions.ror_id` exists |
| Tuition published by registers (CRICOS fees) as reviewable fact versions | — | Weeks 5–6 | Currently the importer skips fees rather than publishing them unreviewed |
| ASCED and CIP to ISCED-F field crosswalks | — | Weeks 5–6 | CRICOS maps only one-to-one broad fields; Scorecard fields are unmapped, so field matching scores them 0 |
| "Report outdated info" as an in-app form with credits for correct reports | — | Weeks 5–6 | Now a mailto link |
| Scheduled worker (weekly re-fetch in season, change diff alerts) | 3.9 | Weeks 5–6 | Fetcher already does conditional GET and content hashes |
| Conversational onboarding (3–4 turn chat updating the profile by tool calls) | 1.1 | Weeks 7–12 | The CV reader uses one structured-output call with field-by-field confirmation |
| Playwright end-to-end suite in CI | — | Weeks 5–6 | Flows were verified by hand-run Playwright scripts |
| Visa interview coach (truthful preparation only, official links) | — | Phase 3 at earliest | Concealment content deleted |

## Deferred to year 2

- Scholarships and loans (8.x). No ethnicity / religion / health filters without separate explicit consent.
- Counselor marketplace (12). If needed earlier: Cal.com + payment link with 3–5 partner counselors.
- Peer match (3.8).

## Cut

- Multi-source rankings aggregation (3.2): QS, THE and US News terms forbid it. Link out; show open signals only.
- Percentage admission predictor (before own data exists).
- AI-detection scanner (5.8): detectors misflag non-native essays.
- SOP ghostwriting and SOP translation aid (5.9).
- Exam roadmap (2.1–2.3): replaced by a test-requirement flag on each card.
- Gantt and heatmap views in the tracker.
- Community forums, mobile apps, white-label, public API, gamification.
- Push notifications and SMS.

## Needs a decision or review before launch

- [ ] **Legal: parental consent mechanism.** The current flow emails the parent a one-time link. That may not count as *verifiable* parental consent under India's DPDP rules or strict GDPR Art. 8 readings. Counsel review before marketing to under-18s.
- [ ] **Legal: consent ages in `consent_age_rules`.** Seeded from public summaries of GDPR Art. 8 national choices, COPPA and DPDP; confirm each value.
- [ ] Terms of service with liability limits; privacy policy stating real API retention (up to 30 days by default).
- [ ] F-1/OPT: confirm with the DSO that operating the business is allowed.
- [ ] New product and assistant name (UniGuide and Sage are taken); trademark and domain check.
- [ ] Vercel Hobby is non-commercial: move to Pro before charging.
