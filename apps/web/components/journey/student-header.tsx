import Link from "next/link";
import type { Dict } from "@/lib/i18n/en";
import { type HeaderJourney, reachedSections, type NavSection } from "@/lib/journey-nav";
import { BottomBar } from "./bottom-bar";
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
 * bar on phones, a small "Get help" panel and the account menu. Staff, parents and guests keep the
 * site header.
 */
export function StudentHeader({
  journey,
  t,
  unread,
  accountEnd,
}: {
  journey: HeaderJourney;
  t: Dict;
  unread: number;
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
  };

  const account = (
    <details className="relative">
      <summary className="btn btn-secondary btn-sm cursor-pointer list-none whitespace-nowrap [&::-webkit-details-marker]:hidden">
        {nav.account}
      </summary>
      <ul className="absolute right-0 z-50 mt-2 grid w-56 gap-1 rounded-xl border border-border bg-surface p-2 text-sm shadow-lg">
        <li><Link href="/app/profile" className="block rounded-lg px-3 py-2 hover:bg-surface-2">{t.nav.profile}</Link></li>
        <li><Link href="/app/sharing" className="block rounded-lg px-3 py-2 hover:bg-surface-2">{nav.sharing}</Link></li>
        <li>
          <Link href="/app/notifications" className="block rounded-lg px-3 py-2 hover:bg-surface-2">
            {unread ? t.nav.updatesCount(unread) : t.nav.updates}
          </Link>
        </li>
        <li><Link href="/accessibility" className="block rounded-lg px-3 py-2 hover:bg-surface-2">{t.nav.display}</Link></li>
        <li className="border-t border-border px-1 pt-2">{accountEnd}</li>
      </ul>
    </details>
  );

  return (
    <>
      <header className="sticky top-3 z-40 flex justify-center px-4 pt-3 print:hidden">
        <nav aria-label="Main" className="flex max-w-full items-center gap-4 rounded-2xl border border-border bg-surface/80 px-4 py-2 backdrop-blur-md">
          <Link href="/app" className="text-base font-semibold whitespace-nowrap">
            Uniguide
          </Link>
          <div className="hidden min-w-0 overflow-x-auto [scrollbar-width:none] md:block [&::-webkit-scrollbar]:hidden">
            <StudentNav items={items} label={nav.label} notReached={nav.notReached} />
          </div>
          <details className="relative hidden md:block">
            <summary className="btn btn-secondary btn-sm cursor-pointer list-none whitespace-nowrap [&::-webkit-details-marker]:hidden">{nav.help}</summary>
            <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-border bg-surface p-4 shadow-lg">
              <HelpContent copy={help} />
            </div>
          </details>
          {account}
        </nav>
      </header>
      <BottomBar
        items={items}
        help={<HelpContent copy={help} />}
        labels={{ nav: nav.label, help: nav.help, more: nav.more, close: nav.close, notReached: nav.notReached }}
      />
    </>
  );
}
