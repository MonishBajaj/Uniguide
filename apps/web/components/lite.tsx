"use client";

import Link from "next/link";
import { createContext, useContext, type ComponentProps } from "react";

const LiteContext = createContext(false);

export function LiteProvider({ lite, children }: { lite: boolean; children: React.ReactNode }) {
  return <LiteContext.Provider value={lite}>{children}</LiteContext.Provider>;
}

/** A Link that does not prefetch in low-bandwidth mode (15.3). */
export function AppLink(props: ComponentProps<typeof Link>) {
  const lite = useContext(LiteContext);
  return <Link {...props} prefetch={lite ? false : props.prefetch} />;
}
