import { expect, test } from "@playwright/test";

const SLUG = "verified-facts-pipeline";
const TITLE = "Keeping an LLM away from the deadline: how Uniguide turns official pages into checked facts";

test("17.2 the blog lists posts, renders them with article metadata, and publishes a feed", async ({ page }) => {
  await page.goto("/");
  await page.locator("footer").getByRole("link", { name: "Blog" }).click();
  await page.waitForURL("**/blog");
  await expect(page.getByRole("heading", { level: 1, name: "Blog" })).toBeVisible();
  await page.getByRole("link", { name: TITLE }).click();
  await page.waitForURL(`**/blog/${SLUG}`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(TITLE);
  await expect(page.locator(".post h2", { hasText: "The trust layer" })).toBeVisible();
  await expect(page.locator(".post table th", { hasText: "Suite" })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/blog/${SLUG}$`));
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(ld).toMatchObject({ "@type": "Article", headline: TITLE, datePublished: "2026-10-28" });

  const rss = await page.request.get("/blog/rss.xml");
  expect(rss.headers()["content-type"]).toContain("application/rss+xml");
  expect(await rss.text()).toContain(`/blog/${SLUG}</link>`);

  expect(await (await page.request.get("/sitemap.xml")).text()).toContain(`/blog/${SLUG}</loc>`);
  expect((await page.request.get("/blog/no-such-post")).status()).toBe(404);
});
