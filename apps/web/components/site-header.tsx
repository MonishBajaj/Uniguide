import Link from "next/link";
import { headers } from "next/headers";
import { COMMUNITY_ENABLED, DEMO_SWITCHER } from "@/lib/env";
import { modeOf } from "@/lib/demo-mode";
import { getLocale } from "@/lib/i18n/server";
import { getRoles } from "@/lib/roles";
import { getUser } from "@/lib/supabase/server";
import { headerJourney } from "@/lib/journey-nav";
import { getJourney } from "@/lib/journey-request.server";
import { PATH_HEADER } from "@/lib/request-path";
import { StudentHeader } from "./journey/student-header";
import { ModeSwitcher } from "./mode-switcher";
import { NavLinks } from "./nav-links";

export async function SiteHeader() {
  const { supabase, user } = await getUser();
  const unread = user
    ? (await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)).count ?? 0
    : 0;
  const roles = await getRoles(supabase, user?.id);
  const mode = modeOf(Boolean(user), roles.parentOf.length > 0);
  const { t } = await getLocale();
  const accountEnd = DEMO_SWITCHER ? (
    <ModeSwitcher mode={mode} />
  ) : (
    <form action="/auth/signout" method="post">
      <button className="btn btn-secondary btn-sm w-full whitespace-nowrap">{t.nav.signOut}</button>
    </form>
  );

  // Students get the journey navigation (journey M2, J2.2). Staff, counselors and parents keep the site header.
  const staff = roles.admin || roles.verifier || roles.orgs.length > 0;
  if (user && mode === "user" && !staff) {
    const path = (await headers()).get(PATH_HEADER);
    const journey = await headerJourney(path, true, getJourney);
    return <StudentHeader journey={journey} t={t} unread={unread} accountEnd={accountEnd} />;
  }

  const links = [
    { href: "/courses", label: t.nav.courses },
    { href: "/requirements", label: t.nav.requirements },
    ...(mode === "parent" ? [{ href: "/parent", label: t.nav.myChild }] : []),
    ...(user && mode !== "parent"
      ? [
          { href: "/app/match", label: t.nav.matches },
          { href: "/app/shortlist", label: t.nav.shortlist },
          { href: "/app/tracker", label: t.nav.tracker },
          { href: "/app/offers", label: t.nav.offers },
          { href: "/app/writing", label: t.nav.writing },
          { href: "/app/profile", label: t.nav.profile },
          { href: "/app/notifications", label: unread ? t.nav.updatesCount(unread) : t.nav.updates },
        ]
      : []),
    ...(roles.admin || roles.verifier ? [{ href: "/admin/review", label: "Review queue" }, { href: "/admin/institution-facts", label: "Facts" }] : []),
    ...(roles.admin ? [{ href: "/admin/rules", label: "Rules" }, { href: "/admin/team", label: "Team" }, { href: "/admin/media", label: "Media" }, { href: "/admin/suggested", label: "Suggested" }] : []),
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
          {t.nav.display}
        </Link>
        {DEMO_SWITCHER ? (
          <ModeSwitcher mode={mode} />
        ) : user ? (
          <form action="/auth/signout" method="post">
            <button className="btn btn-secondary btn-sm whitespace-nowrap">{t.nav.signOut}</button>
          </form>
        ) : (
          <Link href="/login" className="btn btn-secondary btn-sm whitespace-nowrap">
            {t.nav.signIn}
          </Link>
        )}
      </nav>
    </header>
  );
}
