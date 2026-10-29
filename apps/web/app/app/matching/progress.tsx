"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { itemLabel, STAGES, stageIndex } from "@/lib/enrichment";
import { jobProgress, type Progress } from "./actions";

const TONE = { pending: "text-muted", working: "text-accent", ok: "text-verified", warn: "text-unverified" } as const;

export function ProgressView({ jobId, initial }: { jobId: string; initial: Progress }) {
  const [progress, setProgress] = useState(initial);
  const finished = progress.status === "done" || progress.status === "failed";

  useEffect(() => {
    if (finished) return;
    const timer = setInterval(async () => {
      const next = await jobProgress(jobId);
      if (next) setProgress(next);
    }, 2000);
    return () => clearInterval(timer);
  }, [jobId, finished]);

  const current = progress.status === "done" ? STAGES.length : stageIndex(progress.stage);
  return (
    <div className="grid gap-8">
      <ol aria-live="polite" className="grid gap-2">
        {STAGES.map((s, i) => {
          const state = i < current ? "done" : i === current ? "active" : "todo";
          return (
            <li key={s.key} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`inline-block size-3 rounded-full ${state === "done" ? "bg-verified" : state === "active" ? "bg-accent motion-safe:animate-pulse" : "bg-surface-2"}`}
              />
              <span className={state === "todo" ? "text-muted" : ""}>{s.label}</span>
              <span className="sr-only">{state === "done" ? " (done)" : state === "active" ? " (in progress)" : " (waiting)"}</span>
            </li>
          );
        })}
      </ol>

      {progress.status === "failed" ? (
        <p role="alert" className="text-conflicting">The search stopped before it finished. Try again from your profile page.</p>
      ) : null}
      {finished && progress.items.length === 0 && progress.status === "done" ? (
        <p className="text-muted">We could not find matching courses yet. Widen your countries or subjects on your profile and try again.</p>
      ) : null}

      <ul className="grid gap-3">
        {progress.items.map((item) => {
          const label = itemLabel(item.status);
          return (
            <li key={item.programId} className="rounded-2xl border border-border bg-surface p-4">
              <p className="font-semibold">{item.title}</p>
              <p className="text-sm text-muted">{item.institution}</p>
              <p className={`mt-1 text-sm ${TONE[label.tone]}`}>{label.text}</p>
              {item.status === "failed" && item.detail ? <p className="text-xs text-muted">{item.detail}</p> : null}
            </li>
          );
        })}
      </ul>

      {progress.status === "done" ? (
        <Link href="/app/match" className="btn btn-primary justify-self-start">See my matches</Link>
      ) : null}
    </div>
  );
}
