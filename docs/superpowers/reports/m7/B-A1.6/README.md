# REA step B again: suggested roles (M7, A1.6)

**Run:** 31 October 2026, `rea analyze-javascript-application --artifact-format directory`, on fresh test and store builds after A1.6. The summary is in `rea-summary.json`. The first audit and its method are in `../B-A1.5/`.

## Result: still only the Supabase project

| | Test build | Store build |
|---|---|---|
| **Network destination candidates** | 5 request sites, all in `background.js`, all `${SUPABASE_URL}/…`. These are A1.5's four, plus `functions/v1/${fn}` for the `suggest-field-role` Edge Function on the same project. | the same 5 |
| **Click, submit or navigation paths** | none (the panel's own "Open UniGuide" link, as before) | none |
| **Third-party code** | none | none |

Our own build checks (`scripts/check.mjs`) pass on both builds too. The model provider is reached only by the Edge Function, server-side, with its own key. The extension never contacts it and never has the key.

## What the extension sends for a suggestion

Only the field's visible label and our role list. The end-to-end test intercepts the call and checks this:
- the body's keys are exactly `label` and `roles`
- the label is the field's
- no profile value appears in it

The function itself refuses anything else (`supabase/functions/suggest-field-role/logic.ts`, 25 tests). It also refuses a label that looks like an answer (an email address or a long number). Nothing is stored except who asked and when, for the per-student limit.
