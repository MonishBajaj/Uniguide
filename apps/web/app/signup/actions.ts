"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ageFromBirthMonth } from "@/lib/age";
import { isCountryCode } from "@/lib/countries";
import { POLICY_VERSION, SITE_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type SignupState = { message: string; done?: boolean } | null;

const UNDER_13_COOKIE = "uniguide_age_block";
const UNDER_13 = "Sorry, Uniguide accounts are for people aged 13 and over. You can still browse courses without an account.";

const Form = z.object({
  birth_month: z.string().regex(/^\d{4}-\d{2}$/),
  residence_country: z.string().refine(isCountryCode),
  email: z.email().max(254),
  password: z.string().min(8).max(72),
  terms: z.literal("on"),
});

export async function signUp(_prev: SignupState, form: FormData): Promise<SignupState> {
  const cookieStore = await cookies();
  if (cookieStore.get(UNDER_13_COOKIE)) return { message: UNDER_13 };

  const birthMonth = `${form.get("birth_year")}-${String(form.get("birth_month")).padStart(2, "0")}`;
  const parsed = Form.safeParse({
    birth_month: birthMonth,
    residence_country: form.get("residence_country"),
    email: String(form.get("email") ?? "").trim(),
    password: form.get("password"),
    terms: form.get("terms"),
  });
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0]);
    const messages: Record<string, string> = {
      birth_month: "Choose the month and year you were born.",
      residence_country: "Choose the country you live in.",
      email: "Enter a valid email address.",
      password: "Use a password of at least 8 characters.",
      terms: "Please accept the terms and privacy policy.",
    };
    return { message: messages[field] ?? "Check the form and try again." };
  }

  // Age is decided on the server. Under-13s are stopped before anything is sent to Supabase Auth,
  // and nothing about them is stored except a short-lived cookie that blocks an immediate retry.
  const age = ageFromBirthMonth(parsed.data.birth_month);
  if (age == null || age > 120) return { message: "Choose the month and year you were born." };
  if (age < 13) {
    cookieStore.set(UNDER_13_COOKIE, "1", { maxAge: 60 * 60, httpOnly: true, sameSite: "lax", path: "/" });
    return { message: UNDER_13 };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${SITE_URL}/auth/callback?next=/app/profile`,
      data: {
        birth_month: parsed.data.birth_month,
        residence_country: parsed.data.residence_country,
        accepted_policy_version: POLICY_VERSION,
      },
    },
  });
  if (error) return { message: "We could not create the account. If you already have one, sign in instead." };
  if (!data.session) return { done: true, message: "Check your email for a link to confirm your account." };

  const { data: profile } = await supabase.from("profiles").select("consent_state").eq("user_id", data.user!.id).single();
  redirect(profile?.consent_state === "pending_parental" ? "/consent" : "/app/profile");
}
