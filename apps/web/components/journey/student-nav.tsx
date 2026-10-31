"use client";

import { usePathname } from "next/navigation";
import { AppLink as Link } from "@/components/lite";
import { navSection } from "@/lib/journey-nav";
import type { NavItem } from "./nav-items";

/** Desktop journey navigation (spec 6.1). Sections not reached yet are quieter, but still links. */
export function StudentNav({ items, label, notReached }: { items: NavItem[]; label: string; notReached: string }) {
  const current = navSection(usePathname());
  return (
    <ul aria-label={label} className="flex items-center gap-4">
      {items.map((item) => {
        const isCurrent = item.section === current;
        const quiet = item.reached === false;
        return (
          <li key={item.section}>
            <Link
              href={item.href}
              aria-current={isCurrent ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 border-b-2 py-1 text-sm whitespace-nowrap transition-colors duration-300 ${
                isCurrent ? "border-accent font-semibold text-foreground" : `border-transparent hover:text-foreground ${quiet ? "text-muted" : "text-foreground"}`
              }`}
            >
              {item.label}
              {quiet ? <span className="sr-only"> ({notReached})</span> : null}
              {item.badge ? (
                <>
                  <span aria-hidden="true" className="min-w-5 rounded-full bg-conflicting px-1.5 text-center text-xs leading-5 font-semibold text-white">
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
