# Brief for ChatGPT: Netherlands

## What you are doing

We are building a student guide that lists real university courses. Our own crawler reads each university's
**course-list page**, keeps only courses whose name is quoted on that page and whose link is on the university's own
website, and checks everything mechanically. **Your job is only to find those course-list pages** for the
universities below, and write one small file for each. You do not write or guess any course, fee or deadline.

## Output: one YAML file per university

Path: `data/seed/indexes/nl/<slug>.yaml` where `<slug>` is the short lowercase name with hyphens
(`example-uni`). One file per university, nothing else changed anywhere in the repository. **If you cannot write files**, reply with
each file as its own code block headed by its full path, plus the report, so they can be saved as they are.

```yaml
institution: "Example University"
country: NL
official_domain: example.nl
indexes:
  - url: https://www.example.nl/en/masters/programmes  # example shape only
    kind: programs
```

Rules for the fields:
- `institution`: copy the name from the table below exactly.
- `official_domain`: the university's own plain domain, no `www.` and no path (`example.nl`). **Every index URL
  must be on this domain or one of its subdomains**, or the file is rejected. If the "Domain on file" column looks wrong
  for that university, write the correct domain and say so in your report.
- `indexes`: one to three pages. `kind` is always `programs`.
- **Do not write `verified_by`, `verified_at` or `ror_id`.** A person verifies each page later; an AI filling those in
  would defeat the check.

## What a good index page is

- An official page on the university's site that **lists many of its degree courses, each with its own link**
  (an A to Z list, a "find a course" list that is plain HTML, a handbook index, or a list per faculty).
- Not a single course page, not a news or marketing page, not a page behind a login.
- Our crawler cannot run JavaScript. If the list only appears after clicking filters or searching, it will not work:
  prefer a plain A to Z or per-faculty list. If a university has only a JavaScript search, write no file and say so.
- If the courses are split over several lists (by faculty or by level), give up to three pages that together cover them.
- Our register (DUO) holds Dutch programme names but **no field of study and mostly no pages**. Prefer the English
  overview of **master's programmes** (many Dutch universities have an English "Master's programmes" list); a Dutch-only
  list is fine if there is no English one. Also give the bachelor's list if it is a separate page. The list is for
  research universities; universities of applied sciences are not needed now.

## Hard rules

1. **Open every page yourself and confirm it lists courses with links before you write its URL.** Never write a URL
   from memory or by guessing the pattern. If you cannot open it, write no file for that university.
2. Official university pages only. No course aggregators, rankings sites, forums, agents or social media.
3. Stay light: open at most about three pages per university. Do not bulk-copy or download course pages, and do not
   crawl. Respect login walls, bot checks and CAPTCHAs: skip that university and note it.
4. Do not put any course names, fees, deadlines or requirements in the files, and do not invent any.
5. Touch only your own folder `data/seed/indexes/nl/`. Another tool is working on the other countries.

## Report

When finished, add `data/seed/indexes/nl/REPORT.md` with three short lists:
- **Done:** universities with a file and the pages you used.
- **Skipped:** universities with no file and why (JavaScript only, login, blocked, could not find a list).
- **Domain differences:** where the domain on file looked wrong, and the one you used.

## Check your work

If you can run commands: `cd worker && uv run uniguide-worker index load --check`. It validates every file and
prints how many are valid. If you cannot, re-read each file against the example above: valid YAML, two-space indents,
`country: NL`, URLs on the stated domain.

You are finished when every university in the table has either a file or a line under "Skipped".

## Universities

| # | University (name in our database) | Domain on file | Note |
|---|---|---|---|
| 1 | Universiteit Utrecht | not on file |  |
| 2 | Rijksuniversiteit Groningen | not on file |  |
| 3 | Universiteit Leiden | www.universiteitleiden.nl |  |
| 4 | Technische Universiteit Delft | not on file |  |
| 5 | Universiteit Twente | not on file |  |
| 6 | Technische Universiteit Eindhoven | not on file |  |
| 7 | Wageningen University | www.wur.nl |  |
| 8 | Universiteit Maastricht | www.maastrichtuniversity.nl |  |
| 9 | Tilburg University | not on file |  |
| 10 | Breda University of Applied Sciences | not on file |  |
| 11 | Design Academy Eindhoven | not on file |  |
| 12 | Hotelschool The Hague | www.hotelschool.nl |  |
| 13 | Universiteit van Amsterdam | uva.nl | not in our table yet: use this domain |
| 14 | Erasmus Universiteit Rotterdam | eur.nl | not in our table yet: use this domain |
| 15 | Radboud Universiteit | ru.nl | not in our table yet: use this domain |
| 16 | Vrije Universiteit Amsterdam | vu.nl | our register has the wrong domain (auc.nl) for it: use this one |
