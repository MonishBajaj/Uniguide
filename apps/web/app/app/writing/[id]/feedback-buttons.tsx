"use client";

import { useActionState } from "react";
import { compareLatest, requestReview, type ActionState } from "../actions";

export function FeedbackButtons({ documentId, canCompare, freeReview }: { documentId: string; canCompare: boolean; freeReview: boolean }) {
  const [review, reviewAction, reviewing] = useActionState<ActionState>(requestReview.bind(null, documentId), null);
  const [compare, compareAction, comparing] = useActionState<ActionState>(compareLatest.bind(null, documentId), null);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={reviewAction}>
          <button disabled={reviewing} className="btn btn-secondary btn-sm">
            {reviewing ? "Reading your draft…" : freeReview ? "Get feedback (free)" : "Get feedback (1 credit)"}
          </button>
        </form>
        {canCompare ? (
          <form action={compareAction}>
            <button disabled={comparing} className="btn btn-secondary btn-sm">{comparing ? "Comparing…" : "Compare with previous draft (1 credit)"}</button>
          </form>
        ) : null}
      </div>
      {[review, compare].map((s, i) => s ? <p key={i} role="status" className={`text-sm ${s.ok ? "text-verified" : "text-conflicting"}`}>{s.message}</p> : null)}
    </div>
  );
}
