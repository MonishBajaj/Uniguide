import { expect, test } from "@playwright/test";
import { resetStudent, signIn, sql, STUDENT } from "./helpers";

const SLUG = "exampleton-msc-data-science";
const removeRequirement = () =>
  sql(`delete from requirements where details = 'e2e letters' and cycle_id in
         (select c.id from program_cycles c join programs p on p.id = c.program_id where p.slug = '${SLUG}')`);

test.beforeEach(() => {
  resetStudent();
  removeRequirement();
  sql(`delete from recommenders where user_id = '${STUDENT}';
       insert into requirements (cycle_id, kind, count_required, details, status, published)
       select c.id, 'recommendation_letters', 2, 'e2e letters', 'verified', true
       from program_cycles c join programs p on p.id = c.program_id where p.slug = '${SLUG}' and c.is_current`);
});
test.afterEach(removeRequirement);

test("6.1 the student tracks who writes which letter, against what the course asks for", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto(`/courses/${SLUG}`);
  await page.click('button:has-text("Track")');
  await page.waitForURL("**/app/tracker/*");
  const appUrl = page.url();
  const section = page.locator("section[aria-labelledby=letters]");
  await expect(section.getByText("This course asks for 2 letters.", { exact: false })).toBeVisible();

  await section.getByRole("link", { name: "Manage recommenders" }).click();
  await page.waitForURL("**/app/recommenders");
  for (const [name, rel] of [["Dr Mehta", "Thesis supervisor"], ["Ms Okafor", "Manager"]]) {
    await page.fill("input[name=name]", name!);
    await page.fill("input[name=relationship]", rel!);
    await page.click('button:has-text("Add recommender")');
    await expect(page.locator("h2", { hasText: name! })).toBeVisible();
  }

  const mehta = page.locator("section[aria-label='Dr Mehta']");
  await mehta.locator("select[name=status]").selectOption("agreed");
  await mehta.locator("input[name=due_on]").fill("2027-06-15");
  await mehta.locator('button:has-text("Add")').click();
  await expect(mehta.locator("li", { hasText: "MSc Data Science" })).toBeVisible();

  const okafor = page.locator("section[aria-label='Ms Okafor']");
  await okafor.locator('button:has-text("Add")').click();
  await expect(okafor.locator("li", { hasText: "MSc Data Science" })).toBeVisible();

  // Mark Dr Mehta's letter submitted.
  await mehta.locator("li select[name=status]").selectOption("submitted");
  await mehta.locator('li button:has-text("Update")').click();
  await expect.poll(() => sql(`select concat(status, ' ', submitted_on is not null) from recommendation_requests q join recommenders r on r.id = q.recommender_id where r.name = 'Dr Mehta' and q.user_id = '${STUDENT}'`)).toBe("submitted t");

  await page.goto(appUrl);
  await expect(section.getByText("1 submitted, 1 agreed or submitted.", { exact: false })).toBeVisible();
  await expect(section.getByText("Ask 1 more person.", { exact: false })).toBeVisible();
  await expect(section.getByText("Ms Okafor")).toBeVisible();

  await page.goto("/app/tracker");
  await expect(page.getByText("Letters submitted: 1 of 2")).toBeVisible();
});
