# M8 Portal accounts and real portals: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a student presses "Apply with UniGuide Assist" and UniGuide does the rest up to the portal's review page:

1. it **signs in** to the portal with the student's saved account, or **creates the account** for them
2. it **fills the application** page by page (guided apply, built in M7)
3. it **stops at the review page**, and the student checks and submits

It works on UCAS, Common App, Slate sites and universities' own application sites.

**Builds on:** M7 (assisted fill and guided apply, `docs/APPLICATION_ASSIST.md`), merged into `develop` at `397aed5`.

**Branch:** `Updated-developer-b`, restarted from `develop`. One commit per task, starting with its ID. Plain messages, no co-author line.

## Owner decisions of 1 November 2026

1. **Permission:** the owner reports permission to fill applications up to the review page on any university's own site, UCAS, Common App and Slate sites. OUAC, uni-assist and Studielink are still waiting. This clears gates G1, G2 and G4 (G4 widened from three universities to any university's own site) for filling up to review.
2. **Holding portal passwords is allowed.** UniGuide may keep a student's portal username and password, sign in for them, and create portal accounts for them.

This **replaces spec rule 4.1** ("we never ask for, see, store or handle a portal password"). Every other spec section 4 rule still holds: it never submits, pays, signs, certifies or declares; it pauses on anything uncertain; it fills only confirmed facts and never writes essays; no features while consent is pending or revoked; an audit log with no values.

## Design decisions (defaults; the owner can change any before its task starts)

| # | Question | Default | Why |
|---|---|---|---|
| D1 | **Where does sign-in happen?** | **In the student's own browser, by the extension,** when the student presses Apply or Start. Not from our servers. | Portals see a normal sign-in from the student's own device and network, so accounts aren't flagged or locked. Security codes sent to the student's phone or email reach them where they are. |
| D2 | **Where are passwords kept?** | **In UniGuide's database, end-to-end encrypted.** The extension encrypts each password with a key made from a **vault passphrase** the student sets. We store only the encrypted form and can't read it. | A breach of our database exposes nothing usable. The student's passwords follow them to any browser where they unlock the vault. |
| D3 | **What if the student forgets the passphrase?** | The saved passwords can't be recovered; the student adds them again, or resets them on the portal. | That's the price of us not being able to read them. The alternative (we hold the key) is listed below, not the default. |
| D4 | **Creating an account** | The extension fills the portal's sign-up form from the profile (name, email, date of birth, country), **generates a strong, unique password**, saves it to the vault, and shows it to the student. | A generated password is never one the student reuses elsewhere. |
| D5 | **Security checks** | CAPTCHAs, email or phone codes and "is this you?" checks **always pause for the student.** It never tries to get past them. | They exist to stop exactly that; trying would lock the account. |
| D6 | **The portal's own terms and declarations at sign-up** | The student ticks "I accept the terms" and any declaration themselves. The guard keeps refusing those boxes. | Only the applicant can accept a portal's terms. |
| D7 | **Reading verification codes from Gmail** | **Off.** A later, optional add-on with the read-only Gmail connection, after Google's review. | Needs Google's restricted-access review, and access to email is high-risk. |
| D8 | **Who can use it** | Adults, and minors whose parental consent is done, as for every assist feature. Counselors and parents never see or use the vault. | Same consent rules as M7. |
| D9 | **Student's agreement** | Before the first saved account, the student agrees, in plain words, that UniGuide may keep their portal password and sign in and fill for them, and that they stay the applicant and submit themselves. Recorded with a date, revocable, and revoking deletes the vault. | The student must know and agree. |

**Not the default:** UniGuide holds the key (no passphrase), so it could sign in from our servers without the student present. Easier for students, but anyone who breaks into our systems could read every password, and server sign-ins get blocked by portals. Only with an independent security review and the owner's explicit choice.

## Gates before real students use it (owner actions)

| Gate | What clears it | Blocks |
|---|---|---|
| **L. Permission covers accounts** | The written permission (or lawyer's review) is filed with the project, and it covers **signing in with saved passwords and creating accounts**, not only filling | Live use of sign-in and account creation (P3.x on real portals). Filling up to review on real portals only needs the existing permission |
| **S. Security review** | An independent security review of the vault, the extension and the database before launch | Live use of the vault |
| **P. Privacy and terms** | The privacy policy, terms of service and store disclosure updated for stored credentials; checked by a lawyer (DPDP, GDPR) | Live use of the vault; store submission |
| **G3. Clean-room review** | As in M7 | Store submission |
| **Test accounts** | The owner creates test accounts with made-up data on each portal, for mapping and checks | Each portal's map (P3.x) |

All building and testing happen on our practice portal until then. No real personal data is ever entered on a real portal, and nothing is ever submitted.

## Phase 1: Accounts on the practice portal

### Task P1.1: Practice portal sign-up, sign-in checks and security codes
- [ ] The practice portal gains: a sign-up page (name, email, date of birth, country, password, "I accept the terms" box), an emailed-code stand-in shown on a test-only page, an "account already exists" error, an optional two-step code at sign-in, and a "wrong password" error.
- [ ] Its map and adapter gain the sign-up and sign-in pages: roles `account.username`, `account.password`, `account.new_password`, and the terms box as `never`.
- [ ] Smoke tests for each new page. Commit `P1.1 Practice portal accounts`.

### Task P1.2: The vault (pure TypeScript)
- [ ] `packages/portal-adapters/src/vault.ts` with WebCrypto only:
  - key from the passphrase: PBKDF2-SHA-256, 600,000 rounds, random 16-byte salt per student
  - each entry encrypted with AES-256-GCM and its own random 12-byte nonce, with the portal and username bound in as associated data, so an entry can't be moved to another portal
  - a check value so a wrong passphrase is detected without decrypting entries
  - a password generator: 20 characters from the portal's allowed set, meeting its rules (from the adapter)
- [ ] **Failing tests first:** known-answer vectors, wrong passphrase, tampered ciphertext, entry swapped between portals, generator meets every adapter's rules.
- [ ] Commit `P1.2 Vault encryption`.

### Task P1.3: Database
- [ ] Migration (real current timestamp):
  - `portal_vaults` (user, salt, KDF settings, check value, agreed_at)
  - `portal_accounts` (user, portal, username shown to the student, ciphertext, nonce, created, updated, last used)
  - RLS: only the student, through RPCs. No counselor, parent, verifier or admin read, not even for the service role in app code.
  - RPCs: save, list (without ciphertext), fetch one (ciphertext, for the extension), delete one, delete all; revoking consent deletes all.
  - `assist_events` kinds `signed_in`, `account_created`, `account_saved`, `account_deleted`. Never a username or password.
- [ ] pgTAP: isolation, no access for counselors and parents, delete-all, consent revoked, no plaintext column anywhere. `pnpm db:types`.
- [ ] Commit `P1.3 Portal accounts in the database`.

### Task P1.4: The vault in the extension
- [ ] Side panel: set the passphrase (with the D9 agreement), unlock once per browser session, list accounts, add an existing account, show a password on request, delete one or all.
- [ ] The key lives only in memory and `chrome.storage.session`, so it's gone when the browser closes. The passphrase is never stored or sent.
- [ ] Build checks extended: no password or key in any message to the background except as ciphertext; none in logs or storage outside the vault.
- [ ] Commit `P1.4 Vault in the extension`.

### Task P1.5: Signing in
- [ ] The run gains a sign-in step before the application: the extension fills the username and password on the adapter's **sign-in page only, on the portal's own origin**, and presses the adapter's declared sign-in button through the guard.
- [ ] Guard rules: a password is only ever written into the adapter's password field on its sign-in page; a wrong origin, a changed page or an unknown field refuses it.
- [ ] Pauses: wrong password (offer to update the saved one), two-step code, CAPTCHA, account locked, anything unexpected.
- [ ] **Failing tests first** (unit and Playwright on the practice portal): signs in; pauses for the code; wrong password pauses and offers an update; a look-alike page on another origin gets nothing.
- [ ] Commit `P1.5 Sign in with a saved account`.

### Task P1.6: Creating an account
- [ ] When the student has no account for the portal: fill the sign-up form from confirmed profile facts, generate and save the password, pause for the student to accept the portal's terms and press "Create account", then pause for the emailed code.
- [ ] Never: tick the terms box, guess a missing value, or reuse a password.
- [ ] **Failing tests first:** creates the account; the terms box stays unticked; "account already exists" offers to add the existing one instead; the saved entry decrypts to the generated password.
- [ ] Commit `P1.6 Create a portal account`.

### Task P1.7: Apply, end to end
- [ ] From the tracker: Apply, then unlock the vault, sign in or create the account, run guided apply, and stop at review. The panel shows each stage.
- [ ] The web app: a "Portal accounts" page in settings (which portals have saved accounts, when last used, delete one or all, the agreement), English and Hindi, axe at 1280 and 390 px.
- [ ] Commit `P1.7 Apply with a saved account`.

### Task P1.8: Phase 1 exit gate
- [ ] REA step B on the new build: the only network destination is still Supabase; the password reaches only the portal's own sign-in form.
- [ ] REA step C on the practice portal: create an account, sign out, sign in with the saved account, fill to review. Record every field touched and request made, and check no password crosses any network except to the portal's own origin.
- [ ] Threat model (`docs/APPLICATION_ASSIST.md`, new section): lost laptop, stolen database, malicious page, compromised UniGuide account, and what each one exposes.
- [ ] Every suite, docs, a report. Commit `P1.8 Portal accounts audit and docs`.

## Phase 2: Mapping real portals

### Task P2.1: The recorder
- [ ] A script the owner runs on their own computer with their test account. They sign in and click through each page; it records only labels, types, IDs, options and which page each field is on. No page copies and no values. It never presses submit.
- [ ] A converter turns a recording into a draft adapter map, with AI suggesting each field's role and the person confirming it (the A1.6 function, labels only).
- [ ] Commit `P2.1 Portal recorder`.

## Phase 3: Real portals, one at a time

Each portal gets the same task:

- [ ] Map (recorder run by the owner), adapter, `validateAdapter` passing
- [ ] Guard tests for its submit, pay, sign, declare and terms controls, and its sign-in and sign-up pages
- [ ] A test copy of its pages made from the map (our own markup, no portal page copy), so CI never touches the real portal
- [ ] Assisted fill, guided apply, sign-in and account creation on the test copy
- [ ] A check run on the owner's test account, stopping at review, with the evidence saved under `docs/superpowers/reports/m8/`
- [ ] The tracker's Apply button for its `owning_system`, and docs

| Task | Portal | Notes |
|---|---|---|
| P3.1 | UCAS | UK undergraduate |
| P3.2 | Common App | US colleges |
| P3.3 | Slate | One shared adapter for Slate's common layout, then each university's differences |
| P3.4+ | Universities' own sites | One at a time, by how many students apply there |
| later | OUAC, uni-assist, Studielink | After their permission |

## Verification

- Every M7 suite, plus the vault's tests and the new e2e specs
- REA steps B and C for each phase and each portal
- No password, key or passphrase in logs, the audit log, CI output or evidence files: a check on every build and report
