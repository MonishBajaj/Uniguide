"use client";

import { useActionState } from "react";
import { saveStory, type ActionState } from "../actions";

export function StoryAnswer({ id, question, hint, initial }: { id: string; question: string; hint: string; initial: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveStory.bind(null, id), null);
  return (
    <form action={action} className="grid gap-3 rounded-xl border border-border bg-surface p-6 ambient-shadow">
      <div>
        <label htmlFor={`q-${id}`} className="font-serif font-bold text-base text-primary block mb-1">{question}</label>
        <p className="text-xs text-muted leading-relaxed">{hint}</p>
      </div>
      <textarea id={`q-${id}`} name="answer" defaultValue={initial} rows={4} maxLength={4000} placeholder="Type your reflection…" className="field text-sm leading-relaxed" />
      <div className="flex items-center gap-3 pt-1">
        <button disabled={pending} className="btn btn-secondary btn-sm">{pending ? "Saving…" : "Save Note"}</button>
        {state ? <span role="status" className={`text-xs font-semibold ${state.ok ? "text-verified" : "text-conflicting"}`}>{state.message}</span> : null}
      </div>
    </form>
  );
}
