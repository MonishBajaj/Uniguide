"use client";

import { useState } from "react";
import { shareLink } from "./actions";

/** Makes a 7-day link on request, so links are never created for nothing. */
export function ShareButton({ id, title }: { id: string; title: string }) {
  const [url, setUrl] = useState<string | null>(null);
  return url ? (
    <label className="grid gap-1 text-xs text-muted">
      Link for 7 days
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="field py-1 text-xs" aria-label={`Share link for ${title}`} />
    </label>
  ) : (
    <button type="button" onClick={async () => setUrl(await shareLink(id))} className="btn btn-secondary btn-sm">Get share link</button>
  );
}
