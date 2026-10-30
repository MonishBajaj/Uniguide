import { expect, test } from "@playwright/test";
import { STUDENT, audit, resetStudent, signIn, sql } from "./helpers";

// Journey M3 (J3.1): score goals on the match page; advice, comparison and costs on the shortlist; and the
// steps that link to them. TUM publishes a verified TOEFL iBT (legacy) minimum of 88; the student's best is 80.
const TUM = "tum-msc-informatics";

test.beforeEach(() => {
  resetStudent();
  sql(`delete from test_scores where user_id = '${STUDENT}' and exam = 'toefl_ibt';
       insert into test_scores (user_id, exam, exam_version, total, taken_on) values ('${STUDENT}', 'toefl_ibt', 'legacy', 80, '2026-09-01');
       insert into shortlists (user_id, program_id) select '${STUDENT}', id from programs where slug = '${TUM}';
       insert into applications (user_id, cycle_id, status)
         select '${STUDENT}', c.id, 'shortlisted' from program_cycles c join programs p on p.id = c.program_id
         where p.slug = '${TUM}' and c.is_current`);
});

test.afterEach(() => {
  sql(`delete from test_scores where user_id = '${STUDENT}' and exam = 'toefl_ibt'`);
});

const stepLink = (page: import("@playwright/test").Page, title: string) =>
  page.getByRole("article").filter({ hasText: title }).getByRole("link", { name: /^Start this step/ });

test("the score gap step names the verified minimum and opens the score goals panel", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/steps");
  const gap = page.getByRole("article").filter({ hasText: "Close the gap to a course's minimum score" });
  await expect(gap).toContainText("asks for 88 in TOEFL iBT. Your best so far is 80.");
  await stepLink(page, "Close the gap to a course's minimum score").click();
  await expect(page).toHaveURL(/\/app\/match#score-goals$/);
  const goals = page.getByRole("region", { name: "Score goals" });
  await expect(goals).toBeInViewport();
  await expect(goals.getByRole("listitem").filter({ hasText: "TOEFL" })).toContainText("8 below the overall minimum");
});

test("the shortlist shows advice, the profile comparison and each course's cost, and its steps land on them", async ({ browser }) => {
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/shortlist");
  await expect(page.getByRole("region", { name: "Advice on your shortlist" }).getByRole("listitem").first()).toBeVisible();
  const comparison = page.getByRole("region", { name: "How your profile compares" });
  await expect(comparison.getByRole("rowheader")).toHaveCount(1);
  // The student meets the English minimum through their IELTS 7.5, even with a TOEFL below it.
  await expect(comparison.getByRole("row").nth(1)).toContainText("Meets the published minimum");
  await expect(page.getByRole("region", { name: "Cost of each course" }).getByRole("listitem")).toHaveCount(1);

  for (const [title, region, hash] of [
    ["Build a balanced shortlist", "Advice on your shortlist", "advice"],
    ["See how your profile compares", "How your profile compares", "comparison"],
    ["Check the cost of each course", "Cost of each course", "costs"],
  ] as const) {
    await page.goto("/app/steps");
    await stepLink(page, title).click();
    await expect(page).toHaveURL(new RegExp(`/app/shortlist#${hash}$`));
    await expect(page.getByRole("region", { name: region })).toBeInViewport();
  }
});

test("without a budget the cost panel asks for one instead of flagging courses", async ({ browser }) => {
  sql(`update profiles set budget_amount = null, budget_currency = null where user_id = '${STUDENT}'`);
  const page = await signIn(browser, "student@uniguide.local");
  await page.goto("/app/shortlist#costs");
  const costs = page.getByRole("region", { name: "Cost of each course" });
  await expect(costs.getByRole("link", { name: "Add a budget" })).toHaveAttribute("href", "/app/profile#budget");
  await expect(costs.getByText("over your budget")).toHaveCount(0);
});

for (const [width, height] of [[1280, 900], [390, 844]]) {
  test(`the panels have no serious accessibility violations at ${width}px, in English and Hindi`, async ({ browser }) => {
    const page = await signIn(browser, "student@uniguide.local");
    await page.setViewportSize({ width, height });
    const found: string[] = [];
    for (const path of ["/app/match", "/app/shortlist"]) found.push(...(await audit(page, path)));
    await page.context().addCookies([{ name: "ug_locale", value: "hi", url: page.url() }]);
    for (const path of ["/app/match", "/app/shortlist"]) found.push(...(await audit(page, path)));
    expect(found, found.join("\n")).toEqual([]);
  });
}
