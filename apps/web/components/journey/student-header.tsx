import { AppLink as Link } from "@/components/lite";
import type { Dict } from "@/lib/i18n/en";
import { type HeaderJourney, reachedSections, type NavSection } from "@/lib/journey-nav";
import { AccountMenu } from "./account-menu";
import { BottomBar } from "./bottom-bar";
import { HelpButton, HelpDialog } from "./help-dialog";
import { HelpContent, type HelpCopy } from "./help-panel";
import type { NavItem } from "./nav-items";
import { StudentNav } from "./student-nav";
import { GraduationCap, Sparkles } from "lucide-react";

const HREFS: Record<Exclude<NavSection, "account">, string> = {
  home: "/app",
  explore: "/app/match",
  shortlist: "/app/shortlist",
  applications: "/app/tracker",
  offers: "/app/offers",
  departure: "/app/departure",
};

/**
 * The header for signed-in students (journey M2, J2.2): the journey's sections on desktop, a bottom
 * bar on phones, the "Get help" panel (M4, J4.1) and the account menu. Staff, parents and guests keep
 * the site header.
 */
export function StudentHeader({
  journey,
  t,
  unread,
  accountEnd,
  pageHelp,
  courseSlug,
}: {
  journey: HeaderJourney;
  t: Dict;
  unread: number;
  /** This page's help, as HTML from content/help. */
  pageHelp: string | null;
  /** The catalogue course of the application this page shows, for "Ask about this course". */
  courseSlug: string | null;
  /** Sign out, or the demo mode switcher. */
  accountEnd: React.ReactNode;
}) {
  const nav = t.journey.nav;
  const reached = journey.stage ? reachedSections(journey.stage) : null;
  const items: NavItem[] = (Object.keys(HREFS) as (keyof typeof HREFS)[]).map((section) => ({
    section,
    href: HREFS[section],
    label: nav[section],
    reached: reached ? reached.includes(section) : null,
    badge: section === "applications" ? journey.badge : null,
  }));
  const stage = journey.stage ? t.journey.stages[String(journey.stage) as keyof typeof t.journey.stages] : null;
  const help: HelpCopy = {
    heading: journey.stage && stage ? nav.helpStage(journey.stage, stage.name) : nav.help,
    explainer: stage,
    labels: t.journey.explainer,
    noStage: nav.helpNoStage,
    guide: nav.guide,
    glossary: nav.glossary,
    onThisPage: nav.onThisPage,
    askCourse: nav.askCourse,
    inviteParent: nav.inviteParent,
    shareCounselor: nav.shareCounselor,
  };

  const account = (
    <AccountMenu
      label={nav.account}
      items={[
        { href: "/app/profile", label: t.nav.profile },
        { href: "/app/sharing", label: nav.sharing },
        { href: "/app/notifications", label: unread ? t.nav.updatesCount(unread) : t.nav.updates },
        { href: "/accessibility", label: t.nav.display },
      ]}
      end={null}
    />
  );

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-surface/90 backdrop-blur-md transition-all print:hidden">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Link href="/app" className="flex items-center gap-2.5 group">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white shadow-sm transition-transform group-hover:scale-105">
                <GraduationCap className="h-5 w-5" />
              </span>
              <span className="font-serif text-xl font-bold tracking-tight text-primary leading-none">
                Uniguide
              </span>
            </Link>

            <nav aria-label={nav.main} className="hidden md:block">
              <StudentNav items={items} label={nav.label} notReached={nav.notReached} />
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Phones open help from the bottom bar. */}
            <div className="hidden md:block">
              <HelpButton className="btn btn-secondary btn-sm gap-1.5 whitespace-nowrap border-border hover:border-primary/40 hover:text-primary">
                <Sparkles className="h-3.5 w-3.5 text-secondary" />
                <span>{nav.help}</span>
              </HelpButton>
            </div>
            {accountEnd}
            {account}
          </div>
        </div>
      </header>

      <BottomBar items={items} labels={{ nav: nav.label, help: nav.help, more: nav.more, close: nav.close, notReached: nav.notReached }} />
      <HelpDialog title={nav.helpTitle} close={nav.close}>
        <HelpContent copy={help} pageHelp={pageHelp} courseSlug={courseSlug} />
      </HelpDialog>
    </>
  );
}
