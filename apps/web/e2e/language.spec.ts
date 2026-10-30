import { expect, test } from "@playwright/test";
import { en } from "../lib/i18n/en";
import { hi } from "../lib/i18n/hi";
import { resetStudent, signIn } from "./helpers";

test("15.4 the interface switches to Hindi and back; course facts stay as published", async ({ page }) => {
  await page.goto("/");
  await page.locator("footer").getByRole("button", { name: en.footer.switchTo }).click();
  const html = page.locator("html");
  await expect(html).toHaveAttribute("lang", "hi");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(hi.home.heroTitle);
  await expect(page.locator("footer")).toContainText("हिन्दी अनुवाद की समीक्षा");

  // Facts are never translated: the course page keeps its title and requirements, inside a Hindi interface.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: hi.nav.courses }).click();
  await page.waitForURL("**/courses");
  await page.goto("/courses/exampleton-msc-data-science");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("MSc Data Science");
  await expect(page.getByText("IELTS Academic", { exact: false }).first()).toBeVisible();

  // The guide, its glossary and its inline terms are in Hindi.
  await page.goto("/guide");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(hi.guide.title);
  await expect(page.locator("#term-cas")).toContainText(hi.glossary.cas);
  await page.getByRole("button", { name: "SOP", exact: true }).click();
  await expect(page.getByRole("note")).toContainText(hi.glossary.sop);

  await page.locator("footer").getByRole("button", { name: hi.footer.switchTo }).click();
  await expect(html).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.guide.title);
});

test("15.4 a browser that prefers Hindi gets Hindi until the student chooses", async ({ browser }) => {
  const page = await (await browser.newContext({ locale: "hi-IN", extraHTTPHeaders: { "Accept-Language": "hi-IN,hi;q=0.9,en;q=0.8" } })).newPage();
  await page.goto("/accessibility");
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(hi.settings.title);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "English", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("15.4 the tracker and offers read in Hindi when chosen", async ({ browser }) => {
  resetStudent();
  const page = await signIn(browser, "student@uniguide.local");
  await page.context().addCookies([{ name: "ug_locale", value: "hi", url: page.url() }]);
  await page.goto("/app/tracker");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(hi.tracker.title);
  await expect(page.getByText(hi.journey.empty.trackerTitle)).toBeVisible();
  await page.goto("/app/offers");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(hi.offers.title);
  await expect(page.getByText(hi.offers.none)).toBeVisible();
});
