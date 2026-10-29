import { expect, test } from "@playwright/test";
import { audit, resetStudent, signIn, sql, STUDENT } from "./helpers";

// 15.2 Automated accessibility audit: no serious or critical WCAG 2.1 AA violations on key pages.

test("15.2 public pages have no serious accessibility violations", async ({ page }) => {
  const found: string[] = [];
  for (const path of ["/", "/courses", "/courses/exampleton-msc-data-science", "/requirements", "/visas", "/guide", "/accessibility", "/blog", "/blog/verified-facts-pipeline", "/login", "/signup"]) {
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
