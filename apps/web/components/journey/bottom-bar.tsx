"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppLink as Link } from "@/components/lite";
import { navSection, type NavSection } from "@/lib/journey-nav";
import { HelpButton } from "./help-dialog";
import type { NavItem } from "./nav-items";

const ICONS: Record<"home" | "explore" | "applications" | "help" | "more", ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  explore: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  applications: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" />
    </>
  ),
  more: <path d="M4 7h16M4 12h16M4 17h16" />,
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

const IN_MORE: NavSection[] = ["shortlist", "offers", "departure"];

/**
 * Phone navigation (spec 6.1): Home, Explore, Applications, Help and More, fixed to the bottom.
 * More opens a sheet above the bar; Escape or a tap outside closes it. Help opens the help panel (J4.1).
 */
export function BottomBar({
  items,
  labels,
}: {
  items: NavItem[];
  labels: { nav: string; help: string; more: string; close: string; notReached: string };
}) {
  const current = navSection(usePathname());
  const [open, setOpen] = useState<"more" | null>(null);
  const bar = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    const onClick = (e: MouseEvent) => bar.current && !bar.current.contains(e.target as Node) && setOpen(null);
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  const item = (section: NavSection) => items.find((i) => i.section === section)!;
  const tab = "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] leading-tight";
  const link = (section: "home" | "explore" | "applications") => {
    const it = item(section);
    const isCurrent = current === section;
    return (
      <li key={section} className="relative">
        <Link href={it.href} aria-current={isCurrent ? "page" : undefined} className={`${tab} ${isCurrent ? "font-semibold text-accent" : it.reached === false ? "text-muted" : "text-foreground"}`}>
          <Icon name={section} />
          <span>{it.label}</span>
          {it.reached === false ? <span className="sr-only"> ({labels.notReached})</span> : null}
          {it.badge ? (
            <>
              <span aria-hidden="true" className="absolute top-0.5 left-1/2 ml-1.5 min-w-4.5 rounded-full bg-conflicting px-1 text-center text-[10px] leading-4.5 font-semibold text-white">
                {it.badge.count}
              </span>
              <span className="sr-only">, {it.badge.label}</span>
            </>
          ) : null}
        </Link>
      </li>
    );
  };
  const toggle = (name: "more", icon: "more", text: string, active = false) => (
    <li>
      <button
        type="button"
        aria-expanded={open === name}
        aria-controls={`bottom-${name}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(open === name ? null : name);
        }}
        className={`${tab} w-full ${open === name || active ? "font-semibold text-accent" : "text-foreground"}`}
      >
        <Icon name={icon} />
        <span>{text}</span>
      </button>
    </li>
  );

  return (
    <nav
      ref={bar}
      data-bottom-bar
      aria-label={labels.nav}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
    >
      {open ? (
        <div
          id={`bottom-${open}`}
          // Following a link in the sheet closes it.
          onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(null)}
          className="absolute inset-x-0 bottom-full max-h-[70vh] overflow-y-auto rounded-t-2xl border border-b-0 border-border bg-surface p-5 shadow-lg"
        >
          <div className="mb-3 flex justify-end">
            <button type="button" onClick={() => setOpen(null)} className="btn btn-secondary btn-sm">
              {labels.close}
            </button>
          </div>
          <ul className="grid gap-1">
            {IN_MORE.map((section) => {
              const it = item(section);
              return (
                <li key={section}>
                  <Link
                    href={it.href}
                    aria-current={current === section ? "page" : undefined}
                    className={`flex min-h-12 items-center rounded-lg px-3 ${current === section ? "bg-surface-2 font-semibold" : it.reached === false ? "text-muted" : ""}`}
                  >
                    {it.label}
                    {it.reached === false ? <span className="sr-only"> ({labels.notReached})</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <ul className="grid grid-cols-5 px-1 pt-1">
        {link("home")}
        {link("explore")}
        {link("applications")}
        <li>
          <HelpButton className={`${tab} w-full text-foreground`}>
            <Icon name="help" />
            <span>{labels.help}</span>
          </HelpButton>
        </li>
        {toggle("more", "more", labels.more, current != null && IN_MORE.includes(current))}
      </ul>
    </nav>
  );
}
