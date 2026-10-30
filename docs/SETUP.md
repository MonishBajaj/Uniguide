# Hosted setup: Supabase, Vercel and the worker

Everything runs locally without accounts (see the README). This guide puts it online. Allow about an hour. To host a demo on your own machine instead, follow [DEMO_LOCAL.md](DEMO_LOCAL.md).

## 1. Supabase project

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard). Choose a region near your users; if you will market to the EU or UK, choose an EU region (GDPR).
   - Free tier pauses after about a week of inactivity and allows two projects. Move to Pro before launch.
2. Link and push the schema from your machine:

   ```bash
   pnpm exec supabase login
   ```

   ```bash
   pnpm exec supabase link --project-ref <your-project-ref>
   ```

   ```bash
   pnpm exec supabase db push
   ```

   `supabase/seed.sql` is for local development only and is **not** pushed.
3. **Auth settings** (Authentication → URL Configuration): set Site URL to your production URL and add `https://<your-domain>/auth/callback` to the redirect URLs. Keep **Confirm email** on.
4. **Auth email** (Authentication → Emails → SMTP): the built-in sender is rate limited and for testing only. Add an SMTP provider (Resend works) before real users sign up.
5. **Keys** (Project Settings → API Keys): copy the project URL and the **publishable** key (`sb_publishable_…`). The web app never needs the secret or service-role key.

## 2. Worker database roles

The worker uses three Postgres roles, none of which can read what it does not need:

| Role | Used by | Reads |
|---|---|---|
| `ingest_worker` | imports, extraction, monitor | catalogue and proposals, no student data |
| `notifier` | reminder and update emails | what an email needs; recipients through a function |
| `analyst` | outcome report and admission model | consented outcomes without user ids |

In the SQL editor, give each a different strong password:

```sql
alter role ingest_worker with login password '<long random password>';
alter role notifier with login password '<another long random password>';
alter role analyst with login password '<a third long random password>';
```

Connection strings (Connect → Session pooler). The pooler needs the project ref in the user name:

```
WORKER_DATABASE_URL=postgresql://ingest_worker.<project-ref>:<password>@<pooler-host>:5432/postgres
NOTIFIER_DATABASE_URL=postgresql://notifier.<project-ref>:<password>@<pooler-host>:5432/postgres
ANALYST_DATABASE_URL=postgresql://analyst.<project-ref>:<password>@<pooler-host>:5432/postgres
```

The seed loader is an operator task and uses the `postgres` user's connection string as `OPERATOR_DATABASE_URL`. It refuses to load placeholder courses into a hosted database.

## 3. First admin

Sign up on the live site with your own email, then in the SQL editor:

```sql
insert into public.admins (user_id) select id from auth.users where email = '<your email>';
```

The **Review queue**, **Rules** and **Team** links then appear in the header.

- **Verifiers** (contractors who check one or more countries): ask them to sign up, then add them on **Team** with their email and countries. They see and review only those countries' courses, and the Team page shows each verifier's tally. Pause them there when a contract ends.
- **Consultancies**: add the organisation on **Team**, then its counselors by email. Give the organisation its invite code; students enter it under Profile → Manage sharing. Counselors see a read-only **Students** page.

## 4. Vercel

1. Import the GitHub repository at [vercel.com/new](https://vercel.com/new). Set **Root Directory** to `apps/web`; Vercel detects Next.js and the pnpm workspace.
2. Environment variables (Production and Preview):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` |
   | `NEXT_PUBLIC_CONTACT_EMAIL` | address for "report outdated information" |
   | `ANTHROPIC_API_KEY` | AI features: CV reader, setup chat, explanations, course Q&A, writing review (optional; each needs the student's AI consent) |
   | `VOYAGE_API_KEY` | embeddings for the faculty matcher (optional; full-text search is used without it) |
   | `RESEND_API_KEY`, `EMAIL_FROM` | parental consent emails |

   Do **not** set `AUTH_DISABLED`. It switches sign-in off, and the Guest / User / Parent switcher refuses a non-local database, so a hosted site with it set would have no way to sign in.

3. **Plan:** Vercel Hobby is for non-commercial use only. The waitlist with pricing questions is borderline and charging money is not allowed on Hobby: move to Pro before taking payments.

Parental consent emails need `RESEND_API_KEY` in production; without it the request fails rather than silently not sending.

## 5. Worker credentials

| Variable | Where from |
|---|---|
| `WORKER_DATABASE_URL`, `NOTIFIER_DATABASE_URL`, `ANALYST_DATABASE_URL` | step 2 |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com): page extraction with Claude Haiku 5.5 |
| `DATA_GOV_API_KEY` | free at [api.data.gov/signup](https://api.data.gov/signup/): College Scorecard importer |
| `OPENALEX_API_KEY` | [openalex.org](https://openalex.org/): faculty import for research degrees |
| `RESEND_API_KEY`, `EMAIL_FROM` | reminder and update emails (without a key the notifier only prints what it would send) |
| `CRAWLER_CONTACT` | an email site owners can reach you at; sent in the User-Agent |

Run imports from your machine (`uv run uniguide-worker import --help`).

## 6. Scheduled jobs

`.github/workflows/scheduled.yml` runs the recurring work on GitHub Actions. Each job runs only when its secret exists, so add them under Settings → Secrets and variables → Actions:

| Job | When (UTC) | Secrets | Variables |
|---|---|---|---|
| `notify`: deadline reminders and update emails | hourly at :07 | `NOTIFIER_DATABASE_URL`, `RESEND_API_KEY` | `EMAIL_FROM`, `SITE_URL` |
| `monitor`: re-check official pages by demand | daily 03:17 | `WORKER_DATABASE_URL`, and `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` | `CRAWLER_CONTACT`, `EXTRACTOR` (`gemini` by default) |
| `research`: outcome report and admission model gate | Mondays 04:23 | `ANALYST_DATABASE_URL` | |
| `index`: crawl verified course-index pages | daily 05:41 | `WORKER_DATABASE_URL`, `GEMINI_API_KEY` | `CRAWLER_CONTACT`, `GEMINI_MODEL` |
| `journeys`: recompute each active student's journey (stage and next steps) | daily 02:29 | `JOURNEY_CRON_TOKEN` | `SITE_URL` |

Any job can also be started by hand from the Actions tab (Run workflow).

### Journey recompute token

The `journeys` job calls `POST /api/cron/journeys` on the live site, which recomputes students who signed in within 90 days and stores the result for emails and the parent view. The web app has no secret Supabase key, so the route proves itself with a shared token, like the payment webhooks:

1. Pick a token of at least 32 random bytes (for example `openssl rand -hex 32`).
2. Set it as `JOURNEY_CRON_TOKEN` on Vercel (Production) and as the `JOURNEY_CRON_TOKEN` Actions secret.
3. Store its hash in the database (SQL editor):

   ```sql
   insert into public.journey_config (cron_token_hash)
   values (encode(extensions.digest('<the token>', 'sha256'), 'hex'))
   on conflict (id) do update set cron_token_hash = excluded.cron_token_hash;
   ```

Locally the seed stores the hash of `local-journey-token`, which `.env.example` already sets. Without the variable the route answers 503; with a wrong token, 401.

## 7. Enrichment worker (on-demand course facts)

When a student presses "Find universities for me", the web app queues a job and the progress page follows it. A long-running process has to pick the job up, because Vercel functions are too short for fetching and reading ten sets of official pages. It is the same worker image as everything else:

```bash
docker build -t uniguide-worker worker
```

Deploy that image on Fly.io, Railway, Render or any host that keeps a process running, with these environment variables:

| Variable | Value |
|---|---|
| `WORKER_DATABASE_URL` | the `ingest_worker` connection string from step 2 |
| `GEMINI_API_KEY` | a Google AI Studio key (or set `EXTRACTOR=anthropic` and `ANTHROPIC_API_KEY`) |
| `GEMINI_MODEL` | optional, defaults to a Flash model |
| `CRAWLER_CONTACT` | an address that officials of the sites we read can write to |
| `ENRICH_FRESH_DAYS` | optional, default `7`: courses read within this many days are not fetched again |

Locally, run it with `cd worker && uv run uniguide-worker serve` after `pnpm db:start`. One worker is enough; it handles one course at a time so the free Gemini limits hold. A job whose worker stops is picked up again after 15 minutes without a heartbeat.

### Turning on the course-index crawl

1. Load the seed files (operator role): `cd worker && uv run uniguide-worker index load`. Everything loads **inactive**.
2. For each university in `data/seed/indexes/us/` and `data/seed/indexes/de/`, open its `url`, confirm it is the university's own list of courses (fix the URL if not), then add `verified_by: "Your Name"` and `verified_at: YYYY-MM-DD` to that index and load again.
3. Try one: `uv run uniguide-worker index crawl --country us --limit 1`, then look at the new courses in the catalog.
4. Review model-suggested courses at `/admin/suggested`.

## 8. Before charging money

Payments are built (see the Payments section below); you still need provider accounts and keys. Work through the "Needs a decision or review before launch" list in BACKLOG.md: counsel review of the parental consent flow and consent ages, terms and privacy policy (both pages are drafts), F-1/OPT confirmation with your DSO, and a final product name.

## Payments (season pass)

1. In Stripe, create a webhook endpoint `https://<your-domain>/api/webhooks/stripe` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. In Razorpay, create one at `/api/webhooks/razorpay` for `order.paid`. A payment event that does not match the pass answers 422 and is logged; check for those after launch.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `PASS_PRICE_USD` and `PASS_PRICE_INR` on Vercel (Production).
3. Pick a `PAYMENT_WEBHOOK_TOKEN` of at least 32 random bytes (for example `openssl rand -hex 32`); it is the only guard on a function the web app calls without a session.
   Set it set it on Vercel, and store its hash in the database (SQL editor):

   ```sql
   insert into public.payment_config (webhook_token_hash)
   values (encode(extensions.digest('<the token>', 'sha256'), 'hex'))
   on conflict (id) do update set webhook_token_hash = excluded.webhook_token_hash;
   ```

4. Vercel Hobby is non-commercial: move to Pro before the first live payment. Test first with each provider's test keys and test card numbers.

