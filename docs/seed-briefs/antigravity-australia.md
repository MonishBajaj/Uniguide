# Brief for Antigravity: Australia

## What you are doing

We are building a student guide that lists real university courses. Our own crawler reads each university's
**course-list page**, keeps only courses whose name is quoted on that page and whose link is on the university's own
website, and checks everything mechanically. **Your job is only to find those course-list pages** for the
universities below, and write one small file for each. You do not write or guess any course, fee or deadline.

## Output: one YAML file per university

Path: `data/seed/indexes/au/<slug>.yaml` where `<slug>` is the short lowercase name with hyphens
(`example-uni`). One file per university, nothing else changed anywhere in the repository. **If you cannot write files**, reply with
each file as its own code block headed by its full path, plus the report, so they can be saved as they are.

```yaml
institution: "Example University"
country: AU
official_domain: example.edu.au
indexes:
  - url: https://www.example.edu.au/study/courses/a-z  # example shape only
    kind: programs
```

Rules for the fields:
- `institution`: copy the name from the table below exactly.
- `official_domain`: the university's own plain domain, no `www.` and no path (`example.edu.au`). **Every index URL
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
- Our register (CRICOS) already holds every Australian provider and course name, but **no course pages**. Postgraduate
  coursework (master's) and undergraduate lists are both wanted. Many Australian universities publish a plain A to Z list
  or a handbook (often on a `handbook.` subdomain); those usually work, the main "find a course" search often does not.

## Hard rules

1. **Open every page yourself and confirm it lists courses with links before you write its URL.** Never write a URL
   from memory or by guessing the pattern. If you cannot open it, write no file for that university.
2. Official university pages only. No course aggregators, rankings sites, forums, agents or social media.
3. Stay light: open at most about three pages per university. Do not bulk-copy or download course pages, and do not
   crawl. Respect login walls, bot checks and CAPTCHAs: skip that university and note it.
4. Do not put any course names, fees, deadlines or requirements in the files, and do not invent any.
5. Touch only your own folder `data/seed/indexes/au/`. Another tool is working on the other countries.

## Report

When finished, add `data/seed/indexes/au/REPORT.md` with three short lists:
- **Done:** universities with a file and the pages you used.
- **Skipped:** universities with no file and why (JavaScript only, login, blocked, could not find a list).
- **Domain differences:** where the domain on file looked wrong, and the one you used.

## Check your work

If you can run commands: `cd worker && uv run uniguide-worker index load --check`. It validates every file and
prints how many are valid. If you cannot, re-read each file against the example above: valid YAML, two-space indents,
`country: AU`, URLs on the stated domain.

You are finished when every university in the table has either a file or a line under "Skipped".

## Universities

| # | University (name in our database) | Domain on file | Note |
|---|---|---|---|
| 1 | The University of Sydney | sydney.edu.au |  |
| 2 | The University of Melbourne (UniMelb) | www.unimelb.edu.au |  |
| 3 | The University of Queensland | www.uq.edu.au |  |
| 4 | Monash University | www.monash.edu.au |  |
| 5 | UNSW Sydney | www.unsw.edu.au |  |
| 6 | Adelaide University | not on file | new university (merged from Adelaide and UniSA): confirm its current domain |
| 7 | Macquarie University | www.mq.edu.au |  |
| 8 | Australian National University | www.anu.edu.au |  |
| 9 | The University of Western Australia | www.uwa.edu.au |  |
| 10 | Deakin University (Deakin) | www.deakin.edu.au |  |
| 11 | Curtin University | www.curtin.edu.au |  |
| 12 | University of Technology Sydney (UTS) | www.uts.edu.au |  |
| 13 | RMIT University (RMIT) | www.rmit.edu.au |  |
| 14 | University of Wollongong | www.uow.edu.au |  |
| 15 | Queensland University of Technology | www.qut.edu.au |  |
| 16 | Griffith University | www.griffith.edu.au |  |
| 17 | La Trobe University | www.latrobe.edu.au |  |
| 18 | Western Sydney University | www.westernsydney.edu.au |  |
| 19 | Swinburne University of Technology | www.swinburne.edu.au |  |
| 20 | University of Tasmania (UTas) | www.utas.edu.au |  |
| 21 | Flinders University | www.flinders.edu.au |  |
| 22 | James Cook University | www.jcu.edu.au |  |
| 23 | Edith Cowan University | www.ecu.edu.au |  |
| 24 | Australian Catholic University | www.acu.edu.au |  |
| 25 | University of Canberra | www.canberra.edu.au |  |
