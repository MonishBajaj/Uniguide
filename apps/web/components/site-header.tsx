import Link from "next/link";
import { COMMUNITY_ENABLED, DEMO_SWITCHER } from "@/lib/env";
import { modeOf } from "@/lib/demo-mode";
import { getRoles } from "@/lib/roles";
import { getUser } from "@/lib/supabase/server";
import { ModeSwitcher } from "./mode-switcher";
import { NavLinks } from "./nav-links";

export async function SiteHeader() {
  const { supabase, user } = await getUser();
  const unread = user
    ? (await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)).count ?? 0
    : 0;
  const roles = await getRoles(supabase, user?.id);
  const mode = modeOf(Boolean(user), roles.parentOf.length > 0);

  const links = [
    { href: "/courses", label: "Courses" },
    { href: "/requirements", label: "Requirements table" },
    ...(mode === "parent" ? [{ href: "/parent", label: "My child" }] : []),
    ...(user && mode !== "parent"
      ? [
          { href: "/app/match", label: "My matches" },
          { href: "/app/shortlist", label: "Shortlist" },
          { href: "/app/tracker", label: "Tracker" },
          { href: "/app/offers", label: "Offers" },
          { href: "/app/writing", label: "Writing" },
          { href: "/app/profile", label: "Profile" },
          { href: "/app/notifications", label: unread ? `Updates (${unread})` : "Updates" },
        ]
      : []),
    ...(roles.admin || roles.verifier ? [{ href: "/admin/review", label: "Review queue" }] : []),
    ...(roles.admin ? [{ href: "/admin/rules", label: "Rules" }, { href: "/admin/team", label: "Team" }] : []),
    ...(roles.admin && COMMUNITY_ENABLED ? [{ href: "/admin/community", label: "Community" }] : []),
    ...(roles.orgs.length ? [{ href: "/agency", label: "Students" }] : []),
  ];

  return (
    <header className="sticky top-3 z-40 flex justify-center px-4 pt-3 print:hidden">
      <nav
        aria-label="Main"
        className="flex max-w-full items-center gap-4 rounded-2xl border border-border bg-surface/80 px-4 py-2 backdrop-blur-md"
      >
        <Link href="/" className="text-base font-semibold whitespace-nowrap">
          Uniguide
        </Link>
        <div className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <NavLinks links={links} />
        </div>
        <Link href="/accessibility" className="btn btn-secondary btn-sm whitespace-nowrap">
          Display
        </Link>
        {DEMO_SWITCHER ? (
          <ModeSwitcher mode={mode} />
        ) : user ? (
          <form action="/auth/signout" method="post">
            <button className="btn btn-secondary btn-sm whitespace-nowrap">Sign out</button>
          </form>
        ) : (
          <Link href="/login" className="btn btn-secondary btn-sm whitespace-nowrap">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
