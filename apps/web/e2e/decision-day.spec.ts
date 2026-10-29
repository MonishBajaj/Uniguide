import { expect, test } from "@playwright/test";
import { resetStudent, signIn, sql, STUDENT } from "./helpers";

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test.beforeEach(() => {
  resetStudent();
  sql(`delete from decision_matrices where user_id = '${STUDENT}'`);
});

test("7.7 offers count down to the first reply date, and a coin flip records a gut reaction", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  for (const [slug, due] of [["exampleton-msc-data-science", inDays(10)], ["tu-beispielstadt-msc-informatik", inDays(25)]] as const) {
    await page.goto(`/courses/${slug}`);
    await page.click('button:has-text("Track")');
    await page.waitForURL("**/app/tracker/*");
    await page.selectOption("select[name=decision]", "admitted");
    await page.fill("input[name=deposit_due_at]", due);
    await page.click('button:has-text("Save decision")');
    await expect(page.getByText("Decision recorded: Admitted")).toBeVisible();
  }

  await page.goto("/app/offers");
  const banner = page.locator("section[aria-labelledby=decision-day]");
  await expect(banner.getByText("Your first reply is due in 10 days")).toBeVisible();
  await expect(banner.getByText("MSc Data Science", { exact: false })).toBeVisible();
  await expect(page.getByText("Reply due in 25 days")).toBeVisible();

  await page.click('button:has-text("Flip a coin")');
  const picked = page.getByText(/The coin picked (MSc Data Science|M\.Sc\. Informatik)/);
  await expect(picked).toBeVisible();
  await page.click('button:has-text("Relieved")');
  await expect(page.getByText("Noted: relieved.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("relieved 1×")).toBeVisible();
  expect(sql(`select jsonb_array_length(gut_checks) from decision_matrices where user_id = '${STUDENT}'`)).toBe("1");
});
