import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { shortDate } from "@/lib/format";
import { getRoles } from "@/lib/roles";
import { getUser } from "@/lib/supabase/server";
import { addMember, addOrganization, addVerifier, setVerifierActive } from "./actions";

export const metadata: Metadata = { title: "Verifiers and organisations" };

export default async function TeamPage({ searchParams }: PageProps<"/admin/team">) {
  const { supabase, user } = await getUser();
  if (!(await getRoles(supabase, user!.id)).admin) notFound();
  const { message } = (await searchParams) as { message?: string };
  const [{ data: tally }, { data: verifiers }, { data: orgs }] = await Promise.all([
    supabase.rpc("verifier_tally"),
    supabase.from("verifiers").select("user_id, active"),
    supabase.from("organizations").select("id, name, country, invite_code, org_members(role, user_id), agency_shares(id, revoked_at)").order("name"),
  ]);
  const active = new Map((verifiers ?? []).map((v) => [v.user_id, v.active]));

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-6 py-12">
      <header>
        <h1 className="text-4xl font-semibold">Verifiers and organisations</h1>
        {message ? <p role="status" className="mt-3 rounded-lg border border-border bg-surface p-3 text-sm">{message}</p> : null}
      </header>

      <section aria-labelledby="verifiers" className="grid gap-4">
        <h2 id="verifiers" className="text-2xl font-semibold">Country verifiers</h2>
        <p className="max-w-2xl text-sm text-muted">Verifiers review proposed facts for courses in their countries only. Their tally counts courses with at least one fact they verified.</p>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className="p-3">Verifier</th>
                <th scope="col" className="p-3">Countries</th>
                <th scope="col" className="p-3">Approved</th>
                <th scope="col" className="p-3">Rejected</th>
                <th scope="col" className="p-3">Courses verified</th>
                <th scope="col" className="p-3">Last review</th>
                <th scope="col" className="p-3"><span className="sr-only">Access</span></th>
              </tr>
            </thead>
            <tbody>
              {(tally ?? []).map((t) => (
                <tr key={t.user_id} className="border-t border-border">
                  <td className="p-3 font-semibold">{t.display_name}</td>
                  <td className="p-3">{t.countries.join(", ")}</td>
                  <td className="p-3">{t.approved}</td>
                  <td className="p-3">{t.rejected}</td>
                  <td className="p-3">{t.courses_verified}</td>
                  <td className="p-3">{t.last_review ? shortDate(t.last_review) : "Never"}</td>
                  <td className="p-3">
                    <form action={setVerifierActive.bind(null, t.user_id, !active.get(t.user_id))}>
                      <button className="btn btn-secondary btn-sm">{active.get(t.user_id) ? "Pause" : "Resume"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={addVerifier} className="grid gap-3 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">Account email<input name="email" type="email" required className="field" /></label>
          <label className="grid gap-1 text-sm">Name shown on reviews<input name="name" required maxLength={120} className="field" /></label>
          <label className="grid gap-1 text-sm">Countries (comma separated)<input name="countries" required placeholder="DE, AT" className="field" /></label>
          <button className="btn btn-primary justify-self-start">Add verifier</button>
        </form>
      </section>

      <section aria-labelledby="orgs" className="grid gap-4">
        <h2 id="orgs" className="text-2xl font-semibold">Consultancies</h2>
        <p className="max-w-2xl text-sm text-muted">
          Counselors see a student only after the student enters the organisation&apos;s invite code and agrees to share. Students can stop sharing at any time.
        </p>
        <ul className="grid gap-3">
          {(orgs ?? []).map((o) => (
            <li key={o.id} className="grid gap-3 rounded-2xl border border-border bg-surface p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">{o.name}{o.country ? ` · ${o.country}` : ""}</h3>
                <span className="text-sm">Invite code <code className="rounded bg-background px-2 py-1 font-mono">{o.invite_code}</code></span>
              </div>
              <p className="text-sm text-muted">
                {o.org_members.length} member{o.org_members.length === 1 ? "" : "s"} · {o.agency_shares.filter((s) => !s.revoked_at).length} students sharing
              </p>
              <form action={addMember.bind(null, o.id)} className="flex flex-wrap gap-2">
                <label className="sr-only" htmlFor={`m-${o.id}`}>Member email</label>
                <input id={`m-${o.id}`} name="email" type="email" required placeholder="counselor@agency.com" className="field max-w-xs" />
                <label className="sr-only" htmlFor={`r-${o.id}`}>Role</label>
                <select id={`r-${o.id}`} name="role" className="field max-w-[160px]">
                  <option value="counselor">Counselor</option>
                  <option value="owner">Owner</option>
                </select>
                <button className="btn btn-secondary">Add member</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addOrganization} className="grid gap-3 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">Name<input name="name" required maxLength={160} className="field" /></label>
          <label className="grid gap-1 text-sm">Country (two letters)<input name="country" maxLength={2} className="field" /></label>
          <label className="grid gap-1 text-sm">Website<input name="website" type="url" className="field" /></label>
          <button className="btn btn-primary justify-self-start">Add organisation</button>
        </form>
      </section>
    </div>
  );
}
