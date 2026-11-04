"use client";

import { AppLink as Link } from "./lite";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex items-center gap-6">
      {links.map((link) => {
        const current = pathname === link.href || (link.href !== "/" && pathname.startsWith(`${link.href}/`));
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={current ? "page" : undefined}
              className={`text-sm whitespace-nowrap transition-all duration-200 py-1 border-b-2 ${
                current
                  ? "font-bold text-primary border-secondary"
                  : "text-muted hover:text-primary border-transparent"
              }`}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
