# REA step B: static audit of the extension (M7, A1.5)

**Run:** 31 October 2026, `rea analyze-javascript-application --artifact-format directory` (REA 6.8.0, our own code only), on two builds of `apps/extension` made against the local stack:

- **test build** (`EXT_TEST=1`): includes the practice portal adapter and its content script
- **store build** (`EXT_STORE=1`): what would go to the Web Store, with no portal adapter until a gate clears

The summary of both runs is in `rea-summary.json`; the manifests are `manifest-test.json` and `manifest-store.json`. The raw output (about 11 MB per build) stayed in the session scratchpad.

## Result: passes

| What the plan asks for | Test build | Store build |
|---|---|---|
| **Declared permissions** | `storage`, `sidePanel` | same |
| **Host permissions** | the Supabase project's host, and the practice portal's host | the Supabase project's host only |
| **Content security policy** | `connect-src` the Supabase project only | same |
| **Network destination candidates** | 4 request sites, all in `background.js`, all `${SUPABASE_URL}/…`: `auth/v1/user`, `auth/v1/token?grant_type=refresh_token`, `rest/v1/${path}`, `auth/v1/logout`. `SUPABASE_URL` is a build-time constant (the project's origin). | the same 4 |
| **Paths that can click, submit or navigate** | None. REA found no click, submit or navigation operation. Its one navigation finding is the panel's own "Open UniGuide" link (`panel.js`, an `<a target="_blank">` to our web app, shown when consent is pending), which the student clicks in the panel. The path strings it lists (`/apply/…`, `/review`, `/confirmation`) are the practice map's data, not navigation. | None. Same panel link; no path strings, because the store build carries no adapter. |
| **Third-party code** | None. The bundles hold only `apps/extension/src` and `packages/portal-adapters` (and the practice map in the test build). There are no npm runtime dependencies: the extension calls Supabase with `fetch`, not a client library. | None |
| **Listeners** | 7: install, the external session handoff, panel messages, the panel port and its disconnect (background); panel messages (content script); tab updates (panel) | 7 |
| **Sender checks** | REA saw 2: the session handoff accepts only our web app's origin, and panel requests only the extension's own pages | 2 |

**Fail conditions from the plan:** a destination other than our Supabase project (none), or a click path to a never-click control (no click paths at all).

## Our own build checks, run on the same builds

`apps/extension/scripts/check.mjs` (and `test/checks.test.ts`, which also proves it fails on planted problems):

- **Network:**
  - every address in the bundle is the Supabase project, our sign-in page (opened as a tab, never fetched) or a supported portal's origin
  - only `background.js` calls `fetch`
  - no WebSocket, XMLHttpRequest, beacon, event stream or remote script
  - the manifest's `connect-src`, host permissions and permissions match
- **Actions:** no source file outside `guard.ts` (in `apps/extension/src` or `packages/portal-adapters/src`) has a click, submit, `requestSubmit`, synthetic mouse, key or submit event, Enter key, location change, `window.open`, history change, `chrome.tabs.update` or `chrome.scripting`.

Both builds pass.

## What this found and changed

- **The store build carried the practice portal's map.** The first build kept the test-only adapter in a store build, because the bundler can't drop an import guarded by an imported constant. Our own check caught it before REA ran. Fixed:
  - the adapter list now reads the build flag directly
  - the adapters package is marked side-effect free
  - dead branches are removed at build time

  The store build now has no practice-portal code or address, and REA confirms no path strings in it.
- **Permissions trimmed** from the plan's `storage, sidePanel, scripting, activeTab` to `storage, sidePanel`. Nothing uses scripting or activeTab: the content script is declared statically for supported portal hosts, and the panel finds its tab without either. The Web Store rejects unused permissions.

## Limits

REA's analysis is static. It parsed the bundles as text and never ran them, so it shows what the code can do, not what it does at runtime. REA step C (A1.8) covers runtime on the practice portal.
