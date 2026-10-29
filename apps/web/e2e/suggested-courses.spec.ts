import { expect, test } from "@playwright/test";
import { signIn, sql } from "./helpers";

const SLUG = "e2e-suggested-course";

test.beforeEach(() => {
  sql(`delete from institutions where name = 'E2E Suggested U'`);
  sql(`insert into institutions (name, country, official_domain) values ('E2E Suggested U', 'US', 'e2e-suggested.example.org')`);
  sql(`insert into programs (institution_id, slug, title, level, published, suggestion_status, official_url)
       select id, '${SLUG}', 'MS Suggested Robotics', 'master', false, 'pending', 'https://www.e2e-suggested.example.org/robotics'
       from institutions where name = 'E2E Suggested U'`);
});
test.afterEach(() => sql(`delete from institutions where name = 'E2E Suggested U'`));

test("an admin approves a suggested course and it becomes visible; students never see the review page", async ({ browser }) => {
  const student = await signIn(browser, "student@uniguide.local");
  expect((await student.goto("/admin/suggested"))?.status()).toBe(404);

  const admin = await signIn(browser, "admin@uniguide.local");
  await admin.goto("/admin/suggested");
  const card = admin.locator("li", { hasText: "MS Suggested Robotics" });
  await expect(card).toBeVisible();
  expect(sql(`select published from programs where slug = '${SLUG}'`)).toBe("f");
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card).toHaveCount(0);
  expect(sql(`select published || '/' || suggestion_status from programs where slug = '${SLUG}'`)).toBe("t/approved");
});

test("rejecting keeps the course hidden", async ({ browser }) => {
  const admin = await signIn(browser, "admin@uniguide.local");
  await admin.goto("/admin/suggested");
  await admin.locator("li", { hasText: "MS Suggested Robotics" }).getByRole("button", { name: "Reject" }).click();
  await expect(admin.locator("li", { hasText: "MS Suggested Robotics" })).toHaveCount(0);
  expect(sql(`select published || '/' || suggestion_status from programs where slug = '${SLUG}'`)).toBe("f/rejected");
});
