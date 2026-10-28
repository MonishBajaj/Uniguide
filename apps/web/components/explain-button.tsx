"use client";

import { useState, useTransition } from "react";
import { explain } from "@/app/app/match/actions";

export function ExplainButton({ programId }: { programId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2 text-sm">
      <button type="button" disabled={pending} onClick={() => start(async () => setText((await explain(programId)).text))} className="btn btn-secondary btn-sm justify-self-start">
        {pending ? "Explaining…" : "Explain this result"}
      </button>
      {text ? <p role="status" className="rounded-lg bg-background p-3">{text}</p> : null}
    </div>
  );
}
