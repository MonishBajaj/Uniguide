"use client";

import { useActionState } from "react";
import { addLink, type PortfolioState } from "./actions";

export function LinkForm() {
  const [state, action, pending] = useActionState<PortfolioState, FormData>(addLink, null);
  return (
    <form action={action} aria-label="Add a link" className="grid gap-3 rounded-2xl border border-border bg-surface p-5 text-sm">
      <h2 className="text-lg font-semibold">Add a link</h2>
      <label className="grid gap-1 font-semibold">
        Link
        <input name="url" type="url" required placeholder="https://" className="field font-normal" />
      </label>
      <label className="grid gap-1 font-semibold">
        Title
        <input name="title" required maxLength={120} className="field font-normal" />
      </label>
      <label className="grid gap-1 font-semibold">
        What it shows (optional)
        <textarea name="description" maxLength={1000} rows={2} className="field font-normal" />
      </label>
      {state ? <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-verified" : "text-conflicting"}>{state.message}</p> : null}
      <button disabled={pending} className="btn btn-secondary justify-self-start">{pending ? "Adding…" : "Add link"}</button>
    </form>
  );
}
