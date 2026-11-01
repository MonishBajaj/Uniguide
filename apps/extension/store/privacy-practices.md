# Chrome Web Store privacy practices (draft, M7 A1.8)

The answers for the store's privacy tab, and the disclosure spec 7.8 asks for. They describe the build as it is, and are checked by REA steps B and C (`docs/superpowers/reports/m7/`).

## What the extension reads on portal pages

The questions on a supported application page: each field's label, type, options and whether it's required. This is read in the browser, to match questions to your profile. It isn't sent anywhere. There's one exception, below: when you ask what a field means, its label alone is sent.

It doesn't read or keep anything you type into a portal, and it never reads password fields.

## What it sends, and where

Everything goes to the UniGuide service (our Supabase project), and nowhere else. The build checks and REA confirm this.

| What | When | Why |
|---|---|---|
| Your UniGuide sign-in session | When you connect the extension on the UniGuide site | To act as you |
| A request for your fill profile | When you choose an application | Your contact email, country, qualification, grade as entered, test scores, CV entries, the course's AI policy, and which of your drafts are final. No name, birth date, address or phone. |
| A request for one final draft's text | Only when you press "Copy final draft" or "Paste final draft" | To copy or paste it |
| Audit events | For each fill, copy, skip or block | Which question (its role), which page, where the value came from, and why it was left, if it was. **Never the value.** |
| One field's label | Only when you press "Suggest what this asks" on a field we don't recognise | UniGuide's server asks an AI model (Anthropic's Claude) which kind of question it is. The label and our list of question kinds are all that's sent: never your answers or profile. |

## Data types (store form)

- **Personally identifiable information:** your email address, used only to fill the email field you choose.
- **Authentication information:** your UniGuide session, kept in browser session storage.
- **Website content:** field labels on supported portal pages, read locally. One label is sent when you ask for a suggestion.
- **Not collected:** health, financial or payment information, personal communications, location, web history and user activity outside supported portal pages.

## Retention

| What | How long |
|---|---|
| The session in the extension | Until you sign out or close the browser |
| The assist log | With your UniGuide account, until you delete it or ask us to |
| Suggestion requests | Only who asked and when, for the rate limit, kept for two days. Never the label. Anthropic may retain the label for up to 30 days. |

## Who sees it

- You.
- A counselor you've chosen to share with sees your assist log, read only and without values.
- Parents don't see it.
- We don't sell data or share it with universities.

## Limited use

The data is used only to help you fill your own applications. It is not used for advertising, it is not sold, and it is not used to train models.

## Certifications (store form)

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.
