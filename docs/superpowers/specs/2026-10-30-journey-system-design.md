<!-- Source: "UniGuide journey system: build spec for Claude Code" (Oct 29, 2026, @Mo), added to the repository unchanged on 30 Oct 2026. Where it differs from the code on develop, see the M1 plan: docs/superpowers/plans/2026-10-30-journey-m1-engine.md -->

# UniGuide journey system: build spec for Claude Code

Oct 29, 2026 · @Mo

## 1. How to use this spec

This spec turns UniGuide's existing features into a guided journey: a student always sees which of seven stages they are in, their next three steps, and where each feature lives. It also lists the features that are missing. Hand it to Claude Code as the plan for one feature branch per milestone (section 9).

**Goal.** A student applying alone never wonders what to do next. A linked parent sees the same journey, read-only.

**Scope.** The journey engine, student navigation and home, onboarding, stage pages, the help panel, the parent view, journey-driven emails, and the missing features listed in sections 5 and 7. Data work (real courses, verifying rules) is out of scope here but is called out where the journey depends on it.

**Rules for Claude Code**

- Work on `develop`. One branch per milestone, named `feat/journey-m<N>-<slug>`; one commit per task, starting with the task ID (for example `J1.3 Rank next steps by deadline`). Plain commit messages.
- Read `README.md`, `docs/ARCHITECTURE.md` and `docs/FEATURES.md` before starting. Keep their product rules: the model never writes a fact a student sees; unverified facts never decide eligibility; no grade conversion; no admission percentage outside the gated model; no ghostwriting.
- Reuse before building. Most features already exist (section 5 names their routes and libraries). The journey work is mostly wiring, placement and copy.
- New migrations use timestamps starting `202701`, add pgTAP tests, and keep RLS on every table. Run `pnpm db:types` after a migration.
- Every new library function gets unit tests next to it (`*.test.ts`), like the existing `apps/web/lib` modules. Every new student flow gets a Playwright test in `apps/web/e2e`.
- Run `pnpm db:test`, `pnpm -r test`, `cd worker && uv run pytest` and `pnpm --filter web e2e` before marking a milestone done.
- Update `docs/FEATURES.md` and `BACKLOG.md` at the end of each milestone. Add a `docs/JOURNEY.md` that summarises sections 3 to 6 for future work.
- Copy is plain, short and kind: sentence case, no jargon, every number with its unit. The student is often 17 to 25 and may be the first in their family to apply abroad.

## 2. Overview

One journey engine reads what the student has saved and returns their stage and ranked next steps. Everything the student and parent see is built from that one result: the home page, the navigation state, the help panel, reminder emails and the parent view.

&#91;embedded content: journey system · engine, stored state, five surfaces\]

The home, navigation and help panel call the engine directly; the parent view and emails read the stored `journey_state`. No feature page changes its job: each step simply links to the page that does it.

## 3. Journeys

There is one student journey of seven stages. Students enter it at different points, follow slightly different steps by degree level and destination, and a parent follows alongside. Staff roles sit outside the journey.

### 3.1 The student journey

| # | Stage | The student is trying to | Route home |
| --- | --- | --- | --- |
| 1 | Set up | Tell UniGuide who they are and what they want | `/app/profile` |
| 2 | Explore | See what is possible for them | `/app/match` |
| 3 | Shortlist | Decide where to apply | `/app/shortlist` |
| 4 | Prepare | Get each application ready before its deadline | `/app/tracker` |
| 5 | Submit and wait | Keep track of what they've sent | `/app/tracker` (submitted view) |
| 6 | Decide | Choose the right offer | `/app/offers` |
| 7 | Go | Get there | `/app/departure` |

### 3.2 Entry paths

The onboarding question "Where are you right now?" sets the starting point. The stage after that is always computed from data (section 4), so the answer only decides where onboarding sends the student first.

| Answer | Onboarding asks for | Lands on |
| --- | --- | --- |
| Just exploring | Short profile (level, subject, countries, budget, intake) | First matches (stage 2) |
| I know roughly what and where | Same short profile | First matches, with shortlist prompt |
| I'm already applying | Short profile, then "add the courses you're applying to" | Tracker with checklists (stage 4) |
| I have offers | Short profile, then "add your offers" | Offers comparison (stage 6) |

A student whose course isn't in the catalogue must still be able to add it (gap G1, section 7).

### 3.3 Degree-level variants

The stages are the same; the steps inside stage 1 and stage 4 differ. The engine picks steps by `level` on the profile or the active track.

| Level | Differences |
| --- | --- |
| Undergraduate | School grades and predicted grades; supplemental essays (5.6); parent consent is common (under-18s); parent invited at signup by default; recommenders are teachers. |
| Master's | Degree credits and grade scale checked per course; statement of purpose and "why this university" (5.5); CV builder (6.2); recommenders are professors or employers. |
| Research (PhD, MRes) | Faculty dossiers (OpenAlex); research statement workshop (5.7); supervisor contact step before applying (gap G9); portfolio for some fields (6.4). |

A student with more than one track (1.4, for example a master's in Germany and one in the UK) sees one journey; next steps carry a track label.

### 3.4 Destination variants

Country rules (`country_rules`) add steps to stage 4 and stage 7: APS for Indian applicants to Germany, credential evaluation, proof of funds, banking. Only verified rules create a step; an unverified rule creates a "check this with the university" step labelled as unverified.

### 3.5 The parent journey

A linked parent (`parent_links`) follows the same seven stages, read-only. Each stage has one "how you can help" note (section 5). Parents never see essays, drafts, grades or scores. The student can revoke the link at any time.

### 3.6 Roles outside the journey

- **Counselor** (`/agency`): reads a sharing student's progress. The journey shows them the student's stage and next steps (read-only); no other change.
- **Reviewer and verifier** (`/admin`): unchanged. The journey adds one input: next steps that depend on unverified facts raise that fact's place in `verification_demand` (task J6.4).

## 4. Journey engine

The engine is a new pure TypeScript package, `packages/journey`, built and tested like `packages/matching`. It takes a snapshot of the student's data and a date and returns their stage and ranked next steps. The web app calls it directly; the worker reads its stored result (4.5) so there is only one implementation.

### 4.1 Input and output

```ts
type JourneyInput = {
  today: string;                 // ISO date, in the student's time zone
  profile: Profile;              // profiles row: level, fields, countries, budget, intake, grades, residence
  tracks: Track[];               // 1.4 tracks; the main track comes from the profile
  testScores: TestScore[];
  shortlist: ShortlistRow[];      // with program, cycle, deadlines
  applications: Application[];   // status, decision, offer_accepted_at, checklist_items, documents,
                                 // recommendation_requests, score reports, costs, events
  countryRules: CountryRule[];   // verified and unverified, for the student's destinations
  departureTasks: DepartureTask[];
  matchRuns: { latestAt: string | null };
  stepState: StepStateRow[];     // dismissed or snoozed steps (section 8)
  parentLinked: boolean;
  consentState: 'active' | 'pending_parental';
};

type JourneyResult = {
  stage: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  stageProgress: { done: number; total: number; label: string }; // "2 of 3 applications ready"
  steps: NextStep[];             // ranked, all of them; the home shows the first 3
  stalled: boolean;
  engineVersion: string;         // bump on any rule change, like ALGORITHM_VERSION
};

type NextStep = {
  id: string;                    // catalogue id + subject, e.g. "S4.07:app_123"
  catalogueId: string;           // e.g. "S4.07"
  stage: number;
  title: string;                 // imperative, under 60 characters
  reason: string;                // one sentence, under 160 characters
  href: string;                  // the feature that does it
  dueAt: string | null;
  rank: 'urgent' | 'long_lead' | 'stage' | 'carry_over';
  factRefs: { table: string; id: string; status: 'verified' | 'unverified' | 'conflicting' }[];
  trackLabel?: string;
  application?: { id: string; label: string };
  parentTitle?: string;          // safe wording for the parent view; omitted = not shown to parents
};
```

### 4.2 Stage rules

The stage is the furthest stage the student has entered. Rules are checked from 7 down to 1; the first that matches wins.

| Stage | Entered when |
| --- | --- |
| 7 Go | any application has `offer_accepted_at` set |
| 6 Decide | any application has decision `admitted` or `waitlisted` |
| 5 Submit and wait | any application is `submitted` and none is `preparing` with an open deadline |
| 4 Prepare | any application is `preparing` |
| 3 Shortlist | the shortlist (or any application `shortlisted`) has at least 1 course |
| 2 Explore | the matching minimum is met (the existing "what matching needs" list is empty) |
| 1 Set up | otherwise |

Stage 5 counts a student as "waiting" only when nothing is still being prepared. A student with one submitted and one preparing application is in stage 4; the submitted one shows as carry-over steps (portal checks).

### 4.3 Ranking

Steps are ranked in four bands, then by due date (soonest first), then by catalogue order:

1. `urgent`: due within 14 days, or overdue.
2. `long_lead`: a step with a known lead time whose latest safe start date is within 14 days (due date minus lead time). Lead times come only from sourced data (`country_rules.lead_days`, section 8) or from a fixed default per catalogue item listed in section 5.
3. `stage`: the current stage's catalogue steps.
4. `carry_over`: open steps from earlier stages, and steps for other applications in other stages.

Caps: the home shows 3 steps; the full list ("See all") shows every step grouped by band. A step can be snoozed for 7 days or dismissed when the catalogue allows it (section 5 marks which can't be dismissed).

### 4.4 Reason rules

- A reason may quote a date, amount or requirement only from a published fact, and lists that fact in `factRefs`. The UI shows a verified tick or an "unverified" label next to the reason.
- Never write "you meet" or "you don't meet" from an unverified or conflicting fact. Use "check this on the official page".
- If a step depends on something the student hasn't given (for example residence country for APS), the step asks for that instead.
- Reasons are templates in code, never model-generated.

### 4.5 Where results are stored

The web app writes the result to `journey_state` (section 8) whenever the home page renders, and a daily cron route recomputes it for students active in the last 90 days. The worker's emails (14.1) and the parent digest read `journey_state` instead of recomputing.

### 4.6 Stalled detection

`stalled` is true when the student completed no step in 14 days and any step is due within 30 days. Completed means a catalogue step's `done` check changed from false to true, recorded in `journey_events` (section 8).

## 5. Stage by stage

Each stage lists its step catalogue (the steps the engine can suggest), the existing features it uses, what is missing, the parent note and acceptance criteria. Feature IDs (1.1, 4.2...) are from `docs/FEATURES.md`; gap IDs (G1...) are defined in section 7. Every step's `href` must open the exact place where the step is done, not a general page.

### Stage 1: Set up

**For:** telling UniGuide who you are and what you want. **Done when:** the matching minimum is met. **Usually takes:** 15 minutes.

| ID | Step | Shows when | Done when | Links to |
| --- | --- | --- | --- | --- |
| S1.01 | Tell us what and where you want to study | level, fields or countries missing | all three set | `/app/onboarding` |
| S1.02 | Set your budget | budget missing | `budget_amount` set | `/app/profile#budget` |
| S1.03 | Choose your intake | `intake_year` missing | set | `/app/profile#intake` |
| S1.04 | Add your grades | no grade value | grade value and scale set | `/app/profile#grades` |
| S1.05 | Add your test scores | a target course lists a test and none is saved | one score saved, or "not taken yet" chosen (G11) | `/app/profile#tests` |
| S1.06 | Ask a parent to confirm your account (can't dismiss) | `consent_state = pending_parental` | consent active | `/consent` |
| S1.07 | Invite a parent to follow along | no parent link, level undergraduate, or budget step reached | link created or dismissed | `/app/sharing#family` |
| S1.08 | Upload your CV to fill this in faster | level master's or research, no grades yet | CV read or dismissed | `/app/cv` |

**Existing features:** 1.1 onboarding chat (`/app/onboarding`), 1.2 "what matching needs" (`/app/profile`), CV reader, age gate and parental consent (`/consent`), 1.5 parent invite, 1.4 tracks.

**Missing:** G6 trust screen and entry question; G11 planned tests ("not taken yet, booked for March").

**Parent note:** "Help set a realistic budget, including living costs, before {name} falls for courses that don't fit it."

**Acceptance:** a new student who answers "just exploring" reaches matches in one session; S1.06 blocks nothing visible except saving personal data, and its banner explains why.

### Stage 2: Explore

**For:** seeing what is possible. **Done when:** at least one course is on the shortlist. **Usually takes:** 1 to 3 weeks.

| ID | Step | Shows when | Done when | Links to |
| --- | --- | --- | --- | --- |
| S2.01 | Look through your matches | a match run exists and nothing shortlisted | 1 course shortlisted | `/app/match` |
| S2.02 | Find universities for your subject | no match run, or fewer than 5 matches | an enrichment job finished | `/app/matching` (find button) |
| S2.03 | Compare your countries | 2 or more target countries | comparison opened or dismissed | `/compare/countries?c=...` prefilled |
| S2.04 | Check which English tests your matches accept | non-native residence and no English score | test guide opened or score saved | `/english-tests` filtered to matches |
| S2.05 | Close the gap to a course's minimum score | a score is below a published verified minimum | score updated or dismissed | score goals panel (2.4, G8) |
| S2.06 | Try what-if | the student has under 5 matches because of one filter | opened | `/app/match/what-if` |
| S2.07 | Watch courses you're unsure about | viewed a course twice without shortlisting | watching or dismissed | course page watch button (3.9) |

**Existing features:** 3.1 matching (`/app/match`), on-demand enrichment (`/app/matching`), 3.3 cards, 3.4 filters, 3.5 course pages, 3.6 public explore, 3.7 what-if, 3.9 watchlist, 3.10 country comparison, 3.11 deadline calendar, 2.6 English test guide, match explanations, course Q&A.

**Missing:** G8 place `ScoreGoals` on the match page (built, not shown anywhere); G19 good empty states while the catalogue is small ("we're adding courses for your subject; here's what to do meanwhile").

**Parent note:** "Ask about the reasons behind each country, not just the rankings."

**Acceptance:** every match card has a one-tap shortlist button; after the first shortlist the home moves to stage 3 without a reload of other pages.

### Stage 3: Shortlist

**For:** deciding where to apply. **Done when:** at least one application is `preparing`. **Usually takes:** 1 to 4 weeks.

| ID | Step | Shows when | Done when | Links to |
| --- | --- | --- | --- | --- |
| S3.01 | Build a balanced shortlist | fewer than 6 shortlisted, or advice flags an imbalance | advice shows no warning, or dismissed | shortlist advice panel (13.4, G8) |
| S3.02 | See how your profile compares | shortlisted course with published minimums | viewed | profile comparison panel (1.3, G8) |
| S3.03 | Check the cost of each course | shortlisted course without a budget check | viewed | course cost scenario on `/app/shortlist` |
| S3.04 | Confirm the intake for each course | shortlisted course has more than one open cycle | cycle chosen | `/app/shortlist` |
| S3.05 | Decide which ones you're applying to (can't dismiss while none chosen) | nearest shortlisted deadline within 10 weeks | an application set to `preparing` | "I'm applying" button (G10) |
| S3.06 | Look at the cost range together with your parent | parent linked | parent view opened by parent, or dismissed | `/app/sharing` |

**Existing features:** shortlist (`/app/shortlist`), 13.4 shortlist advice (component built, not placed), 1.3 profile comparison (component built, not placed), optional bands, 1.4 tracks, cost scenarios from matching.

**Missing:** G8 place `ShortlistAdvice` and `ProfileComparison` on `/app/shortlist`; G10 an explicit "I'm applying to this" action that moves an application to `preparing` and creates its checklist.

**Parent note:** "Look at the cost range of each shortlisted course together."

**Acceptance:** "I'm applying" creates the tracker card and checklist in one action and moves the student to stage 4.

### Stage 4: Prepare

**For:** getting each application ready before its deadline. **Done when:** every application the student chose is `submitted`. **Usually takes:** 6 to 10 weeks. Steps here are per application; each carries the application label.

| ID | Step | Shows when | Done when | Links to |
| --- | --- | --- | --- | --- |
| S4.01 | Work through the checklist for {course} | open checklist items | all items done | `/app/tracker/[id]` |
| S4.02 | Start your APS certificate (or other country rule) | a verified rule applies to the student's residence and destination | checklist item done | rule item on `/app/tracker/[id]`, rule detail on `/visas` |
| S4.03 | Ask {recommender} for a letter | course requires letters and fewer requests than required are `asked` | enough requests `asked` | `/app/recommenders` |
| S4.04 | Send a brag sheet to {recommender} | request `agreed`, no brag sheet opened | opened | `/app/recommenders/[id]/brag-sheet` |
| S4.05 | Start your statement for {course} | course needs a statement and no document exists | document created | `/app/writing/new?application=...` |
| S4.06 | Get feedback on your draft | a draft exists with no review run | review run | `/app/writing/[id]` |
| S4.07 | Answer {course}'s extra questions | supplemental questions recorded and unanswered | documents exist with text | `/app/writing/new?kind=supplemental` (5.6) |
| S4.08 | Write your research statement | level research | document exists | 5.7 in `/app/writing` |
| S4.09 | Contact potential supervisors | level research, no supervisor logged | one contact logged | supervisor tracker (G9) |
| S4.10 | Build your CV | course asks for a CV and none exists | CV has entries | `/app/cv` |
| S4.11 | Book your test | a required test has no score and no booking | booking or score saved | test plans (G11) |
| S4.12 | Send your scores to {course} | score saved, course requires official scores, not marked sent | marked sent (4.5) | `/app/tracker/[id]#scores` |
| S4.13 | Check your passport is valid | destination selected, passport expiry missing or within 18 months of intake | expiry saved and fine | document readiness (G12) |
| S4.14 | Record the application fee | application has no cost row | cost recorded (4.6) | `/app/tracker/costs` |
| S4.15 | Upload your portfolio | course requires a portfolio | items added | `/app/portfolio` (6.4) |
| S4.16 | Submit {course} | all checklist items done | status `submitted` | `/app/tracker/[id]` |

Default lead times when no sourced value exists: recommenders 21 days, test booking 30 days, statement 21 days. These are defaults for ranking only and are never shown as facts.

**Existing features:** 4.1 tracker, 4.2 checklists with country rules, 4.3 email reminders, 4.5 score sending, 4.6 costs, 4.7 history, 5.1–5.7 writing coach, 6.1 recommenders, 6.2 CV builder, 6.3 brag sheet, 6.4 portfolio, faculty dossiers, `.ics` export, 3.11 deadline calendar.

**Missing:** G9 supervisor contact tracker; G11 test bookings; G12 document readiness (passport, transcripts, translations); G26 interview tracking (some courses interview).

**Parent note:** "Help gather documents like transcripts and certificates. The essays are {name}'s to write: encouragement helps more than edits."

**Acceptance:** each application's card shows "x of y ready"; the stage progress on the home reads "2 of 3 applications ready"; S4.02 never appears from an unverified rule (an unverified rule gives a "check with the university" step instead).

### Stage 5: Submit and wait

**For:** keeping track of what you've sent. **Done when:** a decision is recorded. **Usually takes:** 4 to 16 weeks.

| ID | Step | Shows when | Done when | Links to |
| --- | --- | --- | --- | --- |
| S5.01 | Check the {course} portal | submitted, no portal check logged in 10 days | check logged (4.7) | `/app/tracker/[id]#history` |
| S5.02 | Send the missing document | portal check noted "missing" | note resolved | `/app/tracker/[id]` |
| S5.03 | Prepare for your interview | interview event logged (G26) | event date passed | `/app/tracker/[id]` |
| S5.04 | Record the decision | expected decision date passed | decision set | `/app/tracker/[id]#decision` |
| S5.05 | Respond to the waitlist | decision `waitlisted` | letter of continued interest sent, or dismissed | 4.8 waitlist guide in `/app/writing` |
| S5.06 | Plan for the next intake | every decision is `rejected` | new track or intake chosen, or dismissed | G20 "no offers" path |

**Existing features:** 4.7 history and portal checks, 7.7 reply-date countdowns, 4.8 waitlist assistant, notifications (`/app/notifications`).

**Missing:** G20 a kind "no offers yet" path; G26 interview events; expected decision dates per course (a fact, sourced; part of G26).

**Parent note:** "This stage is mostly waiting. Patience is the most useful help."

**Acceptance:** a rejected-everywhere student sees supportive copy and a clear way back to stage 3 for the next intake, never an empty page.

### Stage 6: Decide

**For:** choosing the right offer and securing your place. **Done when:** one offer is accepted; its open enrollment steps (G13) carry into stage 7. **Usually takes:** 1 to 4 weeks, bounded by the earliest reply date.

| ID | Step | Shows when | Done when | Links to |
| --- | --- | --- | --- | --- |
| S6.01 | Add the details of your {course} offer | decision `admitted`, offer details missing (aid, conditions) | details saved | `/app/offers` |
| S6.02 | Compare the true cost of your offers | 2 or more offers | comparison viewed | `/app/offers` (7.1) |
| S6.03 | Fill in the decision matrix | 2 or more offers | matrix saved | `/app/offers` (7.4) |
| S6.04 | Reply to {course} by {date} (can't dismiss) | reply date within 21 days and no acceptance | offer accepted or declined | `/app/offers` (7.7) |
| S6.05 | Meet your offer's conditions | conditional offer (final grades, English score) | conditions marked met | enrollment steps (G13) |
| S6.06 | Pay the deposit for {course} | accepted, course has a deposit fact | marked paid | enrollment steps (G13) |
| S6.07 | Let your other universities know | accepted, other offers or waitlists open | each marked declined | enrollment steps (G14) |
| S6.08 | Get your admission document for the visa | accepted, destination needs one (I-20, CAS, admission letter) | marked received | enrollment steps (G13) |
| S6.09 | Share your outcome for research | decided, research consent not answered | answered | consent prompt |

**Existing features:** 7.1 true cost, 7.4 decision matrix, 7.7 decision-day timer and gut check, `set_accepted_offer`, 11.5 "I got in" card, outcome sharing, 7.2 assistantships, 7.3 campus living, 7.5 student life.

**Missing:** G13 enrollment steps after accepting (conditions, deposit, admission document, housing application); G14 declining other offers; G15 funding beyond awarded aid (8.x is deferred, see section 7).

**Parent note:** "This is where parents matter most. Compare the true cost of each offer together."

**Acceptance:** accepting one offer moves the others to "decline pending" and shows S6.07; the earliest reply date is always on the home page while the stage is open.

### Stage 7: Go

**For:** getting there and settling in. **Done when:** the pre-departure checklist is done and the arrival date has passed. **Usually takes:** 6 to 12 weeks.

| ID | Step | Shows when | Done when | Links to |
| --- | --- | --- | --- | --- |
| S7.01 | Apply for your student visa | accepted, admission document received | departure task done | `/visas` and `/app/departure` (9.1) |
| S7.02 | Prepare your proof of funds | destination has a verified funds rule | task done | `/visas/funds` (9.2) |
| S7.03 | Apply for housing | course has housing facts | task done | `/app/departure` with 7.3 facts, housing task (G13) |
| S7.04 | Arrange health insurance | destination rule `health_insurance` (G23) | task done | `/app/departure` |
| S7.05 | Get your credential evaluation | destination rule `credential_evaluation` applies | task done | `/visas` |
| S7.06 | Set up money and banking | destination has a `banking` rule | task done | `/visas` (10.3) |
| S7.07 | Plan your arrival | 30 days before course start | task done | `/courses/[slug]/arrival` (10.2, 10.4) |
| S7.08 | Register after you arrive | destination rule `residence_registration` (G23) | task done | `/app/departure` |

**Existing features:** 10.1 pre-departure checklist with `.ics`, 9.1 visa guides, 9.2 funds calculator, 9.4 post-study work, 10.2 arrival guide, 10.3 banking, 10.4 course registration, credential evaluation links.

**Missing:** G23 country rule kinds for health insurance, residence registration and housing; all of these are data entry plus one migration.

**Parent note:** "Proof of funds usually needs your documents. Start early."

**Acceptance:** after arrival the home shows a short "you made it" state with links to student life facts, and stops sending journey emails.

## 6. Shell: navigation, home, help, onboarding, parent view, emails

The shell is what makes the features feel like one system. All of it reads from the journey engine.

### 6.1 Student navigation (`apps/web/app/app/layout.tsx`)

Today the student area has no navigation. Add a top bar for signed-in students: Home, Explore, Shortlist, Applications, Offers, Visa and departure, plus Get help and the account menu. Items for stages not reached yet stay visible but quieter (secondary colour, no badge). Applications shows a count of urgent steps. On phones it becomes a bottom bar with Home, Explore, Applications, Help and More.

| Nav item | Routes inside it |
| --- | --- |
| Home | `/app` |
| Explore | `/app/match`, `/app/match/what-if`, `/app/matching`, `/courses`, `/compare/countries`, `/english-tests`, `/deadlines` |
| Shortlist | `/app/shortlist` |
| Applications | `/app/tracker`, `/app/tracker/[id]`, `/app/tracker/costs`, `/app/writing/*`, `/app/recommenders/*`, `/app/cv`, `/app/portfolio` |
| Offers | `/app/offers` |
| Visa and departure | `/app/departure`, `/visas`, `/visas/funds` |
| Account menu | `/app/profile`, `/app/sharing`, `/app/notifications`, `/accessibility`, sign out |

### 6.2 Journey home (`/app`, new)

Matches the canvas mockup. Top to bottom: greeting and one summary line; the seven-stage path with the current stage's progress; "Your next steps" (3 cards: band label, application label, title, reason, fact status with link to the source, one action button); a side column with the stage explainer (for, done when, usually takes), "Coming up" (next 3 deadlines, add to calendar), "Also open" (carry-over count), and who it's shared with. "See all steps" opens `/app/steps` with every step by band, snooze and dismiss.

Acceptance: loads in one server request using the snapshot query; no step card without a working link; empty states for every stage.

### 6.3 Help panel (G4)

A "Get help" button on every `/app` page opens a side panel (a drawer on phones). It contains, in order: what this stage is for and what done looks like; help for the current page (a short entry per route, stored in `apps/web/content/help/<route>.md`); course Q&A when the page belongs to a course or application; the glossary and first-generation guide (15.1); "Ask a parent to follow along" and, lower, "Share with a counselor". No free-form chatbot in this milestone.

### 6.4 Onboarding (G6)

Three screens before the existing chat, as in the canvas: how UniGuide works (the three tiers); "Where are you right now?" (four answers, section 3.2); the short profile (chat or form). It ends on the page the entry path names, never on a bare "Find universities" button. Save the answer as `profiles.entry_path`.

### 6.5 Parent view (`/parent`)

Keep what exists (shortlist count, checklist progress, next deadline, applications, weekly email toggle, no essays, drafts or grades). Add the stage path and summary line, the stage's parent note as "How you can help right now", and "What {name} is working on" from steps that have `parentTitle`. Steps without `parentTitle` (writing and grades) never show.

Invite prompts (S1.07 and the same step in stages 3, 6 and 7) ask the student, never the parent.

### 6.6 Emails

All journey emails use `journey_state` and the existing worker mailer and `email_preferences`.

- **Weekly student digest:** stage, top 3 steps, next 3 deadlines. Replaces the generic Monday digest for students with a journey.
- **Stalled nudge:** when `stalled` is true, the digest leads with the most urgent step and a one-line "you haven't checked in for a while".
- **Stage change:** one short email when the student enters stages 4, 6 and 7, explaining what the stage is for.
- **Parent digest:** stage, summary line, parent note and parent-safe step titles.

## 7. Gap analysis

The biggest gap is not a feature but the missing journey layer: no student home, no navigation, no next steps. After that come three built components that no page shows, and the enrollment steps between "admitted" and "visa". Checked against the code on `develop` and `docs/FEATURES.md` (103 rows) on 29 October 2026.

### 7.1 Gaps found in the journey review

Priority: P0 needed for the journey to work, P1 needed for a complete journey, P2 later. Size: S about 2 days, M about a week, L two weeks or more.

| ID | Gap | Stage | Why it matters | Size | Pri | Milestone |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | Add a course that isn't in the catalogue (own application, unverified, no facts) | 4 | "Already applying" students can't track real applications; `applications.cycle_id` is required today | M | P0 | M3 |
| G2 | Journey home `/app` | all | No student home page exists | M | P0 | M2 |
| G3 | Student navigation | all | The student area has no navigation; features are reachable only by URL | S | P0 | M2 |
| G4 | Stage-aware help panel | all | A student alone needs help where they are | M | P1 | M4 |
| G5 | Stage explainers and per-page help copy | all | Students don't know what each stage is for | S | P0 | M2 |
| G6 | Onboarding trust screen and entry question | 1 | Sets trust and the starting point | S | P0 | M2 |
| G7 | Journey engine and step catalogue (`packages/journey`) | all | Everything else reads from it | L | P0 | M1 |
| G8 | Place `ScoreGoals`, `ShortlistAdvice` and `ProfileComparison` | 2, 3 | Built and tested (2.4, 13.4, 1.3) but no page renders them | S | P0 | M3 |
| G9 | Supervisor contact tracker for research degrees (who, when, reply; no AI-written emails) | 4 | Research applicants often need a supervisor first | M | P1 | M5 |
| G10 | "I'm applying to this" action | 3 | The move from shortlist to preparing must be one clear decision | S | P0 | M3 |
| G11 | Test plans: booked test dates and "not taken yet" | 1, 4 | Lets the engine warn before deadlines; replaces the cut exam roadmap with the minimum needed | S | P1 | M3 |
| G12 | Document readiness: passport expiry, transcripts, translations (dates and yes/no, no uploads) | 4, 7 | Common late surprises | S | P1 | M5 |
| G13 | Enrollment steps after accepting: conditions, deposit, admission document (I-20, CAS, admission letter), housing application | 6, 7 | The "enrollment" part of the journey is missing between accepting and the visa | M | P0 | M5 |
| G14 | Decline other offers | 6 | Frees places for others and closes open applications | S | P1 | M5 |
| G15 | Funding beyond awarded aid | 3, 6 | Scholarships (8.x) are deferred; until then show 7.2 funding facts and official scholarship links per destination | S | P2 | later |
| G16 | Parent view on the journey: stage path, parent note, parent-safe steps | all | Parent sees progress in the same terms | M | P0 | M4 |
| G17 | Journey emails: digest, stalled nudge, stage change, parent digest | all | Nudges a student alone when they stall | M | P1 | M4 |
| G18 | Snooze and dismiss steps | all | Lets students keep the list honest | S | P1 | M1 |
| G19 | Empty states while the catalogue is small | 2 | Most matches are empty until real courses are added | S | P0 | M3 |
| G20 | "No offers yet" path | 5 | Rejection needs a kind next step, not an empty page | S | P1 | M5 |
| G21 | Next intake rollover: move a track to the next year and keep the profile | 5, 6 | Students reapply or defer | S | P2 | M5 |
| G22 | Counselor and school views show the student's stage and next steps | all | Same shared language for helpers | S | P2 | M4 |
| G23 | Country rule kinds: `health_insurance`, `residence_registration`, `housing`, plus `lead_days` | 4, 7 | Steps in stage 7 need them; lead times feed ranking | S | P1 | M5 |
| G24 | Notifications page shows journey events (stage changes, urgent steps) | all | One place for everything that changed | S | P2 | M4 |
| G25 | Steps that depend on unverified facts raise verification demand | all | Reviewers verify what students need next | S | P2 | M6 |
| G26 | Interview events and expected decision dates | 4, 5 | Some courses interview; waiting needs an expected date | S | P2 | M5 |

### 7.2 Gaps still open in the original feature list

Rows from `docs/FEATURES.md` that are not built, only partly built, or waiting on a decision, placed on the journey.

| ID | Feature | Status | Stage | What to do |
| --- | --- | --- | --- | --- |
| X1 | 50 hand-verified real courses | Partial (1 of 50) | 2, 3 | Data work. The journey works without it but shows mostly empty states (G19). Highest priority outside this spec. |
| X4 | Hosted setup | Partial | all | Owner's accounts. Needed before any real student uses the journey. |
| X2 | Confirm importers against live APIs | To build | 2 | Needs keys. |
| 2.4 | Score goal setter | Partial (not placed) | 2 | G8. |
| 13.4 | Shortlist advice | Partial (not placed) | 3 | G8. |
| 1.3 | Profile comparison | Partial (not placed) | 3 | G8. |
| 3.3 | Course card badges | Partial | 2 | Fee waiver and funding badges once 4.4 and 7.2 data exists. |
| 3.4 | City size and climate filters | Partial | 2 | Wait on city data (7.6). |
| 3.5 | Course detail: career outcomes | Partial | 2 | Depends on 13.3. |
| 13.3 | Career outcomes from official data | To build | 2, 6 | P2; only Scorecard and Discover Uni data. |
| 7.6 | City explorer | To build | 2, 6 | P2; needs a data source. |
| 16.1 | University partner dashboard | Partial | none | Outside the student journey. |
| X10 | Paywall and upgrade UI | To build | 4 | Decide where payments sit on the journey (section 10). |
| 13.2 | Premium analytics | To build | none | Wait on X10. |
| X12 | Product and assistant name | Decision | all | Needed before journey copy is final. |
| 15.4 | Hindi interface | Partial | all | New journey copy must go through `apps/web/lib/i18n` from the start. |
| X13 | Two human raters for the writing eval | To build | 4 | Unchanged. |
| X7, X8, X9 | More registers, admission model go-live, Gulf visa links | To build | 2, 7 | Unchanged. |
| 8.1–8.4 | Scholarships, loans | Deferred | 3, 6 | See G15 for the stopgap. |
| 12.x, 3.8, 10.5, 14.3, 14.4 | Counselor marketplace, peer match, WhatsApp, AI email drafter | Deferred | none | Unchanged; the help panel is the journey's answer for now. |
| 2.5 | Test prep affiliates | Decision | 1, 4 | Unchanged. |

Community features (11.1, 11.3, 11.4, 11.6) are built behind `COMMUNITY_ENABLED`. When legal review clears them, they belong in the help panel (6.3) and on course pages, not in the step catalogue.

## 8. Data model and migration changes

Six new tables and a few columns cover every gap. All are student-owned rows with RLS (students see and write only their own; writes blocked while `consent_state = pending_parental`, like the existing personal tables). Timestamps start `202701`; each migration ships with pgTAP tests.

| Change | For | Shape | Who reads |
| --- | --- | --- | --- |
| `profiles.entry_path` | G6 | text, check in (`exploring`, `knows`, `applying`, `offers`), nullable | student |
| `journey_state` (new) | G7, G17 | `user_id` pk, `stage` smallint 1–7, `stage_progress` jsonb, `steps` jsonb (ranked `NextStep[]`), `stalled` bool, `engine_version` text, `computed_at` | student; `notifier` role for emails |
| `parent_journey(p_student uuid)` (new RPC) | G16 | security definer; returns stage, progress and only steps with `parentTitle`, for an active `parent_links` row | parent |
| `journey_step_state` (new) | G18 | `user_id`, `step_id`, `state` (`snoozed`, `dismissed`), `until` timestamptz, pk (`user_id`, `step_id`) | student |
| `journey_events` (new, append-only) | 4.6, G24 | `id`, `user_id`, `kind` (`stage_entered`, `step_done`), `stage`, `catalogue_id`, `created_at` | student; `notifier` |
| `applications.cycle_id` nullable plus `own_institution`, `own_title`, `own_country`, `own_due_at` | G1 | check: `cycle_id` is set, or all `own_*` fields are; own applications are labelled "added by you, not checked" and never feed matching, research or verification | student, parent (titles only) |
| `applications` enrollment columns: `conditions` text, `conditions_met_at`, `deposit_paid_at`, `admission_document_received_at`, `housing_applied_at`, `declined_at`, `expected_decision_on` date | G13, G14, G26 | all nullable, student-entered | student |
| `test_plans` (new) | G11 | `id`, `user_id`, `exam`, `exam_version`, `status` (`not_taken`, `booked`), `booked_for` date | student |
| `readiness_items` (new) | G12 | `id`, `user_id`, `kind` (`passport`, `transcript`, `translation`, `other`), `ready` bool, `expires_on` date, `note`; no file uploads | student |
| `supervisor_contacts` (new) | G9 | `id`, `user_id`, `application_id` nullable, `faculty_profile_id` nullable, `name`, `institution`, `contacted_on`, `reply` (`none`, `positive`, `negative`), `note` | student |
| `application_events` kind `interview` | G26 | add to the existing kind check, with `occurs_at` | student |
| `country_rules.kind` adds `health_insurance`, `residence_registration`, `housing`; new `lead_days` int with its own `evidence_quote` | G23 | `lead_days` only counts when the rule is verified | everyone (published rules) |

After the migrations, run `pnpm db:types` and regenerate `worker/.../db_enums.py`. Add every new table to the RLS coverage test and the parent-cannot-see test.

## 9. Build plan

Six milestones, in order; each is one branch and ends with all four test suites green. M1 and M2 make the journey real; M3 to M5 fill the gaps stage by stage; M6 polishes. Sizes add up to about 7 to 9 weeks for one developer.

### M1: Journey engine (`feat/journey-m1-engine`, about 2 weeks)

- [ ] J1.1 Create `packages/journey` with the types in 4.1, `ENGINE_VERSION`, and the same build, lint and test setup as `packages/matching`.
- [ ] J1.2 Stage rules from 4.2, with a fixture per stage and per entry path.
- [ ] J1.3 Step catalogue S1.01 to S7.08 as data: id, stage, levels, `applies`, `done`, title and reason templates, `href`, default lead days, dismissable, `parentTitle`. Steps that need M3 or M5 tables return nothing until those exist.
- [ ] J1.4 Ranking from 4.3 and stalled detection from 4.6. Property tests: urgent steps always come first; a dismissed step never appears before its `until`; no reason quotes an unverified fact without its label.
- [ ] J1.5 Migrations: `journey_state`, `journey_step_state`, `journey_events`, `profiles.entry_path`, with pgTAP tests.
- [ ] J1.6 `apps/web/lib/journey-snapshot.ts`: one query that loads `JourneyInput` for a user; writes `journey_state` and `journey_events`.
- [ ] J1.7 Daily cron route that recomputes `journey_state` for students active in the last 90 days.

Done when: given fixture data for each stage and entry path, the engine returns the expected stage and top three steps, and `journey_state` is written.

### M2: Shell (`feat/journey-m2-shell`, about 1.5 weeks)

- [ ] J2.1 Student navigation from 6.1, desktop and phone.
- [ ] J2.2 Journey home `/app` from 6.2, matching the canvas mockup.
- [ ] J2.3 `/app/steps`: all steps by band, with snooze and dismiss.
- [ ] J2.4 Stage explainer copy for all seven stages in one content file, through `apps/web/lib/i18n`.
- [ ] J2.5 Onboarding screens from 6.4, saving `entry_path` and routing by it.
- [ ] J2.6 Playwright: a new student goes from sign-up to first matches; a student with a preparing application lands on the home with stage 4.

Done when: every `/app` page has navigation, and a signed-in student always lands on a home that shows their stage and next steps.

### M3: Explore, shortlist and prepare wiring (`feat/journey-m3-wiring`, about 1.5 weeks)

- [ ] J3.1 Place `ScoreGoals` on `/app/match`, `ShortlistAdvice` and `ProfileComparison` on `/app/shortlist` (G8).
- [ ] J3.2 "I'm applying to this" action (G10): sets `preparing`, builds the checklist, links to the tracker card.
- [ ] J3.3 Own applications for courses not in the catalogue (G1), including the migration and labels.
- [ ] J3.4 Test plans (G11): migration, profile section, steps S1.05 and S4.11.
- [ ] J3.5 Empty states for matches, shortlist and tracker (G19).
- [ ] J3.6 Add anchors (`#budget`, `#tests`, `#scores`, `#history`, `#decision`) so every step `href` lands on the exact control.

Done when: every step in stages 1 to 4 links to a working control, and the "already applying" entry path works for a course outside the catalogue.

### M4: Help, parent and emails (`feat/journey-m4-help-parent`, about 1.5 weeks)

- [ ] J4.1 Help panel (G4) with per-route help files.
- [ ] J4.2 `parent_journey` RPC and the parent view additions (G16); pgTAP test that a parent never receives a step without `parentTitle`.
- [ ] J4.3 Journey emails in the worker (G17): student digest, stalled nudge, stage change, parent digest.
- [ ] J4.4 Stage and steps on `/agency/[student]` (G22) and journey events on `/app/notifications` (G24).

Done when: a linked parent sees the stage path and parent note, and a stalled student receives a nudge in the local Mailpit.

### M5: Enrollment and edge paths (`feat/journey-m5-enrollment`, about 1.5 weeks)

- [ ] J5.1 Enrollment columns and an "After you accept" panel on `/app/offers` (G13): conditions, deposit, admission document, housing.
- [ ] J5.2 Decline other offers (G14).
- [ ] J5.3 Readiness items (G12) and supervisor contacts (G9).
- [ ] J5.4 "No offers yet" path and next-intake rollover (G20, G21).
- [ ] J5.5 Country rule kinds and `lead_days` (G23); admin rules page can enter them.
- [ ] J5.6 Interview events and expected decision date (G26).

Done when: a student can go from "admitted" to "arrived" with a step for every task, and a rejected-everywhere student has a clear way back.

### M6: Polish (`feat/journey-m6-polish`, about 1 week)

- [ ] J6.1 Add the new pages to the axe accessibility audit in CI.
- [ ] J6.2 Hindi strings for all journey copy, marked for native-speaker review.
- [ ] J6.3 Low-bandwidth mode check for home and help panel.
- [ ] J6.4 Steps that depend on unverified facts raise `verification_demand` (G25).
- [ ] J6.5 Write `docs/JOURNEY.md`; update `docs/FEATURES.md` and `BACKLOG.md`.

## 10. Open questions

Claude Code should use the default in brackets and flag it in the pull request, unless the owner decides otherwise first.

- Product and assistant name (X12) before journey copy is final. \[Keep "UniGuide" in copy through a single constant.\]
- Where payments sit on the journey (X10): before the writing review in stage 4, or as a season pass offered at stage 3? \[No paywall in these milestones.\]
- Should stage 3 require a minimum shortlist size before "I'm applying" is offered? \[Advise 6 to 10, never require.\]
- Own applications (G1): should a reviewer be able to turn one into a catalogue course later? \[No, out of scope; record the request in `BACKLOG.md`.\]
- Parent invites for undergraduates: suggest at signup by default, or only at the budget step? \[At signup for undergraduates, at the budget step for others.\]
- Journey emails: replace the existing Monday digest for students with a journey, or send both? \[Replace.\]
- Default lead times in section 5 (21 and 30 days) are guesses used only for ranking. Confirm or adjust. \[Use them; never show them as facts.\]
