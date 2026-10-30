# Data sources

Only official sources. Never aggregators (Yocket, Studyportals, Leverage Edu, ...), rankings sites (QS, THE, US News), forums or GradCafe, and nothing behind a login. The fetcher enforces a blocklist and robots.txt.

## Registers and open data

| Source | Country | Used for | Licence / terms | Status in code |
|---|---|---|---|---|
| [CRICOS register](https://data.gov.au/data/dataset/cricos) (data.gov.au) | AU | Institutions and courses open to student-visa holders (Listed); register tuition as unverified proposals | CC BY 2.5 AU, attribute the Department of Education | `import au-cricos [--with-fees]`, checked against the live export (Oct 2026): 1,105 providers, 18,607 tertiary courses |
| [DUO, overview of accredited programmes](https://onderwijsdata.duo.nl/) | NL | Accredited HBO and WO programmes: level, ECTS, language, mode (Listed) | CC BY 4.0, attribute DUO | `import nl-duo`, checked against the live file (Oct 2026): 5,067 current programmes from 6,863 rows |
| [College Scorecard API](https://collegescorecard.ed.gov/data/documentation/) | US | Institutions and fields of study by credential (Listed), CIP to ISCED-F crosswalk | Public domain; api.data.gov key, 1,000 requests/hour default | `import us-scorecard`. Written to the documented response shape; **confirm against a live response with your key** before a full import (the shared demo key was rate limited during the build) |
| [Discover Uni dataset](https://www.hesa.ac.uk/kisdata) (HESA) | GB | Undergraduate courses with their own page URLs (Listed); `SBJ.csv` gives each course's subject, mapped to a broad field | HESA publishes it under CC BY 4.0 (attribute HESA and the Office for Students) | `import uk-discover-uni --institution-file INSTITUTION.csv --course-file KISCOURSE.csv --subject-file SBJ.csv` from the downloaded zip (HESA blocks automated downloads). Checked against the 2026 files (Oct 2026): 389 providers, about 28,000 courses. The first listed subject that maps decides the field (`CAH_TO_ISCED_F` in `importers/uk_discover_uni.py`); combined studies map to none |
| [Hochschulkompass](https://www.hochschulkompass.de/) (HRK) | DE | Degree programmes | Reuse needs a partner export from HRK | Stub until access is granted. Do not scrape |
| [ROR](https://ror.org/) | All | Institution identifiers | CC0 | `import ror-match`: accepts only ROR's own high-confidence match in the same country |
| [OpenAlex](https://openalex.org/) | All | Faculty, topics and recent works for research degrees | CC0; API key for regular use | `import openalex-faculty`. Written to the documented shape; **confirm against a live response** (the free budget was exhausted during the build) |
| University pages | All | Requirements, fees, deadlines (Extracted, then Verified) | Copyright of the institution | Facts, short evidence quotes and content hashes only; never page copies |

## Curated course indexes

Registers rarely name individual courses with their own pages. For the main universities of a country we keep the
official page that lists their courses in `data/seed/indexes/<country>/<slug>.yaml`.

- An index is **crawled only after a person has opened it** and filled in `verified_by` and `verified_at`. Until then it loads switched off.
- `uniguide-worker index load` loads the files; `uniguide-worker index crawl --country us` (daily from the scheduled workflow) reads each active index with the model named by `EXTRACTOR` (Gemini, or a local Ollama model: pages are then cut to 20,000 characters and 250 links, so a long index lists only its first courses).
- A listed course is kept only if its quote is on the page, its URL is one of that page's links, and that URL is on the university's own domain.
- Unchanged pages (same content hash) are not sent to the model again. A page the model could not read is retried next run.
- Courses the model merely *suggests* (the long-tail fallback) are saved hidden and appear only after an admin approves them at `/admin/suggested`.
- The US list (30 universities) and the German list (20) ship **unverified**: the URLs were written from memory.

## Countries without a usable register

| Country | Why | How courses arrive |
|---|---|---|
| France | The national open data API reset connections during the build | Extraction from official pages, added through the source register |
| New Zealand | The official course catalogue sits behind a bot challenge | Extraction from official pages |
| Singapore, Japan, South Korea, UAE, Qatar (Wave 3) | No open course register found | Extraction, reviewed by per-country verifiers |

## Visa and country rules

`country_rules` links only to government pages (or government-run study portals where the visa page refuses automated checks) and stores a short quote for rules such as the APS certificate. Gulf visa links are left for a reviewer to add from the admin rules page once the current official page has been checked.

## Rules for fetching

- robots.txt respected (protego); an unreadable robots.txt means do not fetch.
- At most one request every 5 seconds per host, or the site's crawl delay if longer.
- Conditional GET (ETag, Last-Modified); re-extract only when the content hash changes.
- User-Agent names the bot and a contact address (`CRAWLER_CONTACT`).
