# Course Index Report: Australia

This report summarizes the course-list index discovery for the 25 Australian universities specified in the brief.

## Done

Universities with confirmed index pages that list degree programs directly in server-rendered HTML with individual course links on the university's domain:

- **The University of Sydney** (`sydney.edu.au`)
  - `https://www.sydney.edu.au/handbooks/arts/coursework.html`
  - `https://www.sydney.edu.au/handbooks/science/coursework.html`
  - `https://www.sydney.edu.au/handbooks/medicine-health/coursework.html`
- **Adelaide University** (`adelaide.edu.au`)
  - `https://adelaide.edu.au/study/study-areas/arts-humanities-social-sciences/`
  - `https://adelaide.edu.au/study/study-areas/business-marketing-management/`
  - `https://adelaide.edu.au/study/study-areas/engineering/`
- **Australian National University** (`anu.edu.au`)
  - `https://study.anu.edu.au/all-programs-and-courses`
  - `https://study.anu.edu.au/all-programs-and-courses?page=1`
  - `https://study.anu.edu.au/all-programs-and-courses?page=2`
- **The University of Western Australia** (`uwa.edu.au`)
  - `https://www.handbooks.uwa.edu.au/undergraduate`
  - `https://www.handbooks.uwa.edu.au/postgraduate`
  - `https://www.handbooks.uwa.edu.au/college`
- **University of Wollongong** (`uow.edu.au`)
  - `https://www.uow.edu.au/study/courses/`
  - `https://www.uow.edu.au/study/courses/?page=2`
  - `https://www.uow.edu.au/study/courses/?page=3`
- **Swinburne University of Technology** (`swinburne.edu.au`)
  - `https://www.swinburne.edu.au/courses/find-a-course/engineering/`
  - `https://www.swinburne.edu.au/courses/find-a-course/business/`
  - `https://www.swinburne.edu.au/courses/find-a-course/information-technology/`
- **Flinders University** (`flinders.edu.au`)
  - `https://www.flinders.edu.au/study/courses`

## Skipped

Universities with no file created and the reason for skipping:

- **The University of Melbourne (UniMelb)**: Blocked by bot challenge (Cloudflare managed challenge HTTP 403 across `unimelb.edu.au` and `study.unimelb.edu.au`; Incapsula block on `handbook.unimelb.edu.au`).
- **The University of Queensland**: Blocked by Fastly/Varnish WAF (HTTP 403 Forbidden on `study.uq.edu.au`; `my.uq.edu.au/programs-courses/` robots disallowed and HTTP 403; connection reset on root domain).
- **Monash University**: Blocked by bot challenge (Cloudflare managed challenge HTTP 403 across `monash.edu` endpoints including `/robots.txt`).
- **UNSW Sydney**: JavaScript search only (both `handbook.unsw.edu.au` and `unsw.edu.au/study/find-a-degree-or-course` are client-side rendered SPAs with no HTML course lists without JavaScript).
- **Macquarie University**: Blocked by bot challenge (Cloudflare HTTP 403 on `www.mq.edu.au` and `study/find-a-course`; `coursehandbook.mq.edu.au` is CourseLoop React SPA without HTML course links).
- **Deakin University (Deakin)**: Blocked by bot challenge (Cloudflare managed challenge HTTP 403 across `deakin.edu.au` and `/robots.txt`).
- **Curtin University**: No static HTML course index page; search endpoint `search.curtin.edu.au` is blocked by Incapsula (HTTP 403).
- **University of Technology Sydney (UTS)**: JavaScript search only (`handbook.uts.edu.au` migrated to CourseLoop React SPA `coursehandbook.uts.edu.au`; main site search is dynamic JS without static HTML course lists).
- **RMIT University (RMIT)**: JavaScript search only (search endpoints `/search` and `/study-with-us/find-a-course` are JS-driven or return empty/404; no static HTML course index page).
- **Queensland University of Technology**: Blocked by bot challenge (Cloudflare managed challenge HTTP 403 across `qut.edu.au` and `/robots.txt`).
- **Griffith University**: Blocked by bot challenge (Cloudflare managed challenge HTTP 403 across `griffith.edu.au` and `/robots.txt`).
- **La Trobe University**: Blocked by bot challenge (Cloudflare managed challenge HTTP 403 on `www.latrobe.edu.au`; `handbook.latrobe.edu.au` is CourseLoop React SPA with no HTML course lists).
- **Western Sydney University**: Blocked by bot protection (Akamai EdgeSuite HTTP 403 Access Denied on `handbook.westernsydney.edu.au`; main site course directories load cards via client-side JavaScript).
- **University of Tasmania (UTas)**: Blocked by bot challenge (Cloudflare managed challenge HTTP 403 across `utas.edu.au` and `/robots.txt`).
- **James Cook University**: Blocked by bot challenge (Cloudflare managed challenge HTTP 403 on `www.jcu.edu.au`; `handbook.jcu.edu.au` is CourseLoop React SPA with no HTML course links).
- **Edith Cowan University**: Blocked by bot challenge (Cloudflare managed challenge HTTP 403 across `ecu.edu.au` and `/robots.txt`).
- **Australian Catholic University**: Blocked by WAF bot protection (HTTP 403 Forbidden with reference ID block across `acu.edu.au` and `/robots.txt`).
- **University of Canberra**: JavaScript search only (interactive Funnelback search on `search.canberra.edu.au` which blocks programmatic requests via HTTP 403 and robots disallow; no static HTML course list).

## Domain differences

- **Adelaide University**: Was "not on file" in the database; confirmed and used the current primary domain `adelaide.edu.au` created through the University of Adelaide and UniSA merger.
- **Monash University**: Domain on file was `www.monash.edu.au`; the university's primary plain domain is `monash.edu` (which `monash.edu.au` redirects to).
- **All other institutions**: Stripped leading `www.` prefix from "Domain on file" to satisfy the schema requirement that `official_domain` be a plain domain name without `www.` or path (e.g. `sydney.edu.au`, `anu.edu.au`, `uwa.edu.au`, `uow.edu.au`, `swinburne.edu.au`, `flinders.edu.au`).
