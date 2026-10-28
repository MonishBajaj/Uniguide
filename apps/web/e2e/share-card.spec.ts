import { expect, test } from "@playwright/test";
import { resetStudent, signIn } from "./helpers";

test.beforeEach(() => resetStudent());

test("11.5 an admitted student gets an I got in card; nobody else can make it", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/courses/exampleton-msc-data-science");
  await page.click('button:has-text("Track")');
  await page.waitForURL("**/app/tracker/*");
  const cardUrl = `${new URL(page.url()).pathname}/share-card`;

  // Not admitted yet: no card.
  await expect(page.getByText("Share the news")).toHaveCount(0);
  expect((await page.request.get(cardUrl)).status()).toBe(404);

  await page.selectOption("select[name=decision]", "admitted");
  await page.click('button:has-text("Save decision")');
  await expect(page.getByText("Congratulations! Share the news")).toBeVisible();
  const img = page.locator('img[alt^="Your I got in card"]');
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1200);

  await page.fill('input[maxlength="40"]', "Asha");
  await expect(img).toHaveAttribute("src", `${cardUrl}?name=Asha`);
  const download = await page.request.get(`${cardUrl}?name=Asha&download=1`);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toBe("image/png");
  expect(download.headers()["content-disposition"]).toContain("i-got-in.png");

  // The linked parent can read the application (RLS) but cannot make the card.
  const parent = await (await browser.newContext()).newPage();
  await parent.goto("/login");
  await parent.fill("input[name=email]", "parent@uniguide.local");
  await parent.fill("input[name=password]", "password123");
  await parent.click('button:has-text("Sign in")');
  await parent.waitForURL("**/parent");
  await expect(parent.locator("h4", { hasText: "MSc Data Science" })).toBeVisible();
  expect((await parent.request.get(cardUrl)).status()).toBe(404);
});
