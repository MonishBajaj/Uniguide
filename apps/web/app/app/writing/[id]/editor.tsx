"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { lint } from "@/lib/writing/lint";
import { saveVersion, type ActionState } from "../actions";

const KIND_LABEL = { cliche: "Cliché", vague: "Vague", long: "Long sentence", passive: "Passive", unsupported_claim: "Claim without evidence" } as const;

/**
 * Plain textarea with an authorship log: characters typed vs pasted, paste events and active
 * editing time. The log is saved with each draft so the student can show how it was written.
 */
export function Editor({ documentId, initial, wordLimit }: { documentId: string; initial: string; wordLimit: number | null }) {
  const [body, setBody] = useState(initial);
  const [state, action, pending] = useActionState<ActionState, FormData>(saveVersion.bind(null, documentId), null);
  const [start] = useState(() => new Date().toISOString());
  const empty = { typed_chars: 0, pasted_chars: 0, deleted_chars: 0, paste_events: [] as { at: string; chars: number }[], session_started_at: start, active_seconds: 0 };
  const log = useRef(empty);
  const lastInput = useRef<number | null>(null);
  // Snapshot of the log for the hidden field; refs must not be read during render.
  const [authorship, setAuthorship] = useState(() => JSON.stringify(empty));
  const snapshot = () => setAuthorship(JSON.stringify(log.current));
  const report = useMemo(() => lint(body, wordLimit), [body, wordLimit]);

  // React's onBeforeInput is a polyfill without inputType, so listen to the native event.
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const onBeforeInput = (event: InputEvent) => {
      const now = Date.now();
      if (lastInput.current && now - lastInput.current < 60_000) log.current.active_seconds += Math.round((now - lastInput.current) / 1000);
      lastInput.current = now;
      const type = event.inputType ?? "";
      if (type === "insertText" || type === "insertLineBreak" || type === "insertParagraph") log.current.typed_chars += event.data?.length ?? 1;
      if (type.startsWith("delete")) log.current.deleted_chars += 1;
      setAuthorship(JSON.stringify(log.current));
    };
    el.addEventListener("beforeinput", onBeforeInput);
    return () => el.removeEventListener("beforeinput", onBeforeInput);
  }, []);
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const chars = e.clipboardData.getData("text").length;
    log.current.pasted_chars += chars;
    log.current.paste_events.push({ at: new Date().toISOString(), chars });
    snapshot();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <form action={action} className="grid gap-3">
        <label htmlFor="draft" className="sr-only">Draft</label>
        <textarea
          id="draft"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          ref={area}
          onPaste={onPaste}
          rows={22}
          className="field font-normal leading-7"
        />
        <input type="hidden" name="authorship" value={authorship} />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button disabled={pending} className="btn btn-primary">{pending ? "Saving…" : "Save draft"}</button>
          <span className={report.overLimit ? "text-conflicting" : "text-muted"}>
            {report.words}{wordLimit ? ` / ${wordLimit}` : ""} words
          </span>
          {state ? <span role="status" className={state.ok ? "text-verified" : "text-conflicting"}>{state.message}</span> : null}
        </div>
      </form>
      <aside aria-label="Writing checks" className="grid content-start gap-3 rounded-2xl bg-surface p-4 text-sm">
        <h2 className="font-semibold">Checks as you write</h2>
        <p className="text-muted">
          {Math.round(report.specificity * 100)}% of sentences contain a name, number or course.
          {report.iStarts > 0.4 ? " Many sentences start with “I”." : ""}
        </p>
        {report.flags.length === 0 ? <p className="text-muted">No clichés or vague phrases found.</p> : (
          <ul className="grid gap-2">
            {report.flags.slice(0, 12).map((f, i) => (
              <li key={i} className="rounded-lg bg-background p-2">
                <span className="font-semibold">{KIND_LABEL[f.kind]}</span> in {f.sentence}: “{f.match}”
                <span className="block text-muted">{f.question}</span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
