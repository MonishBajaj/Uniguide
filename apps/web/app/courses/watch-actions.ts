"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/supabase/server";

/** Starts or stops watching a course for changes. Row-level security decides who may; a minor pending consent cannot. */
export async function setWatch(programId: string, watch: boolean): Promise<string | null> {
  const { supabase, user } = await getUser();
  if (!user) return "Sign in to watch a course.";
  const { error } = watch
    ? await supabase.from("watches").insert({ user_id: user.id, program_id: programId })
    : await supabase.from("watches").delete().eq("user_id", user.id).eq("program_id", programId);
  if (error && error.code !== "23505") return "Could not save that. A parent or guardian may need to confirm your account first.";
  revalidatePath("/courses", "layout");
  return null;
}
