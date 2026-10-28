# Data sources

Only official sources. Never aggregators (Yocket, Studyportals, Leverage Edu, ...), rankings sites (QS, THE, US News), forums or GradCafe, and nothing behind a login. The fetcher enforces a blocklist and robots.txt.

| Source | Country | Used for | Licence / terms | Status in code |
|---|---|---|---|---|
| [CRICOS register](https://data.gov.au/data/dataset/cricos) (data.gov.au) | AU | Institutions and courses open to student-visa holders (Listed) | CC BY 2.5 AU, attribute the Department of Education | `import au-cricos`, verified against the live export (Oct 2026): 1,105 providers, 18,607 tertiary courses |
| [College Scorecard API](https://collegescorecard.ed.gov/data/documentation/) | US | Institutions and fields of study by credential (Listed) | Public domain; api.data.gov key, 1,000 requests/hour default | `import us-scorecard`. Written to the documented response shape; **confirm against a live response with your key** before a full import |
| [Discover Uni dataset](https://www.discoveruni.gov.uk/about-our-data/) | GB | Undergraduate courses (Listed) | Open Government Licence v3.0 | `import uk-discover-uni` from downloaded files. **Confirm the column names** against the current year's specification; the importer fails loudly on a mismatch |
| [Hochschulkompass](https://www.hochschulkompass.de/) (HRK) | DE | Degree programmes | Reuse needs a partner export from HRK | Stub until access is granted. Do not scrape |
| [ROR](https://ror.org/) | All | Institution identifiers | CC0 | Column exists (`institutions.ror_id`); importer in backlog |
| [OpenAlex](https://openalex.org/) | All | Faculty and research for research degrees | CC0 | Weeks 7–12 |
| University pages | All | Requirements, fees, deadlines (Extracted, then Verified) | Copyright of the institution | Facts, short evidence quotes and content hashes only; never page copies |

## Rules for fetching

- robots.txt respected (protego); an unreadable robots.txt means do not fetch.
- At most one request every 5 seconds per host, or the site's crawl delay if longer.
- Conditional GET (ETag, Last-Modified); re-extract only when the content hash changes.
- User-Agent names the bot and a contact address (`CRAWLER_CONTACT`).
