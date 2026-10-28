import Link from "next/link";
import { getRoles } from "@/lib/roles";
import { getUser } from "@/lib/supabase/server";
import { NavLinks } from "./nav-links";

export async function SiteHeader() {
  const { supabase, user } = await getUser();
  const unread = user
    ? (await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)).count ?? 0
    : 0;
  const roles = await getRoles(supabase, user?.id);

  const links = [
    { href: "/courses", label: "Courses" },
    { href: "/requirements", label: "Requirements table" },
    ...(user
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
    ...(roles.orgs.length ? [{ href: "/agency", label: "Students" }] : []),
  ];

  return (
    <header className="sticky top-3 z-40 flex justify-center px-4 pt-3">
      <nav
        aria-label="Main"
        className="flex max-w-full items-center gap-4 overflow-x-auto rounded-2xl border border-border bg-background/80 px-4 py-2 backdrop-blur-md"
      >
        <Link href="/" className="text-base font-semibold whitespace-nowrap">
          Uniguide
        </Link>
        <NavLinks links={links} />
        {user ? (
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
