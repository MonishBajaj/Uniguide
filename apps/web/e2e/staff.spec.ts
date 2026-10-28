import { expect, test } from "@playwright/test";
import { resetStudent, signIn, sql, STUDENT } from "./helpers";

const VERIFIER = "00000000-0000-4000-a000-000000000003";

test("a verifier reviews only their country's courses", async ({ browser }) => {
  // Each run approves one German proposal; re-propose one when none is left, so the test can be rerun.
  sql(`insert into fact_versions (subject, subject_id, cycle_id, proposed, evidence_quote, source_id, created_by)
       select v.subject, v.subject_id, v.cycle_id, v.proposed, v.evidence_quote, v.source_id, v.created_by
       from fact_versions v join program_cycles c on c.id = v.cycle_id join programs p on p.id = c.program_id
       where p.slug = 'tu-beispielstadt-msc-informatik' and v.validation = '[]'
         and not exists (select 1 from fact_versions w join program_cycles c2 on c2.id = w.cycle_id join programs p2 on p2.id = c2.program_id
                         where p2.slug = 'tu-beispielstadt-msc-informatik' and w.review_state = 'pending' and w.validation = '[]')
       limit 1`);
  const page = await signIn(browser, "verifier@uniguide.local");
  await page.goto("/admin/review");
  await expect(page.getByText("You review courses in DE")).toBeVisible();
  const titles = await page.locator("li h2").allInnerTexts();
  expect(titles.length).toBeGreaterThan(0);
  for (const t of titles) expect(t).toContain("Informatik");
  const before = Number(sql(`select count(*) from fact_versions where reviewed_by = '${VERIFIER}'`));
  await page.locator("li button.btn-primary:not([disabled])").first().click();
  await expect.poll(() => Number(sql(`select count(*) from fact_versions where reviewed_by = '${VERIFIER}'`))).toBe(before + 1);
  expect((await page.goto("/admin/team"))!.status()).toBe(404);
});

test("a counselor sees a student only while the student shares", async ({ browser }) => {
  resetStudent();
  const student = await signIn(browser, "student@uniguide.local");
  await student.goto("/courses/exampleton-msc-data-science");
  await student.click('button:has-text("Track")');
  await student.waitForURL("**/app/tracker/*");
  await student.goto("/app/sharing");
  await student.fill("input[name=code]", "LOCAL-AGENCY");
  await student.fill("input[name=name]", "Asha");
  await student.check("input[name=agree]");
  await student.click('button:has-text("Share")');
  await expect(student.getByText("Example Consultancy (local)")).toBeVisible();

  const counselor = await signIn(browser, "counselor@uniguide.local");
  await counselor.goto("/agency");
  await counselor.click('a:has-text("Asha")');
  await expect(counselor.locator("h3", { hasText: "MSc Data Science" })).toBeVisible();
  const detail = counselor.url();

  await student.click('button:has-text("Stop sharing")');
  await expect(student.getByText("Stopped sharing.")).toBeVisible();
  expect((await counselor.goto(detail))!.status()).toBe(404);
  expect(sql(`select count(*) from consents where user_id = '${STUDENT}' and kind = 'agency_sharing' and withdrawn_at is null`)).toBe("0");
});
