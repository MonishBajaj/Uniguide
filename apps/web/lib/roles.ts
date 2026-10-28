import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Staff roles for navigation and page guards. RLS and the RPCs enforce them; this only decides what to show. */
export async function getRoles(supabase: Supabase, userId: string | undefined) {
  if (!userId) return { admin: false, verifier: null, orgs: [] as { id: string; name: string }[], parentOf: [] as { student_id: string; student_name: string }[] };
  const [{ data: admin }, { data: verifier }, { data: orgs }, { data: parentOf }] = await Promise.all([
    supabase.from("admins").select("user_id").eq("user_id", userId).maybeSingle(),
    supabase.from("verifiers").select("display_name, countries").eq("user_id", userId).eq("active", true).maybeSingle(),
    supabase.from("org_members").select("organizations(id, name)").eq("user_id", userId),
    supabase.from("parent_links").select("student_id, student_name").eq("parent_id", userId).is("revoked_at", null),
  ]);
  return {
    admin: Boolean(admin),
    verifier,
    parentOf: parentOf ?? [],
    orgs: (orgs ?? []).flatMap((m) => (m.organizations ? [m.organizations] : [])),
  };
}
