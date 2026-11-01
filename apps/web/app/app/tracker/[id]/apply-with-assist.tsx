"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Dict } from "@/lib/i18n/en";

type Words = Dict["assist"]["apply"];

interface ExtensionRuntime {
  sendMessage(extensionId: string, message: unknown, callback: (reply: unknown) => void): void;
  lastError?: { message?: string };
}

type Status = "checking" | "no_extension" | "signed_out" | "unsupported" | "ready" | "opening" | "opened" | "failed";

function ask<T>(extensionId: string, message: unknown): Promise<T | null> {
  const runtime = (globalThis as { chrome?: { runtime?: ExtensionRuntime } }).chrome?.runtime;
  if (!runtime?.sendMessage) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      runtime.sendMessage(extensionId, message, (reply) => resolve(runtime.lastError ? null : ((reply as T) ?? null)));
    } catch {
      resolve(null);
    }
  });
}

/**
 * M7 A2.4: Apply with UniGuide Assist, for an application whose portal supports guided apply. It checks that the
 * extension is installed and connected, then asks it to open the portal; the student presses Start there.
 */
export function ApplyWithAssist({ applicationId, system, extensionId, words }: { applicationId: string; system: string; extensionId: string; words: Words }) {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let live = true;
    ask<{ ok: boolean; signedIn: boolean; guided: { system: string }[] }>(extensionId, { type: "uniguide.status" }).then((r) => {
      if (!live) return;
      if (!r?.ok) setStatus("no_extension");
      else if (!r.signedIn) setStatus("signed_out");
      else if (!r.guided.some((g) => g.system === system)) setStatus("unsupported");
      else setStatus("ready");
    });
    return () => {
      live = false;
    };
  }, [extensionId, system]);

  async function apply() {
    setStatus("opening");
    const r = await ask<{ ok: boolean }>(extensionId, { type: "uniguide.apply", applicationId, system });
    setStatus(r?.ok ? "opened" : "failed");
  }

  if (status === "checking" || status === "unsupported") return null;
  return (
    <section id="apply-with-assist" aria-labelledby="apply-title" className="grid gap-2 rounded-2xl border border-border bg-surface p-6">
      <h2 id="apply-title" className="text-lg font-semibold">{words.title}</h2>
      <p className="text-sm text-muted">{words.intro}</p>
      {status === "no_extension" ? (
        <p className="text-sm">
          {words.noExtension} <Link href="/extension/connect" className="underline underline-offset-2">{words.setUp}</Link>
        </p>
      ) : status === "signed_out" ? (
        <p className="text-sm">
          {words.signedOut} <Link href="/extension/connect" className="underline underline-offset-2">{words.connect}</Link>
        </p>
      ) : status === "opened" ? (
        <p role="status" className="text-sm font-semibold">{words.opened}</p>
      ) : (
        <>
          <button type="button" onClick={apply} disabled={status === "opening"} className="btn btn-primary justify-self-start">
            {words.button}
          </button>
          {status === "failed" ? <p role="alert" className="text-sm text-conflicting">{words.failed}</p> : null}
        </>
      )}
    </section>
  );
}
