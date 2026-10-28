"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { OnboardingTurn } from "@/lib/assistant";
import { applyUpdates, nextTurn, type Message } from "./actions";

const OPENING: Message = { role: "assistant", text: "Hi. What would you like to study, and at which level (for example a master's in data science)?" };

export function OnboardingChat() {
  const [messages, setMessages] = useState<Message[]>([OPENING]);
  const [proposals, setProposals] = useState<OnboardingTurn["updates"]>([]);
  const [kept, setKept] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = (form: FormData) => {
    const text = String(form.get("message") ?? "").trim();
    if (!text) return;
    const history = [...messages, { role: "student" as const, text }];
    setMessages(history);
    start(async () => {
      const turn = await nextTurn(history);
      setMessages([...history, { role: "assistant", text: turn.reply }]);
      setProposals((p) => [...p.filter((x) => !turn.updates.some((u) => u.field === x.field)), ...turn.updates]);
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section aria-label="Conversation" className="grid content-start gap-3">
        <ol className="grid gap-3" aria-live="polite">
          {messages.map((m, i) => (
            <li key={i} className={`max-w-[85%] rounded-2xl p-3 text-sm ${m.role === "student" ? "justify-self-end bg-accent text-accent-foreground" : "bg-surface"}`}>
              {m.text}
            </li>
          ))}
          {pending ? <li className="rounded-2xl bg-surface p-3 text-sm text-muted">Thinking…</li> : null}
        </ol>
        <form action={send} className="flex gap-2">
          <label htmlFor="msg" className="sr-only">Your answer</label>
          <input id="msg" name="message" maxLength={1000} autoComplete="off" className="field" />
          <button disabled={pending} className="btn btn-primary">Send</button>
        </form>
      </section>
      <aside aria-label="Suggested profile changes" className="grid content-start gap-3 rounded-2xl bg-surface p-4 text-sm">
        <h2 className="font-semibold">Suggestions to confirm</h2>
        {proposals.length === 0 ? <p className="text-muted">As you answer, suggested profile fields appear here with the words they came from.</p> : null}
        {proposals.map((p, i) => (
          <label key={`${p.field}-${i}`} className="flex gap-2 rounded-lg bg-background p-2 has-[:checked]:outline has-[:checked]:outline-accent">
            <input type="checkbox" checked={Boolean(kept[i])} onChange={(e) => setKept({ ...kept, [i]: e.target.checked })} className="mt-1 accent-[var(--accent)]" />
            <span>
              <span className="block font-semibold">{p.field.replaceAll("_", " ")}: {p.value}</span>
              <span className="block text-muted">You said: &ldquo;{p.quote}&rdquo;</span>
            </span>
          </label>
        ))}
        {proposals.length ? (
          <button
            className="btn btn-primary btn-sm"
            disabled={pending || !Object.values(kept).some(Boolean)}
            onClick={() => start(async () => setSaved((await applyUpdates(proposals.filter((_, i) => kept[i]))).message))}
          >
            Save the ones I ticked
          </button>
        ) : null}
        {saved ? <p role="status">{saved} <Link href="/app/profile" className="underline underline-offset-2">Review your profile</Link></p> : null}
      </aside>
    </div>
  );
}
