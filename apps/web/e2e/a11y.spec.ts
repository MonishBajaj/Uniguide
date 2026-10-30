import { expect, test } from "@playwright/test";
import { audit, resetStudent, signIn, sql, STUDENT } from "./helpers";

// 15.2 Automated accessibility audit: no serious or critical WCAG 2.1 AA violations on key pages.

test("15.2 public pages have no serious accessibility violations", async ({ page }) => {
  const found: string[] = [];
  for (const path of ["/", "/courses", "/courses/exampleton-msc-data-science", "/requirements", "/visas", "/guide", "/accessibility", "/learn", "/blog", "/blog/verified-facts-pipeline", "/login", "/signup"]) {
    found.push(...(await audit(page, path)));
  }
  expect(found, found.join("\n")).toEqual([]);
});

test("15.2 student pages have no serious accessibility violations", async ({ browser }) => {
  resetStudent();
  sql(`insert into applications (user_id, cycle_id, status, decision, deposit_due_at, offer_accepted_at)
       select '${STUDENT}', c.id, 'decided', 'admitted', now() + interval '20 days', now() from program_cycles c join programs p on p.id = c.program_id
       where p.slug = 'exampleton-msc-data-science' and c.is_current`);
  const appId = sql(`select id from applications where user_id = '${STUDENT}'`);
  const page = await signIn(browser, "student@uniguide.local");
  const found: string[] = [];
  for (const path of ["/app/match", "/app/shortlist", "/app/tracker", "/app/tracker?view=table", `/app/tracker/${appId}`, "/app/tracker/costs", "/app/offers", "/app/departure", "/app/writing", "/app/writing/new", "/app/writing/stories", "/app/recommenders", "/app/cv", "/app/profile", "/app/sharing", "/app/notifications"]) {
    found.push(...(await audit(page, path)));
  }
  expect(found, found.join("\n")).toEqual([]);
});

test("15.2 high contrast and large text stay free of serious violations", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "ug_display", value: "text=larger&contrast=high&motion=reduce", url: baseURL! }]);
  const found: string[] = [];
  for (const path of ["/", "/courses/exampleton-msc-data-science", "/guide", "/accessibility"]) found.push(...(await audit(page, path)));
  expect(found, found.join("\n")).toEqual([]);
});

test("15.2 the parent view has no serious accessibility violations", async ({ browser }) => {
  const page = await signIn(browser, "parent@uniguide.local");
  const found = await audit(page, "/parent");
  expect(found, found.join("\n")).toEqual([]);
});

// Journey M2 (J2.7): the journey home, the steps page and onboarding, at desktop and phone widths.
for (const [width, height] of [[1280, 900], [390, 844]]) {
  test(`journey pages have no serious accessibility violations at ${width}px`, async ({ browser }) => {
    resetStudent();
    sql(`insert into applications (user_id, cycle_id, status)
         select '${STUDENT}', c.id, 'preparing' from program_cycles c join programs p on p.id = c.program_id
         where p.slug = 'exampleton-msc-data-science' and c.is_current`);
    const page = await signIn(browser, "student@uniguide.local");
    await page.setViewportSize({ width, height });
    const found: string[] = [];
    for (const path of ["/app", "/app/steps"]) found.push(...(await audit(page, path)));
    // Onboarding is for students who haven't answered the entry question.
    sql(`delete from applications where user_id = '${STUDENT}'; update profiles set entry_path = null where user_id = '${STUDENT}'`);
    for (const path of ["/app/onboarding", "/app/onboarding?screen=2", "/app/onboarding?screen=3"]) found.push(...(await audit(page, path)));
    // The same pages in Hindi.
    await page.context().addCookies([{ name: "ug_locale", value: "hi", url: page.url() }]);
    for (const path of ["/app/onboarding?screen=2", "/app/onboarding?screen=3"]) found.push(...(await audit(page, path)));
    sql(`update profiles set entry_path = 'exploring' where user_id = '${STUDENT}'`);
    found.push(...(await audit(page, "/app")));
    expect(found, found.join("\n")).toEqual([]);
  });
}
