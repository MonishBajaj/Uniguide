# US index pages: check of 2026-10-30

Every URL was opened with the crawler's own fetcher, and the pages that load were run through the real course
lister (local Ollama `qwen2.5:7b`) with the crawler's acceptance checks, without touching the database. Nothing here
is verified by a person: no file has `verified_by`, so none is crawled yet.

## Works: courses found and accepted (12)

| University | Result |
|---|---|
| UC Berkeley | 153 of 156 accepted (long page: only its first part is read per crawl) |
| UCLA | 126 of 134 |
| Yale | 67 of 72 |
| Wisconsin-Madison | 47 of 47 |
| MIT | 41 of 43 |
| UC San Diego | 24 of 29 |
| Illinois | 20 of 20 (the page says 135; the rest are behind a JavaScript filter) |
| Harvard | 11 of 11 |
| Rutgers | 8 of 10 |
| Boston University | 62 of 121 (after the title repair and a 15-minute model timeout) |
| UT Austin | 42 of 176 |
| Northwestern | 35 of 91 |

## Weak or unfinished (3)

| University | Problem |
|---|---|
| Virginia Tech | only certificates and interdisciplinary programs listed |
| Purdue | right page (377 links), but the local model times out even after 15 minutes: split it into smaller pages |
| USC | page links to sections, not courses |

## Does not work with our crawler (10)

- **Blocked, HTTP 403 to our fetcher (5):** Columbia, Cornell, Johns Hopkins, Michigan, Princeton.
- **JavaScript list, nothing to read (6):** Arizona State, Georgia Tech, Stanford, Washington, Northeastern, Duke.
- **Empty or 404 with no better page found (3):** NYU, Texas A&M, Carnegie Mellon (its new page lists colleges only).
- **Not courses (1):** Penn lists schools and the catalog.

Fixed URLs (found as links on the universities' own sites, then opened): ASU, Carnegie Mellon, Georgia Tech, Harvard,
Rutgers, Stanford, Berkeley, UCSD, UCLA, UT Austin, Washington, Wisconsin, Yale, Boston University, Northwestern, Purdue.

## Next

1. Open the twelve that work, and add `verified_by` and `verified_at` where the page lists courses.
2. Purdue needs a smaller page; the blocked and JavaScript ones need a different page or another source.
