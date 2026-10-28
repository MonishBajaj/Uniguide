"use client";

import { useActionState } from "react";
import { saveStory, type ActionState } from "../actions";

export function StoryAnswer({ id, question, hint, initial }: { id: string; question: string; hint: string; initial: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveStory.bind(null, id), null);
  return (
    <form action={action} className="grid gap-2 rounded-2xl bg-surface p-5">
      <label htmlFor={`q-${id}`} className="font-semibold">{question}</label>
      <p className="text-sm text-muted">{hint}</p>
      <textarea id={`q-${id}`} name="answer" defaultValue={initial} rows={4} maxLength={4000} className="field" />
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn btn-secondary btn-sm">{pending ? "Saving…" : "Save"}</button>
        {state ? <span role="status" className={`text-sm ${state.ok ? "text-verified" : "text-conflicting"}`}>{state.message}</span> : null}
      </div>
    </form>
  );
}
