"use client";

import { useActionState } from "react";
import { reportOutdated, type ReportState } from "@/app/courses/actions";

export function ReportForm({ programId, facts }: { programId: string; facts: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<ReportState, FormData>(reportOutdated.bind(null, programId), null);
  if (state?.ok) return <p role="status" className="text-sm text-verified">{state.message}</p>;
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-2 text-sm font-semibold">
        Which fact? (optional)
        <select name="fact" defaultValue="" className="field font-normal">
          <option value="">Something else on this page</option>
          {facts.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        What does the official page say now?
        <textarea name="message" required minLength={5} maxLength={2000} rows={3} className="field font-normal" />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        Link to the official page (optional)
        <input name="evidence_url" type="url" placeholder="https://" className="field font-normal" />
      </label>
      {state ? <p role="alert" className="text-sm text-conflicting">{state.message}</p> : null}
      <button disabled={pending} className="btn btn-secondary justify-self-start">{pending ? "Sending…" : "Send report"}</button>
    </form>
  );
}
