import { expect, test } from "@playwright/test";
import { expectStored, resetStudent, signIn, sql, STUDENT } from "./helpers";

test.beforeEach(() => resetStudent());

test("bands, tracking with country rules, offers and the decision matrix", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/profile");
  await page.check("input[name=show_bands]");
  await page.fill("input[name=class_percentile]", "8");
  await page.click('button:has-text("Save profile")');
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expectStored(`select preferences ->> 'showBands' from profiles where user_id = '${STUDENT}'`, "true");

  await page.goto("/app/match");
  await expect(page.getByText("Band (low confidence)").first()).toBeVisible();

  // Tracking a German course from India adds the APS step from the country rules.
  await page.goto("/courses/tu-beispielstadt-msc-informatik");
  await page.click('button:has-text("Track")');
  await page.waitForURL("**/app/tracker/*");
  await expect(page.getByText("APS certificate").first()).toBeVisible();
  await page.selectOption("select[name=decision]", "admitted");
  await page.fill("input[name=awarded_aid]", "2000");
  await page.selectOption("select[name=awarded_aid_currency]", "EUR");
  await page.click('button:has-text("Save decision")');
  await expectStored(`select count(*) from applications where user_id = '${STUDENT}' and decision = 'admitted'`, "1");

  await page.goto("/app/offers");
  await expect(page.locator("section[aria-labelledby=cost] article")).toHaveCount(1);
  await expect(page.getByText("Funding in your offer, subtracted")).toBeVisible();
  await page.locator("select[id^=s-]").first().selectOption("4");
  await page.click('button:has-text("Save matrix")');
  await expect(page.getByText("Saved.")).toBeVisible();
  expect(sql(`select count(*) from decision_matrices where user_id = '${STUDENT}'`)).toBe("1");
});
