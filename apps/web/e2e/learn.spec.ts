import { expect, test } from "@playwright/test";
import { expectStored, signIn, sql } from "./helpers";

const cleanup = () => sql(`delete from media_items where title like 'E2E %'`);
test.beforeEach(cleanup);
test.afterEach(cleanup);

const local = (d: Date) => d.toISOString().slice(0, 16);

test("17.3/17.4 admins publish webinars and recordings; the public page shows only what is published", async ({ browser, page }) => {
  await page.goto("/learn");
  await expect(page.getByText("No webinars scheduled yet.")).toBeVisible();
  await expect(page.getByText("No recordings yet.")).toBeVisible();

  const admin = await signIn(browser, "admin@uniguide.local");
  await admin.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Media" }).click();
  await admin.waitForURL("**/admin/media");
  const form = admin.getByRole("form", { name: "Add media" });
  const add = async (fields: { kind: string; title: string; url?: string; starts?: Date; register?: string; publish: boolean }) => {
    await form.locator("select[name=kind]").selectOption(fields.kind);
    await form.locator("input[name=title]").fill(fields.title);
    await form.locator("input[name=url]").fill(fields.url ?? "");
    await form.locator("input[name=starts_at]").fill(fields.starts ? local(fields.starts) : "");
    await form.locator("input[name=registration_url]").fill(fields.register ?? "");
    await form.getByLabel("Publish now").setChecked(fields.publish);
    await form.getByRole("button", { name: "Add" }).click();
    await expect(admin.getByRole("listitem", { name: fields.title })).toBeVisible();
  };
  await add({ kind: "webinar", title: "E2E UK visas Q&A", starts: new Date(Date.now() + 3 * 86_400_000), register: "https://example.org/register", publish: true });
  await add({ kind: "video", title: "E2E Reading a requirements page", url: "https://www.youtube.com/watch?v=abc123DEF45", publish: false });
  await add({ kind: "podcast", title: "E2E Funding your master's", url: "https://podcasts.example.org/ep1", publish: true });
  await expectStored(`select count(*) from media_items where title like 'E2E %' and published`, "2");

  await page.reload();
  const webinar = page.getByRole("listitem", { name: "E2E UK visas Q&A" });
  await expect(webinar.getByRole("link", { name: "Register" })).toHaveAttribute("href", "https://example.org/register");
  const id = sql(`select id from media_items where title = 'E2E UK visas Q&A'`);
  const ics = await page.request.get(`/learn/${id}/event.ics`);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("SUMMARY:Webinar: E2E UK visas Q&A");
  await expect(page.getByRole("listitem", { name: "E2E Funding your master's" }).getByRole("link", { name: "Listen" })).toBeVisible();
  await expect(page.getByText("E2E Reading a requirements page")).toHaveCount(0);

  // Publishing the video embeds it through YouTube's no-cookie domain.
  await admin.getByRole("listitem", { name: "E2E Reading a requirements page" }).getByRole("button", { name: "Publish" }).click();
  await expectStored(`select published from media_items where title = 'E2E Reading a requirements page'`, "t");
  await page.reload();
  await expect(page.locator('iframe[title="E2E Reading a requirements page"]')).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/abc123DEF45");

  await admin.getByRole("listitem", { name: "E2E Funding your master's" }).getByRole("button", { name: "Delete" }).click();
  await expectStored(`select count(*) from media_items where title like 'E2E %'`, "2");
});
