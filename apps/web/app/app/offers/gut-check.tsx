"use client";

import { useState, useTransition } from "react";
import { REACTIONS, type Reaction } from "@/lib/decision-day";
import { recordGutCheck } from "./actions";

/**
 * A coin flip picks one offer at random; the student notes how that felt. The reaction is the point,
 * not the coin, so nothing here ever recommends an offer.
 */
export function GutCheck({ offers }: { offers: { id: string; title: string }[] }) {
  const [picked, setPicked] = useState<{ id: string; title: string } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-3">
      <button
        type="button"
        className="btn btn-secondary justify-self-start"
        onClick={() => {
          setSaved(null);
          setPicked(offers[Math.floor(Math.random() * offers.length)] ?? null);
        }}
      >
        {picked ? "Flip again" : "Flip a coin"}
      </button>
      {picked ? (
        <div role="status" className="grid gap-3 rounded-xl bg-background p-4">
          <p>
            The coin picked <span className="font-semibold">{picked.title}</span>. How does that feel, before you think about it?
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(REACTIONS) as Reaction[]).map((r) => (
              <button
                key={r}
                type="button"
                disabled={pending || saved !== null}
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  start(async () => {
                    const { ok } = await recordGutCheck({ application_id: picked.id, reaction: r });
                    setSaved(ok ? `Noted: ${REACTIONS[r].toLowerCase()}.` : "Could not save that.");
                  })
                }
              >
                {REACTIONS[r]}
              </button>
            ))}
          </div>
          {saved ? <p className="text-sm text-muted">{saved}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
