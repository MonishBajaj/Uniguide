"use client";

import { useState, useTransition } from "react";
import { askAboutCourse, type AskResult } from "@/app/courses/ask";

const STATUS: Record<string, string> = { verified: "verified", unverified: "unverified", conflicting: "sources disagree" };

export function CourseQuestion({ programId }: { programId: string }) {
  const [result, setResult] = useState<AskResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <section aria-labelledby="ask" className="mt-12 rounded-2xl border border-border bg-surface p-6">
      <h2 id="ask" className="text-lg font-semibold">Ask about this course</h2>
      <p className="mt-1 text-sm text-muted">Answers use only the facts on this page and link each one to its source.</p>
      <form
        className="mt-4 flex flex-wrap gap-2"
        action={(form) => start(async () => setResult(await askAboutCourse(programId, String(form.get("q") ?? ""))))}
      >
        <label htmlFor="ask-q" className="sr-only">Question</label>
        <input id="ask-q" name="q" required minLength={5} maxLength={500} placeholder="For example: Do I need the GRE?" className="field max-w-md" />
        <button disabled={pending} className="btn btn-secondary">{pending ? "Checking…" : "Ask"}</button>
      </form>
      {result ? (
        <div role="status" className="mt-4 grid gap-2 text-sm">
          {!result.ok ? <p className="text-conflicting">{result.message}</p> : null}
          {result.ok && !result.answered ? (
            <p>
              This is not in our verified information yet.{" "}
              {result.officialUrl ? <a href={result.officialUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">Check the official page</a> : "Check the official page."}
            </p>
          ) : null}
          {result.sentences?.map((s, i) => (
            <p key={i}>
              {s.text}{" "}
              {s.citations.map((c, j) =>
                c.source ? (
                  <a key={j} href={c.source.url} target="_blank" rel="noreferrer" className="text-xs text-muted underline underline-offset-2">
                    [{c.source.owner}, {STATUS[c.status] ?? c.status}]
                  </a>
                ) : null,
              )}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
