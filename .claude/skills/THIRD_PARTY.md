# Third-party skills

Project skills for Claude Code, copied from upstream repositories (skill folders only; no hooks,
scripts or plugins). All MIT licensed; licence texts are in `_licenses/`. To update, re-copy the
folders from upstream and read the diff before committing: these files become instructions.

| Skills | Source | Commit |
|---|---|---|
| nextjs-turbopack, postgres-patterns, database-migrations, react-patterns, python-testing, eval-harness, cost-aware-llm-pipeline, security-review, frontend-a11y, e2e-testing, seo | [affaan-m/ECC](https://github.com/affaan-m/ECC) | 25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b |
| ponytail, ponytail-review, ponytail-audit, ponytail-debt, ponytail-help, ponytail-gain | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | 09c434ab73ca43761c5d8b0c5d341926c2fba710 |
| landing-page-design | [elayadesign/ai-design-skills](https://github.com/elayadesign/ai-design-skills) | ded7efc9d5c02761c41a03caf3b78f9259ab8828 |

Why these ECC skills: they match this stack (Next.js 16, Supabase/Postgres with RLS, React 19,
the Python worker and its pytest suite, the extraction eval harness, LLM cost tracking,
Playwright, accessibility, and SEO for the public course pages). ECC ships 300+ skills; the rest
cover stacks this project does not use.

Where a skill's generic advice conflicts with this repository's own conventions (for example
Prisma or Drizzle migration commands; this project uses Supabase SQL migrations), the
repository wins.
