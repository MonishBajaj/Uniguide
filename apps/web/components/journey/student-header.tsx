import Link from "next/link";
import type { Dict } from "@/lib/i18n/en";
import { type HeaderJourney, reachedSections, type NavSection } from "@/lib/journey-nav";
import { AccountMenu } from "./account-menu";
import { BottomBar } from "./bottom-bar";
import { HelpButton, HelpDialog } from "./help-dialog";
import { HelpContent, type HelpCopy } from "./help-panel";
import type { NavItem } from "./nav-items";
import { StudentNav } from "./student-nav";

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
      end={accountEnd}
    />
  );

  return (
    <>
      <header className="sticky top-3 z-40 flex justify-center px-4 pt-3 print:hidden">
        <nav aria-label={nav.main} className="flex max-w-full items-center gap-4 rounded-2xl border border-border bg-surface/80 px-4 py-2 backdrop-blur-md">
          <Link href="/app" className="text-base font-semibold whitespace-nowrap">
            Uniguide
          </Link>
          <div className="hidden min-w-0 overflow-x-auto [scrollbar-width:none] md:block [&::-webkit-scrollbar]:hidden">
            <StudentNav items={items} label={nav.label} notReached={nav.notReached} />
          </div>
          {/* Phones open help from the bottom bar. */}
          <div className="hidden md:block">
            <HelpButton className="btn btn-secondary btn-sm whitespace-nowrap">{nav.help}</HelpButton>
          </div>
          {account}
        </nav>
      </header>
      <BottomBar items={items} labels={{ nav: nav.label, help: nav.help, more: nav.more, close: nav.close, notReached: nav.notReached }} />
      <HelpDialog title={nav.helpTitle} close={nav.close}>
        <HelpContent copy={help} pageHelp={pageHelp} courseSlug={courseSlug} />
      </HelpDialog>
    </>
  );
}
