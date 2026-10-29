import { expect, test } from "@playwright/test";
import { expectStored, resetStudent, signIn, sql, STUDENT } from "./helpers";

// A 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const cleanup = () =>
  sql(`delete from portfolio_items where user_id = '${STUDENT}';
       select set_config('storage.allow_delete_query', 'true', false);
       delete from storage.objects where bucket_id = 'portfolios' and name like '${STUDENT}/%';`);
test.beforeEach(() => {
  resetStudent();
  cleanup();
});
test.afterEach(cleanup);

test("6.4 a student uploads work and links, orders them, shares a 7-day link, and a counselor sees it only while shared", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/writing");
  await page.getByRole("link", { name: "Portfolio" }).click();
  await page.waitForURL("**/app/portfolio");
  await expect(page.getByText("Nothing in the portfolio yet.")).toBeVisible();

  const upload = page.getByRole("form", { name: "Upload a file" });
  await upload.locator("input[name=file]").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await upload.locator("input[name=title]").fill("Notes");
  await upload.getByRole("button", { name: "Upload" }).click();
  await expect(upload.getByRole("alert")).toHaveText("Upload a PNG, JPEG or PDF.");

  await upload.locator("input[name=file]").setInputFiles({ name: "poster.png", mimeType: "image/png", buffer: PNG });
  await upload.locator("input[name=title]").fill("Studio poster");
  await upload.locator("textarea[name=description]").fill("Second-year typography brief.");
  await upload.getByRole("button", { name: "Upload" }).click();
  await expect(upload.getByRole("status")).toHaveText("Added.");
  await expect(page.getByRole("img", { name: "Studio poster" })).toBeVisible();
  await expectStored(`select count(*) from storage.objects where bucket_id = 'portfolios' and name like '${STUDENT}/%.png'`, "1");

  const link = page.getByRole("form", { name: "Add a link" });
  await link.locator("input[name=url]").fill("https://github.com/asha/thesis");
  await link.locator("input[name=title]").fill("Thesis code");
  await link.getByRole("button", { name: "Add link" }).click();
  await expect(page.getByRole("listitem", { name: "Thesis code" })).toContainText("github.com");

  // Reorder: the link moves to the top.
  await page.getByRole("button", { name: "Move Thesis code up" }).click();
  await expect(page.locator("ol > li").first()).toHaveAttribute("aria-label", "Thesis code");

  // A share link opens the file without signing in.
  await page.getByRole("listitem", { name: "Studio poster" }).getByRole("button", { name: "Get share link" }).click();
  const shared = await page.getByLabel("Share link for Studio poster").inputValue();
  expect(shared).toContain("/storage/v1/object/sign/portfolios/");
  const fetched = await (await browser.newContext()).request.get(shared);
  expect(fetched.status()).toBe(200);
  expect(fetched.headers()["content-type"]).toBe("image/png");

  // A counselor sees it while the student shares.
  await page.goto("/app/sharing");
  await page.fill("input[name=code]", "LOCAL-AGENCY");
  await page.fill("input[name=name]", "Asha");
  await page.check("input[name=agree]");
  await page.click('button:has-text("Share")');
  const counselor = await signIn(browser, "counselor@uniguide.local");
  await counselor.goto("/agency");
  await counselor.click('a:has-text("Asha")');
  const portfolio = counselor.locator("section[aria-labelledby=portfolio]");
  await expect(portfolio.getByRole("img", { name: "Studio poster" })).toBeVisible();
  await expect(portfolio.getByRole("button", { name: /Remove/ })).toHaveCount(0);

  // Removing an item deletes the file too.
  await page.goto("/app/portfolio");
  await page.getByRole("button", { name: "Remove Studio poster" }).click();
  await expectStored(`select count(*) from storage.objects where bucket_id = 'portfolios' and name like '${STUDENT}/%'`, "0");
});
