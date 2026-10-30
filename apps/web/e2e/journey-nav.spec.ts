import { expect, test } from "@playwright/test";
import { STUDENT, resetStudent, signIn, sql } from "./helpers";

// Journey M2 (J2.2): the journey navigation. J2.7 extends this file to every /app page.
const cycle = (slug: string) =>
  `(select c.id from program_cycles c join programs p on p.id = c.program_id where p.slug = '${slug}' and c.is_current limit 1)`;

test.beforeEach(() => {
  resetStudent();
  // A preparing application with a checklist item due in 5 days gives one urgent step.
  sql(`insert into applications (user_id, cycle_id, status) values ('${STUDENT}', ${cycle("exampleton-msc-data-science")}, 'preparing');
       insert into checklist_items (application_id, user_id, title, kind, due_at)
         select id, user_id, 'Transcript', 'requirement', now() + interval '5 days' from applications where user_id = '${STUDENT}'`);
});

test("students see the journey sections everywhere, and the urgent badge only on /app pages", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  const nav = page.getByRole("list", { name: "Your journey" });

  await page.goto("/courses/exampleton-msc-data-science");
  await expect(nav.getByRole("link", { name: /^Applications/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: /^Explore/ })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByText(/due this fortnight/)).toHaveCount(0);

  // A crafted path header can't make a public page read the journey.
  await page.setExtraHTTPHeaders({ "x-ug-path": "/app" });
  await page.reload();
  await expect(nav.getByText(/due this fortnight/)).toHaveCount(0);
  await page.setExtraHTTPHeaders({});

  await page.goto("/app/tracker");
  const applications = nav.getByRole("link", { name: /^Applications/ });
  await expect(applications).toHaveAttribute("aria-current", "page");
  await expect(applications).toContainText("1 step due this fortnight");
  await expect(page.getByRole("navigation", { name: "Main" }).locator('[aria-current="page"]')).toHaveCount(1);
  // Stage 4: offers and departure aren't reached yet, so they read as quieter links.
  await expect(nav.getByRole("link", { name: /^Offers \(not reached yet\)/ })).toBeVisible();
});

test("on a phone the bottom bar carries the sections, and More opens and closes from the keyboard", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/tracker");
  const bar = page.getByRole("navigation", { name: "Your journey" });
  await expect(bar).toBeVisible();
  await expect(page.getByRole("list", { name: "Your journey" })).toBeHidden();
  await expect(bar.getByRole("link", { name: /^Applications/ })).toHaveAttribute("aria-current", "page");

  const more = bar.getByRole("button", { name: "More" });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(bar.getByRole("link", { name: /^Shortlist/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(more).toHaveAttribute("aria-expanded", "false");

  await bar.getByRole("button", { name: "Get help" }).click();
  await expect(bar.getByText("Stage 4 of 7: Prepare")).toBeVisible();
});

// J2.7: every student page in the spec's navigation table (6.1) has the journey navigation, with
// exactly one current item; the account pages mark theirs in the account menu.
test("every /app page has the journey navigation with exactly one current item", async ({ browser }) => {
  const appId = sql(`select id from applications where user_id = '${STUDENT}' limit 1`);
  const page = await signIn(browser, "student@uniguide.local");
  const expected: [string, RegExp][] = [
    ["/app", /^Home/],
    ["/app/match", /^Explore/],
    ["/app/match/what-if", /^Explore/],
    ["/app/matching", /^Explore/],
    ["/app/shortlist", /^Shortlist/],
    ["/app/tracker", /^Applications/],
    [`/app/tracker/${appId}`, /^Applications/],
    ["/app/tracker/costs", /^Applications/],
    ["/app/writing", /^Applications/],
    ["/app/recommenders", /^Applications/],
    ["/app/cv", /^Applications/],
    ["/app/portfolio", /^Applications/],
    ["/app/offers", /^Offers/],
    ["/app/departure", /^Visa and departure/],
    ["/app/profile", /^Profile/],
    ["/app/sharing", /^Sharing/],
    ["/app/notifications", /^Updates/],
  ];
  for (const [path, name] of expected) {
    await page.goto(path);
    const current = page.getByRole("navigation", { name: "Main" }).locator('[aria-current="page"]');
    await expect(current, path).toHaveCount(1);
    // Text, not accessible name: account pages mark a link inside the closed account menu.
    await expect(current, path).toHaveText(name);
  }
});

test("a linked parent who opens /app is sent to the parent view", async ({ browser }) => {
  const page = await signIn(browser, "parent@uniguide.local");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/parent$/);
  await page.goto("/app/steps");
  await expect(page).toHaveURL(/\/parent$/);
});
