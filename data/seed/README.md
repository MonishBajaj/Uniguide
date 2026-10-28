# Seed courses

One YAML file per hand-verified course, under `courses/<country>/`. The format is defined by
`worker/src/uniguide_worker/seed/schema.json` and checked in CI (`uniguide-worker seed check`).

The files here now are **placeholders**: fictional institutions on reserved `example.org`
domains, marked `placeholder: true`. They exist to show the format and give the local app
something to display. They never load into a hosted database: the loader refuses.

## Verification protocol (per fact)

1. Open the **official** page (university or government). Never an aggregator, rankings site,
   forum or agent page.
2. Copy the sentence or table cell that states the fact into `evidence_quote`, verbatim.
3. Check the page says which intake it applies to. If it describes last cycle, the fact is
   not verified for this cycle: leave it out.
4. Record `source_url`, `verified_by` (your name) and `verified_at` (today).
5. If two official pages disagree, add both with `status: conflicting`.
6. Critical facts (deadlines, eligibility, tuition) need a second look before loading.

Budget about 10 minutes per course per week in season. Re-check any deadline not verified in
the last 30 days.

## Fact fields

| subject | fields |
|---|---|
| `requirement` | `kind` (entry_qualification, language_test, admissions_test, prerequisite, recommendation_letters, statement, portfolio, interview, other), `applicant_category`, and per kind: `qualification`, `min_grade_text`, `min_grade_numeric`, `grade_scale`, `is_desirable` / `exam`, `exam_version`, `min_total`, `min_sections` / `test_policy` / `count_required` / `word_limit` / `details` |
| `deadline` | `date` (YYYY-MM-DD), optional `time` (HH:MM) and `timezone` (IANA), `kind`, `round`, `owning_system`, `original_text`, `applicant_category` |
| `cost_item` | `kind`, `basis`, `base` (and optional `low` / `high`), `currency`, `fee_year`, `mandatory`, `details`, `applicant_category` |

## Load

```bash
cd worker
uv run uniguide-worker seed check                          # validate files
uv run uniguide-worker seed load                           # local: placeholders stay hidden
uv run uniguide-worker seed load --publish-placeholders    # local demo: show them as unverified
```
