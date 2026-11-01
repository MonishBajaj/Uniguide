// M7 A2.2: a deliberately wrong practice adapter, built in only for this test (EXT_WRONG_ADAPTER=1). It names the
// review page's "Submit my application" as the next-page control and forgets every never-click control. Guided
// apply still can't submit: the guard refuses, and the run pauses and says so.
import { expect, test, type BrowserContext } from "@playwright/test";
import { APPLICANT, sql } from "./helpers";
import { PORTAL, completeApplication, connect, eventLines, freshPortal, launch, openPanel, resetApplicantForAssist, type Rig } from "./extension-helpers";

let rig: Rig;
let ctx: BrowserContext;

test.beforeAll(async () => {
  resetApplicantForAssist();
  rig = await launch("wrong", { EXT_WRONG_ADAPTER: "1" });
  ctx = rig.ctx;
  await connect(ctx);
});

test.afterAll(async () => {
  await rig?.close();
  resetApplicantForAssist();
});

test("a wrong adapter can't get guided apply past the guard to submit", async () => {
  const portal = await freshPortal(ctx);
  await completeApplication(portal);
  await portal.goto(`${PORTAL}/review`);
  await expect(portal.locator("#submit-application")).toBeVisible();

  const panel = await openPanel(ctx);
  await panel.getByRole("button", { name: "Start guided apply" }).click();
  await expect(panel.locator("#guided-run")).toHaveAttribute("data-status", "paused", { timeout: 20_000 });
  await expect(panel.locator("#guided-status")).toHaveAttribute("data-reason", "guard");

  await portal.waitForTimeout(1500);
  await expect(portal).toHaveURL(`${PORTAL}/review`);
  await portal.goto(`${PORTAL}/`);
  await expect(portal.locator("#status")).toHaveText("In progress.");
  expect(eventLines()).toContain("blocked:-:guard");
  expect(sql(`select count(*) from applications where user_id = '${APPLICANT}' and status = 'submitted'`)).toBe("0");
});
