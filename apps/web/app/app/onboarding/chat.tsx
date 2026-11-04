"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { OnboardingTurn } from "@/lib/assistant";
import { applyUpdates, nextTurn, type Message } from "./actions";
import { Bot, Sparkles, Send } from "lucide-react";

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
      <section aria-label="Conversation" className="grid content-start gap-4">
        <ol className="grid gap-3" aria-live="polite">
          {messages.map((m, i) => (
            <li
              key={i}
              className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${
                m.role === "student"
                  ? "justify-self-end bg-primary text-white rounded-tr-xs shadow-xs"
                  : "border border-border/80 bg-surface rounded-tl-xs shadow-xs text-foreground"
              }`}
            >
              {m.role === "assistant" ? (
                <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-secondary">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Sage AI</span>
                </div>
              ) : null}
              {m.text}
            </li>
          ))}
          {pending ? (
            <li className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted rounded-tl-xs flex items-center gap-2">
              <Sparkles className="h-4 w-4 animate-spin text-secondary" />
              <span>Thinking…</span>
            </li>
          ) : null}
        </ol>
        <form action={send} className="flex gap-2">
          <label htmlFor="msg" className="sr-only">Your answer</label>
          <input id="msg" name="message" maxLength={1000} autoComplete="off" placeholder="Type your answer…" className="field" />
          <button disabled={pending} className="btn btn-primary inline-flex items-center gap-1.5">
            <span>Send</span>
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
      </section>
      <aside aria-label="Suggested profile changes" className="grid content-start gap-4 rounded-xl border border-border bg-surface p-5 ambient-shadow text-sm">
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <Bot className="h-4 w-4 text-secondary" />
          <h2 className="font-serif font-bold text-base text-primary">Suggestions to confirm</h2>
        </div>
        {proposals.length === 0 ? (
          <p className="text-xs text-muted leading-relaxed">
            As you chat, suggested profile fields appear here with the exact words they were extracted from.
          </p>
        ) : null}
        {proposals.map((p, i) => (
          <label
            key={`${p.field}-${i}`}
            className="flex gap-2.5 rounded-xl border border-border/60 bg-surface-2/40 p-3.5 text-xs transition-all has-[:checked]:border-secondary has-[:checked]:bg-secondary/5"
          >
            <input
              type="checkbox"
              checked={Boolean(kept[i])}
              onChange={(e) => setKept({ ...kept, [i]: e.target.checked })}
              className="mt-0.5 accent-primary"
            />
            <span className="grid gap-1">
              <span className="font-bold text-primary">{p.field.replaceAll("_", " ")}: {p.value}</span>
              <span className="text-muted italic">&ldquo;{p.quote}&rdquo;</span>
            </span>
          </label>
        ))}
        {proposals.length ? (
          <button
            className="btn btn-primary btn-sm w-full mt-2"
            disabled={pending || !Object.values(kept).some(Boolean)}
            onClick={() => start(async () => setSaved((await applyUpdates(proposals.filter((_, i) => kept[i]))).message))}
          >
            Save selected changes
          </button>
        ) : null}
        {saved ? (
          <p role="status" className="text-xs text-verified font-medium bg-verified/10 p-2.5 rounded-lg border border-verified/20">
            {saved}{" "}
            <Link href="/app/profile" className="underline underline-offset-2 font-bold hover:text-primary">Review profile</Link>
          </p>
        ) : null}
      </aside>
    </div>
  );
}
