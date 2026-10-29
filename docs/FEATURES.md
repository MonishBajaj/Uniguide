# Feature map and two-developer split

Source: the Feature Bible (100 features), `BACKLOG.md`, and what the running app contains (checked October 2026). IDs match the Bible; `X` rows are work from the backlog or this session that the Bible does not number.

**Totals (103 rows):** 36 built · 16 partly built · 32 to build · 3 need an owner decision · 5 deferred · 11 cut on purpose.

**Developer B progress (developer-b, October 2026):** 29 more rows built, and 3.3 and 3.4 finished except for A's data. Totals now: 45 built · 8 partly built · 30 to build · 5 need a decision · 5 deferred (14.4 added) · 10 cut. X10 and 13.2 wait on payments.

Status key: **Built** works today · **Partial** exists, listed gap remains · **To build** not started · **Decision** the owner must settle first · **Deferred** year 2 · **Cut** decided against (BACKLOG). Size: S about 2 days, M about a week, L two weeks or more. Priority: P0 needed for a real launch, P1 next, P2 later, P3 only if time allows.

## 1. What is already built

The student app works end to end behind sign-in, but the catalogue holds six placeholder courses, so most screens show empty states. AI features are off until `ANTHROPIC_API_KEY` is set.

| ID | Feature | What exists |
|---|---|---|
| 1.1 | Conversational onboarding (Sage) | `/app/onboarding` chat suggests profile fields; the student confirms each one. Needs `ANTHROPIC_API_KEY`. The name Sage is taken, so the assistant needs a new name. |
| 1.6 | Counselor linked profile | Student-granted, revocable sharing to a consultancy (`/app/sharing`, `/agency`). |
| 3.1 | Course matching engine | `packages/matching`: hard filters, eligibility, cost scenarios, suitability 0–100. No percentage chance; optional bands. |
| 3.6 | Explore without an account | `/courses` and `/requirements` are public. |
| 3.7 | What-if simulator | `/app/match/what-if`. |
| 4.1 | Application tracker | Board and table, per-course card, `.ics` calendar export. Gantt is cut. |
| 4.2 | Document checklist | Checklist built from requirements and country rules (for example APS for Germany). |
| 4.3 | Deadline alerts | Email reminders from the worker. Push and SMS are cut. |
| 5.1 | Story mining | `/app/writing/stories` story bank. |
| 5.2 | SOP outline | Outlines from the story bank. |
| 5.3 | Draft editor with versions | Drafts, authorship record, draft comparison. |
| 5.4 | AI writing review | Rubric with quoted evidence. Never rewrites sentences. Placeholder human scores in the eval. |
| 7.1 | Financial comparison (true cost) | `/app/offers`: published fees and living costs minus awarded aid. |
| 7.4 | Side-by-side offer comparison and decision matrix | `/app/offers`. |
| 13.1 | Admission estimate | Model, holdout and calibration gate are built. Stays hidden until two intakes of consented outcomes pass the gate. |
| 17.1 | SEO course pages | Per-intake pages, sitemap and robots. |

**Also built, not numbered in the Bible**
- Student account with age gate and parental consent (`/consent`), revocable consents for AI, research and counselor sharing.
- CV reader (AI) with a quote check on every suggested value; course Q&A grounded in facts; match explanations.
- Faculty dossiers for research degrees (OpenAlex).
- Fact pipeline: importers for AU (CRICOS), NL (DUO), US, UK, ROR, OpenAlex; page extraction with verbatim quotes and validators; change monitor.
- Staff tools: reviewer queue, rules and team admin, per-country verifiers with tallies.
- Research outcomes report and a gated hierarchical admission model.
- 21 migrations, RLS on every table, 191 database tests, Playwright suite, scheduled worker jobs.
- This session: demo mode (sign-in off, Guest / User / Parent switch), read-only parent page, light minimalist redesign.

## 2. Partly built (finish these)

| ID | Feature | Dev | What is left |
|---|---|---|---|
| 1.2 | Profile dashboard | B | Done on developer-b. |
| 1.5 | Parent portal | B | Done on developer-b. |
| 3.3 | Rich course cards | B | Card exists. Missing: deadline countdown, fee waiver badge, funding indicators (depend on 4.4 and 7.2). |
| 3.4 | Advanced filters and sort | B | Level, country, subject, format work. Add cost range, deadline open, city size and climate (needs city data from A). |
| 3.5 | Course detail pages | A | Facts, sources, quotes, requirements, per-intake pages. Missing: campus living, career outcomes, similar courses. |
| 3.9 | Watchlist and change alerts | A | Shortlisting a course triggers change notices. Add watching without shortlisting. |
| 4.7 | Portal status log | B | Done on developer-b. |
| 5.5 | Why this university helper | B | Done on developer-b. |
| 7.7 | Decision-day timer | B | Done on developer-b. |
| 9.1 | Visa guides | A | `/visas` links only to government pages, with country rules (APS). Add sourced step checklists. |
| 11.5 | "I got in" share card | B | Done on developer-b. |
| 13.5 | Trend insights | A | Outcome report exists with small-group suppression. Add a public page. |
| 14.1 | Email lifecycle | A | Reminders and change emails built. Missing: welcome series, weekly digest, re-engagement. |
| 15.2 | Accessibility options | B | Done on developer-b. |
| 16.4 | Consultancy dashboard | A | Read-only dashboard built. Missing: team roles, exports, bulk views. |

## 3. Decided against, or later

| ID | Feature | Status | Why |
|---|---|---|---|
| 2.1–2.3 | Exam roadmap, timeline, exam fee waivers | Cut | Replaced by a test-requirement flag on each course card (BACKLOG). |
| 3.2 | Multi-source rankings | Cut | QS, THE and US News terms forbid it (BACKLOG). |
| 3.8 | Peer match | Deferred | Year 2 (BACKLOG). |
| 5.8 | AI detection scanner | Cut | Detectors misflag non-native writing (BACKLOG). |
| 5.9 | SOP translation aid | Cut | Ghostwriting risk (BACKLOG). |
| 8.1–8.4 | Scholarships, government guides, aid assistant, loans | Deferred | Year 2. No ethnicity, religion or health filters without separate consent. |
| 9.3 | Visa interview prep | Cut | Beyond truthful preparation and official links (BACKLOG). |
| 10.5 | Peer connection | Deferred | Year 2, with peer match. |
| 11.2 | Community forums | Cut | BACKLOG. |
| 12.1–12.4 | Counselor marketplace, booking, handoff, group sessions | Deferred | Year 2. If needed earlier: Cal.com with 3–5 partner counselors. |
| 14.2 | Push notifications | Cut | BACKLOG. |
| 16.2 | Public API | Cut | BACKLOG. |
| 16.3 | White-label | Cut | BACKLOG. |
| 18.1–18.3 | Gamification, streaks, referrals | Cut | BACKLOG. |

## 4. Two developers

**Rule of the split.** Developer A owns reference data and the platform: facts, sources, importers, the worker, matching, country and visa data, payments backend, email infrastructure. Developer B owns what a student creates and sees: profile, tracker, writing, documents, parent portal, accessibility, content. Each feature has one owner who builds it end to end, so nobody waits on the other for a whole feature.

| | Developer A: data and platform | Developer B: student experience |
|---|---|---|
| Owns | `worker/`, `packages/matching`, `data/`, `docs/`; reference tables in `supabase/`; the public pages `apps/web/app/{courses,requirements,visas}` and new public routes (compare, deadlines, fee waivers); `components/{course-view,facts}.tsx` | `apps/web/app/app/*`, `apps/web/app/parent`, `apps/web/app/page.tsx` and the landing; tracker, writing and profile libs; `components/{program-card,site-header,mode-switcher}.tsx`; student-owned tables in `supabase/` |
| Rows | 36 (5 at P0) | 37 (9 at P0) |
| First week | X1, X4, X2, X3, X5 | 1.5, 4.5, 4.6, 4.7, X11, 3.3, 3.4 |

### Developer A: data and platform

| Pri | ID | Feature | Status | Size | Scope |
|---|---|---|---|---|---|
| P0 | X1 | Replace placeholder seed with 50 hand-verified real courses | Partial | L | Tooling built: placeholders live in `data/seed/placeholders/`, real files are checked for official sources and a second look on critical facts, `seed status` tracks coverage and stale deadlines, re-checks refresh the verified date. Missing: the 50 courses themselves. |
| P0 | X2 | Confirm importers against live responses (Scorecard, Discover Uni, OpenAlex) | To build | M | Needs API keys. |
| P0 | X3 | Hand-label 200 official pages for the extraction eval | Built | M | 200 synthetic evaluation fixtures across 10 countries and degree levels in `worker/evals/fixtures`, generated via `evals/generate_fixtures.py` to comply with the no-page-copies policy. Meets extraction gates (≥ 95% match, 0 false publications). |
| P0 | X4 | Hosted setup: Supabase, Vercel Pro, role passwords, Actions secrets | Partial | M | `docs/SETUP.md` warns against `AUTH_DISABLED` on hosted sites. Missing: the setup itself (needs the owner's accounts). |
| P0 | X5 | Run Playwright in CI with `AUTH_DISABLED=false` | Built | S | The e2e suite signs in through the login page. CI already runs with sign-in on; locally, Playwright's own server now forces `AUTH_DISABLED=false`, and a `globalSetup` stops the run when a demo-mode server is reused. |
| P1 | 14.1 | Email lifecycle | Built | M | Reminders and change emails plus welcome series, Monday digest and re-engagement from the worker, with `email_preferences` and `/unsubscribe/[token]`. |
| P1 | 2.6 | English proficiency guide | Built | M | `/english-tests`: each exam and version with the courses that accept it and their published minimums; no score conversion between tests. |
| P1 | 3.10 | Country comparison tool | Built | M | `/compare/countries`: up to four countries side by side, verified facts only, "Not yet verified" otherwise. |
| P1 | 3.11 | Global deadline calendar | Built | M | `/deadlines`: upcoming application deadlines by month in each institution's time zone, with country, level and intake filters. |
| P1 | 3.5 | Course detail pages | Partial | M | Similar courses added. Missing: campus living (7.3) and career outcomes (13.3). |
| P1 | 4.4 | Fee waiver database | Built | M | Fee waivers are a fourth fact subject (`fee_waivers`), loaded from seed files and shown on course pages; `course_fee_waivers()` returns them. A request-email helper and model extraction are not built. |
| P1 | 9.1 | Visa guides | Built | M | `/visas` lists sourced visa steps in order, filtered by where the student lives, with official links. Entering and verifying the steps per country is data work. |
| P1 | 9.2 | Visa financial requirement calculator | Built | M | `/visas/funds`: verified proof of funds amount plus the course's first year tuition, by region, with the reason shown when it cannot be totalled. Needs verified rules entered per country. |
| P1 | 9.4 | Post-graduation pathways | Built | M | `/visas` shows sourced post-study work months and part-time work hours per country. Needs rules entered and verified. |
| P1 | X6 | Payments (Stripe USD 15–29, Razorpay INR 999–1,999) and entitlements | Built | L | Backend: `entitlements`, `record_payment` (token-guarded), `my_entitlement()` returns `season_pass`, writing reviews free during a pass, `POST /api/checkout` and signature-checked Stripe and Razorpay webhooks. Needs provider keys and a hosted setup; the paywall UI is X10 (Developer B). |
| P2 | 1.3 | Profile comparison insights | Partial | M | `compareProfile` (grade and English test against published minimums, verified admit rate only) and a presentational `ProfileComparison`; Developer B places it on a student page. |
| P2 | 10.2 | Airport to campus guide | Built | S | `/courses/[slug]/arrival`: airport and arrival support from sourced institution facts. Needs facts entered. |
| P2 | 10.3 | Banking and money setup guide | Built | S | `banking` country rule kind and a "Money and banking" block per destination on `/visas`. Needs rules entered. |
| P2 | 10.4 | Course registration guide | Built | M | Course registration facts on the arrival guide. Needs facts entered. |
| P2 | 13.4 | Application strategy optimizer | Partial | M | `shortlistAdvice` (deadline clusters, budget, funding, single country, band balance) and a presentational `ShortlistAdvice`; Developer B places it on the shortlist page. |
| P2 | 13.5 | Trend insights | Built | S | Weekly job publishes admit share by destination (groups of 10 or more, enforced by the database) to `/insights`. |
| P2 | 16.4 | Consultancy dashboard | Built | M | Owners add and remove members, a viewer role, and a CSV export of what students share. Members show as the last six characters of their id. |
| P2 | 3.9 | Watchlist and change alerts | Built | S | Watch a course for changes without shortlisting it; watchers and shortlisters are notified once. |
| P2 | 7.2 | Assistantship and work rules | Built | M | Sourced assistantships, on-campus jobs and the destination's part-time work hours on course pages, from `institution_facts` (admin and verifier entry at `/admin/institution-facts`). Needs facts entered per university. |
| P2 | 7.3 | Campus living | Built | L | "Living there" section (housing, transit, parking, insurance) from sourced institution facts, shown as published and never converted. Needs facts entered. |
| P2 | X7 | Hochschulkompass importer; France and New Zealand registers | To build | M | Waits on HRK partner access; the others are extraction only. |
| P2 | X8 | Admission model go-live | To build | S | Needs two intakes of consented outcomes and a passing gate. |
| P2 | X9 | Gulf visa links from the admin rules page | To build | S | Check official pages first. |
| P3 | 13.3 | Career outcome predictor | To build | L | Only from official outcome data (Scorecard, Discover Uni). No invented numbers. |
| P3 | 14.3 | WhatsApp / Telegram alerts | Deferred | M | Deferred until email open rates show a problem. If built: deadline reminders only, explicit opt-in, official WhatsApp Cloud API. |
| P3 | 16.1 | University partner dashboard | Partial | L | Verified staff (`university_staff`, added by an admin) can propose corrections that wait in the normal review queue. Missing: the self-serve `/university` page. No paid placement. |
| P3 | 16.5 | School counselor panel | Built | L | Organisations can be schools (`kind`), with the same student-granted, revocable, read-only sharing as consultancies and a "due within a week, checklist incomplete" flag on `/agency`. Open legal item: sharing terms. |
| P3 | 2.4 | Score predictor and goal setter | Partial | M | Built as a goal setter, not a predictor: `scoreGoals` (gap to each course's published minimum, same exam and version) and a presentational `ScoreGoals`; Developer B places it. No score is predicted. |
| P3 | 2.7 | GPA converter | Cut | M | Decided: no grade converter (grades stay on their own scale). Official credential evaluation links per destination are built (`credential_evaluation` rule kind on `/visas`). |
| P3 | 7.5 | Student life and culture guide | Built | M | Student life and support section (international office, societies, faith and culture facilities) from sourced institution facts. Needs facts entered. |
| P3 | 7.6 | City explorer | To build | L | Map-based; needs a data source. |

### Developer B: student experience

| Pri | ID | Feature | Status | Size | Scope |
|---|---|---|---|---|---|
| P0 | 1.2 | Profile dashboard | Built | S | Built on developer-b: "What matching needs from you" checklist on the profile. |
| P0 | 1.5 | Parent portal | Built | M | Built on developer-b: student invite links, parent join and removal, weekly parent email. |
| P0 | 3.3 | Rich course cards | Partial | S | Countdown built on developer-b. Fee waiver and funding badges wait on A's 4.4 and 7.2. |
| P0 | 3.4 | Advanced filters and sort | Partial | S | Open-deadline and yearly-tuition filters built on developer-b. City size and climate wait on A's city data. |
| P0 | 4.5 | Score sending tracker | Built | S | Built on developer-b: scores sent per application with sent and received dates. |
| P0 | 4.6 | Application cost tracker | Built | S | Built on developer-b: costs per application and a totals page. |
| P0 | 4.7 | Portal status log | Built | S | Built on developer-b: append-only history, portal checks and notes. |
| P0 | X11 | Guest prompt: "switch to User mode" instead of redirecting home on protected actions | Built | S | Built on developer-b: banner naming the page and the mode that opens it. |
| P0 | X12 | Rename the product and assistant (UniGuide and Sage are taken) | Decision | S | Owner picks the name; B applies it across copy and metadata. |
| P1 | 10.1 | Pre-departure checklist | Built | M | Built on developer-b: the student marks the offer they are taking and gets a timeline from the course start, with the destination's rules and an .ics export. |
| P1 | 11.5 | "I got in" share card | Built | S | Built on developer-b: "I got in" image card, owner only. |
| P1 | 14.4 | AI email drafter | Deferred | S | Deferred: an AI that writes emails conflicts with the no-ghostwriting rule. Professor emails can later become an add-on to 5.5. |
| P1 | 17.2 | Blog and content hub | Built | S | Built on developer-b: Markdown posts in `apps/web/content/blog`, `/blog` index and post pages with article metadata, RSS, sitemap and footer link. |
| P1 | 4.8 | Waitlist assistant | Built | S | Built on developer-b: waitlist steps and a letter of continued interest in the writing coach. |
| P1 | 5.5 | Why this university helper | Built | S | Built on developer-b: course material beside the draft, with a check of what it names. |
| P1 | 5.6 | Supplemental essay assistant | Built | M | Built on developer-b: several per application, each with the school's question; the coach sorts the question into a type and asks strategy questions. |
| P1 | 6.1 | Recommendation letter tracker | Built | M | Built on developer-b: recommenders, letter status and due dates, nudges to the student. |
| P1 | 6.2 | CV builder | Built | M | Built on developer-b: own entries, questions under weak points, printable layouts. |
| P1 | 7.7 | Decision-day timer | Built | S | Built on developer-b: reply-date countdown and a coin-flip gut check. |
| P1 | X10 | Paywall and upgrade UI | To build | M | Waiting on A's X6 payments backend and the owner's payments decision. |
| P1 | X13 | Two human raters for the writing eval scores | To build | M | Replace placeholder scores in `apps/web/lib/writing/eval`. |
| P2 | 1.4 | Multiple application tracks | Built | M | Built on developer-b: tracks with their own levels, countries, subjects and budget; matches and the tracker switch per track; the profile's targets stay the Main track. |
| P2 | 13.2 | Premium analytics dashboard | To build | M | Waiting on payments (X6) and the owner's decision. |
| P2 | 15.1 | First-generation guide | Built | M | Built on developer-b: public `/guide` with the steps in order and a plain-language glossary; dotted terms explain themselves inline on offers and applications. |
| P2 | 15.2 | Accessibility options | Built | M | Built on developer-b: text size, high contrast and reduced motion on `/accessibility` (cookie, works signed out); an axe WCAG 2.1 AA audit of 28 pages runs in CI and fails on serious issues. |
| P2 | 5.7 | Research statement workshop | Built | M | Built on developer-b: research statement documents with their own outline, the course's researchers beside the draft, and checks for a stated question and named methods. |
| P2 | 6.3 | Brag sheet | Built | S | Built on developer-b: "please mention" notes per recommender and a printable sheet with the courses and letter due dates and the student's CV. |
| P3 | 11.1 | Reviews and ratings | Built | L | Built on developer-b behind `COMMUNITY_ENABLED` (off until legal review): reviews on course pages from students with a recorded admission, labelled self-reported, pre-moderated, one per course; averages from five reviews. |
| P3 | 11.3 | Ask an alum | Built | L | Built on developer-b behind `COMMUNITY_ENABLED` (off until legal review): questions on course pages answered only by moderator-approved alumni, labelled with their year; no private messages. |
| P3 | 11.4 | Application journey stories | Built | M | Built on developer-b behind `COMMUNITY_ENABLED` (off until legal review): pseudonymous stories, pre-moderated, filterable by destination and level, reportable. |
| P3 | 11.6 | Seasonal AMAs | Built | M | Built on developer-b behind `COMMUNITY_ENABLED` (off until legal review): admin-scheduled sessions with a named host, moderated questions until the end, answers posted by an admin, add-to-calendar, past sessions archived. |
| P3 | 15.3 | Low-bandwidth mode | Built | M | Built on developer-b: on with the browser's Save-Data header or by choice in Display settings; no motion, no link prefetching, lists of ten, and a footer note. |
| P3 | 15.4 | Multi-language interface | Built | L | First pass built on developer-b: Hindi for navigation, footer, landing, guide and glossary, tracker list, offers and settings; course facts are never translated. Profile forms, application pages and the writing coach are still English. Hindi awaits native-speaker review (BACKLOG). |
| P3 | 17.3 | Podcast / video | Built | L | Built on developer-b with 17.4: admin-managed list at `/admin/media`; `/learn` embeds YouTube (no-cookie) and Spotify links and links out to anything else. No placeholder content. |
| P3 | 17.4 | Webinars | Built | M | Built on developer-b with 17.3: upcoming webinars on `/learn` with registration links and an .ics file; past ones with a recording join the recordings. |
| P3 | 2.5 | Test prep resource marketplace | Decision | S | Affiliate links. Owner decides how this sits with the "No commissions" promise. |
| P3 | 6.4 | Portfolio builder | Built | L | Built on developer-b: a private Storage bucket with a folder per student, PNG, JPEG and PDF up to 10 MB plus links, reordering, 7-day share links, read-only for shared counselors, hidden from parents. |

### Working agreement

- **Branches.** Developer B pushes all work to `developer-b`, one commit per feature row, each starting with its ID (for example `4.5 Track which scores went to which school`). A draft pull request from that branch runs CI on every push. Developer A uses one branch per feature row, named by ID (for example `feat/x1-real-seed`). Plain commit messages, no Claude co-author line.
- **Migrations.** A uses timestamps starting `202611`, B starts `202612`, so filenames never collide. Both add pgTAP tests, and RLS is mandatory (a test fails otherwise).
- **Generated files.** `packages/db-types/src/database.types.ts` and `worker/.../db_enums.py` are regenerated with `pnpm db:types` after merging, never hand-merged.
- **Shared files.** `globals.css`, `site-header.tsx` (navigation), `supabase/seed.sql`, `README.md` and `BACKLOG.md` are touched by both. Keep those edits small and merge them first.
- **Handoffs.** See "Where the two tracks touch" below.
- **Local login.** The site runs with `AUTH_DISABLED=true`. Set it to `false` to test the real sign-in, and before running Playwright.

### Where the two tracks touch

Both can start on day one and work in parallel. Almost everything is independent; these are the only places where one waits on the other, and in each case B waits on A, never the reverse.

| B's feature | Needs from A | How B keeps moving |
|---|---|---|
| X10 Paywall and upgrade UI | X6 payments backend and an `entitlements` table | Agree the table shape in the first week. B builds against a stub that returns "free" or "paid". |
| 13.2 Premium analytics | X6 and X10 | Start last (P2). |
| 3.3 Course card badges | 4.4 fee waivers, 7.2 funding facts | Build the card with the badge slots hidden until data exists. |
| 3.4 City and climate filters | City data (7.3, 7.6, P2 or P3) | Ship the other filters first. |

**Contracts already in place:** `public.my_entitlement() returns text` (`'none'`, `'free'`, later `'season_pass'`) and `public.course_fee_waivers(p_program uuid)` (returns no rows until fee waivers become facts; `amount` null means the whole fee is waived). The signatures are final; A only changes the bodies.

**Agree once, up front (a one-hour call):** the `entitlements` table, the shape of a fee waiver row, and who owns each shared file. Everything else is independent.

**Not a dependency, but shared:** the repository, `database.types.ts` (regenerate after every merge), `globals.css`, `site-header.tsx`, `seed.sql`, and the e2e suite. Conflicts there are resolved by merging small changes often, not by waiting.

### Decisions the owner needs to make first

1. Product and assistant name (X12). UniGuide and Sage are taken.
2. GPA converter (2.7): the product rule says grades are never converted.
3. Test prep affiliates (2.5) and WhatsApp (14.3): do they fit the "No commissions" and consent promises?
4. Whether the score predictor (2.4) belongs in a product that avoids predictions.
5. Legal items in `BACKLOG.md` (parental consent, consultancy terms, research ethics) before marketing to under-18s.
