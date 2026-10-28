# Hosted setup: Supabase, Vercel and the worker

Everything runs locally without accounts (see the README). This guide puts it online. Allow about an hour.

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
| `monitor`: re-check official pages by demand | daily 03:17 | `WORKER_DATABASE_URL`, `ANTHROPIC_API_KEY` | `CRAWLER_CONTACT` |
| `research`: outcome report and admission model gate | Mondays 04:23 | `ANALYST_DATABASE_URL` | |

Any job can also be started by hand from the Actions tab (Run workflow).

## 7. Before charging money

Payments are not built. Work through the "Needs a decision or review before launch" list in BACKLOG.md: counsel review of the parental consent flow and consent ages, terms and privacy policy (both pages are drafts), F-1/OPT confirmation with your DSO, and a final product name.
