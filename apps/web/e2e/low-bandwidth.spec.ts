import { expect, test } from "@playwright/test";

test("15.3 the browser's data saver turns on low-bandwidth mode, and the student can override it", async ({ browser }) => {
  const saver = await (await browser.newContext({ extraHTTPHeaders: { "Save-Data": "on" } })).newPage();
  await saver.goto("/");
  const html = saver.locator("html");
  await expect(html).toHaveAttribute("data-lite", "on");
  // No motion: the tagline is fully drawn straight away, without transitions.
  const word = saver.locator("[data-word]").first();
  expect(await word.evaluate((el) => [getComputedStyle(el).opacity, getComputedStyle(el).transitionDuration])).toEqual(["1", "0s"]);
  await expect(saver.locator("footer")).toContainText("Data saver is on: no animations, no preloading, shorter lists.");

  // Turning it off wins over the browser.
  await saver.locator("footer").getByRole("link", { name: "Change" }).click();
  await saver.getByRole("group", { name: "Data saver" }).getByLabel("Off").check();
  await saver.click('button:has-text("Save display settings")');
  await expect(html).not.toHaveAttribute("data-lite", /.*/);
  await saver.goto("/guide");
  await expect(html).not.toHaveAttribute("data-lite", /.*/);

  // Without the header it is off, unless chosen.
  const plain = await (await browser.newContext()).newPage();
  await plain.goto("/accessibility");
  await expect(plain.locator("html")).not.toHaveAttribute("data-lite", /.*/);
  await expect(plain.locator("footer")).not.toContainText("Data saver is on");
  await plain.getByRole("group", { name: "Data saver" }).getByLabel("Always save data").check();
  await plain.click('button:has-text("Save display settings")');
  await expect(plain.locator("html")).toHaveAttribute("data-lite", "on");
  await plain.goto("/courses");
  await expect(plain.locator("html")).toHaveAttribute("data-lite", "on");
});
