import { expect, test } from "@playwright/test";
import { STUDENT, resetStudent, signIn, sql } from "./helpers";

// Journey M4 (J4.1): the "Get help" panel, with help for the page the student is on.
const SLUG = "exampleton-msc-data-science";

test.beforeEach(() => {
  resetStudent();
  sql(`insert into applications (user_id, cycle_id, status)
         select '${STUDENT}', c.id, 'preparing' from program_cycles c join programs p on p.id = c.program_id
         where p.slug = '${SLUG}' and c.is_current;
       insert into applications (user_id, status, own_institution, own_title, own_country)
         values ('${STUDENT}', 'preparing', 'Universiteit Voorbeeld', 'MSc Urban Planning', 'NL')`);
});

const appId = (own: boolean) => sql(`select id from applications where user_id = '${STUDENT}' and own_title is ${own ? "not " : ""}null`);

test("the panel opens on any page with that page's help, keeps focus inside and gives it back on Escape", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  for (const [path, text] of [
    ["/app/shortlist", "When you decide to apply"],
    ["/app/tracker", "Add a course that isn't listed"],
    ["/app/profile", "We never convert them"],
  ] as const) {
    await page.goto(path);
    const button = page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Get help" });
    await button.click();
    const panel = page.getByRole("dialog", { name: "Help" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Stage 4 of 7: Prepare")).toBeVisible();
    await expect(panel.getByRole("region", { name: "On this page" })).toContainText(text);
    await expect(panel.getByRole("link", { name: "Ask a parent to follow along" })).toHaveAttribute("href", "/app/sharing#family");
    await expect(panel.getByRole("link", { name: "Share with a counselor" })).toHaveAttribute("href", "/app/sharing#shares");

    // The page behind is inert: tabbing never reaches it. (Chrome lets focus pass to its own toolbar
    // after the last link, which leaves the page's active element as the body.)
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect(await panel.evaluate((d) => d.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(button).toBeFocused();
  }
});

test("on an application, the panel links to course questions for a catalogue course only", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto(`/app/tracker/${appId(false)}`);
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Get help" }).click();
  await expect(page.getByRole("dialog", { name: "Help" }).getByRole("link", { name: "Ask about this course" })).toHaveAttribute("href", `/courses/${SLUG}#ask`);

  await page.goto(`/app/tracker/${appId(true)}`);
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Get help" }).click();
  const panel = page.getByRole("dialog", { name: "Help" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link", { name: "Ask about this course" })).toHaveCount(0);
});

test("on a phone the bar's Help opens the panel as a sheet, in Hindi too", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addCookies([{ name: "ug_locale", value: "hi", url: page.url() }]);
  await page.goto("/app/shortlist");
  // Only the bottom bar offers help on a phone.
  await expect(page.getByRole("navigation", { name: "मुख्य" }).getByRole("button", { name: "मदद" })).toBeHidden();
  await page.locator("[data-bottom-bar]").getByRole("button", { name: "मदद" }).click();
  const panel = page.getByRole("dialog", { name: "मदद" });
  await expect(panel.getByRole("region", { name: "इस पेज पर" })).toContainText("जिन पर आप विचार कर रहे हैं");
});
