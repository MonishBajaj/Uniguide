# Assisted fill exit gate: REA steps B and C (M7, A1.8)

**Run:** 1 November 2026, on our own practice portal with the synthetic profile and the synthetic portal account. No real portal and no real personal data.

## REA step C: a full assisted-fill session, observed

`run-session.cjs` (kept here so it can be rerun) drives one complete session in Chromium with the test build of the extension loaded:

1. The student connects the extension on UniGuide's own page.
2. The student signs in to the portal themselves.
3. The student works through every page of the application, using the side panel's Fill, Copy and Leave for me.
4. The student moves on with the portal's own Continue each time, and stops at the review page without submitting.

Three things watched the session at once:

- **REA's page session:** `rea observe-web-session`, attached to the portal tab through a debugging port, for the whole session. Plus `rea inspect-web-page` at the review page.
- **The browser's own request log:** every request from every page and from the extension's service worker. REA's page session can't see the service worker (spec 8), so this covers it.
- **The extension's content security policy:** `connect-src` names the Supabase project only.

The results are in `session.json`.

| Check | Result |
|---|---|
| Extension service worker requests | **22, all to our Supabase project.** Only these endpoints: `rest/v1/profiles`, `rest/v1/applications`, and the RPCs `fill_profile`, `final_draft_text`, `start_assist_run`, `log_assist_event` and `end_assist_run`. |
| Side panel requests | Only its own files (`chrome-extension://…`). No network. |
| Portal tab requests | 16, all to the portal itself. |
| Content security policy | `connect-src` is the Supabase project only. |
| Navigations (REA timeline) | 8 form submissions, one per page, and the student pressed Continue 8 times. The extension made none: REA saw no navigation the student didn't make. Every destination was in scope. |
| Fields the extension touched | Worked out from the page itself, before and after the panel's actions on each page. The student filled every other field. **10 fields:** <br>• **Your details:** email, country <br>• **School:** qualification, grading scale, grade (exactly `8.4`, scale `gpa_10`) <br>• **Tests:** whether a test was taken, which test, overall score, date <br>• **Activities:** what you did |
| Fields the extension didn't touch | Names, date of birth and phone (left for the student, R15). School name and still studying. The activity's organisation (copied, not filled) and description (left). The statement: the student pasted their own final draft after copying it, because the AI policy was unknown. The security word, the fee waiver, the declaration and the signature. |
| Where it stopped | The review page. Nothing was submitted; the application is not marked submitted. |
| Audit log | One run (`practice fill practice-1`, ended `abandoned` when the panel closed) with 14 events. Every event has a role and a page; none has a value. |
| REA at the review page | No requests in its window, no storage, every link and form in scope. |

**Two things the first attempts showed:**

- **REA starts late.** It takes a few seconds to start recording after it's launched. The first attempt began its timeline at the third page. The script now makes a marker navigation and waits for it before starting the session, so the timeline covers every page.
- **An empty check is not a pass.** A labelling slip once filed the service worker's requests under "other", and the check that every service-worker request goes to Supabase passed with nothing to check. The script now requires service-worker requests to be present and every request to be labelled with where it came from.

## REA step B on the final build

`rea analyze-javascript-application` on fresh test and store builds (`rea-B-final.json`), plus our own build checks:

- **Network:** 5 request sites, all in `background.js`, all to `${SUPABASE_URL}/…` (auth user, token refresh, REST, Edge Functions, logout). The same in both builds.
- **Click, submit and navigation paths:** none. The only navigation REA flags is the panel's own "Open UniGuide" link (`panel.js`), shown when consent is pending.
- **Third-party code:** none.
- **Our build checks** (`scripts/check.mjs`): pass. Supabase only, and no clicks, submits, navigation or keys outside the guard.

## Earlier evidence

- `../A-practice/`: REA step A, the practice portal map
- `../B-A1.5/`, `../B-A1.6/`: REA step B after the extension and the suggestions
