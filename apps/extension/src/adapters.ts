// Adapters by portal origin. Store builds have none until a portal's gate clears (plan gates G1 to G7), so the
// content script, which is only injected on listed portal hosts, has nothing to work with.
import type { Adapter } from "@uniguide/portal-adapters";
import { practice } from "@uniguide/portal-adapters/practice";

// The build-time flag itself, not config's copy of it, so a store build drops the practice adapter entirely.
declare const __TEST_BUILD__: boolean;
const ADAPTERS: Adapter[] = __TEST_BUILD__ ? [practice] : [];

export function adapterFor(url: string): Adapter | null {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return null;
  }
  return ADAPTERS.find((a) => new URL(a.map.origin).origin === origin) ?? null;
}

export function adapterByPortal(portal: string): Adapter | null {
  return ADAPTERS.find((a) => a.portal === portal) ?? null;
}
