"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppLink as Link } from "@/components/lite";

/**
 * The student's account menu (journey M2). Profile, sharing, updates and display settings make up
 * the "account" section of spec 6.1, so the page you're on is marked here, and the menu reads bold.
 */
export function AccountMenu({ label, items, end }: { label: string; items: { href: string; label: string }[]; end: ReactNode }) {
  const path = usePathname();
  const current = items.find((i) => path === i.href || path.startsWith(`${i.href}/`))?.href;
  return (
    <details className="relative">
      <summary className={`btn btn-secondary btn-sm cursor-pointer list-none whitespace-nowrap [&::-webkit-details-marker]:hidden ${current ? "underline decoration-accent decoration-2 underline-offset-4" : ""}`}>
        {label}
      </summary>
      <ul className="absolute right-0 z-50 mt-2 grid w-56 gap-1 rounded-xl border border-border bg-surface p-2 text-sm shadow-lg">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={i.href === current ? "page" : undefined}
              className={`block rounded-lg px-3 py-2 hover:bg-surface-2 ${i.href === current ? "bg-surface-2 font-semibold" : ""}`}
            >
              {i.label}
            </Link>
          </li>
        ))}
        <li className="border-t border-border px-1 pt-2">{end}</li>
      </ul>
    </details>
  );
}
