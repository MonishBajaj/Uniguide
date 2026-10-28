"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/age";
import { createClient } from "@/lib/supabase/server";

export async function signIn(_prev: string | null, form: FormData): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
  });
  if (error) return "That email and password do not match an account.";
  redirect(safeNext(form.get("next")));
}
