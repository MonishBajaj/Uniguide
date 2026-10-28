"use client";

import { useActionState, useState } from "react";
import { createInvite, type InviteState } from "@/app/family/actions";

export function FamilyInvite() {
  const [state, action, pending] = useActionState<InviteState, FormData>(createInvite, null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-3">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm font-semibold">
          Your name as your parent knows it
          <input name="student_name" required maxLength={120} className="field font-normal" />
        </label>
        <button className="btn btn-primary" disabled={pending}>{pending ? "Creating" : "Create an invite link"}</button>
      </form>
      {state ? (
        <div role="status" className="grid gap-2 text-sm">
          <p>{state.message}</p>
          {state.link ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-lg bg-background px-3 py-2 break-all">{state.link}</code>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(state.link!);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
