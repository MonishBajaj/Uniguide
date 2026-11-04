import Link from "next/link";
import { headers } from "next/headers";
import { COMMUNITY_ENABLED, DEMO_SWITCHER } from "@/lib/env";
import { modeOf } from "@/lib/demo-mode";
import { getLocale } from "@/lib/i18n/server";
import { getRoles } from "@/lib/roles";
import { getUser } from "@/lib/supabase/server";
import { helpFor } from "@/lib/help";
import { headerJourney } from "@/lib/journey-nav";
import { getJourney } from "@/lib/journey-request.server";
import { PATH_HEADER } from "@/lib/request-path";
import { StudentHeader } from "./journey/student-header";
import { ModeSwitcher } from "./mode-switcher";
import { NavLinks } from "./nav-links";
import { GraduationCap } from "lucide-react";

export async function SiteHeader() {
  const { supabase, user } = await getUser();
  const unread = user
    ? (await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)).count ?? 0
    : 0;
  const roles = await getRoles(supabase, user?.id);
  const mode = modeOf(Boolean(user), roles.parentOf.length > 0);
  const { t, locale } = await getLocale();
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
    // "Ask about this course" in the help panel, on a catalogue application's page (J4.1).
    const appId = /^\/app\/tracker\/([0-9a-f-]{36})$/.exec(path ?? "")?.[1];
    const courseSlug = appId
      ? ((await supabase.from("applications").select("program_cycles(programs(slug))").eq("id", appId).maybeSingle()).data?.program_cycles?.programs?.slug ?? null)
      : null;
    return (
      <StudentHeader
        journey={journey}
        t={t}
        unread={unread}
        accountEnd={accountEnd}
        pageHelp={helpFor(path, locale)}
        courseSlug={courseSlug}
      />
    );
  }

  const links = [
    { href: "/courses", label: t.nav.courses },
    { href: "/requirements", label: t.nav.requirements },
    { href: "/visas", label: t.footer.visas },
    { href: "/compare/countries", label: "Compare" },
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
    ...(roles.admin ? [{ href: "/admin/rules", label: "Rules" }, { href: "/admin/ai-policies", label: "AI policies" }, { href: "/admin/team", label: "Team" }, { href: "/admin/media", label: "Media" }, { href: "/admin/suggested", label: "Suggested" }] : []),
    ...(roles.admin && COMMUNITY_ENABLED ? [{ href: "/admin/community", label: "Community" }] : []),
    ...(roles.orgs.length ? [{ href: "/agency", label: "Students" }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-surface/90 backdrop-blur-md transition-all print:hidden">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white shadow-sm transition-transform group-hover:scale-105">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span className="font-serif text-xl font-bold tracking-tight text-primary">
              UniGuide AI
            </span>
          </Link>
          <nav aria-label="Main" className="hidden lg:flex items-center gap-1 text-sm font-medium">
            <NavLinks links={links} />
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/accessibility"
            className="hidden sm:inline-flex rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:border-primary/40 hover:text-foreground transition-colors"
          >
            {t.nav.display}
          </Link>

          {DEMO_SWITCHER ? (
            <ModeSwitcher mode={mode} />
          ) : user ? (
            <form action="/auth/signout" method="post">
              <button className="btn btn-secondary btn-sm whitespace-nowrap">{t.nav.signOut}</button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="btn btn-secondary btn-sm whitespace-nowrap">
                {t.nav.signIn}
              </Link>
              <Link href="/signup" className="btn btn-coral-bright btn-sm whitespace-nowrap shadow-sm">
                Get Started Free
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
