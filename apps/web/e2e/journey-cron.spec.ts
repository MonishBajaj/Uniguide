import { expect, test } from "@playwright/test";
import { STUDENT, expectStored, resetStudent, sql } from "./helpers";

// Journey M1 (J1.7): the daily recompute route the scheduled workflow calls.
test("the daily journey recompute refuses requests without its token", async ({ request }) => {
  expect((await request.post("/api/cron/journeys")).status()).toBe(401);
  expect((await request.post("/api/cron/journeys", { headers: { authorization: "Bearer wrong-token" } })).status()).toBe(401);
});

test("with the token it stores the journey of every recently active student", async ({ request }) => {
  resetStudent();
  // The seed student has no subjects (the seed default), so matching still needs something: stage 1.
  sql(`update profiles set target_fields = '{}' where user_id = '${STUDENT}';
       update auth.users set last_sign_in_at = now() where id = '${STUDENT}';
       delete from journey_state where user_id = '${STUDENT}';
       delete from journey_events where user_id = '${STUDENT}'`);

  // Page through every due student, as the workflow does.
  let after: string | null = null;
  for (let page = 0; page < 50; page++) {
    const res = await request.post(`/api/cron/journeys${after ? `?after=${after}` : ""}`, {
      headers: { authorization: "Bearer local-journey-token" },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { processed: number; failed: number; next: string | null };
    expect(body.failed).toBe(0);
    after = body.next;
    if (!after) break;
  }

  await expectStored(`select stage || '|' || (engine_version ~ '^journey-[0-9]+\\.[0-9]+\\.[0-9]+$') from journey_state where user_id = '${STUDENT}'`, "1|true");
  await expectStored(`select steps -> 0 ->> 'id' from journey_state where user_id = '${STUDENT}'`, "S1.01");
  await expectStored(`select stage_progress ->> 'label' from journey_state where user_id = '${STUDENT}'`, "4 of 5 profile details added");
  await expectStored(`select count(*) from journey_events where user_id = '${STUDENT}' and kind = 'stage_entered' and stage = 1`, "1");
});
