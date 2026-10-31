import { expect, test } from "@playwright/test";
import { STUDENT, resetStudent, signIn, sql } from "./helpers";

// Journey M6 (J6.3): with the browser's data saver on, the journey home and the help panel stay light and work.
// Prefetching is guarded by a source test (lib/journey-links.test.ts): the dev server these specs run against
// never prefetches, so a browser check here would pass either way.

// The /app page measured 69.8 KB with data saver on (31 October 2026); the budget allows 20% growth.
const HOME_BUDGET = 84_000;

test.beforeEach(() => {
  resetStudent();
  sql(`insert into applications (user_id, cycle_id, status)
         select '${STUDENT}', c.id, 'preparing' from program_cycles c join programs p on p.id = c.program_id
         where p.slug = 'exampleton-msc-data-science' and c.is_current`);
});

test("the journey home and help panel with data saver on: light, still, and usable by keyboard", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.context().setExtraHTTPHeaders({ "Save-Data": "on" });
  const response = await page.goto("/app");
  await expect(page.locator("html")).toHaveAttribute("data-lite", "on");
  const size = (await response!.body()).length;
  expect(size, `the home page is ${size} bytes`).toBeLessThan(HOME_BUDGET);

  // Nothing moves: step card buttons have no transition.
  const button = page.getByRole("article").first().getByRole("link", { name: /^Start this step/ });
  expect(await button.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");

  // The help panel opens and closes by keyboard, shows its content at once, and gives focus back.
  const help = page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Get help" });
  await help.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((el) => [getComputedStyle(el).opacity, getComputedStyle(el).transitionDuration])).toEqual(["1", "0s"]);
  await expect(panel.getByRole("heading").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(help).toBeFocused();
});
