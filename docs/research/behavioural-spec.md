# Behavioural specification: application-portal answer assistant (browser extension)

**What this is.** A plain-language description of how a browser extension of this kind should behave. It helps a student use answers they have already prepared in our web app while filling in a third-party college application portal. It describes behaviour and requirements only. Where public information didn't settle a point, the point is listed under "Open questions" rather than guessed.

**Where it comes from.** Public material only. No code was examined and the product was not used.

## 1. Purpose and scope

- The extension helps a signed-in student see their own prepared answers beside the matching questions on a supported college application portal, and act on them one field at a time.
- The student stays in control. The extension suggests and assists; it never decides, navigates or submits.
- The answers come from the student's own account in our web app: answers they prepared for specific schools' questions, plus profile facts. The extension doesn't write essays or create new content.

## 2. Supported portals and activation

- **Portals.** It works on a named list of college application portals. At minimum this means the main multi-school portal's school-specific question pages. Comparable products have also covered a portal for historically Black colleges and a state university system's portal, so the list should be easy to extend, one portal at a time.
- **Where it activates.**
  - Only on pages of the portals on the list, and only on the pages within them that hold questions it supports (for example, a school's own question pages).
  - On any other website it does nothing and reads nothing.
- **Away from supported pages.** The toolbar control stays available. On an unsupported page it says that the page isn't supported, rather than failing silently.
- **When a supported page loads,** the extension may show a small, unobtrusive way to open its side panel. It never opens the panel on its own or covers the portal's content.

## 3. User flows

### 3.1 Sign-in

- **How.** The student signs in from the extension with their existing web app account. Sign-in happens on our own sign-in page, never in a form the extension injects into the portal.
- **After success.** The extension keeps a session so the student doesn't sign in on every page, and shows who is signed in.
- **Signing out** clears the session and every cached answer from the browser immediately.
- **Expiry.** An expired or revoked session sends the student back to sign-in, with a clear message and no error dump.
- **Age and consent.** Students who are minors, or whose account is waiting for a parent's consent, are handled the same way as in the web app. If the account can't use personal data yet, the extension shows only a message explaining why and how to fix it.

### 3.2 Sync

- **What syncs.** After sign-in, the student can sync, which fetches their prepared answers for the schools they're applying to and the profile facts the portals ask for.
- **Status.** The extension shows when the last sync happened and how many schools and answers it holds.
- **Re-sync.** The student can sync again at any time, for example after editing answers in the web app.
- **Scope of the fetch.** It fetches only the signed-in student's own data, and only what supported portals need: answers and facts, not uploaded documents.
- **Sync failures** (network, server, expired session) show a plain message and a way to retry. Any previously synced answers stay usable and are labelled with the time of that sync.

### 3.3 The side panel

- **Opening and closing.** The student opens a side panel beside the portal page. It doesn't hide the portal's own controls, and it can be closed and reopened at any time.
- **Answers matched on this page:** the panel lists them, grouped as the portal groups them (by section or school), in the order the questions appear on the page. Each item shows:
  - the portal's question it matched, in short
  - the student's answer, in full, or expandable if long
  - how confident the match is, in plain words (for example, a clear match, or a likely match to check)
  - the actions below
- **Questions with no answer:** the panel lists the page's questions it recognised but has no answer for, separately, each with a link to where the student can add one in the web app.
- **Saved answers this page doesn't ask for:** the panel doesn't list these as matches. It may say how many there are.
- **Keeping up with the page.** When the portal page changes without a full reload (a new section opens, or a conditional question appears), the panel updates to match.

### 3.4 Actions on a matched answer

Each matched answer offers three actions. Every one is triggered by the student, on one answer at a time.

1. **Find the field:** scrolls the portal page to the question and highlights it briefly, so the student can see where the answer goes. It changes nothing.
2. **Copy:** puts the answer on the clipboard and confirms briefly, so the student can paste it themselves.
3. **Fill:** puts the answer into that one field on the portal, as if the student had typed it. Rules:
   - **Only on request:** it fills only the field it's attached to, and only when the student asks.
   - **Overwrites:** if the field already has content, it asks before replacing it.
   - **Choice fields:** for drop-downs, choices and checkboxes, it selects the option that matches the answer. If no option matches exactly, it doesn't pick one; it says so and offers the find-the-field action instead.
   - **Length limits:** if the answer is longer than the field allows, it doesn't fill and doesn't cut the answer; it says so.
   - **Portal behaviour:** after filling, the portal should behave as though the student typed the text. Its own word counts and checks update, and nothing is saved or submitted on the student's behalf.
   - **Low-confidence matches** are never filled in one step. The student first confirms that the question is the right one.

There is no "fill everything" action.

### 3.5 Error and empty states

Each state has plain wording and a next step:
- **Not signed in:** offer to sign in.
- **Signed in but never synced:** offer to sync.
- **Synced, but nothing for this school or page:** say so, and link to the web app to prepare answers.
- **Page not supported:** say so.
- **The portal changed and questions can't be recognised:** say that the page couldn't be read, and offer copying from the list of saved answers for that school as a fallback.
- **Network or server problem:** offer retry, and keep showing the previously synced answers with their sync time.
- **Fill failed** (the field didn't accept it): say so, and offer copy instead.

## 4. How a question is matched to an answer

These describe behaviour, not method:
- **Basis.** A question on the portal page is matched to a saved answer by its meaning, not only its exact wording. The visible question wording counts most. The section or school it sits under, and any helper text near it, are used to tell similar questions apart.
- **The school matters.** An answer prepared for one school is never offered for another school's question, even when the wording is the same. General profile facts (name, contact details, education) can be offered on any school's page where that fact is asked.
- **Confidence.** Each match is either:
  - a clear match: the same question, or an equivalent wording already known for this portal, or
  - a likely match: a different wording that probably means the same.
  Anything below "likely" is not shown as a match.
- **Repeated questions.** Where a question repeats (for example, several entries of the same kind), answers are matched in order and the student can choose another entry.
- **Conditional questions.** A question shown only after an earlier choice is matched only while it's visible. If it disappears because the student changed the earlier answer, its suggestion disappears too.
- **Ambiguity.** If two saved answers fit one question equally well, both are shown and the student chooses. Nothing is filled until they do.
- **Unmatched fields** are listed as having no answer (3.3). The extension never makes up, generates or borrows an answer to fill the gap.

## 5. Data behaviour

- **Reading the page.** The extension reads the portal page's questions and field types in the browser, so it can match them.
  - It does not send the page's content, the student's other entries on the portal, or the student's portal login to our servers.
  - Matching happens in the browser, against answers already synced.
- **Sent to our servers:**
  - sign-in through our sign-in page
  - the sync request (who is asking, which schools and portals)
  - optional anonymous error reports (which portal page could not be read), with no answer text, portal content or personal details
- **Kept in the browser:**
  - the session
  - the synced answers, only for as long as the student stays signed in, in the browser's protected extension storage
  - Signing out, or 30 days without use, clears both.
- **Permissions:**
  - access to the listed portal websites and our own site, and no other website
  - storage for the session and synced answers
  - clipboard writing, for copy
  - nothing for browsing history, all websites, other tabs' content, downloads or identity beyond our sign-in
- **The student's control.**
  - The web app shows what the extension has synced and when.
  - Deleting the student's data in the web app also invalidates the extension's session.
- **Disclosure.** The store listing and our privacy notice say in specific terms what the extension reads, what it sends, and how long anything is kept. They match this section.

## 6. Limits (what it never does)

It never:
- submits a form, presses the portal's save, continue or submit buttons, or moves between portal pages
- fills more than one field per student action, or fills anything without an action
- writes, rewrites or generates answers, essays or personal statements. It only uses what the student prepared.
- logs into the portal, reads or stores the portal password, or acts while the student is away
- activates on websites outside the supported list
- uses answers from one student's account in another's

## 7. Behaviours we should NOT copy

These are weaknesses or risks seen in public material on comparable products. Our product does the opposite.

1. **Blanket consent wording.**
   - **The weakness:** a privacy notice that describes extension processing in open-ended terms ("any form, any field, any direction", with features that may change at any time) and treats using the product as consent.
   - **What we do:** say exactly what is read, what is sent and why, and ask for fresh consent before doing anything new.
2. **Retention at the company's discretion.** We set fixed retention periods, and we always honour deletion.
3. **Collecting "website content" as a category.**
   - **The weakness:** declaring portal page content as data the product collects.
   - **What we do:** read the page in the browser to match questions, and send none of it to our servers.
4. **Matching on page structure.**
   - **The weakness:** recognising fields mainly by the portal's internal structure and naming, which breaks silently when the portal changes and can attach an answer to the wrong question.
   - **What we do:** match on the visible question and its context. When recognition fails, say so plainly instead of guessing.
5. **Filling on fuzzy text similarity alone.**
   - **The weakness:** a similarity score just over a threshold is enough to fill.
   - **What we do:** never fill on a weak match without the student confirming the question.
6. **Inconsistent descriptions of what the extension does.**
   - **The weakness:** public descriptions of the same product disagreed over time, from "never fills, copy and paste only" to "fill on request", and the list of supported portals changed between versions without a clear notice.
   - **What we do:** keep one accurate public description, and keep a dated change list when portals or actions change.
7. **A vague site scope in the store listing.** Our listing names every portal the extension works on and asks for access to exactly those sites.
8. **Paid features inside the extension.** We keep any paid features in the web app, so the extension stays a simple, transparent helper.
9. **Answer text going to third-party AI services from the extension.** Our extension sends no answer or portal text to any AI service; it only shows what the student already prepared.
10. **Relying on the student to notice problems.** Every failure (unreadable page, failed fill, low confidence) is stated in the panel. The student never has to discover it from the portal later.

## 8. Requirements outside the extension

- **Portal terms.** Before release, check each supported portal's terms of use for rules on browser extensions, automated entry and copying. Drop any portal, or any action on it (especially fill), that its terms don't allow. Support only after that check passes.
- **Accessibility.** The panel and its actions work by keyboard and screen reader, meet WCAG 2.1 AA, and announce what each action did (for example, "copied" or "filled").
- **Languages.** The panel's own words follow the web app's language setting. Answers are shown exactly as the student wrote them.

## 9. Open questions

Public information didn't settle these. Decide them on our own merits; they are not to be inferred from the other product.

- Whether the portal's lists of activities and honors are in scope, or only school-specific questions plus profile facts.
- How the extension should behave when the student has the same portal open in several tabs.
- Whether the panel should show answers for schools the student hasn't yet added on the portal.
- How long an unused session may last before sign-in is needed again (30 days is proposed above).
- How the panel works on small screens or narrow windows.
