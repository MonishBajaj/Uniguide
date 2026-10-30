# Brief for Kimi: United Kingdom

## What you are doing

We are building a student guide that lists real university courses. Our own crawler reads each university's
**course-list page**, keeps only courses whose name is quoted on that page and whose link is on the university's own
website, and checks everything mechanically. **Your job is only to find those course-list pages** for the
universities below, and write one small file for each. You do not write or guess any course, fee or deadline.

## Output: one YAML file per university

Path: `data/seed/indexes/gb/<slug>.yaml` where `<slug>` is the short lowercase name with hyphens
(`example-uni`). One file per university, nothing else changed anywhere in the repository. **If you cannot write files**, reply with
each file as its own code block headed by its full path, plus the report, so they can be saved as they are.

```yaml
institution: "Example University"
country: GB
official_domain: example.ac.uk
indexes:
  - url: https://www.example.ac.uk/study/postgraduate/courses/a-z  # example shape only
    kind: programs
```

Rules for the fields:
- `institution`: copy the name from the table below exactly.
- `official_domain`: the university's own plain domain, no `www.` and no path (`example.ac.uk`). **Every index URL
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
- Undergraduate courses are **already loaded** from the national Discover Uni dataset, each with its page. What is
  missing is **postgraduate taught (master's) courses**. Look for each university's "postgraduate taught courses A to Z"
  page (or the list per school). Undergraduate lists are a bonus, not the goal. Some pages are on a `/postgraduate/`
  or `study.` subdomain.

## Hard rules

1. **Open every page yourself and confirm it lists courses with links before you write its URL.** Never write a URL
   from memory or by guessing the pattern. If you cannot open it, write no file for that university.
2. Official university pages only. No course aggregators, rankings sites, forums, agents or social media.
3. Stay light: open at most about three pages per university. Do not bulk-copy or download course pages, and do not
   crawl. Respect login walls, bot checks and CAPTCHAs: skip that university and note it.
4. Do not put any course names, fees, deadlines or requirements in the files, and do not invent any.
5. Touch only your own folder `data/seed/indexes/gb/`. Another tool is working on the other countries.

## Report

When finished, add `data/seed/indexes/gb/REPORT.md` with three short lists:
- **Done:** universities with a file and the pages you used.
- **Skipped:** universities with no file and why (JavaScript only, login, blocked, could not find a list).
- **Domain differences:** where the domain on file looked wrong, and the one you used.

## Check your work

If you can run commands: `cd worker && uv run uniguide-worker index load --check`. It validates every file and
prints how many are valid. If you cannot, re-read each file against the example above: valid YAML, two-space indents,
`country: GB`, URLs on the stated domain.

You are finished when every university in the table has either a file or a line under "Skipped".

## Universities

| # | University (name in our database) | Domain on file | Note |
|---|---|---|---|
| 1 | University of Leeds | www.leeds.ac.uk |  |
| 2 | University of Edinburgh | www.ed.ac.uk |  |
| 3 | University of Cambridge | www.cam.ac.uk |  |
| 4 | University College London | www.ucl.ac.uk |  |
| 5 | University of Glasgow Court | www.gla.ac.uk |  |
| 6 | University of Manchester | www.manchester.ac.uk |  |
| 7 | University of Birmingham | www.birmingham.ac.uk |  |
| 8 | University of Nottingham | www.nottingham.ac.uk |  |
| 9 | University of Sheffield | www.shef.ac.uk |  |
| 10 | University of Bristol | www.bristol.ac.uk |  |
| 11 | University of Oxford | www.ox.ac.uk |  |
| 12 | University of Newcastle Upon Tyne | www.ncl.ac.uk |  |
| 13 | King's College London | www.kcl.ac.uk |  |
| 14 | University of Liverpool | www.liverpool.ac.uk |  |
| 15 | University of Exeter | www.exeter.ac.uk |  |
| 16 | University of Southampton | www.soton.ac.uk |  |
| 17 | University of Durham | www.dur.ac.uk |  |
| 18 | Cardiff University | www.cardiff.ac.uk |  |
| 19 | Queen's University of Belfast | www.qub.ac.uk |  |
| 20 | University of Warwick | www.warwick.ac.uk |  |
| 21 | University of Aberdeen | www.abdn.ac.uk |  |
| 22 | Loughborough University | www.lboro.ac.uk |  |
| 23 | Queen Mary University of London | www.qmul.ac.uk |  |
| 24 | University of St Andrews | www.st-andrews.ac.uk |  |
| 25 | Imperial College of Science, Technology and Medicine | www.imperial.ac.uk |  |
| 26 | University of Bath | www.bath.ac.uk |  |
| 27 | University of York | www.york.ac.uk |  |
| 28 | Swansea University | www.swan.ac.uk |  |
| 29 | University of Surrey | www.surrey.ac.uk |  |
| 30 | University of Reading | www.reading.ac.uk |  |
| 31 | University of Strathclyde | www.strath.ac.uk |  |
| 32 | University of Leicester | www.le.ac.uk |  |
| 33 | University of Sussex | www.sussex.ac.uk |  |
| 34 | Heriot-Watt University | www.hw.ac.uk |  |
| 35 | University of East Anglia | www.uea.ac.uk |  |
| 36 | London School of Economics and Political Science | www.lse.ac.uk |  |
| 37 | Brunel University London | www.brunel.ac.uk |  |
| 38 | School of Oriental and African Studies | www.soas.ac.uk |  |
| 39 | University of Kent (Part of London and South East University Group) | www.kent.ac.uk |  |
| 40 | Royal Holloway and Bedford New College | www.rhul.ac.uk |  |
| 41 | Aston University | www.aston.ac.uk |  |
| 42 | Coventry University | www.coventry.ac.uk |  |
| 43 | University of Stirling | www.stir.ac.uk |  |
| 44 | University of Dundee | www.dundee.ac.uk |  |
| 45 | The Manchester Metropolitan University | www.mmu.ac.uk |  |
| 46 | University of Huddersfield | www.hud.ac.uk |  |
| 47 | Goldsmiths College, University of London | www.gold.ac.uk |  |
| 48 | The Nottingham Trent University | www.ntu.ac.uk |  |
| 49 | University of Plymouth | www.plymouth.ac.uk |  |
