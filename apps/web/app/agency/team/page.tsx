import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { addMember, removeMember } from "./actions";

export const metadata: Metadata = { title: "Your team" };

export default async function TeamPage() {
  const { supabase, user } = await getUser();
  const { data: mine } = await supabase.from("org_members").select("org_id, role, organizations(name)").eq("user_id", user!.id).eq("role", "owner");
  if (!mine || mine.length === 0) notFound();
  const { data: members } = await supabase.from("org_members").select("org_id, user_id, role").in("org_id", mine.map((m) => m.org_id));

  return (
    <div className="mx-auto grid max-w-3xl gap-8 px-6 py-12">
      <header>
        <Link href="/agency" className="text-sm text-muted underline underline-offset-2">Your students</Link>
        <h1 className="mt-2 text-4xl font-semibold">Your team</h1>
        <p className="mt-2 text-muted">Owners add and remove members. Counselors and owners can read what students share and export it. Viewers can read only. The person needs a Uniguide account first.</p>
      </header>
      {mine.map((org) => (
        <section key={org.org_id} aria-labelledby={`org-${org.org_id}`} className="grid gap-4">
          <h2 id={`org-${org.org_id}`} className="text-2xl font-semibold">{org.organizations?.name}</h2>
          <ul className="grid gap-2">
            {(members ?? []).filter((m) => m.org_id === org.org_id).map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
                <span>Member ending {m.user_id.slice(-6)} · {m.role}{m.user_id === user!.id ? " (you)" : ""}</span>
                <form action={removeMember.bind(null, org.org_id, m.user_id)}><button className="btn btn-secondary btn-sm">Remove</button></form>
              </li>
            ))}
          </ul>
          <form action={addMember} className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[1fr_160px_auto]">
            <input type="hidden" name="org" value={org.org_id} />
            <label className="grid gap-1 text-sm">Email<input name="email" type="email" required className="field" /></label>
            <label className="grid gap-1 text-sm">Role
              <select name="role" className="field"><option value="counselor">Counselor</option><option value="viewer">Viewer</option><option value="owner">Owner</option></select>
            </label>
            <button className="btn btn-primary self-end">Add</button>
          </form>
        </section>
      ))}
    </div>
  );
}
