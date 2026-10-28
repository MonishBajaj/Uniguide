import Link from "next/link";
import { redirect } from "next/navigation";
import { getRoles } from "@/lib/roles";
import { getUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  if ((await getRoles(supabase, user.id)).parentOf.length) redirect("/parent");
  const { data: profile } = await supabase.from("profiles").select("consent_state").eq("user_id", user.id).single();

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      {profile?.consent_state === "pending_parental" ? (
        <div role="status" className="mb-8 rounded-2xl bg-surface p-4 text-sm">
          A parent or guardian needs to confirm your account before we save grades, scores or a shortlist.{" "}
          <Link href="/consent" className="font-semibold underline underline-offset-2">Send them a request</Link>
        </div>
      ) : null}
      {children}
    </div>
  );
}
