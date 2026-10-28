"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Signup = z.object({
  email: z.email().max(254),
  residence_country: z.string().regex(/^[A-Z]{2}$/).nullable(),
  destination_countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(20),
  target_level: z.enum(["foundation", "diploma", "bachelor", "master", "doctorate"]),
  field: z.string().trim().max(120).nullable(),
  interest: z.enum(["verified_tracker", "writing_coach"]),
  confirmed_13_plus: z.literal(true),
  utm: z.record(z.string(), z.string().max(200)),
});

export type WaitlistState = { ok: boolean; message: string } | null;

export async function joinWaitlist(_prev: WaitlistState, form: FormData): Promise<WaitlistState> {
  const parsed = Signup.safeParse({
    email: String(form.get("email") ?? "").trim(),
    residence_country: form.get("residence_country") || null,
    destination_countries: form.getAll("destination_countries").map(String),
    target_level: form.get("target_level"),
    field: String(form.get("field") ?? "").trim() || null,
    interest: form.get("interest"),
    confirmed_13_plus: form.get("confirmed_13_plus") === "on",
    utm: Object.fromEntries(
      ["utm_source", "utm_medium", "utm_campaign"].flatMap((k) => (form.get(k) ? [[k, String(form.get(k))]] : [])),
    ),
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const messages: Record<string, string> = {
      email: "Enter a valid email address.",
      target_level: "Choose the level you want to study.",
      interest: "Choose which tool you want first.",
      confirmed_13_plus: "Please confirm you are 13 or older.",
    };
    return { ok: false, message: messages[String(field)] ?? "Check the form and try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("signups").insert(parsed.data);
  if (error && error.code !== "23505") {
    return { ok: false, message: "We could not save your signup. Please try again in a minute." };
  }
  return {
    ok: true,
    message: error ? "You are already on the list. We will email you when it opens." : "You are on the list. We will email you when it opens.",
  };
}
