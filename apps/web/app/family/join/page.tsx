import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Join as a parent", robots: { index: false } };

/** Where a parent lands from a student's invite link. Signing in or up comes back here with the code. */
export default async function JoinPage({ searchParams }: PageProps<"/family/join">) {
  const code = (await searchParams).code;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: invite } = typeof code === "string" && /^[0-9a-fA-F]{12}$/.test(code)
    ? await supabase.rpc("parent_invite_info", { p_code: code }).maybeSingle()
    : { data: null };
  const back = encodeURIComponent(`/family/join?code=${code}`);

  return (
    <div className="mx-auto grid max-w-md gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold">Follow a student&apos;s applications</h1>
      {!invite || !invite.usable ? (
        <p className="rounded-2xl border border-border bg-surface p-6">
          This invite link has expired or was already used. Ask for a new one; they are made under Sharing in the
          student&apos;s account.
        </p>
      ) : (
        <div className="grid gap-4 rounded-2xl border border-border bg-surface p-6">
          <p>
            <span className="font-semibold">{invite.student_name}</span> invited you to follow their shortlist,
            applications, checklist and deadlines, read only, with a weekly email you can turn off. You will not
            see their grades, test scores or writing, and they can remove you at any time.
          </p>
          {user ? (
            <AcceptForm code={code as string} />
          ) : (
            <div className="grid gap-2">
              <p className="text-sm text-muted">Use your own account, not your child&apos;s.</p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/signup?next=${back}`} className="btn btn-primary">Create a parent account</Link>
                <Link href={`/login?next=${back}`} className="btn btn-secondary">Sign in</Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
