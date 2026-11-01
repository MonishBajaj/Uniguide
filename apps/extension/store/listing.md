# Chrome Web Store listing (draft, M7 A1.8)

**Status: draft, not submitted.** Before submission:

- **G3:** an independent clean-room review checks that the wording, interface and name don't echo any competitor's (plan R13).
- **A cleared portal:** a store build only works on portals whose gate has cleared (plan gates G1 to G7). Until one has, it has nothing to do anywhere, and the listing can't name a portal.
- **Legal:** the privacy policy section on the extension (`apps/web/app/legal/privacy`) is reviewed by counsel along with the rest of that page.

## Name

UniGuide Application Assist

## Short description (132 characters at most)

Fill your own university applications from your own UniGuide profile, one field at a time. Nothing is ever submitted for you.

## Single purpose

Help students complete their own university applications with their own UniGuide data.

## Description

UniGuide Application Assist puts your UniGuide profile beside your university application, so you don't retype the same facts on every portal.

Open the side panel on a supported application page and you see each question with the answer from your profile, where it came from, and how sure we are that it's the right question. For each one you choose:

- **Fill:** writes that one answer into that one field. If the field already has something in it, we ask first.
- **Copy:** puts the answer on your clipboard.
- **Leave for me:** you answer it yourself.

**What it never does:**

- It never submits, pays, signs, certifies or makes a declaration for you. A safety check blocks those, whatever the page looks like.
- It never asks for, sees or keeps your portal password. You sign in to each portal yourself.
- It never writes or changes your essays. It can offer your own final draft from UniGuide's writing workspace, and only you can choose to use it. Where a course hasn't said that AI help is allowed, it won't paste at all: you copy your own draft and paste it yourself.
- It never converts your grades. If a portal wants your grade in a form you haven't entered, it says so and leaves it to you.
- Nothing works while a parent or guardian's consent is still needed.

**Every fill, copy and skip is listed in the assist log on your application in UniGuide.** The log records which question and what happened, never what was filled.

You need a UniGuide account. Sign in on the UniGuide site to connect the extension.

## Category

Productivity (Education)

## Permissions and why

| Permission | Why |
|---|---|
| `storage` | Keeps your UniGuide sign-in for this browser session and the current assist run. Cleared when you sign out or close the browser. |
| `sidePanel` | The panel where you choose what to fill. |
| Host access to the UniGuide service | To read your profile and save the assist log. It's the only place the extension sends data. |
| Host access to supported application portals | To read the questions on the page and fill the answers you choose. Only portals UniGuide supports are listed. |

**No remote code:** all code is in the package.
