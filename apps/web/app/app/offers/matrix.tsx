"use client";

import { useState, useTransition } from "react";
import { saveMatrix } from "./actions";

type Criterion = { id: string; label: string; weight: number };
type Scores = Record<string, Record<string, number>>;

/** Weighted total on a 0-100 scale; unscored criteria count as missing, not as zero. */
export function weightedTotal(criteria: Criterion[], scores: Record<string, number> | undefined) {
  let sum = 0;
  let weight = 0;
  for (const c of criteria) {
    const s = scores?.[c.id];
    if (s == null) continue;
    sum += ((s - 1) / 4) * c.weight;
    weight += c.weight;
  }
  return { total: weight ? Math.round((sum / weight) * 100) : null, scored: criteria.filter((c) => scores?.[c.id] != null).length };
}

export function DecisionMatrix({
  offers,
  initialCriteria,
  initialScores,
}: {
  offers: { id: string; title: string }[];
  initialCriteria: Criterion[];
  initialScores: Scores;
}) {
  const [criteria, setCriteria] = useState(initialCriteria);
  const [scores, setScores] = useState(initialScores);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  const setScore = (offer: string, criterion: string, value: string) =>
    setScores((prev) => {
      const row = { ...prev[offer] };
      if (value) row[criterion] = Number(value);
      else delete row[criterion];
      return { ...prev, [offer]: row };
    });

  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">Your decision matrix: criteria, weights and a score from 1 to 5 for each offer</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-3 font-semibold">What matters to you</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Weight</th>
              {offers.map((o) => <th key={o.id} scope="col" className="py-2 pr-3 font-semibold">{o.title}</th>)}
              <th scope="col"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {criteria.map((c, i) => (
              <tr key={c.id} className="border-b border-border">
                <td className="py-2 pr-3">
                  <label className="sr-only" htmlFor={`label-${c.id}`}>Criterion {i + 1}</label>
                  <input id={`label-${c.id}`} value={c.label} maxLength={80} className="field"
                    onChange={(e) => setCriteria(criteria.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)))} />
                </td>
                <td className="py-2 pr-3">
                  <label className="sr-only" htmlFor={`weight-${c.id}`}>Weight of {c.label}</label>
                  <select id={`weight-${c.id}`} value={c.weight} className="field"
                    onChange={(e) => setCriteria(criteria.map((x) => (x.id === c.id ? { ...x, weight: Number(e.target.value) } : x)))}>
                    {[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </td>
                {offers.map((o) => (
                  <td key={o.id} className="py-2 pr-3">
                    <label className="sr-only" htmlFor={`s-${o.id}-${c.id}`}>{c.label} for {o.title}</label>
                    <select id={`s-${o.id}-${c.id}`} value={scores[o.id]?.[c.id] ?? ""} className="field"
                      onChange={(e) => setScore(o.id, c.id, e.target.value)}>
                      <option value="">Not scored</option>
                      {[1, 2, 3, 4, 5].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                ))}
                <td className="py-2">
                  <button type="button" className="btn btn-secondary btn-sm" aria-label={`Remove ${c.label}`}
                    onClick={() => setCriteria(criteria.filter((x) => x.id !== c.id))}>Remove</button>
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="py-3 pr-3 font-semibold" colSpan={2}>Your weighted total (0 to 100)</th>
              {offers.map((o) => {
                const { total, scored } = weightedTotal(criteria, scores[o.id]);
                return (
                  <td key={o.id} className="py-3 pr-3">
                    <span className="text-xl font-semibold">{total ?? "?"}</span>
                    {scored < criteria.length ? <span className="block text-xs text-muted">{scored} of {criteria.length} scored</span> : null}
                  </td>
                );
              })}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-secondary" disabled={criteria.length >= 12}
          onClick={() => setCriteria([...criteria, { id: `c${Date.now().toString(36)}`, label: "New criterion", weight: 3 }])}>
          Add a criterion
        </button>
        <button type="button" className="btn btn-primary" disabled={pending}
          onClick={() => start(async () => setMessage((await saveMatrix({ criteria, scores })).message))}>
          {pending ? "Saving" : "Save matrix"}
        </button>
        <p role="status" className="text-sm text-muted">{message}</p>
      </div>
    </div>
  );
}
