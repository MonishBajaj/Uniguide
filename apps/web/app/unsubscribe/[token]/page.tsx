import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

/** A button, not a GET, so link scanners that open the URL cannot unsubscribe anyone. */
export default async function UnsubscribePage({ params, searchParams }: PageProps<"/unsubscribe/[token]">) {
  const { token } = await params;
  const result = (await searchParams).result;

  async function unsubscribe(form: FormData) {
    "use server";
    const kind = String(form.get("kind") ?? "");
    const supabase = await createClient();
    const { data } = await supabase.rpc("unsubscribe", { p_token: token, p_kind: ["digest", "tips", "all"].includes(kind) ? kind : "all" });
    redirect(`/unsubscribe/${token}?result=${data ? "ok" : "invalid"}`);
  }

  if (result === "ok") {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-3xl font-semibold">You are unsubscribed</h1>
        <p className="mt-3 text-muted">We will not send you those emails. Deadline reminders you set up in your profile still arrive.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Unsubscribe from Uniguide emails</h1>
      {result === "invalid" ? (
        <p role="alert" className="mt-4 text-conflicting">This link is not valid. Use the link in your latest email.</p>
      ) : null}
      <form action={unsubscribe} className="mt-6 grid gap-3">
        <button name="kind" value="digest" className="btn btn-secondary justify-self-start">Stop the weekly digest</button>
        <button name="kind" value="tips" className="btn btn-secondary justify-self-start">Stop tips and reminders to come back</button>
        <button name="kind" value="all" className="btn btn-primary justify-self-start">Unsubscribe from all of these</button>
      </form>
      <p className="mt-6 text-sm text-muted">Deadline reminders are separate. You can change them in your profile.</p>
    </div>
  );
}
