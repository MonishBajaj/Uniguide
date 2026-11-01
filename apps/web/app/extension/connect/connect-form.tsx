"use client";

import { createClient } from "@supabase/supabase-js";
import { useState, type FormEvent } from "react";
import type { Dict } from "@/lib/i18n/en";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

type Words = Dict["extensionConnect"];

interface ExtensionRuntime {
  sendMessage(extensionId: string, message: unknown, callback: (reply: unknown) => void): void;
  lastError?: { message?: string };
}

/**
 * Signs in with a client that keeps nothing in this page, so the extension gets a session of its own: the
 * web app's own session isn't shared, and refreshing one never signs the other out.
 */
export function ConnectForm({ extensionId, words }: { extensionId: string; words: Words }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "wrong" | "unreachable">("idle");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const runtime = (globalThis as { chrome?: { runtime?: ExtensionRuntime } }).chrome?.runtime;
    if (!runtime?.sendMessage) return setState("unreachable");
    setState("busy");
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    if (error || !data.session) return setState("wrong");
    const { access_token, refresh_token } = data.session;
    const ok = await new Promise<boolean>((resolve) => {
      try {
        runtime.sendMessage(extensionId, { type: "uniguide.session", access_token, refresh_token }, (reply) => {
          resolve(!runtime.lastError && (reply as { ok?: boolean } | undefined)?.ok === true);
        });
      } catch {
        resolve(false);
      }
    });
    setState(ok ? "done" : "unreachable");
  }

  if (state === "done") return <p role="status" id="connected">{words.connected}</p>;
  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-2xl border border-border bg-surface p-6">
      <label className="grid gap-2 text-sm font-semibold">
        {words.email}
        <input name="email" type="email" required autoComplete="email" className="field font-normal" />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        {words.password}
        <input name="password" type="password" required autoComplete="current-password" className="field font-normal" />
      </label>
      {state === "wrong" ? <p role="alert" className="text-sm text-conflicting">{words.wrongPassword}</p> : null}
      {state === "unreachable" ? <p role="alert" className="text-sm text-conflicting">{words.noExtension}</p> : null}
      <button disabled={state === "busy"} className="btn btn-primary">{state === "busy" ? words.connecting : words.connect}</button>
    </form>
  );
}
