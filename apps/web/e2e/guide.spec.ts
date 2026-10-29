import { expect, test } from "@playwright/test";
import { resetStudent, signIn, sql, STUDENT } from "./helpers";

test("15.1 the guide walks through the steps and explains each term, and terms open inline with the keyboard", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/");
  await page.locator("footer").getByRole("link", { name: "How it works" }).click();
  await page.waitForURL("**/guide");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("How applying abroad works");
  await expect(page.locator("section[aria-labelledby=steps] > ol > li")).toHaveCount(10);

  // A step links to the terms it uses; the glossary gives the official site where there is one.
  await page.locator("section[aria-labelledby=steps]").getByRole("link", { name: "CAS", exact: true }).click();
  await expect(page).toHaveURL(/#term-cas$/);
  const cas = page.locator("#term-cas");
  await expect(cas).toContainText("Confirmation of Acceptance for Studies");
  await expect(cas.getByRole("link", { name: "Official site: GOV.UK: Student visa" })).toHaveAttribute("href", "https://www.gov.uk/student-visa");

  // Inline term: keyboard only.
  const sop = page.getByRole("button", { name: "SOP", exact: true });
  await sop.focus();
  await page.keyboard.press("Enter");
  await expect(sop).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("note")).toContainText("Statement of purpose");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("note")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("15.1 offers explain the deposit in place", async ({ browser }) => {
  resetStudent();
  sql(`insert into applications (user_id, cycle_id, status, decision, deposit_due_at)
       select '${STUDENT}', c.id, 'decided', 'admitted', now() + interval '20 days' from program_cycles c join programs p on p.id = c.program_id
       where p.slug = 'exampleton-msc-data-science' and c.is_current`);
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/offers");
  await page.getByRole("button", { name: "deposit" }).click();
  await expect(page.getByRole("note")).toContainText("Check whether it is refundable");
  await page.getByRole("note").getByRole("link", { name: "More in the guide" }).click();
  await page.waitForURL("**/guide#term-deposit");
});
