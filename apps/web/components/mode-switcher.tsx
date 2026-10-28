"use client";

import { useRef, useState, useTransition } from "react";
import { switchMode } from "@/app/mode/actions";
import type { Mode } from "@/lib/demo-mode";

const OPTIONS: { mode: Mode; name: string; hint: string }[] = [
  { mode: "guest", name: "Guest", hint: "Not signed in" },
  { mode: "user", name: "User", hint: "Student account" },
  { mode: "parent", name: "Parent", hint: "Read-only view of a student" },
];

/** Navbar menu for the demo modes. A native <details> keeps it keyboard and screen-reader friendly. */
export function ModeSwitcher({ mode }: { mode: Mode }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <details ref={menu} className="relative">
      <summary
        aria-label={`Viewing as ${mode}. Switch mode`}
        className="btn btn-secondary btn-sm cursor-pointer list-none whitespace-nowrap [&::-webkit-details-marker]:hidden"
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
        </svg>
        <span className="capitalize">{mode}</span>
      </summary>
      <ul role="menu" aria-label="Switch mode" className="absolute right-0 top-full z-50 mt-2 grid w-56 gap-1 rounded-2xl border border-border bg-background p-2 shadow-lg">
        {OPTIONS.map((o) => (
          <li key={o.mode} role="none">
            <button
              role="menuitemradio"
              aria-checked={o.mode === mode}
              disabled={pending || o.mode === mode}
              onClick={() => {
                setError(null);
                start(async () => {
                  const message = await switchMode(o.mode);
                  if (message) setError(message);
                  else menu.current?.removeAttribute("open");
                });
              }}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors duration-300 hover:bg-surface disabled:cursor-default ${o.mode === mode ? "bg-surface font-semibold" : ""}`}
            >
              {o.name}
              <span className="block text-xs font-normal text-muted">{o.hint}</span>
            </button>
          </li>
        ))}
        {error ? <li role="alert" className="px-3 py-2 text-xs text-conflicting">{error}</li> : null}
      </ul>
    </details>
  );
}
