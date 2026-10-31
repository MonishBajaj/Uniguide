"use client";

import { useRef } from "react";

export const HELP_ID = "help-panel";

/**
 * The "Get help" panel (journey M4, J4.1): a modal dialog, from the right on desktop and from the bottom
 * on phones. The browser keeps focus inside while it's open, closes it on Escape and returns focus to
 * the button that opened it.
 */
export function HelpDialog({ title, close, children }: { title: string; close: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <dialog
      ref={ref}
      id={HELP_ID}
      aria-labelledby={`${HELP_ID}-title`}
      // A click on the backdrop, or following a link in the panel, closes it.
      onClick={(e) => {
        if (e.target === ref.current || (e.target as HTMLElement).closest("a")) ref.current?.close();
      }}
      className="m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-border bg-surface p-0 text-foreground shadow-lg backdrop:bg-black/40 md:mt-0 md:ml-auto md:h-dvh md:max-h-dvh md:w-[400px] md:rounded-none md:rounded-l-2xl print:hidden"
    >
      <div className="grid gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id={`${HELP_ID}-title`} className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={() => ref.current?.close()} className="btn btn-secondary btn-sm">
            {close}
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Opens the help panel. Used in the header and in the phone's bottom bar. */
export function HelpButton({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-controls={HELP_ID}
      onClick={() => (document.getElementById(HELP_ID) as HTMLDialogElement | null)?.showModal()}
      className={className}
    >
      {children}
    </button>
  );
}
