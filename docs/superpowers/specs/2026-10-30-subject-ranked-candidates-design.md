# Subject-aware, QS-ordered candidate pool (Part 1 of 3)

Date: 2026-10-30. Status: draft for review.

## Why

Students see matches that look alphabetical and ignore the subject they chose (an Engineering student sees Social
Work and Sports courses). Two causes, both in how the candidate pool is built:

1. `loadMatchInputs` (`apps/web/lib/match-data.ts`) calls `search_programs` with the student's levels and countries but
   **not their fields**, so subject never narrows the pool.
2. `search_programs` returns `order by coverage_tier desc, institution_name, title limit 200`. With about 110,000 US
   courses that all look alike, the pool is the first 200 courses by university name, and `matchPrograms` can only
   reorder those 200.

## Goal

For a student with a level, country and subject, the pool the matcher ranks is made of courses in that subject at
well-regarded universities, best first, not the first 200 by name.

Success: for a profile of US, master's, Engineering, `startSearch` picks courses that are all field 07 and at
QS-ranked universities, and the picked universities are not alphabetical. Checked with a script against the local
database and by an e2e test.

## Non-goals (later parts)

- Reading official pages for courses that have no link, skipping incomplete courses and finding replacements (Part 2).
- Pre-warming popular universities (Part 3).
- Showing a QS rank anywhere in the UI. QS is a hidden ordering signal only.
- Changing `packages/matching`'s eligibility, cost or suitability score. Only the final tie-break changed: programs that
  tie now keep the order they were given instead of being sorted by id, so the pool's QS order survives (version 0.3.0).

## Decisions already made

- A match is complete only with deadline, cost and requirements (Part 2).
- A search tries up to 30 courses and keeps the first 10 complete ones (Part 2).
- The QS workbook is used only to order courses. Nothing from it is displayed or redistributed.

## Design

### 1. Data: `institution_rankings`

New migration `supabase/migrations/20270101000002_institution_rankings.sql`:

```
institution_rankings (
  id uuid pk,
  institution_id uuid not null references institutions(id) on delete cascade,
  subject text not null,          -- full QS subject name, e.g. 'Computer Science & Information Systems'
  rank_low int not null,          -- 7 for rank 7, 751 for the band 751-850
  rank_high int not null,         -- 7 for rank 7, 850 for the band 751-850
  edition text not null,          -- '2026'
  source_id uuid references sources(id),
  unique (institution_id, subject, edition)
)
```

Row security is on. Authenticated users may read it, because `search_programs` runs as the student. Nothing in the
web app selects it for display. It is hidden from the UI, not secret from the API; if the QS licence later requires
more, restrict it then.

### 2. Import: `uniguide-worker import qs-rankings --file <xlsx>`

- Reads the workbook with the standard library (`zipfile` and `xml.etree`), so there is no new dependency.
- Each sheet after `Index` and `methodology` is one subject. The full subject name is the first cell of the sheet's
  second row (sheet tab names are cut at 31 characters, for example `Computer Science & Information `).
- Columns used: 2026 rank (first column), institution, country. A rank is either a number or a band such as
  `751-850`; both fit `rank_low` and `rank_high`.
- The edition comes from the workbook's title cell (`2026 QS World University Rankings by Subject`).
- Matching an institution: country name to ISO code, then a normalised name compared with `institutions.name` in the
  same country. Normalising lowercases, removes accents and punctuation, drops bracketed text such as `(MIT)`, drops
  the words the, of, and, at, and drops a trailing campus suffix such as `-Main Campus`.
- Misses are resolved by `data/seed/rankings/aliases.yaml` (QS name to institution name). The import prints the
  unmatched institutions ranked 200 or better, so aliases can be added where it matters.
- Measured on the 2026 file against the current database: exact normalised matches are 174 of 227 US, 72 of 115 GB
  and 31 of 37 AU institutions. The Netherlands matches 4 of 24 because DUO uses Dutch names. Germany, Canada and
  Ireland have no real institutions loaded yet, so they match nothing until those imports exist.
- Idempotent per edition: re-running replaces that edition's rows.
- The workbook itself stays out of the repository (QS licence). Only the aliases file and code are committed.

### 3. Subject mapping

New `apps/web/lib/ranking-subjects.ts` maps each of the ten broad fields to QS subject names. The best (lowest) rank
among a field's subjects is used. Fields 02, 03, 05 and 07 use their broad QS faculty subject alone: with every narrow
subject included, a specialist (Colorado School of Mines, first in mining) ranked above MIT for Engineering when checked on the real data.

| Field | QS subjects |
|---|---|
| 01 Education | Education |
| 02 Arts and humanities | Arts & Humanities |
| 03 Social sciences, journalism, information | Social Sciences & Management |
| 04 Business, administration and law | Business & Management Studies, Accounting & Finance, Marketing, Law, Economics & Econometrics |
| 05 Natural sciences, mathematics, statistics | Natural Sciences |
| 06 ICT | Computer Science & Information Systems, Data Science and Artificial Intelligence |
| 07 Engineering, manufacturing, construction | Engineering & Technology |
| 08 Agriculture, forestry, fisheries, veterinary | Agriculture & Forestry, Veterinary Science |
| 09 Health and welfare | Life Sciences & Medicine, Medicine, Nursing, Dentistry, Pharmacy & Pharmacology, Anatomy & Physiology |
| 10 Services | Hospitality & Leisure Management, Sports-related Subjects |

A unit test fails if a mapped name is missing from the workbook's subject list, so a QS rename is caught.

### 4. Query: `search_programs`

New migration `20270101000003_search_programs_ranking.sql` replaces the function (the existing one is dropped and recreated, as 3.4 did) with one new argument,
`p_rank_subjects text[] default null`.

- When it is not null, the final order becomes:
  `coverage_tier desc, best_rank asc nulls last, institution_name, title`, where `best_rank` is the lowest `rank_low`
  of the course's institution over the given subjects.
- `coverage_tier` stays the first key, so courses with real read facts still beat register-only ones.
- When it is null, the order is exactly today's. Other callers (the explore page) are unchanged.
- A supporting index: `institution_rankings (institution_id, subject)`.
- A second new argument, `p_per_institution integer default null`, keeps at most that many courses of each institution
  (best coverage, then title) before the limit, so 200 courses cover about 40 universities instead of about 10. The web
  passes 5. Migration `20270101000004_search_programs_per_institution.sql`.

### 5. Web

- `loadMatchInputs` passes `p_fields: profile.target_fields` and
  `p_rank_subjects: rankingSubjects(profile.target_fields)`.
- No change to `startSearch`, `pickCourses` (at most 3 per university) or `matchPrograms`.

### 6. Consequences to accept

- **Subject now filters the pool.** A student who chose a field no longer sees courses outside it.
- **Courses without a field code drop out** for students who chose a field. That affects the Dutch courses (no codes
  at all), some Australian ones, and 93 UK ones. This is correct: we cannot tell whether they fit.
- **Unranked universities sort last**, behind every ranked one in the pool. Where the pool is full of ranked
  universities, unranked ones do not appear.
- **The pool is still capped at 200** by the function's limit. That is enough for Part 1; Part 2 asks for 30 tries
  from it.

### 7. Policy and docs

`docs/DATA_SOURCES.md` currently says never use ranking sites. Amend it: QS subject rankings are loaded from a
downloaded workbook and used only to order courses, never displayed or redistributed. Say that a licence from QS is
needed for any use beyond a demo.

## Tests

- **Worker (pytest):** a tiny workbook built in the test with `zipfile` covers: subject name read from the second row,
  numeric rank and band parsing, country to ISO, name normalisation cases (brackets, accents, `-Main Campus`), alias
  file, re-import replaces the edition, and unmatched institutions reported.
- **Database (pgTAP, `supabase/tests/database`):** ordering by best rank across several subjects, unranked last,
  `coverage_tier` still first, field filter applied, null `p_rank_subjects` keeps the old order.
- **Web unit:** every one of the ten fields maps to at least one subject; `rankingSubjects` merges and de-duplicates.
- **Mapping guard:** every mapped subject exists in a committed list of the 2026 subject names (names only, no data).
- **SQL check on real data (replaces e2e, since the CI seed has six placeholder courses and cannot show ranking):**
  `search_programs` for US, master's, field 07 returns field-07 courses with MIT, Stanford and Berkeley first, 40+
  universities, 5 courses each at most.
- **Manual check:** run the import on your workbook, print the unmatched top-200 list, add aliases for the ones that
  matter.

## Risks

- Name matching misses some universities (about a quarter of US names); they sort last until aliased.
- The QS licence. This stays a demo-grade ordering signal until you hold a licence.
- Pool changes alter every student's matches. Saved shortlists and trackers are unaffected, since they store course
  ids.
