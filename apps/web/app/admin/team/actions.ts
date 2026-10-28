"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Authorisation lives in RLS and the RPCs (admins only).

const back = (message: string) => redirect(`/admin/team?message=${encodeURIComponent(message)}`);

export async function addVerifier(form: FormData) {
  const input = z
    .object({ email: z.email(), name: z.string().trim().min(1).max(120), countries: z.string() })
    .safeParse({ email: form.get("email"), name: form.get("name"), countries: form.get("countries") });
  const countries = (input.data?.countries ?? "").split(",").map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));
  if (!input.success || countries.length === 0) back("Give an email, a name and at least one two letter country code.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_verifier", { p_email: input.data!.email, p_display_name: input.data!.name, p_countries: countries });
  revalidatePath("/admin/team");
  back(error ? error.message : `${input.data!.name} can now review ${countries.join(", ")}.`);
}

export async function setVerifierActive(userId: string, active: boolean) {
  const supabase = await createClient();
  await supabase.from("verifiers").update({ active }).eq("user_id", userId);
  revalidatePath("/admin/team");
}

export async function addOrganization(form: FormData) {
  const input = z
    .object({
      name: z.string().trim().min(2).max(160),
      country: z.string().regex(/^[A-Za-z]{2}$/).or(z.literal("")),
      website: z.url().or(z.literal("")),
    })
    .safeParse({ name: form.get("name"), country: form.get("country"), website: form.get("website") });
  if (!input.success) back("An organisation needs a name; the country is two letters and the website a full URL.");
  const supabase = await createClient();
  const { error } = await supabase.from("organizations").insert({
    name: input.data!.name,
    country: input.data!.country ? input.data!.country.toUpperCase() : null,
    website: input.data!.website || null,
  });
  revalidatePath("/admin/team");
  back(error ? error.message : `Added ${input.data!.name}.`);
}

export async function addMember(orgId: string, form: FormData) {
  const email = z.email().safeParse(form.get("email"));
  const role = form.get("role") === "owner" ? "owner" : "counselor";
  if (!email.success) back("Enter the counselor's account email.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_org_member", { p_org: orgId, p_email: email.data!, p_role: role });
  revalidatePath("/admin/team");
  back(error ? error.message : `Added ${email.data}.`);
}
