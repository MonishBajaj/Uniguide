import { expect, test, type Page } from "@playwright/test";
import { STUDENT, audit, expectStored, resetStudent, signIn, sql } from "./helpers";

// Journey M5 (J5.1): after accepting an offer, the conditions, deposit and admission document each have a step
// that goes once the student marks it, and the visa step waits for the document.
const SLUG = "exampleton-msc-data-science";
const UNI = "University of Exampleton (placeholder)";

test.beforeEach(() => {
  resetStudent();
  sql(`insert into applications (user_id, cycle_id, status, decision, deposit_due_at, offer_accepted_at)
         select '${STUDENT}', c.id, 'decided', 'admitted', now() + interval '20 days', now() from program_cycles c
         join programs p on p.id = c.program_id where p.slug = '${SLUG}' and c.is_current`);
});

test.afterEach(() => {
  sql(`delete from country_rules where title like 'E2E GB %'`);
});

const steps = async (page: Page) => {
  await page.goto("/app/steps");
  return page.getByRole("article").getByRole("heading").allTextContents();
};

test("after accepting, each enrollment step goes once it's marked, and the visa step waits for the document", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  let open = await steps(page);
  expect(open).toContain("Get your admission document for the visa");
  // Long titles are shortened to fit a card.
  expect(open.some((s) => s.startsWith("Pay the deposit for MSc Data Science"))).toBe(true);
  expect(open).not.toContain("Apply for your student visa");

  await page.goto("/app/offers#after-accept");
  const panel = page.getByRole("region", { name: "After you accept" });
  await expect(panel).toBeInViewport();
  await panel.getByLabel(/In your own words/).fill("Final grade of at least 8.0");
  await panel.getByRole("button", { name: "Save conditions" }).click();
  await expect(panel.getByRole("button", { name: "Mark conditions met", exact: true })).toBeVisible();
  expect(await steps(page)).toContain("Meet your offer's conditions");

  await page.goto("/app/offers#after-accept");
  await panel.getByRole("button", { name: "Mark conditions met", exact: true }).click();
  await expect(panel.getByText(/^Done on/).first()).toBeVisible();
  await panel.getByRole("button", { name: "Mark deposit paid", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Mark deposit paid", exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Mark received", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Mark received", exact: true })).toHaveCount(0);

  open = await steps(page);
  for (const gone of ["Meet your offer's conditions", "Get your admission document for the visa"]) expect(open).not.toContain(gone);
  expect(open.some((s) => s.startsWith("Pay the deposit"))).toBe(false);
  expect(open).toContain("Apply for your student visa");

  // Undo brings a step back.
  await page.goto("/app/offers#after-accept");
  await panel.getByRole("button", { name: "Undo : Mark received" }).click();
  // Wait for the undo to save before reading the steps.
  await expect(panel.getByRole("button", { name: "Mark received", exact: true })).toBeVisible();
  expect(await steps(page)).toContain("Get your admission document for the visa");
});

test("after accepting, each other offer has a step until it's declined, and the tracker says so (J5.2)", async ({ browser }) => {
  sql(`insert into applications (user_id, cycle_id, status, decision)
         select '${STUDENT}', c.id, 'decided', 'admitted' from program_cycles c join programs p on p.id = c.program_id
         where p.slug = 'tum-msc-informatics' and c.is_current`);
  const page = await signIn(browser, "student@uniguide.local");
  expect(await steps(page)).toContain("Let your other universities know");

  await page.goto("/app/offers#others");
  const others = page.getByRole("region", { name: "Your other offers" });
  await expect(others).toBeInViewport();
  await others.getByRole("button", { name: /^I've declined this offer : M\.Sc\. Informatics/ }).click();
  await expect(others.getByText(/^Declined on/)).toBeVisible();
  expect(await steps(page)).not.toContain("Let your other universities know");

  await page.goto("/app/tracker");
  await expect(page.getByRole("article").filter({ hasText: "M.Sc. Informatics" })).toContainText("Declined");
});

test("\"I've arrived\" turns the home into \"You made it\" and marks the journey done (J5.8)", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/departure#arrived");
  const ask = page.getByRole("region", { name: "Have you arrived?" });
  await ask.getByRole("button", { name: "I've arrived" }).click();
  await expect(ask.getByRole("button", { name: "I haven't arrived yet" })).toBeVisible();

  await page.goto("/app");
  const made = page.getByRole("region", { name: "You made it" });
  await expect(made).toContainText(`Welcome to ${UNI}. This journey is done`);
  await expect(made.getByRole("link", { name: `Arriving at ${UNI}` })).toHaveAttribute("href", `/courses/${SLUG}/arrival`);
  await expect(made.getByRole("link", { name: `Student life and support at ${UNI}` })).toHaveAttribute("href", `/courses/${SLUG}#student-life`);
  await expect(page.getByRole("heading", { name: "Your next steps" })).toHaveCount(0);
  await expectStored(`select arrived from journey_state where user_id = '${STUDENT}'`, "t");

  // Undo brings the journey back.
  await page.goto("/app/departure#arrived");
  await ask.getByRole("button", { name: "I haven't arrived yet" }).click();
  await expect(ask.getByRole("button", { name: "I've arrived" })).toBeVisible();
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Your next steps" })).toBeVisible();
  await expectStored(`select arrived from journey_state where user_id = '${STUDENT}'`, "f");
});

test("one student from admitted to arrived: a step for every task, and each completes (J5.9)", async ({ browser }) => {
  sql(`insert into country_rules (destination, kind, title, status) values
         ('GB', 'housing', 'E2E GB housing', 'verified'),
         ('GB', 'health_insurance', 'E2E GB health cover', 'verified'),
         ('GB', 'residence_registration', 'E2E GB registration', 'verified')`);
  const page = await signIn(browser, "student@uniguide.local");
  let open = await steps(page);
  for (const s of ["Get your admission document for the visa", "Apply for housing", "Arrange health insurance", "Register after you arrive"]) {
    expect(open).toContain(s);
  }
  expect(open.some((s) => s.startsWith("Pay the deposit"))).toBe(true);
  expect(open).not.toContain("Apply for your student visa");

  // Enrollment: the deposit and the admission document, then the visa step appears.
  await page.goto("/app/offers#after-accept");
  const panel = page.getByRole("region", { name: "After you accept" });
  await panel.getByRole("button", { name: "Mark deposit paid", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Mark deposit paid", exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Mark received", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Mark received", exact: true })).toHaveCount(0);
  open = await steps(page);
  expect(open).toContain("Apply for your student visa");

  // Before you go: each task on the departure timeline completes its step.
  await page.goto("/app/departure");
  for (const task of ["UK Student visa (GOV.UK)", "E2E GB housing", "E2E GB health cover", "E2E GB registration"]) {
    await page.getByRole("button", { name: `${task}: mark done` }).click();
    await expect(page.getByRole("button", { name: `${task}: done, mark not done` })).toBeVisible();
  }
  open = await steps(page);
  for (const s of ["Get your admission document for the visa", "Apply for your student visa", "Apply for housing", "Arrange health insurance", "Register after you arrive"]) {
    expect(open).not.toContain(s);
  }
  expect(open.some((s) => s.startsWith("Pay the deposit"))).toBe(false);

  // Arrived.
  await page.goto("/app/departure#arrived");
  const ask = page.getByRole("region", { name: "Have you arrived?" });
  await ask.getByRole("button", { name: "I've arrived" }).click();
  await expect(ask.getByRole("button", { name: "I haven't arrived yet" })).toBeVisible();
  await page.goto("/app");
  await expect(page.getByRole("region", { name: "You made it" })).toBeVisible();
});

test("a parent never sees the conditions", async ({ browser }) => {
  sql(`insert into offer_conditions (application_id, user_id, conditions)
         select id, user_id, 'IELTS 7.0 in every band' from applications where user_id = '${STUDENT}'`);
  const student = await signIn(browser, "student@uniguide.local");
  await student.goto("/app");
  const page = await signIn(browser, "parent@uniguide.local");
  await page.goto("/parent");
  await expect(page.getByText("IELTS 7.0 in every band")).toHaveCount(0);
  await expect(page.getByRole("region", { name: /is working on/ })).not.toContainText("conditions");
});

for (const [width, height] of [[1280, 900], [390, 844]]) {
  test(`the offers page with "After you accept" has no serious accessibility violations at ${width}px`, async ({ browser }) => {
    const page = await signIn(browser, "student@uniguide.local");
    await page.setViewportSize({ width, height });
    const found = await audit(page, "/app/offers");
    await page.context().addCookies([{ name: "ug_locale", value: "hi", url: page.url() }]);
    found.push(...(await audit(page, "/app/offers")));
    expect(found, found.join("\n")).toEqual([]);
  });
}

for (const [width, height] of [[1280, 900], [390, 844]]) {
  test(`the departure page and "You made it" have no serious accessibility violations at ${width}px (J5.9)`, async ({ browser }) => {
    const page = await signIn(browser, "student@uniguide.local");
    await page.setViewportSize({ width, height });
    const found: string[] = [];
    for (const locale of ["en", "hi"]) {
      await page.context().addCookies([{ name: "ug_locale", value: locale, url: page.url() }]);
      found.push(...(await audit(page, "/app/departure")));
    }
    sql(`insert into departure_tasks (user_id, application_id, task_key)
           select user_id, id, 'arrived' from applications where user_id = '${STUDENT}' and offer_accepted_at is not null`);
    for (const locale of ["en", "hi"]) {
      await page.context().addCookies([{ name: "ug_locale", value: locale, url: page.url() }]);
      found.push(...(await audit(page, "/app")));
    }
    expect(found, found.join("\n")).toEqual([]);
  });
}
