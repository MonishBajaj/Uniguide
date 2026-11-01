# Complete matches: find real course pages, check them, skip and replace (Part 2 of 3)

Date: 2026-11-01. Status: draft for review. Follows `2026-10-30-subject-ranked-candidates-design.md` (Part 1).

## Why

After Part 1 a student's matches are in subject and QS order, but almost none carries facts. In the local database there
are 7 deadlines and 14 requirements for 163,000 courses, no verified fact, and the cards say "Not yet known". The search
cannot fill them in because:

1. `start_enrichment` takes a fixed list of at most 12 courses chosen up front. The worker walks that list once.
2. A course page is found only from `programs.official_url`. Only 18% of courses have one, and the 111,000 US courses
   have none. They are also generic register rows ("Master's Degree: Electrical Engineering") that no university
   catalogue matches by name.
3. Nothing checks that a course ended with a deadline, a cost and requirements, and nothing replaces one that did not.

## Goal

When a student has a level, a country and a subject, the search ends with matches that **all** carry a deadline, a
cost and requirements read from the university's own pages. A university that cannot supply them is skipped and the
next one tried.

Success: for US, master's, Engineering, a search on the local stack finishes with up to 10 complete courses from at
least 4 universities, every one of them shown on the matches page with all three facts, and the progress page says how
many universities were checked and kept. If fewer than 10 qualify, it says so.

## Non-goals

- Pre-warming popular universities ahead of time (Part 3).
- A headless browser for JavaScript-only sites. Those universities are skipped with a reason.
- Verification by a person. Everything read here is shown as unverified, as extracted facts are today.
- Changing the matching score or eligibility rules.

## Decisions already made

- A course is **complete** when it has a deadline, a cost and a requirement (an unverified extracted fact counts).
- A search tries up to **30** courses and keeps the first **10** complete ones.
- A university's real course pages come from its **verified index first**, and from **automatic discovery** when it has
  none.

## Design

### 1. The unit of a search is a university

`start_enrichment(p_institution_ids uuid[])` replaces the course-id version. The web app passes up to 30 institutions in
pool order (Part 1: subject, then QS rank, at most 5 courses per university). The function copies the profile targets as
before, keeps the one-active-job and three-per-day limits, and stores the institutions as an ordered queue. Constants:
target 10 complete courses, at most 30 tried, at most 3 courses per university, a 45-minute budget per job.

Migration `20270108000001_complete_matches.sql`:

- `enrichment_jobs` gains `target_complete int default 10`, `max_tries int default 30`, `tried int default 0`,
  `kept int default 0`.
- New `enrichment_candidates (id, job_id, position, institution_id, status, reason, courses, started_at, finished_at)`,
  `status in ('pending','running','kept','skipped')`, unique `(job_id, position)` and `(job_id, institution_id)`.
  Row security like `enrichment_items`: the owner reads, the worker writes.
- `enrichment_items.status` allows `'incomplete'`; items gain `candidate_id`.
- New `institution_discovery (institution_id pk, status in ('found','none','blocked'), reason, index_url, checked_at)`,
  worker only. A `none` or `blocked` result is not retried for 7 days.
- The old `start_enrichment(uuid[])` is dropped and the web call changes with it.

### 2. Finding a university's real course pages (`worker/src/uniguide_worker/enrich/discover.py`)

`real_courses(...)` returns up to 3 program ids for one university in the student's field and level:

1. **Verified index first.** Published programs of that institution with an `official_url` whose `isced_f` starts with a
   target field and whose level is a target level. These come from verified index crawls or earlier discoveries.
2. **Automatic discovery** when step 1 is empty and the 7-day memory allows it. `find_index_page(...)` fetches the
   university's home page, scores its same-domain links for words such as graduate, postgraduate, programs, degrees and
   A to Z (level-aware: graduate words for master's and doctorate), follows each of the best few one more hop, and runs the
   course lister on the two pages with the most links. A page is accepted when at least 5 courses pass the crawl's
   acceptance checks (quote on the page, link on the page, link on the university's domain). The page is stored as an
   `institution_indexes` row, active but unverified, and its courses are created as published, unverified programs with
   their real titles and links.
3. **Field of a discovered course.** The lister schema gains `field` (one of the ten broad codes or null); it is stored
   as `isced_f`. A course with no field is not offered for a subject search.

A university with no real course after this is recorded in `institution_discovery` and skipped with a reason: no list
found, list needs JavaScript, access refused (403 or robots), or no course in the student's field. A discovery is capped
at about 6 minutes.

### 3. The loop (`worker/src/uniguide_worker/enrich/serve.py`)

For each queued university, in order, until `kept >= target_complete`, `tried >= max_tries` or the time budget ends:
mark it running, get its real courses, create items for them, run the existing per-course reading (`process_item`), then
count the courses that are complete. A university with at least one complete course is `kept` (its complete courses
count toward the target, at most 3); otherwise it is `skipped` with the reason. Heartbeats continue so a long job is
never mistaken for a dead one. The existing Gemini candidate fallback is removed from this path.

### 4. What "complete" means

`course_is_complete(p_program_id uuid) returns boolean`, stable, security invoker: the program's current cycle has at
least one published deadline of kind application or priority, one published cost item of kind tuition, and one published
requirement. After reading, an item ends `extracted` when its course is complete and `incomplete` when it is not.

### 5. What the student sees

- `search_programs` gains `p_complete_only boolean default false`, applied in both branches. `loadMatchInputs` takes an
  option; the matches page passes `completeOnly`, `startSearch` does not (it needs the full pool). Explore is unchanged.
- The progress page shows "checked N universities, kept M courses", lists skipped universities with their reason, and,
  when the job ends below the target, says how many were found and why the rest were skipped. New item wording for
  `incomplete`.
- A student with no complete courses yet sees an empty matches state that points to the search.

## Consequences to accept

- A cold search can run 20 to 45 minutes on the local GPU, since discovery costs minutes of model time per university.
  Results are cached: discovered courses and facts are reused by the next student.
- Discovered courses are published and shown as unverified. A wrong discovery shows a wrong unverified course.
- JavaScript-only and blocked universities (about 15 of the current set) never qualify until a headless fetch exists.
- The matches page shows only complete courses, so it is empty until a search has run.

## Tests

- **Worker (pytest, fake fetcher, lister and extractor):** the loop keeps the first 10 complete courses and stops; a
  university with only incomplete courses is skipped and the next one tried; the 30-try and time limits stop a job;
  a university's discovery failure is recorded and not retried within 7 days; discovery accepts a page with 5 or more
  accepted courses and rejects navigation-only pages; at most 3 courses count per university; verified-index courses
  are used before discovery.
- **Database (pgTAP):** `course_is_complete` with each fact missing in turn and with unverified facts present; the new
  `start_enrichment` limits and queue order; students cannot write candidates; `p_complete_only` filters.
- **Web (vitest):** the ordered institution list built from the pool (distinct, at most 30); the matches option.
- **Live trial:** run a real search for the demo student (US, master's, Engineering) and report universities tried,
  kept, skipped with reasons, and the time taken.

## Risks

- A 7B model picks wrong pages or invents a `field`; the acceptance checks catch fabricated courses but not a wrong
  field. Spot-check discovered indexes in the trial.
- Time: a job over many JavaScript or blocked universities may end with few results.
- The extractor must find all three facts on a course page or its linked fees and deadline pages; many courses will end
  `incomplete`, which is the intended skip.
