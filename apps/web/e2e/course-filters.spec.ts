import { expect, test } from "@playwright/test";
import { sql } from "./helpers";

const AU = "example-coast-master-of-information-technology";
const auDeadline = () =>
  `select d.id from deadlines d join program_cycles c on c.id = d.cycle_id join programs p on p.id = c.program_id
   where p.slug = '${AU}' and d.kind = 'application'`;
let original = "";

test.beforeAll(() => {
  original = sql(`select due_at from deadlines where id = (${auDeadline()})`);
  // Close the Australian course's deadline, and make sure no test rate is left over.
  sql(`update deadlines set due_at = now() - interval '10 days' where id = (${auDeadline()});
       delete from fx_rates where source = 'e2e test'`);
});
test.afterAll(() => {
  sql(`update deadlines set due_at = '${original}' where id = (${auDeadline()}); delete from fx_rates where source = 'e2e test'`);
});

test("3.3 course cards count down to the next open deadline", async ({ page }) => {
  await page.goto("/courses");
  const uk = page.locator("article", { hasText: "MSc Data Science" });
  await expect(uk.getByText(/^Closes in \d+ days$/)).toBeVisible();
  await expect(uk.getByText("not yet verified", { exact: false })).toBeVisible();
  const au = page.locator("article", { hasText: "Master of Information Technology" });
  await expect(au.getByText("No open application deadline known")).toBeVisible();
});

test("3.4 filter by open deadline and by published yearly tuition", async ({ page }) => {
  await page.goto("/courses");
  const all = await page.locator("article").count();
  await page.check("input[name=open]");
  await page.click('button:has-text("Search")');
  await expect(page).toHaveURL(/open=1/);
  await expect(page.locator("article")).toHaveCount(all - 1);
  await expect(page.locator("article", { hasText: "Master of Information Technology" })).toHaveCount(0);

  await page.uncheck("input[name=open]");
  await page.fill("input[name=max]", "35000");
  await page.selectOption("select[name=cur]", "GBP");
  await page.click('button:has-text("Search")');
  // Only the UK course publishes a yearly fee in GBP under the limit; the free German course has no EUR rate yet.
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article", { hasText: "MSc Data Science" })).toBeVisible();
  await expect(page.getByText("Courses whose deadline or yearly tuition is not published yet are hidden", { exact: false })).toBeVisible();

  sql(`insert into fx_rates (base, quote, rate, as_of, source) values ('EUR', 'GBP', 0.85, current_date, 'e2e test')`);
  await page.reload();
  await expect(page.locator("article")).toHaveCount(2);
  await expect(page.locator("article", { hasText: "M.Sc. Informatik" })).toBeVisible();
});
