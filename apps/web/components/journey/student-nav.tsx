"use client";

import { usePathname } from "next/navigation";
import { AppLink as Link } from "@/components/lite";
import { navSection } from "@/lib/journey-nav";
import type { NavItem } from "./nav-items";

/** Desktop journey navigation (spec 6.1). Sections not reached yet are quieter, but still links. */
export function StudentNav({ items, label, notReached }: { items: NavItem[]; label: string; notReached: string }) {
  const current = navSection(usePathname());
  return (
    <ul aria-label={label} className="flex items-center gap-6">
      {items.map((item) => {
        const isCurrent = item.section === current;
        const quiet = item.reached === false;
        return (
          <li key={item.section}>
            <Link
              href={item.href}
              aria-current={isCurrent ? "page" : undefined}
              className={`inline-flex items-center gap-2 py-1.5 text-sm whitespace-nowrap transition-all duration-200 border-b-2 ${
                isCurrent
                  ? "border-secondary font-bold text-primary"
                  : `border-transparent hover:text-primary ${quiet ? "text-muted/70 hover:text-muted" : "text-muted hover:text-primary"}`
              }`}
            >
              <span>{item.label}</span>
              {quiet ? <span className="sr-only"> ({notReached})</span> : null}
              {item.badge ? (
                <>
                  <span
                    aria-hidden="true"
                    className="flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-xs font-bold text-white shadow-xs"
                  >
                    {item.badge.count}
                  </span>
                  <span className="sr-only">, {item.badge.label}</span>
                </>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
