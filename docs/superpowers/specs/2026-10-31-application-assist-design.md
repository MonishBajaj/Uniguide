# Application assist: design spec

**Status:** draft for the owner's approval. No code until approved.

**Milestone:** M7, after the journey milestones (M1 to M6).

**Plan:** `docs/superpowers/plans/2026-10-31-application-assist-m7.md`

## 1. How to use this spec

This spec covers two features, each delivered through a browser extension:

- **Assisted fill (feature 1):** on a supported application portal, a side panel lists the page's fields with our suggested value, where it comes from in the student's profile, and fill, copy and skip buttons.
- **Guided apply (feature 2):** the student starts an application from the tracker. In the student's own tab, the extension works through the portal section by section, filling each page and moving on, and stops at the portal's review page. The student reviews everything there and submits it themselves.

Assisted fill ships first. Guided apply builds on its parts and ships after it.

**The binding rules** are in section 4 ("Rules"). Anything in the plan that conflicts with them loses.

**Portal terms (section 3) gate all portal work.** No portal is supported, mapped or observed until its row in section 3 says so.

## 2. Sources and the clean-room boundary

- **What we know about the competing product** (EZCollegeApp's extension) comes only from `docs/research/behavioural-spec.md`. That file came from a clean-room analysis of public material.
- **Allowed sources besides it:** ideas from their arXiv paper (2602.15850) and their public repository. Anything taken from these is re-expressed in our own way.
  - **No code from the repository:** its licence file is missing, and the owner is confirming terms with the authors.
- **Never:** REA or any other tool is never used on EZCollegeApp's extension, website or service, or on any other competitor's product. Nobody on the team signs up for or installs them.
- **Our own:** architecture, names, interface, wording and visual design are all ours.
- **Disclosed limit:** the agent drafting this spec also did the analysis that produced `behavioural-spec.md`. It used only public material the owner has approved, and it never inspected their code or used their product. Even so, the implementation isn't clean-room in the strict sense of separate people. The plan therefore adds an independent review before release (plan, decision 1).

## 3. Portal terms

Read on 31 October 2026. This is not legal advice: each row needs counsel's sign-off, or the portal's written permission, before it unlocks.

### 3.1 Common App (Terms of Use at commonapp.org/terms-of-use)

The licence restrictions say you must not, directly or indirectly:

- **(a)** use the service to create software that performs substantially the same functionality as it
- **(b)** "disassemble, decompile, reverse-engineer, or use any other means to attempt to discover any source code, algorithms, trade secrets, or applications underlying" the service
- **(d)** create derivative works of the service
- **(e)** circumvent security mechanisms
- **(h)** overburden the service
- **(j)** "engage in any 'data mining,' 'deep-link,' 'page-scrape,' or use 'bots,' 'spiders,' or similar data gathering and extraction tools or methods in connection with the Solution"

Two other points:

- The student is responsible for everything entered through their account. Common App relies on every input as if the student made it.
- The terms don't mention browser extensions.

| Question | Reading | Status |
|---|---|---|
| (a) An extension that fills one field when the student clicks | **Not addressed.** Filling doesn't gather data. However, to match fields the extension must read the page's field labels, which could be read as "page-scrape" under (j). It doesn't replicate Common App's own functionality, so (a) shouldn't apply. | **Unclear: needs written permission or counsel's sign-off** |
| (b) An extension that moves through the application from page to page | Acting through the application on the student's behalf is close to the "bots" in (j). | **Treated as not allowed.** Don't support guided apply without written permission. |
| REA mapping (step A) and REA observation of a run (step C) | REA's browser observation captures page structure, scripts and network. That is a data-gathering and extraction tool (j), and arguably a means of discovering the application behind the pages (b). | **Not allowed** without written permission |

**Result:** Common App goes on the **"don't support" list for guided apply**, and on the **"permission needed" list for assisted fill**.

### 3.2 UCAS (Terms and conditions for use of the UCAS network, adopted 24 November 2025; Undergraduate applicant declaration)

The website terms forbid:

- **4.1.1:** decrypting, extracting, disassembling, reverse-engineering or decompiling the website
- **4.1.3:** including any portion of the website in any other software program
- **4.1.5:** creating modifications or derivative works using the website
- **4.1.7:** interfering with or disrupting the website

They have no bots or automation clause. Use of Apply is governed by the applicant declaration, which says:

- the personal statement must be the applicant's own work, and must not include material provided by others, "including artificial intelligence software"
- information must be true, complete and accurate
- an agent may submit for an applicant only with authority and the applicant's agreement

| Question | Reading | Status |
|---|---|---|
| (a) An extension that fills one field when the student clicks | **Not forbidden** by any clause read. The student acts for themselves. We only paste the student's own statement, never generated text, which is consistent with the declaration. | **Likely allowed**, subject to counsel's sign-off |
| (b) An extension that moves through the application from page to page | **Not forbidden** by any clause read. It must not disrupt the site (4.1.7). We stop before the declaration, payment and submit steps. | **Likely allowed**, subject to counsel's sign-off |
| REA mapping and observation (steps A and C) | REA's capture of structure, scripts and network is arguably "extracting" and reverse-engineering (4.1.1). Saving page captures as test fixtures in our repo is arguably including portions of the website in other software (4.1.3). | **Not allowed** without written permission. Fixtures must not contain UCAS page content (see 7.4). |

**Result:** UCAS is a **candidate for both features**. Its adapter can't be built until the mapping question is resolved, because REA mapping on UCAS needs permission (plan, gate G2).

### 3.3 Later portals (checked 31 October 2026, same split)

Ordered by our target countries. There are no live user figures yet, so this uses the documented Wave 1 order: US, GB, CA, AU, DE, IE, with NL after.

| Portal | Terms read | (a) Fill on click | (b) Move through the application | REA steps A and C |
|---|---|---|---|---|
| **Slate graduate applications (US)**, per university | The application and account pages at University of Wisconsin–Madison, University of Georgia and University of Missouri link no terms of use, only university privacy notices. Technolutions processes applicant data on behalf of each university, which controls its own form. No clause found forbids tools. | Not forbidden by anything found | Not forbidden by anything found | Not addressed |
| **OUAC (CA)** | Couldn't read first-hand: the site serves a bot challenge to automated fetches, so a person must read it. Secondary sources say: one account per applicant; keep credentials confidential; content "written by a third party" can affect an application. | Unknown | Unknown | Unknown |
| **uni-assist (DE)** | General Terms and Conditions, a service contract. Nothing on tools, extensions or reverse-engineering. A representative needs a signed power of attorney; payments only through its portal. | Not forbidden by anything found | Not forbidden by anything found | Not addressed |
| **Studielink (NL)** | General terms and conditions. Answer truthfully; keep login details confidential; Studielink is protected against "unlawful use or misuse" and may pursue those responsible. Nothing on tools. | Not forbidden by anything found | Not forbidden by anything found | Not addressed |

**What this means for each:**

- **Slate:** each university's form is different. An adapter is per university, not per platform, and its gate is cleared per university, by its graduate admissions office or by counsel.
- **Every portal in this table** keeps its gate closed until written permission or counsel's positive review, as with G1 and G2. "Not forbidden" is not the same as permitted.
- **Phases:** each portal becomes a later phase of the plan, in the order of the table.

### 3.4 The lists

| List | Portals |
|---|---|
| Don't support | Common App, guided apply |
| Permission needed before any work | Common App assisted fill; REA steps A and C on any real portal |
| Candidate for both features, pending counsel | UCAS; Slate (per university); uni-assist; Studielink |
| Unknown, terms not yet read by a person | OUAC |

**What this means for the build:**

- **Until a portal is cleared,** all mapping, adapter, runtime and end-to-end work runs against a **practice portal** we build and own (section 7.5). REA steps A, B and C apply there without restriction.
- **Clearing a portal later** adds its adapter. The engine, guard, panel and tests don't change.

## 4. Rules (binding for both features)

1. **Runs only in the student's own browser, through the extension.**
   - There are no server-side or headless logins.
   - We never ask for, see, store or handle a portal password. The student signs in to the portal themselves.
2. **The student starts every fill and every guided-apply run.**
   - Progress is always visible.
   - Pause and Stop are always available and take effect before the next action.
3. **Guided apply pauses and asks whenever:**
   - a field has no confident match
   - a required field has no confirmed profile value
   - a page doesn't match the adapter's map
   - a CAPTCHA or other security check appears
   - anything else is unexpected

   It never guesses.
4. **It never clicks submit, pay, sign, certify or any final declaration.** It stops before payment, fee waivers and "this is my own work" steps.
   - A guard layer blocks those controls even if an adapter is wrong. The guard has its own tests.
   - The guard denies by default: a click happens only on a control the adapter declares as moving to the next page, and only if the guard independently judges it safe.
5. **It fills only confirmed profile facts:**
   - grades exactly as entered, with no conversion
   - test scores
   - education
   - activities
   - contact details

   If a portal wants a format the student hasn't entered, the run pauses and asks. It never converts.
6. **Essays and statements:**
   - It offers to paste the student's own final draft from the UniGuide writing workspace, after the student confirms.
   - It never generates or edits text in a field (no ghostwriting).
   - With no final draft, the field stays empty and is listed for review.
7. **AI-policy mode per course:**
   - For a course whose policy bans AI help, and for any course whose policy is unknown, which counts as a ban:
     - factual fill still works
     - the extension never pastes into an essay field
     - the panel can copy the student's own final draft to the clipboard, for the student to paste themselves
   - Automatic paste works only for courses whose verified policy allows it.
8. **Consent:** no extension feature works while the student's consent is pending or revoked.
9. **Audit log:** every run and every field filled, skipped or left is logged and visible to the student.
10. **Submitted status:** when the portal's confirmation page is detected, or the student says they've submitted, the tracker application moves to submitted.
11. **Network:** the extension talks only to our Supabase project. Model help for unmatched fields goes through a Supabase Edge Function (decision 6).

## 5. Assisted fill (feature 1)

### 5.1 Activation and sign-in

- **Where it runs:** only on the portal hosts listed in the extension's host permissions, and there only on pages its adapter recognises.
- **On other pages of a supported portal:** the toolbar button says the page isn't supported.
- **Sign-in** uses our Supabase auth in a page we control. The extension keeps the Supabase session in extension storage and signs out on request.
- **Consent:** if consent is pending or revoked, the panel shows only the reason and a link to fix it.

### 5.2 Getting profile data

- **One RPC:** the extension reads the student's fill profile through a single row-level-security (RLS) protected function, the same pattern as `journey_snapshot`. It returns only what portals ask for:
  - identity and contact details
  - education, grades as entered (value and scale)
  - test scores
  - activities
  - the course's AI policy
  - the ids of final drafts (not their text)
- **Draft text** is fetched one field at a time, only after the student confirms a paste.

### 5.3 The side panel

For the current portal page, each field the adapter knows is shown with:

- the field's label, as our own short name for what it asks
- our suggested value, shown exactly as stored
- its source, for example "Profile › Education › Grade, as you entered it"
- match confidence
- the actions **Fill**, **Copy** and **Skip**

Fields are grouped as the page groups them, in page order. These are always listed separately:

- fields with no match or no confirmed value
- essay fields, with a paste offer only if allowed

**Actions:**

- **Fill** writes into that one field only, as a user would.
  - It asks before overwriting existing text.
  - For choice fields, it selects only an exactly matching option. If none matches, it does nothing and says so.
  - It never truncates.
- **Copy** puts the value on the clipboard.
- **Skip** marks the field "left for me" in this run's log.

There is no "fill all" button in assisted fill.

### 5.4 Matching

- **Rules first:**
  1. The adapter's map gives each known field a role in our canonical schema.
  2. Fields not in the map are matched by their visible label and the section they sit in, using our own synonym lists.
- **Model only for what's left:**
  - For a field still unmatched, the student can ask for a suggested role.
  - The model sees only that field's visible label and our list of roles, never student data.
  - Its suggestion is shown with a "suggested" badge and must be confirmed before any fill.
- **Repeated and conditional fields:**
  - Repeated groups (for example several activities) are matched in order, and the student can change which entry goes where.
  - Conditional fields are offered only while visible.

## 6. Guided apply (feature 2)

### 6.1 Starting

- **The Apply button** is on a tracker application whose portal supports guided apply, for example a UCAS course once cleared.
- It opens the portal's start page in a new tab of the student's own browser. The student signs in themselves if needed.
- The extension shows a start screen listing:
  - the sections it will work through
  - what it will and won't do: never submit, pay, sign or certify
  - the course's AI-policy mode

  The student presses Start.

### 6.2 The run

The run is a state machine:

| State | Meaning |
|---|---|
| Ready | Shown the start screen, waiting for Start |
| Filling page *n* | Filling the current page |
| Paused (reason) | Waiting for the student |
| Moving to page *n+1* | Pressing the adapter's next-page control, through the guard |
| At review | The portal's own review page; the run stops |
| Stopped by the student | The student pressed Stop |
| Finished | The application is marked submitted |

**On each page:**

1. **Check the page.** If the page doesn't match the adapter's map (title, section, required fields), the run pauses: "This page looks different from what we expected."
2. **Fill.** Every confidently matched field with a confirmed value is filled. Every other field is listed and causes a pause if the portal marks it required.
3. **Essays.** Following the course's AI-policy mode, the run offers the student's final draft and waits for confirmation. With no draft, the field is listed for review.
4. **CAPTCHAs.** On a CAPTCHA, security check, sign-in screen, payment form, declaration or anything unexpected, the run pauses and explains why.
5. **Move on.** Only when nothing on the page needs the student does the run press the adapter's next-page control, through the guard. It then waits for the portal to load the next page before checking it.

**Controls:**

- Pause and Stop are always visible.
- The student can resume after fixing something, and can skip a field (logged).
- The student can also take over: the run hands back control, and can be restarted from the current page.

### 6.3 At the review page

The run stops. The panel summarises:

- fields filled
- fields left for the student
- fields skipped
- pages where it paused, and why

Each item links to its place. The extension then waits:

- If the student submits and the portal shows its confirmation page, or the student presses "I've submitted", the tracker application moves to submitted. The log records which of the two happened.

## 7. Architecture

### 7.1 Pieces

- **`apps/extension`:** a Chrome Manifest V3 extension (TypeScript). It has:
  - a background service worker: the Supabase session, runs, the audit queue
  - a content script for supported portal hosts: page reading, fill, guard
  - a side panel: the interface
- **`packages/portal-adapters`:** pure TypeScript, one adapter per portal, built from that portal's map. Each adapter has:
  - sections and page order
  - fields: role, label, how to find it, type, required or conditional
  - the review page, the confirmation page
  - never-click controls, and next-page controls
  - The adapters, the matcher and the guard rules live here, with no browser dependency, so they can be unit-tested against fixtures.
- **Supabase:**
  - the fill-profile RPC
  - the audit-log tables
  - the final-draft marker
  - the course AI-policy fact
  - an Edge Function for model role suggestions
- **The web app:**
  - the Apply button in the tracker
  - the audit-log view
  - a "Use as final draft" control in the writing editor
  - the AI-policy fact on course pages
  - the extension's sign-in page

### 7.2 The guard

Every click and every navigation the content script makes goes through the guard. The guard allows a click only when **all** of these hold:

1. The run is active, and the student started it.
2. The adapter declares the control as next-page, or as a non-submitting control such as "add another activity".
3. The control is not in the adapter's never-click list.
4. Independently of the adapter, the control:
   - isn't a form submit control
   - isn't inside a payment or third-party frame
   - doesn't carry any of these words (English and Hindi lists, case-insensitive) on itself, its label or its accessible name: submit, pay, payment, fee, waiver, sign, signature, certify, certification, declaration, declare, confirm, agree, I agree, final, send application, purchase
5. The current page matches the adapter's map.

Anything else is blocked, logged, and pauses the run. The guard never sends keystrokes that could submit a form (Enter in a text field), and never ticks a declaration checkbox.

**The guard's tests** run independently of any adapter:

- a deliberately wrong adapter that labels a submit button as next-page must be blocked
- the same for a pay link, a declaration checkbox, and a confirm button inside a frame

### 7.3 How real-portal maps are made

- **By hand, not by REA capture.** The owner records field labels and identifiers by hand while using their own test account normally, with the synthetic profile only. They never submit and never enter real data.
- **Our own data.** The map is written as our own structured data: roles, our short wording for each label, identifiers needed to find each field, and the never-click controls.
- **REA on a real portal** runs only after that portal's gate is cleared, and only within what the permission allows.

### 7.4 Adapter reference data and fixtures

A portal map records:

- the order of sections and pages
- each field's role, its visible label in our own short wording, its type, and whether it's required or conditional
- how to find each field
- the review and confirmation pages
- every never-click control

**Test fixtures:**

- **Practice portal:** fixtures are captured pages.
- **Real portals:** fixtures keep only what's needed to find fields (identifiers and roles), written as our own structured data. No page copy, scripts or assets are stored. This respects UCAS 4.1.3 and Common App (d), and is subject to counsel.

### 7.5 The practice portal

**What it is:** an application portal we build and own, served locally for tests. It has:

- our own invented sections and wording
- required and conditional fields
- repeated groups
- an essay field
- a CAPTCHA stand-in
- a payment step
- a declaration
- a review page
- a confirmation page

It is not a copy of any real portal.

**What it's for:**

- developing and testing both features
- running REA steps A to C without restriction until a real portal is cleared
- continuing to serve as the always-on regression suite afterwards

### 7.6 Data model

- **`fill_profile(p_application_id)` RPC:**
  - security definer, `search_path = ''`
  - returns only the caller's own data, and nothing while consent is pending or revoked
- **`assist_runs`:** id, user, application, portal, feature (fill or guided), started, ended, how it ended (review, stopped, paused and left, submitted), adapter version
- **`assist_events`:** run, time, kind (filled, copied, skipped, left, paused with reason, navigated, blocked by guard, pasted draft), field role, page, and the value's source (never the value itself)
- **Both tables:** RLS so only the student reads them, with inserts only through RPCs. Parents can't read them; counselors with a share read them, read-only (decision 9).
- **`documents.final_version_id`:** set by the student with "Use as final draft".
- **`program_ai_policies`:** a sourced fact (program, policy: allows / limited / bans, quote, source, status), through the existing review pipeline. Unknown counts as "bans".
- **Portal per application:** taken from the cycle's application deadline `owning_system`, so no new column. Own applications pick their portal when created.

### 7.7 Network and permissions

- **Host permissions:** the Supabase project, and the portal hosts that are cleared. Nothing else, so the practice portal is reached only in test builds.
- **Permissions:** `storage`, `sidePanel`, `scripting`, `activeTab`. No `tabs` beyond what the side panel needs; no history, downloads or cookies.
- **Content Security Policy:** `connect-src` allows only the Supabase project.
- **Model calls** go to the Supabase Edge Function. The function holds the provider key and never receives student values.

### 7.8 Chrome Web Store compliance

- **Single purpose:** help students complete their own college applications with their own UniGuide data.
- **Privacy disclosure:**
  - what is read on portal pages (field labels, in the browser only)
  - what is sent (sign-in, profile fetch, audit events, optional unmatched-field labels to our own function)
  - retention
- **Limited use:** data is used only for this purpose.
- **Data minimisation:** the RPC returns only fill fields, and draft text is fetched only on request.

## 8. REA

REA is used only on our own build, and on portals and accounts we're cleared to observe.

| Step | Where it runs | When | Output |
|---|---|---|---|
| A. Portal mapping | On the practice portal only. Real-portal maps are made by hand (7.3); REA runs on a real portal only after its gate, within the permission. | Before writing each adapter | The portal map and fixtures; shown to the owner before the adapter is written |
| B. Static audit of our build | Every extension build, in CI and locally | After each build | Declared permissions, every network destination, any code path that can click or submit, third-party code. Fails if a destination isn't our Supabase project, or if a click path reaches a never-click control. |
| C. Runtime verification | On the practice portal now. On real portals after G2, on the owner's test accounts. | Each guided-apply build | Fields touched, navigations, network requests, where it stopped. Saved as evidence in the milestone report. |

**REA's limits, and how we cover them:**

- **Step A needs a person.** REA's browser observation is passive and attaches to a Chrome started with a debugging port. Since Chrome 136, that has to be a separate profile, which suits a test profile. The person clicks through the portal while REA records.
- **Some network traffic escapes step C.** Requests made by the extension's service worker may sit outside REA's page session. Step C therefore also uses the extension's own request log, and the content security policy.
- **Step B can miss things.** REA's static findings are candidates and don't prove complete coverage. Step B is backed by our own build checks: a network allowlist test, and a check that no code outside the guard uses click, submit or navigation APIs.

## 9. Owner decisions (31 October 2026)

1. **Permission and counsel, in parallel.** The owner is emailing Common App and UCAS for written permission, and having a lawyer review these terms findings at the same time. G1 and G2 stay open until one of the two comes back positive for each portal.
2. **Counselors with an active share** see the assist log, read-only, without values.
3. **An unknown AI policy counts as a ban:**
   - factual fill still works
   - the student can copy their own final draft into an essay field themselves
   - only automatic paste is disabled
4. **Later portals:** uni-assist, Studielink, OUAC and Slate-hosted graduate applications (three universities first) were checked (3.3) and are added as later phases, in target-country order.
