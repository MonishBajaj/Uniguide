import { expect, test } from "@playwright/test";
import { audit, resetStudent, signIn, sql, STUDENT } from "./helpers";

const SLUG = "exampleton-msc-data-science";
const cleanup = () => sql(`delete from community_posts where author_id = '${STUDENT}'; delete from community_amas where title = 'E2E Audit AMA';`);
test.beforeEach(() => {
  resetStudent();
  cleanup();
  sql(`insert into community_amas (title, host_name, starts_at, ends_at, published) values ('E2E Audit AMA', 'Priya Shah', now() + interval '2 days', now() + interval '2 days 1 hour', true);
       insert into community_posts (author_id, kind, pseudonym, title, body) values ('${STUDENT}', 'story', 'Asha R', 'An audited story', 'A story long enough to render on the list for the accessibility audit.');
       insert into applications (user_id, cycle_id, status, decision) select '${STUDENT}', c.id, 'decided', 'admitted' from program_cycles c join programs p on p.id = c.program_id where p.slug = '${SLUG}' and c.is_current;`);
  sql(`update community_posts set status = 'published' where author_id = '${STUDENT}'`);
});
test.afterEach(cleanup);

test("community pages have no serious accessibility violations", async ({ browser }) => {
  const ama = sql(`select id from community_amas where title = 'E2E Audit AMA'`);
  const student = await signIn(browser, "student@uniguide.local");
  const found: string[] = [];
  for (const path of ["/community", "/community/stories", "/community/stories/new", "/community/ama", `/community/ama/${ama}`, `/courses/${SLUG}`]) {
    found.push(...(await audit(student, path)));
  }
  const admin = await signIn(browser, "admin@uniguide.local");
  found.push(...(await audit(admin, "/admin/community")));
  expect(found, found.join("\n")).toEqual([]);
});
