"use client";

import { useState, useTransition } from "react";
import { setWatch } from "@/app/courses/watch-actions";

/** Watch a course for changes without shortlisting it. */
export function WatchButton({ programId, watching }: { programId: string; watching: boolean }) {
  const [on, setOn] = useState(watching);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        aria-pressed={on}
        disabled={pending}
        className="btn btn-secondary btn-sm"
        onClick={() =>
          start(async () => {
            const error = await setWatch(programId, !on);
            if (error) setMessage(error);
            else {
              setMessage(null);
              setOn(!on);
            }
          })
        }
      >
        {on ? "Watching for changes" : "Watch for changes"}
      </button>
      {message ? <span role="alert" className="text-xs text-conflicting">{message}</span> : null}
    </span>
  );
}
