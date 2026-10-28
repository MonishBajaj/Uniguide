"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { matchPrograms, type FxTable, type ProgramInput, type StudentProfile, type Weights } from "@uniguide/matching";

type Names = Record<string, { title: string; institution: string; slug: string }>;

export function WhatIf({ programs, student, weights, fx, names }: { programs: ProgramInput[]; student: StudentProfile; weights: Weights; fx: FxTable; names: Names }) {
  const [now] = useState(() => new Date());
  const [grade, setGrade] = useState(student.gradeValue ?? null);
  const [budget, setBudget] = useState(student.budget?.amount ?? null);
  const ielts = student.testScores?.find((s) => s.exam === "ielts_academic");
  const [ieltsScore, setIelts] = useState<number | null>(ielts?.total ?? null);

  const changed: StudentProfile = useMemo(() => {
    const scores = (student.testScores ?? []).filter((s) => s.exam !== "ielts_academic");
    if (ieltsScore != null) {
      // A what-if IELTS score counts every section at the same band.
      const band = ieltsScore;
      scores.push({ exam: "ielts_academic", total: band, takenOn: now.toISOString().slice(0, 10), sections: { reading: band, writing: band, listening: band, speaking: band } });
    }
    return {
      ...student,
      gradeValue: grade,
      budget: budget != null && student.budget ? { ...student.budget, amount: budget } : student.budget,
      testScores: scores,
    };
  }, [student, grade, budget, ieltsScore, now]);

  const ctx = { now, fx };
  const before = useMemo(() => matchPrograms(programs, student, ctx, weights).results, [programs, student, weights]); // eslint-disable-line react-hooks/exhaustive-deps
  const after = useMemo(() => matchPrograms(programs, changed, ctx, weights).results, [programs, changed, weights]); // eslint-disable-line react-hooks/exhaustive-deps
  const wasIn = new Set(before.filter((r) => !r.excluded).map((r) => r.programId));
  const isIn = new Set(after.filter((r) => !r.excluded).map((r) => r.programId));
  const gained = [...isIn].filter((id) => !wasIn.has(id));
  const lost = [...wasIn].filter((id) => !isIn.has(id));

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <form className="grid content-start gap-4 rounded-2xl bg-surface p-5 text-sm" onSubmit={(e) => e.preventDefault()}>
        <label className="grid gap-2 font-semibold">
          Grade ({student.gradeScale ?? "no scale set"})
          <input type="number" step="0.1" value={grade ?? ""} onChange={(e) => setGrade(e.target.value === "" ? null : Number(e.target.value))} className="field font-normal" disabled={!student.gradeScale} />
        </label>
        <label className="grid gap-2 font-semibold">
          Budget ({student.budget?.currency ?? "not set"})
          <input type="number" step="1000" value={budget ?? ""} onChange={(e) => setBudget(e.target.value === "" ? null : Number(e.target.value))} className="field font-normal" disabled={!student.budget} />
        </label>
        <label className="grid gap-2 font-semibold">
          IELTS Academic overall: {ieltsScore ?? "none"}
          <input type="range" min={4} max={9} step={0.5} value={ieltsScore ?? 6} onChange={(e) => setIelts(Number(e.target.value))} className="accent-[var(--accent)]" />
        </label>
        <p className="text-muted">Courses that fit: {wasIn.size} now, {isIn.size} with these changes.</p>
      </form>
      <div className="grid content-start gap-4">
        {gained.length ? (
          <section aria-labelledby="gained" className="rounded-2xl bg-surface p-5 text-sm">
            <h2 id="gained" className="font-semibold text-verified">Would open up ({gained.length})</h2>
            <ul className="mt-2 grid gap-1">{gained.slice(0, 20).map((id) => <li key={id}><Link href={`/courses/${names[id]!.slug}`} className="underline underline-offset-2">{names[id]!.title}</Link>, {names[id]!.institution}</li>)}</ul>
          </section>
        ) : null}
        {lost.length ? (
          <section aria-labelledby="lost" className="rounded-2xl bg-surface p-5 text-sm">
            <h2 id="lost" className="font-semibold text-conflicting">Would drop out ({lost.length})</h2>
            <ul className="mt-2 grid gap-1">
              {lost.slice(0, 20).map((id) => (
                <li key={id}>{names[id]!.title}, {names[id]!.institution}: <span className="text-muted">{after.find((r) => r.programId === id)?.exclusions.map((e) => e.reason).join(" ")}</span></li>
              ))}
            </ul>
          </section>
        ) : null}
        {!gained.length && !lost.length ? <p className="rounded-2xl bg-surface p-5 text-sm text-muted">No course moves in or out with these numbers.</p> : null}
        <section aria-labelledby="top" className="rounded-2xl bg-surface p-5 text-sm">
          <h2 id="top" className="font-semibold">Top courses with these numbers</h2>
          <ol className="mt-2 grid gap-1">
            {after.filter((r) => !r.excluded).slice(0, 10).map((r) => {
              const was = before.find((b) => b.programId === r.programId)?.fit.score;
              const delta = r.fit.score != null && was != null ? r.fit.score - was : 0;
              return (
                <li key={r.programId}>
                  {names[r.programId]!.title}, {names[r.programId]!.institution}: {r.fit.score ?? "n/a"}
                  {delta ? <span className={delta > 0 ? "text-verified" : "text-conflicting"}> ({delta > 0 ? "+" : ""}{delta})</span> : null}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}
