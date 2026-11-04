import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";
import { PATH_HEADER } from "@/lib/request-path";
import { getRoles } from "@/lib/roles";
import { getUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  if ((await getRoles(supabase, user.id)).parentOf.length) redirect("/parent");
  const { data: profile } = await supabase.from("profiles").select("consent_state").eq("user_id", user.id).single();
  const [{ t }, path] = await Promise.all([getLocale(), headers().then((h) => h.get(PATH_HEADER))]);
  // On the home the S1.06 step card says this already (journey M2, N16).
  const pendingBanner = profile?.consent_state === "pending_parental" && path !== "/app";
  const isProfile = path === "/app/profile";

  if (isProfile) {
    return (
      <div className="w-full bg-[#F7F6F2] min-h-[calc(100vh-64px)] print:p-0">
        {pendingBanner ? (
          <div role="status" className="mx-auto max-w-[1200px] px-6 pt-6 mb-2">
            <div className="rounded-xl border border-secondary/40 bg-[#ffdad3]/40 p-4 text-sm ambient-shadow">
              A parent or guardian needs to confirm your account before we save grades, scores or a shortlist.{" "}
              <Link href="/consent" className="font-semibold text-secondary underline underline-offset-2">Send them a request</Link>
            </div>
          </div>
        ) : null}
        {profile?.consent_state === "revoked" ? (
          <div role="status" className="mx-auto max-w-[1200px] px-6 pt-6 mb-2">
            <div className="rounded-xl border border-conflicting/40 bg-[#ffdad6]/40 p-4 text-sm ambient-shadow">
              {t.journey.home.revoked}
            </div>
          </div>
        ) : null}
        {children}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8 print:max-w-none print:p-0">
      {pendingBanner ? (
        <div role="status" className="mb-6 rounded-xl border border-secondary/40 bg-[#ffdad3]/40 p-4 text-sm ambient-shadow">
          A parent or guardian needs to confirm your account before we save grades, scores or a shortlist.{" "}
          <Link href="/consent" className="font-semibold text-secondary underline underline-offset-2">Send them a request</Link>
        </div>
      ) : null}
      {profile?.consent_state === "revoked" ? (
        <div role="status" className="mb-6 rounded-xl border border-conflicting/40 bg-[#ffdad6]/40 p-4 text-sm ambient-shadow">
          {t.journey.home.revoked}
        </div>
      ) : null}
      {children}
    </div>
  );
}
