# Guided apply exit gate: REA steps B and C (M7, A2.5)

**Run:** 1 November 2026, on our own practice portal with the synthetic profile and the synthetic portal account. No real portal and no real personal data. Nothing was submitted.

## REA step C: one guided-apply run, observed

`run-session.cjs` (kept here so it can be rerun) drives one complete run in Chromium with the test build of the extension loaded:

1. The student connects the extension on UniGuide's own page, then signs in to UniGuide.
2. On the application's tracker page, the student presses **Apply with UniGuide Assist**. The extension opens the portal in a new tab.
3. The student signs in to the portal themselves.
4. The school page is changed, as a portal update would change it: its first required question is renamed.
5. The student opens the panel, which already has the application chosen, and presses **Start guided apply**.
6. The run fills and moves on by itself. At each pause the student does their part and presses **Resume**.
7. The run stops at the review page. The student closes the panel there.

Four things watched the run at once:

- **REA's page session:** `rea observe-web-session` on the portal tab for the whole run, and `rea inspect-web-page` at the review page.
- **The browser's own request log:** every request from every page and from the extension's service worker. REA's page session can't see the service worker (spec 8), so this covers it.
- **A recorder of scripted events on the portal's pages:** every `input`, `change` and `click` event that a script raised rather than a person (`isTrusted` false), with its page and target. While the run is paused only the student acts, so every scripted event outside the student's turns is the extension's. This sees the extension's actions from the page's side, independently of the extension's own log.
- **The extension's content security policy:** `connect-src` names the Supabase project only.

The results are in `session.json`.

### Required results

| Required (plan A2.5) | Result |
|---|---|
| It stops at the review page | **Yes.** The run reached `/review` and stayed: still there 4 seconds later, with no scripted event on the page. The application is not marked submitted. Closing the panel there ended the run as `review`. |
| It pauses on the changed page | **Yes, before filling anything.** It paused on `/apply/schooling` with the reason `page_differs`, and no field on the page had a value. A renamed question can't be answered on the practice portal, so the page was then put back as mapped (as if the map had been updated). The student reloaded it and pressed Resume, and the run carried on. |
| It pauses on the CAPTCHA stand-in | **Yes,** `captcha` on `/apply/security-check`. The student typed the word and pressed the page's button. |
| It pauses on the fee and declaration pages | **Yes,** `payment` on `/apply/fee` and `declaration` on `/apply/declaration`. The student asked for the fee waiver and made the declaration, each with the page's own button. |
| It never clicks submit, pay, sign or certify | **Yes.** The extension's clicks, all six of them: the dashboard's "Continue your application" link, then "Save and continue" on your details, school, tests, activities and the statement. Nothing on the security check, fee, declaration or review pages: no click, input or change. It never pressed `submit-application`, `pay-fee`, `sign-continue`, `withdraw-application` or `sign-out`. |

### Every pause, in order

| Page | Reason | Why |
|---|---|---|
| Your details | `student` | Names and date of birth are never filled (R15) |
| School | `page_differs` | The renamed question: the page no longer matched the map |
| School (after it was put back) | `student` | The school's name and "still studying" are the student's |
| Statement | `student` | The AI policy is unknown, which counts as a ban, so the run offered the student's own final draft to **copy**. The student copied it and pasted it themselves. The run never wrote in the field. |
| Security check | `captcha` | Only the student can answer it |
| Fee | `payment` | A payment step |
| Declaration | `declaration` | A declaration and signature |

### What else the observers saw

| Check | Result |
|---|---|
| Fields the extension changed (from the page's side) | **11 fields on 4 pages:** <br>• **Your details:** email, country <br>• **School:** qualification, grading scale, grade (exactly `8.4`, scale `gpa_10`) <br>• **Tests:** whether a test was taken (yes), which test, overall score, date <br>• **Activities:** what you did, organisation <br>These match the panel's review summary and the audit log's `filled` events. |
| Fields it didn't touch | Names, date of birth and phone. School name and still studying. The activity's description. The statement. The security word, the fee waiver, the declaration and the signature. |
| Navigations (REA timeline) | REA recorded from the start: its timeline begins with the marker reload on the dashboard. Then the dashboard link (pressed by the run's guard) and 8 form submissions, one per page: 5 by the run's guard (your details, school, tests, activities, statement) and 3 by the student (security check, fee, declaration). Plus the student's reload of the school page. Every destination was in scope. |
| Extension service worker requests | **36, all to our Supabase project.** Only these: the RPCs `start_assist_run`, `log_assist_event`, `final_draft_text` and `end_assist_run`. |
| Side panel requests | Only its own files. No network. |
| Portal tab requests | 18, all to the portal itself. |
| Content security policy | `connect-src` is the Supabase project only. |
| Audit log | The guided run (`practice guided practice-1`, ended `review`) has 32 events: 11 filled, 6 navigated, 7 paused, 7 resumed, 1 copied draft. `assist_events` has no column for a value (`id, run_id, user_id, at, kind, field_role, page, source, reason`). |
| REA at the review page | No requests in its window, no storage, every link and form in scope. |

**Also in the log:** an assisted-fill run (`practice fill practice-1`) ended `stopped` the moment Start was pressed. The panel opens an assisted-fill run as soon as an application is chosen, and starting guided apply ends it first. It has no events.

**Two things this run showed:**

- **The clipboard is asynchronous.** The first attempts read the clipboard straight after pressing Copy and pasted an empty statement, so the run rightly paused there again. The script now waits for the copy before the student pastes.
- **Chrome stops passing clicks to a tab right after it sends a password form.** The student signs in to UniGuide in one tab and goes on in a fresh one, as the end-to-end tests do since A2.4.

## REA step B on the final build

`rea analyze-javascript-application` on fresh test and store builds (`rea-B-final.json`), plus our own build checks:

| | Test build | Store build |
|---|---|---|
| **Network destination candidates** | 5 request sites, all in `background.js`, all `${SUPABASE_URL}/…`: auth user, token refresh, REST, Edge Functions, logout | the same 5 |
| **Navigation REA can't resolve** | 2, both expected (below) | the same 2 |
| **Portal paths in the code** | the practice portal's map only | **none**: store builds carry no adapter until a gate clears |
| **Third-party code** | none | none |

The two navigation sites:

- **`content.js`: the guard's own navigate call.** New in A2.4: the review summary's "Go to …" buttons. The address is built from the adapter's map, and `guard.allowNavigate` refuses anything off the portal's origin or with a submit, pay, sign or similar word in the address. The student presses the button; the run never navigates on its own.
- **`panel.js`: the panel's "Fix it in UniGuide" link,** shown when consent is pending. Unchanged since A1.5.

There is no click path besides the guard's `press`. **Our build checks** (`scripts/check.mjs`) pass on both builds: Supabase only, and no clicks, submits, navigation or keys outside the guard.

## Earlier evidence

- `../A-practice/`: REA step A, the practice portal map
- `../B-A1.5/`, `../B-A1.6/`: REA step B after the extension and the suggestions
- `../C-A1.8/`: REA steps B and C for assisted fill
