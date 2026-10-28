import { expect, test, type Page } from "@playwright/test";
import { sql } from "./helpers";

const signUp = async (page: Page, age: number, country: string, email: string) => {
  await page.goto("/signup");
  await page.selectOption("select[name=birth_month]", "1");
  await page.selectOption("select[name=birth_year]", String(new Date().getFullYear() - age));
  await page.selectOption("select[name=residence_country]", country);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password1234");
  await page.check("input[name=terms]");
  await page.click('button:has-text("Create account")');
};

test("under-13s are stopped before an account exists", async ({ page }) => {
  const email = `kid${Date.now()}@example.com`;
  await signUp(page, 12, "US", email);
  await expect(page.getByText("aged 13 and over")).toBeVisible();
  expect(sql(`select count(*) from auth.users where email = '${email}'`)).toBe("0");
});

test("a 15 year old in Germany waits for a parent, who must press the button", async ({ page, browser }) => {
  const email = `teen${Date.now()}@example.com`;
  const state = () => sql(`select consent_state from profiles p join auth.users u on u.id = p.user_id where u.email = '${email}'`);
  await signUp(page, 15, "DE", email);
  await page.waitForURL("**/consent");
  expect(state()).toBe("pending_parental");
  await page.fill("input[name=parent_email]", `parent-${email}`);
  await page.click('button:has-text("Send the request")');
  // Without an email provider the link is shown in development mode.
  const status = await page.getByText("Development mode").textContent();
  const link = status!.match(/http\S+/)![0];
  const parent = await (await browser.newContext()).newPage();
  await parent.goto(link);
  expect(state()).toBe("pending_parental");
  await parent.click('button:has-text("I am their parent or guardian and I agree")');
  await expect(parent.getByText("the account is confirmed").first()).toBeVisible();
  expect(state()).toBe("granted");
});
