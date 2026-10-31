import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

// Saves a few different student profiles onto the seed student, one after another, and checks each comes back
// after a reload and that the pages that read the profile still render. The last persona stays in the database.
test.describe.configure({ mode: "serial" });

type Persona = {
  name: string;
  qualification: string;
  grade: string;
  scale: string;
  budget: string;
  currency: string;
  levels: string[];
  countries: string[];
  fields: string[];
};

const PERSONAS: Persona[] = [
  {
    name: "Indian CS graduate aiming at a UK/US master's",
    qualification: "bachelor_4yr",
    grade: "8.4",
    scale: "gpa_10",
    budget: "60000",
    currency: "USD",
    levels: ["master"],
    countries: ["GB", "US"],
    fields: ["06"],
  },
  {
    name: "Engineering bachelor's student on a tight budget in Germany and Ireland",
    qualification: "bachelor_3yr",
    grade: "72",
    scale: "percent",
    budget: "25000",
    currency: "EUR",
    levels: ["master"],
    countries: ["DE", "IE"],
    fields: ["07"],
  },
  {
    name: "CBSE Class XII leaver applying for a bachelor's in business",
    qualification: "cbse",
    grade: "91",
    scale: "percent",
    budget: "90000",
    currency: "CAD",
    levels: ["bachelor"],
    countries: ["CA", "AU", "US"],
    fields: ["04"],
  },
];

/** The profile form; the track form further down the page repeats some field names. */
const profileForm = (page: Page) => page.locator("form", { has: page.getByRole("button", { name: "Save profile" }) });

/** Tick exactly the given values in a checkbox group. */
async function setChecked(page: Page, name: string, values: string[]) {
  const boxes = profileForm(page).locator(`input[type=checkbox][name=${name}]`);
  for (let i = 0; i < (await boxes.count()); i++) {
    const box = boxes.nth(i);
    await box.setChecked(values.includes((await box.getAttribute("value")) ?? ""));
  }
}

async function openProfile(page: Page) {
  await page.goto("/app/profile");
  await expect(page.locator("h1", { hasText: "Your profile" })).toBeVisible();
}

async function fillAndSave(page: Page, p: Persona) {
  await profileForm(page).locator("select[name=home_qualification]").selectOption(p.qualification);
  await profileForm(page).locator("input[name=grade_value]").fill(p.grade);
  await profileForm(page).locator("select[name=grade_scale]").selectOption(p.scale);
  await profileForm(page).locator("input[name=budget_amount]").fill(p.budget);
  await profileForm(page).locator("select[name=budget_currency]").selectOption(p.currency);
  await setChecked(page, "target_levels", p.levels);
  await setChecked(page, "target_countries", p.countries);
  await setChecked(page, "target_fields", p.fields);
  await profileForm(page).locator("select[name=favourite_country]").selectOption(p.countries[0]);
  await page.getByRole("button", { name: "Save profile" }).click();
  // The first complete save starts a search and opens its progress page; later saves stay here.
  await expect(
    page.getByRole("status").filter({ hasText: "Profile saved." }).or(page.locator("h1", { hasText: /search|matching|finding/i })),
  ).toBeVisible();
}

for (const persona of PERSONAS) {
  test(`profile: ${persona.name}`, async ({ browser }) => {
    const page = await signIn(browser, "student@uniguide.local");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await openProfile(page);
    await fillAndSave(page, persona);

    // What was saved comes back after a fresh load.
    await openProfile(page);
    await expect(profileForm(page).locator("select[name=home_qualification]")).toHaveValue(persona.qualification);
    await expect(profileForm(page).locator("input[name=grade_value]")).toHaveValue(persona.grade);
    await expect(profileForm(page).locator("select[name=grade_scale]")).toHaveValue(persona.scale);
    await expect(profileForm(page).locator("input[name=budget_amount]")).toHaveValue(persona.budget);
    await expect(profileForm(page).locator("select[name=budget_currency]")).toHaveValue(persona.currency);
    for (const [name, values] of [
      ["target_levels", persona.levels],
      ["target_countries", persona.countries],
      ["target_fields", persona.fields],
    ] as const) {
      const checked = await profileForm(page)
        .locator(`input[type=checkbox][name=${name}]:checked`)
        .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
      expect(checked.sort()).toEqual([...values].sort());
    }

    // The pages that read the profile still render for it.
    for (const path of ["/app/match", "/app/matching", "/app/tracker", "/app/shortlist"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBeLessThan(500);
      await expect(page.locator("h1").first(), path).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

test("a grade without a scale and a budget without a currency are refused", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await openProfile(page);
  await profileForm(page).locator("input[name=grade_value]").fill("8.1");
  await profileForm(page).locator("select[name=grade_scale]").selectOption("");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Choose the scale your grade is on" })).toBeVisible();

  await openProfile(page);
  await profileForm(page).locator("input[name=budget_amount]").fill("5000");
  await profileForm(page).locator("select[name=budget_currency]").selectOption("");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Choose the currency of your budget" })).toBeVisible();
});
