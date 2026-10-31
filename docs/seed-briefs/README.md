# Finding course-list pages with several AI tools

Each country gets one tool, which finds the official page that lists each university's courses and writes a small
index file. Our crawler then reads those pages and verifies every course mechanically (the course name must be quoted
on the page, its link must be on the university's own website). The tools never supply courses, fees or deadlines.

| Country | Tool | Brief |
|---|---|---|
| United States | Claude (this session) | the 30 files already in `data/seed/indexes/us/` are still unverified; Claude checks them first |
| Australia | Antigravity | [antigravity-australia.md](antigravity-australia.md) |
| United Kingdom | Kimi | [kimi-uk.md](kimi-uk.md) |
| Netherlands | ChatGPT | [chatgpt-netherlands.md](chatgpt-netherlands.md) |

Paste a brief into the tool as it is. The tables list only university names and the domain we already hold; they
carry no ranking data.

## After a tool finishes

1. Put its files in `data/seed/indexes/<cc>/` and read its `REPORT.md`.
2. Validate: `cd worker && uv run uniguide-worker index load --check`.
3. **Open each index URL yourself.** If it lists the university's courses with links, add under that `indexes` entry
   `verified_by: "Your Name"` and `verified_at: <today>`. A file without them loads switched off and is never crawled.
   Only a person adds these.
4. Load and crawl: `uv run uniguide-worker index load`, then `uv run uniguide-worker index crawl --country au --limit 10`
   (use `gb`, `nl`, `us`). The crawl uses the model named by `EXTRACTOR` (your local Ollama), so each page takes a
   minute or so; a very long list is cut to its first 250 links, which is why the briefs ask for up to three pages.
5. Check the new courses on the matches page. Courses the model only suggests stay hidden until an admin approves them.

Use the tools' own terms in mind: they should open a few pages per university to find a list, not copy course pages.
