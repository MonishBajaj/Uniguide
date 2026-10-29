"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { GLOSSARY, glossaryAnchor, type TermId } from "@/lib/glossary";
import { useT } from "./locale";

/**
 * Jargon with its plain meaning on demand (15.1). A button and a span, so it can sit inside a
 * sentence (a <details> cannot live in a <p>). Enter or Space opens it, Escape closes it.
 */
export function Term({ id, children }: { id: TermId; children?: React.ReactNode }) {
  const entry = GLOSSARY[id];
  const t = useT();
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <span className="relative inline-block" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((o) => !o)}
        className="cursor-help underline decoration-dotted underline-offset-4"
      >
        {children ?? entry.term}
      </button>
      {open ? (
        <span id={panel} role="note" className="absolute top-full left-0 z-30 mt-2 block w-72 rounded-xl border border-border bg-surface p-3 text-left text-sm font-normal text-foreground normal-case shadow-lg">
          <span className="block font-semibold">{entry.term}{"expansion" in entry ? `: ${entry.expansion}` : ""}</span>
          <span className="mt-1 block text-muted">{t.glossary[id]}</span>
          <Link href={`/guide#${glossaryAnchor(id)}`} className="mt-2 inline-block underline underline-offset-2">{t.guide.moreInGuide}</Link>
        </span>
      ) : null}
    </span>
  );
}
