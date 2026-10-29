import { expect, test } from "@playwright/test";

test("15.2 display settings apply on every page and persist, signed out", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Display" }).click();
  await page.waitForURL("**/accessibility");
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-text", /.*/);

  await page.getByRole("group", { name: "Text size" }).getByLabel("Larger").check();
  await page.getByRole("group", { name: "Contrast" }).getByLabel("High").check();
  await page.getByRole("group", { name: "Motion" }).getByLabel("Reduce motion").check();
  await page.click('button:has-text("Save display settings")');
  await expect(html).toHaveAttribute("data-text", "larger");
  await expect(html).toHaveAttribute("data-contrast", "high");
  await expect(html).toHaveAttribute("data-motion", "reduce");

  // Another page, after a reload: still applied, and text is 25% larger.
  await page.goto("/guide");
  await expect(html).toHaveAttribute("data-text", "larger");
  expect(await html.evaluate((el) => getComputedStyle(el).fontSize)).toBe("20px");
  // Reduced motion shows the landing tagline at full strength straight away.
  await page.goto("/");
  expect(await page.locator("[data-word]").first().evaluate((el) => getComputedStyle(el).opacity)).toBe("1");

  // Back to defaults clears the cookie.
  await page.goto("/accessibility");
  await expect(page.getByRole("group", { name: "Text size" }).getByLabel("Larger")).toBeChecked();
  for (const [group, label] of [["Text size", "Normal"], ["Contrast", "Normal"], ["Motion", "Normal"]] as const) {
    await page.getByRole("group", { name: group }).getByLabel(label, { exact: true }).check();
  }
  await page.click('button:has-text("Save display settings")');
  await expect(html).not.toHaveAttribute("data-text", /.*/);
  expect((await page.context().cookies()).find((c) => c.name === "ug_display")).toBeUndefined();
});
