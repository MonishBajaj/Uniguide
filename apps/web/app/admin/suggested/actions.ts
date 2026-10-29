"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Authorisation lives in the database: review_suggested_course refuses anyone who is not an admin.
export async function reviewSuggestion(programId: string, approve: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_suggested_course", { p_program: programId, p_approve: approve });
  if (error) throw new Error(error.code === "P0002" ? "That suggestion was already decided." : error.message);
  revalidatePath("/admin/suggested");
}
