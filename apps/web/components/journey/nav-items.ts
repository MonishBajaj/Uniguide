import type { NavSection } from "@/lib/journey-nav";

/** One link in the journey navigation. `reached` is null when the stage isn't known (public pages). */
export interface NavItem {
  section: NavSection;
  href: string;
  label: string;
  reached: boolean | null;
  badge: { count: number; label: string } | null;
}
