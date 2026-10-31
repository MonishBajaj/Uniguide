# REA step A: practice portal map (M7, A1.2)

**Recorded:** 31 October 2026, on our own practice portal (`apps/practice-portal`) with the synthetic test account only. No real portal was touched, and no real personal data was entered.

## How it was recorded

1. Started the practice portal (`PRACTICE_TEST=1 node apps/practice-portal/server.mjs`, port 4318) and reset its data.
2. Started Chromium 153 headless with `--remote-debugging-port=9222` and a fresh, throwaway profile in the session scratchpad.
3. Started `rea observe-web-session` on that tab for 120 seconds, limited to the portal's origin.
4. A Playwright script attached over CDP and walked the whole application with synthetic answers. At each of 18 states it:
   - read every control from the page (id, name, label, type, required, options, condition, hint, limits)
   - saved the page as a fixture (`packages/portal-adapters/practice/fixtures/<state>.html`)
   - took a screenshot (`screens/<state>.png`)
   - ran `rea inspect-web-page --include-accessibility-text --include-storage-keys`
5. The map (`packages/portal-adapters/practice/map.json`) was built from those page records, then checked against REA's accessibility tree for every visible field.

**Where the script stood in for the student:** it typed the sign-in password, answered the security word, ticked the fee waiver and the declaration, signed, and pressed Submit. It did this only to reach the later pages of our own portal. These are exactly the controls the map marks never-click, never-fill or pause. The extension will never do any of them.

## What REA observed

| Check | Result |
|---|---|
| Navigation (`rea/observe-web-session.json`) | 38 navigation rows: sign-in → dashboard → 8 pages in order → review → confirmation → dashboard. Every destination was in scope (`approved`). |
| Network | `inspect-web-page` saw no requests during its window on any page. `observe-web-session` keeps navigation only, and every navigation went to the portal's own origin. |
| Storage | No local storage, session storage, IndexedDB or cache keys on any page. |
| Link and form destinations | All `approved` (same origin) on every page. |
| Labels | Every visible field's label from the page matched REA's accessibility tree name and role (`rea/inspect-web-page.json`, 0 mismatches). Hidden conditional fields are absent from the tree until shown, as expected. |

The raw REA output (about 0.5 MB) stayed in the session scratchpad. The summaries here keep what the map relies on.

## Findings

1. **Fixed: the declaration checkbox wasn't marked required.** The server rejected the page without it, but the markup had no `required`, so a reader of the page, including the extension, couldn't tell. The new drift test caught it. The portal now marks it, and the map was re-recorded.
2. **Fixed: the "Sign out" button had unreadable white-on-grey text** (screenshot review). Re-recorded.
3. **Kept as realistic quirks the adapter must handle:**
   - Radio options have accessible names with a leading space (`" Yes"`). The adapter trims names before comparing.
   - The review page shows stored codes (`cbse_12`, `IN`) rather than option text.
   - Required selects report `invalid` before anything is chosen.
4. **For A1.4 (guard): "Save and continue" is a form submit button.** Spec 7.2 rule 4 says an allowed click "isn't a form submit control", which would block every page. The guard rule needs to read "isn't the final submission or a never-click control". The map lists allowed clicks and never-click controls separately for this reason. To be settled when A1.4 is built.
5. **Differences from the plan's wording for A1.2:** the portal has five sections over eight pages (the plan said four over six), because the security check, fee and declaration became separate pages. The smoke tests use `node:test` with `fetch` rather than Playwright. Playwright drives the mapping walk.

## What the map holds

For each page: path, kind (form, security, fee, declaration), title, section, and for each field:

- **role**: our name for what the field asks
- **label**: the portal's label
- **control**, **required**, **options**, **showWhen** (condition), **hint**, **wordLimit**, **maxlength**
- **find**: the id and name, or a pattern for repeated groups
- **source**: the `fill_profile` path the value would come from, if any
- **action**:
  - `fill`: a confirmed fact, filled after matching
  - `confirm`: filled only after the student confirms it in the panel
  - `student`: left for the student
  - `pause`: stop and hand over
  - `never`: never touched

It also lists:

- the review page (stop here) and the confirmation page (marker and reference)
- the error summary marker
- the conditional-field attributes
- **8 never-click controls:** pay, fee waiver, declaration, sign, submit, withdraw, sign in, sign out
- **5 allowed clicks:** continue application, save and continue, save, add activity, back

`apps/practice-portal/test/portal.test.mjs` checks that the map still matches the portal: page order, field names, required flags, conditions, and the never-click list.

## Files

- `packages/portal-adapters/practice/map.json`: the map
- `packages/portal-adapters/practice/fixtures/*.html`: 18 captured page states
- `screens/*.png`: the same 18 states
- `rea/observe-web-session.json`: REA's navigation timeline (lifecycle rows dropped)
- `rea/inspect-web-page.json`: per-page accessibility cross-check, network, storage and destination scopes
