"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { nextIntakeYear } from "@/lib/next-intake";

/**
 * "Plan for {year}" (journey M5, J5.4, G20 and G21): keeps the profile and shortlist, moves the intake on by a
 * year and records when, so this round's rejections stop counting for the journey. The tracker keeps them.
 */
export async function planNextIntake(): Promise<void> {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  const [{ data: profile }, { data: rejected }] = await Promise.all([
    supabase.from("profiles").select("intake_year").eq("user_id", user.id).single(),
    supabase.from("applications").select("program_cycles(intake_year)").eq("user_id", user.id).eq("decision", "rejected"),
  ]);
  const years = (rejected ?? []).flatMap((a) => (a.program_cycles?.intake_year ? [a.program_cycles.intake_year] : []));
  await supabase
    .from("profiles")
    .update({ intake_year: nextIntakeYear(profile?.intake_year ?? null, years, new Date()), intake_rolled_at: new Date().toISOString() })
    .eq("user_id", user.id);
  revalidatePath("/app", "layout");
  redirect("/app");
}
