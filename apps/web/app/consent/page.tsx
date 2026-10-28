import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = { title: "Ask a parent to confirm", robots: { index: false } };

export default async function ConsentPage() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login?next=/consent");
  const { data: profile } = await supabase.from("profiles").select("consent_state").eq("user_id", user.id).single();
  if (profile?.consent_state !== "pending_parental") redirect("/app/profile");

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold">Ask a parent or guardian to confirm</h1>
      <p className="mt-3 text-muted">
        Where you live, the law asks a parent or guardian to agree before we store your grades, test scores and
        shortlist. Until then you can browse courses and keep a shortlist on this device.
      </p>
      <div className="mt-8">
        <ConsentForm />
      </div>
      <p className="mt-6 text-sm text-muted">
        <Link href="/courses" className="underline underline-offset-2">Browse courses meanwhile</Link>
      </p>
    </div>
  );
}
