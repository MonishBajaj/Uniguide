# Curated course-index crawl (US first)

## Goal

Fill the catalog with named courses from official university sites without hand-entering them, starting
with 30 US universities. A curated list of universities feeds a daily crawl; Gemini suggestions for the long
tail stay hidden until a person approves them.

## Decisions (agreed with the owner)

- Option C: curated index pages for the main universities, Gemini suggestions for the long tail.
- US first, 30 universities. Germany and other countries follow with the same machinery.
- Suggested (long-tail) courses are hidden until an admin approves them.

## Components

1. **Seed files** `data/seed/indexes/<country>/<slug>.yaml`: institution name, country, official domain,
   optional ROR id, and `indexes[]` with `url`, `kind`, `verified_by`, `verified_at`. An index with no
   `verified_by` loads inactive and is never crawled. `uniguide-worker index load [--check]` validates and
   upserts institutions (by domain, then name+country) and `institution_indexes`.
2. **Table** `institution_indexes(institution_id, url, kind, active, content_hash, last_checked_at,
   last_changed_at)`. Admins read it; the ingest worker reads and writes it.
3. **Crawl** `uniguide-worker index crawl [--country us] [--limit N]`: fetch each active index page politely,
   skip it if its content hash is unchanged, ask Gemini for the courses it lists (title, level, course URL,
   verbatim quote), keep a course only when its quote is on the page, its level is valid, and its URL host
   matches the institution's recorded domain. Kept courses are created published at the Extracted tier. It
   runs daily from the scheduled workflow when its secrets exist. One page per index URL; an index that is
   paginated lists each page as its own URL.
4. **Reviewed long tail**: courses created by the Gemini candidate fallback are saved unpublished with
   `suggestion_status = 'pending'`. The worker still reads their pages. A student's progress card for such a
   course says it is being checked by the team. An admin sees them at `/admin/suggested` and approves
   (publishes) or rejects them through `review_suggested_course(p_program, p_approve)`.

## Out of scope

Removing courses that disappear from an index, JavaScript-rendered index pages, countries other than the US
for the seed list, automatic approval, Hochschulkompass.

## Constraints

- Official domains only; the fetcher's robots, rate limit and blocklist apply.
- The LLM supplies course identity only; every course needs a quote found on the page and a URL on the
  institution's own domain.
- This environment cannot reach university sites, so the 30 seed files ship **unverified** (inactive) until
  a person checks each index URL.
