"use client";

import { useActionState } from "react";
import { acceptInvite } from "../actions";

export function AcceptForm({ code }: { code: string }) {
  const [error, action, pending] = useActionState<string | null, FormData>(acceptInvite.bind(null, code), null);
  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-2 text-sm font-semibold">
        Your name, as your child will see it
        <input name="parent_name" required maxLength={120} placeholder="For example: Mum, or Priya Sharma" className="field font-normal" />
      </label>
      {error ? <p role="alert" className="text-sm text-conflicting">{error}</p> : null}
      <button className="btn btn-primary justify-self-start" disabled={pending}>{pending ? "Joining" : "Follow their applications"}</button>
    </form>
  );
}
