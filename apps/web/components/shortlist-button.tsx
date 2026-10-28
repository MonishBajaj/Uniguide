"use client";

import { useState, useTransition } from "react";
import { addToShortlist } from "@/app/app/shortlist/actions";

export const LOCAL_KEY = "uniguide:shortlist";

export function readLocalShortlist(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function saveLocally(programId: string) {
  try {
    const ids = new Set(readLocalShortlist());
    ids.add(programId);
    localStorage.setItem(LOCAL_KEY, JSON.stringify([...ids]));
    return true;
  } catch {
    return false;
  }
}

/** Signed in: saves to the account. Signed out: keeps the shortlist on this device until sign in. */
export function ShortlistButton({ programId, signedIn }: { programId: string; signedIn: boolean }) {
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onClick = () =>
    startTransition(async () => {
      if (!signedIn) {
        setSaved(saveLocally(programId));
        setMessage("Saved on this device. Sign in to keep it.");
        return;
      }
      const result = await addToShortlist(programId);
      if (result.ok) setSaved(true);
      else if (saveLocally(programId)) setSaved(true);
      setMessage(result.message ?? null);
    });

  return (
    <div className="grid gap-1">
      <button type="button" onClick={onClick} disabled={pending || saved} className="btn btn-secondary btn-sm">
        {saved ? "Shortlisted" : pending ? "Saving…" : "Add to shortlist"}
      </button>
      {message ? <p role="status" className="text-xs text-muted">{message}</p> : null}
    </div>
  );
}
