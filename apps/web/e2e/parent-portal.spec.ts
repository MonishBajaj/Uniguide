import { expect, test } from "@playwright/test";
import { resetStudent, signIn, sql, STUDENT } from "./helpers";

test.beforeEach(() => {
  resetStudent();
  // Keep the seeded parent link, drop anything earlier runs created.
  sql(`delete from parent_links where student_id = '${STUDENT}' and parent_id <> '00000000-0000-4000-a000-000000000005';
       delete from parent_invites where student_id = '${STUDENT}'`);
});

test("1.5 a student invites a parent, the parent joins with a new account, and the student removes them", async ({ browser }) => {
  const student = await signIn(browser, "student@uniguide.local");
  await student.goto("/courses/exampleton-msc-data-science");
  await student.click('button:has-text("Track")');
  await student.waitForURL("**/app/tracker/*");

  await student.goto("/app/sharing");
  const family = student.locator("section[aria-labelledby=family]");
  await family.locator("input[name=student_name]").fill("Asha");
  await family.locator('button:has-text("Create an invite link")').click();
  const link = (await family.locator("code").innerText()).trim();
  expect(link).toMatch(/\/family\/join\?code=[0-9a-f]{12}$/);

  // The parent opens the link without an account, signs up, and comes back to accept.
  const parent = await (await browser.newContext()).newPage();
  await parent.goto(new URL(link).pathname + new URL(link).search);
  await expect(parent.getByText("Asha invited you", { exact: false })).toBeVisible();
  await parent.click('a:has-text("Create a parent account")');
  const email = `dad${Date.now()}@example.com`;
  await parent.selectOption("select[name=birth_month]", "4");
  await parent.selectOption("select[name=birth_year]", "1975");
  await parent.selectOption("select[name=residence_country]", "IN");
  await parent.fill("input[name=email]", email);
  await parent.fill("input[name=password]", "password1234");
  await parent.check("input[name=terms]");
  await parent.click('button:has-text("Create account")');
  await parent.waitForURL("**/family/join?code=*");
  await parent.fill("input[name=parent_name]", "Dad");
  await parent.click('button:has-text("Follow their applications")');
  await parent.waitForURL("**/parent");
  await expect(parent.locator("h2", { hasText: "Asha" })).toBeVisible();
  await expect(parent.locator("h4", { hasText: "MSc Data Science" })).toBeVisible();

  // The weekly email can be turned off.
  const asha = parent.locator("section", { has: parent.locator("h2", { hasText: "Asha" }) });
  await expect(asha.getByText("Weekly email on")).toBeVisible();
  await asha.locator('button:has-text("Turn off")').click();
  await expect(asha.getByText("Weekly email off")).toBeVisible();

  // The link works once.
  const other = await (await browser.newContext()).newPage();
  await other.goto(new URL(link).pathname + new URL(link).search);
  await expect(other.getByText("This invite link has expired or was already used", { exact: false })).toBeVisible();

  // The student sees who joined and removes them; access ends at once.
  await student.reload();
  const row = family.locator("li", { hasText: "Dad" });
  await expect(row).toBeVisible();
  await row.locator('button:has-text("Remove")').click();
  await expect(family.locator("li", { hasText: "Dad" })).toHaveCount(0);
  expect((await parent.goto("/parent"))!.status()).toBe(404);
});
