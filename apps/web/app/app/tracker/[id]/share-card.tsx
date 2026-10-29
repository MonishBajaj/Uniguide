"use client";

import { useState } from "react";

/** Preview and download the card; the name box only changes the image link. */
export function ShareCard({ applicationId }: { applicationId: string }) {
  const [name, setName] = useState("");
  const base = `/app/tracker/${applicationId}/share-card`;
  const query = name.trim() ? `?name=${encodeURIComponent(name.trim())}` : "";
  return (
    <div className="grid gap-3">
      <label className="grid max-w-sm gap-1 text-sm font-semibold">
        Name on the card (optional, not saved)
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="field font-normal" />
      </label>
      {/* eslint-disable-next-line @next/next/no-img-element -- a generated image, not a static asset */}
      <img src={`${base}${query}`} alt="Your I got in card: the course, university and intake" width={600} height={315} className="w-full max-w-[600px] rounded-xl border border-border" />
      <a href={`${base}${query ? `${query}&` : "?"}download=1`} className="btn btn-primary justify-self-start">Download the card</a>
    </div>
  );
}
