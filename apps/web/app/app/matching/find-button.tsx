"use client";

import { useActionState } from "react";
import { findUniversities, type FindState } from "./actions";

export function FindUniversitiesButton({ label = "Find universities for me" }: { label?: string }) {
  const [state, action, pending] = useActionState<FindState, FormData>(findUniversities, null);
  return (
    <form action={action} className="grid gap-2">
      <button type="submit" disabled={pending} className="btn btn-primary justify-self-start">
        {pending ? "Starting…" : label}
      </button>
      {state && !state.ok ? <p role="alert" className="text-sm text-conflicting">{state.message}</p> : null}
    </form>
  );
}
