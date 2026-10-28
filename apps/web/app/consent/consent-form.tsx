"use client";

import { useActionState } from "react";
import { requestParentalConsent, type ConsentState } from "./actions";

export function ConsentForm() {
  const [state, action, pending] = useActionState<ConsentState, FormData>(requestParentalConsent, null);
  if (state?.ok) return <p role="status" className="rounded-2xl bg-surface p-6 break-words">{state.message}</p>;
  return (
    <form action={action} className="grid gap-4 rounded-2xl bg-surface p-6">
      <label className="grid gap-2 text-sm font-semibold">
        Parent or guardian&apos;s email
        <input name="parent_email" type="email" required className="field font-normal" />
      </label>
      {state ? <p role="alert" className="text-sm text-conflicting">{state.message}</p> : null}
      <button disabled={pending} className="btn btn-primary">{pending ? "Sending…" : "Send the request"}</button>
    </form>
  );
}
