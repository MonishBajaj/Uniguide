"use client";

import { useState, useTransition } from "react";
import { switchMode } from "@/app/mode/actions";
import type { ModePrompt as Prompt } from "@/lib/demo-mode";

/** Shown on the home page when a guest opens a signed-in page while sign-in is switched off. */
export function ModePrompt({ prompt, canSwitch }: { prompt: Prompt; canSwitch: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const label = prompt.mode === "parent" ? "Parent" : "User";

  return (
    <div role="status" className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-3 rounded-2xl border border-border bg-surface px-5 py-4 text-sm">
      {!canSwitch ? (
        <p>Sign-in is switched off right now, so {prompt.name} is not available.</p>
      ) : prompt.mode === null ? (
        <p>{prompt.name[0]!.toUpperCase() + prompt.name.slice(1)} need real sign-in. Set AUTH_DISABLED=false to use them.</p>
      ) : (
        <>
          <p>To open {prompt.name}, switch to {label} mode.</p>
          <button
            className="btn btn-primary btn-sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const message = await switchMode(prompt.mode!, prompt.from);
                if (message) setError(message);
              })
            }
          >
            {pending ? "Switching" : `Switch to ${label}`}
          </button>
          {error ? <p role="alert" className="w-full text-center text-conflicting">{error}</p> : null}
        </>
      )}
    </div>
  );
}
