"use server";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { POLICY_VERSION, SITE_URL } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { createClient, getUser } from "@/lib/supabase/server";

export type ConsentState = { ok: boolean; message: string } | null;

export async function requestParentalConsent(_prev: ConsentState, form: FormData): Promise<ConsentState> {
  const email = z.email().max(254).safeParse(String(form.get("parent_email") ?? "").trim());
  if (!email.success) return { ok: false, message: "Enter your parent or guardian's email address." };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, message: "Sign in first." };
  if (email.data.toLowerCase() === user.email?.toLowerCase()) {
    return { ok: false, message: "Use your parent or guardian's own email address, not yours." };
  }

  // The token goes only into the email; the database keeps its hash.
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const { error } = await supabase.rpc("request_parental_consent", { p_parent_email: email.data, p_token_hash: hash });
  if (error) {
    return { ok: false, message: error.message.includes("Too many") ? "Too many requests today. Try again tomorrow." : "Could not send the request." };
  }

  const link = `${SITE_URL}/consent/parent/${token}`;
  const result = await sendEmail(
    email.data,
    "Please confirm your child's Uniguide account",
    [
      "Your child has created a Uniguide account to research courses and application deadlines abroad.",
      "Before we store their grades, test scores or shortlist, we need a parent or guardian to agree.",
      "",
      `Read what we store and confirm here (the link works once, for 7 days): ${link}`,
      "",
      "If you did not expect this email, ignore it and nothing will be stored.",
    ].join("\n"),
  );
  if (result === "failed") return { ok: false, message: "We could not send the email. Try again later." };
  return {
    ok: true,
    message:
      result === "logged"
        ? `Development mode: the email was written to the server log. Link: ${link}`
        : `We emailed ${email.data}. Your account unlocks as soon as they confirm.`,
  };
}

export async function confirmParentalConsent(token: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("confirm_parental_consent", { p_token: token, p_policy_version: POLICY_VERSION });
  return data === true;
}
