"use client";

import { AppLink as Link } from "./lite";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex items-center gap-4">
      {links.map((link) => {
        const current = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={current ? "page" : undefined}
              className={`text-sm whitespace-nowrap transition-colors duration-300 ${current ? "font-semibold text-foreground" : "text-muted hover:text-foreground"}`}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
