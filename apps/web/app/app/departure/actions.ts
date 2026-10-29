"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";

const done = () => revalidatePath("/app", "layout");

/** Marks the offer the student is taking; null clears the choice. */
export async function setAcceptedOffer(applicationId: string | null) {
  const { supabase } = await getUser();
  await supabase.rpc("set_accepted_offer", { p_application_id: applicationId as string });
  done();
}

export async function setTaskDone(applicationId: string, key: string, isDone: boolean) {
  if (!z.string().regex(/^([a-z_]{1,40}|rule:[0-9a-f-]{36})$/).safeParse(key).success) return;
  const { supabase, user } = await getUser();
  if (isDone) await supabase.from("departure_tasks").insert({ user_id: user!.id, application_id: applicationId, task_key: key });
  else await supabase.from("departure_tasks").delete().eq("application_id", applicationId).eq("task_key", key);
  done();
}
