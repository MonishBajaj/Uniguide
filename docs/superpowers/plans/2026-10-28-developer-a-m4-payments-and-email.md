# Developer A, Milestone 4: Payments and email lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a student buy a one-time season pass (Stripe in USD, Razorpay in INR) that `my_entitlement()` reports and that makes writing reviews free while active; and send the lifecycle emails the product is missing (welcome series, weekly digest, re-engagement) with a working unsubscribe.

**Architecture:** The web app holds no Supabase secret key, so it cannot write entitlements directly. Payment webhooks arrive at Next.js route handlers, which verify the provider's signature with the provider's secret, then call one `SECURITY DEFINER` function, `record_payment`, passing a shared webhook token whose SHA-256 hash is stored in a table nobody can read. `my_entitlement()` keeps its signature and reads `entitlements`. Writing reviews stay priced in `record_writing_review`; it charges zero during an active pass. Lifecycle emails run in the worker as the `notifier` role, next to the existing reminders, with an `email_preferences` table and a token-based unsubscribe page.

**Tech Stack:** Postgres (Supabase) with pgTAP; Next.js 16 route handlers; `stripe` and `razorpay` Node SDKs; Python worker (notifier role, existing `Mailer`); Vitest, pytest.

**Spec:** `docs/FEATURES.md` rows X6 and 14.1; `BACKLOG.md` "Payments (Stripe season pass USD 15–29, Razorpay INR 999–1,999)"; contract `my_entitlement()` from `20261101000001_contracts_for_web.sql`.

## Owner decisions this plan assumes (change before Task 3 if wrong)

- **Price:** USD 19 and INR 1,499 (inside the BACKLOG ranges). Stored as configuration, not code.
- **Length of a pass:** 12 months from purchase.
- **Refunds:** an admin marks a payment refunded; the entitlement ends at once and a `refund` row is written.
- **Vercel Pro** is in place before the first live payment (Hobby forbids commercial use; `docs/SETUP.md` section 4).

## Global Constraints

- The web app never receives the Supabase service-role or secret key (`docs/SETUP.md`, `docs/ARCHITECTURE.md`).
- A webhook is trusted only after the provider signature check passes. Every webhook is idempotent on the provider's payment id.
- Card and bank details never touch our servers: Stripe Checkout and Razorpay Checkout are hosted by the providers.
- Lifecycle emails: every one carries a working unsubscribe link; the weekly digest and re-engagement respect `email_preferences`; deadline reminders stay as they are (the student chose them).
- No email to an account in `pending_parental` consent state other than the consent flow itself.
- Migrations start with `20261104`. Same check commands and commit rules as Milestone 2 (no `Co-Authored-By: Claude` line).

## Review Focus

1. **The same webhook delivered twice** grants one entitlement and one ledger row. Pinned in Task 1 (`replayed payment id is a no-op`).
2. **A webhook with a valid shape but a bad signature** is rejected before any database call. Pinned in Task 3 (`rejects a bad signature without calling the database`).
3. **A pass that expired yesterday** reports `'free'`, and the next writing review costs credits again. Pinned in Task 2 (`expired pass charges again`).
4. **A student who unsubscribed from the digest** still gets deadline reminders but no digest. Pinned in Task 5 (`unsubscribed students get reminders, not digests`).
5. **Running the digest twice in the same week** sends one email per student. Pinned in Task 5 (`one digest per student per week`).

---

### Task 1: Entitlements and `record_payment`

**Files:**
- Create: `supabase/migrations/20261104000001_entitlements.sql`
- Test: `supabase/tests/database/180_entitlements.test.sql`

**Interfaces:**
- Produces:
  - `public.entitlements (id uuid pk, user_id uuid not null references auth.users on delete cascade, kind text not null check (kind = 'season_pass'), provider text not null check (provider in ('stripe','razorpay','admin')), external_id text not null, amount numeric not null, currency char(3) not null, starts_at timestamptz not null default now(), ends_at timestamptz not null, refunded_at timestamptz, created_at timestamptz not null default now(), unique (provider, external_id))`. RLS: a student selects own rows; no direct writes for anyone.
  - `public.payment_config (id boolean primary key default true check (id), webhook_token_hash text not null, pass_months smallint not null default 12)`: RLS on, no policies, no grants (only definer functions read it).
  - `public.record_payment(p_token text, p_provider text, p_external_id text, p_user_id uuid, p_amount numeric, p_currency char(3)) returns uuid`: `security definer`; raises `42501` unless `encode(extensions.digest(p_token, 'sha256'), 'hex')` equals the stored hash; inserts the entitlement (`ends_at = now() + pass_months months`); no `credit_ledger` row (its check forbids `delta = 0`, and the entitlement row is the record); on a duplicate `(provider, external_id)` returns the existing id. Execute granted to `anon` (the webhook route calls it without a user session).
  - `public.refund_payment(p_entitlement uuid) returns void`: admins only; sets `refunded_at`.

- [ ] **Step 1:** pgTAP: wrong token raises `42501`; right token creates one row; `replayed payment id is a no-op` (second call returns the same id, count stays 1); a student sees own entitlement, not another's; nobody can select `payment_config`; non-admin `refund_payment` raises.
- [ ] **Step 2:** `pnpm db:test`. Expected: FAIL (functions missing).
- [ ] **Step 3:** Migration (check `extensions.digest` is available: `pgcrypto` is already used by `supabase/seed.sql` via `extensions.crypt`). Local seed sets a known test token hash in `supabase/seed.sql`.
- [ ] **Step 4:** `pnpm exec supabase migration up && pnpm db:types && pnpm db:test`. Expected: pass.
- [ ] **Step 5: Commit** `Add entitlements and a token-guarded record_payment function`

### Task 2: `my_entitlement()` and free reviews during a pass

**Files:**
- Create: `supabase/migrations/20261104000002_entitlement_reads.sql` (`create or replace` of `my_entitlement`, `record_writing_review`, `writing_allowance`, same signatures)
- Test: `supabase/tests/database/130_contracts.test.sql`, `supabase/tests/database/080_writing.test.sql` (extend)

**Interfaces:**
- Produces: `my_entitlement()` returns `'season_pass'` while the caller has an entitlement with `now() between starts_at and ends_at` and `refunded_at is null`; otherwise unchanged (`'none'` / `'free'`). `record_writing_review` charges `v_cost = 0` while `my_entitlement() = 'season_pass'`. `writing_allowance()` returns `free_review = true` during a pass.

- [ ] **Step 1:** pgTAP: active pass gives `'season_pass'` and a review costs nothing; `expired pass charges again` (set `ends_at` to yesterday: `'free'`, and the review writes a negative ledger row); refunded pass behaves as expired.
- [ ] **Step 2:** Expected FAIL. **Step 3:** Migration, starting from the current bodies in `20261028000014_writing.sql`. **Step 4:** `pnpm db:test` passes. Tell Developer B that `my_entitlement()` is live.
- [ ] **Step 5: Commit** `Report season passes from my_entitlement and make writing reviews free during one`

### Task 3: Checkout and webhooks

**Files:**
- Create: `apps/web/lib/payments.ts` (provider-agnostic helpers), `apps/web/lib/payments.test.ts`
- Create: `apps/web/app/api/checkout/route.ts` (POST: creates a Stripe Checkout Session or a Razorpay Order for the signed-in user; returns the provider URL or order id)
- Create: `apps/web/app/api/webhooks/stripe/route.ts`, `apps/web/app/api/webhooks/razorpay/route.ts`
- Modify: `.env.example` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `PAYMENT_WEBHOOK_TOKEN`, `PASS_PRICE_USD=1900`, `PASS_PRICE_INR=149900`), `docs/SETUP.md` (a "Payments" section)

**Interfaces:**
- Produces: `verifyRazorpaySignature(body: string, signature: string, secret: string): boolean` (HMAC SHA-256 hex, constant-time compare); `toPaymentRecord(provider: "stripe" | "razorpay", event: unknown): { externalId: string; userId: string; amount: number; currency: string } | null` (reads the user id from the metadata / notes set at checkout; returns `null` for events that are not a completed payment). Stripe signatures use `stripe.webhooks.constructEvent`. Webhook routes call `supabase.rpc("record_payment", { p_token: process.env.PAYMENT_WEBHOOK_TOKEN, ... })` with the publishable key and no session.

- [ ] **Step 1:** Vitest: `verifyRazorpaySignature` true for a known HMAC fixture and false for a changed body; `toPaymentRecord` maps a `checkout.session.completed` fixture and a Razorpay `payment.captured` fixture, and returns `null` for other event types; `rejects a bad signature without calling the database` (the route handler, with the RPC client injected, returns 400 and the fake RPC is never called).
- [ ] **Step 2:** `pnpm --filter web test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Checkout requires a signed-in user (401 otherwise). Currency is chosen by the request (`usd` or `inr`); anything else is 400.
- [ ] **Step 4:** Web checks; then, with Stripe test keys and the Stripe CLI (`stripe listen --forward-to localhost:3000/api/webhooks/stripe`), buy a pass with Stripe's published test card locally. Expected: an `entitlements` row; `my_entitlement()` returns `'season_pass'` for that user. Repeat with Razorpay test mode.
- [ ] **Step 5: Commit** `Add Stripe and Razorpay checkout with signature-checked webhooks`

Developer B builds the paywall and upgrade UI (X10) on `POST /api/checkout` and `my_entitlement()`.

### Task 4: Email preferences and unsubscribe

**Files:**
- Create: `supabase/migrations/20261104000003_email_preferences.sql`
- Create: `apps/web/app/unsubscribe/[token]/page.tsx`
- Test: `supabase/tests/database/190_email_preferences.test.sql`

**Interfaces:**
- Produces: `public.email_preferences (user_id uuid pk references auth.users on delete cascade, digest boolean not null default true, tips boolean not null default true, unsubscribe_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'), updated_at timestamptz not null default now())`, created for every user by extending `handle_new_user` (and backfilled for existing users in the migration). RLS: own row select and update. `public.unsubscribe(p_token text, p_kind text) returns boolean`, `security definer`, executable by `anon`, sets `digest` or `tips` false (or both for `'all'`); `false` for an unknown token. Readable by the `notifier` role.

- [ ] **Step 1:** pgTAP: a new user gets a row; `unsubscribe` with the token turns off the right flag; a wrong token returns false and changes nothing; another user cannot read the row.
- [ ] **Step 2:** Expected FAIL. **Step 3:** Migration; the page calls `unsubscribe` from a form button (not on GET, so link scanners cannot unsubscribe people, the same reason the parental consent page uses a button).
- [ ] **Step 4:** `pnpm db:test`, web checks; open a local unsubscribe link. Expected: confirmation, flag off.
- [ ] **Step 5: Commit** `Add email preferences with a one-click unsubscribe page`

### Task 5: Welcome series, weekly digest, re-engagement

**Files:**
- Create: `worker/src/uniguide_worker/lifecycle.py`
- Modify: `worker/src/uniguide_worker/cli.py` (`notify` also runs lifecycle; a `--only reminders|lifecycle` option), `.github/workflows/scheduled.yml` (no change to cadence: the hourly job calls lifecycle, which decides what is due)
- Create: `supabase/migrations/20261104000004_lifecycle_log.sql` (`public.lifecycle_log (user_id, kind, period_key, sent_at, unique (user_id, kind, period_key))`, notifier insert and select only)
- Test: `worker/tests/test_lifecycle.py`

**Interfaces:**
- Produces: `due_lifecycle(conn: Connection, now: datetime) -> list[LifecycleMessage]` and `send_lifecycle(conn, mailer, site_url, now=None) -> NotifyReport`. `LifecycleMessage = (user_id, email, kind, period_key, subject, body)`. Kinds and when they are due:
  - `welcome_1` on day 0, `welcome_2` on day 3 (how matching works), `welcome_3` on day 7 (shortlist and reminders): `tips` must be on; `period_key` = the kind.
  - `digest` on Mondays: shortlisted courses with changed facts or deadlines in the next 30 days; skipped when there is nothing to say; `digest` must be on; `period_key` = ISO week (`2026-W45`).
  - `reengage` once, 14 days after the last sign-in when the student has a shortlist: `tips` must be on; `period_key` = `'once'`.
  - Never to `pending_parental` accounts.

- [ ] **Step 1:** pytest against the local database (pattern of `tests/test_pipeline_db.py` and `tests/test_notify.py`, with the fake mailer there): welcome timing; `unsubscribed students get reminders, not digests`; `one digest per student per week` (two runs, one send, enforced by `lifecycle_log`); an empty digest is not sent; pending parental consent gets nothing.
- [ ] **Step 2:** `uv run pytest tests/test_lifecycle.py`. Expected: FAIL.
- [ ] **Step 3:** Implement; every body ends with the unsubscribe link `SITE_URL/unsubscribe/<token>`. Copy is plain and specific (no exclamation marks).
- [ ] **Step 4:** Worker checks; run `uv run uniguide-worker notify --only lifecycle` locally and read the messages in Mailpit (`http://127.0.0.1:54324`). Expected: welcome emails for the seed student, unsubscribe link works.
- [ ] **Step 5: Commit** `Send welcome, weekly digest and re-engagement emails with unsubscribe`

### After the last task

Update `docs/FEATURES.md`: X6 Built, 14.1 Built, totals. Remove "Payments" from "Left to do" in `BACKLOG.md`.
