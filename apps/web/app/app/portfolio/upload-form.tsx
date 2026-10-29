"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { fileProblem, objectPath, PORTFOLIO_BUCKET, type PortfolioMime } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/browser";
import { addFile, type PortfolioState } from "./actions";

/** Uploads straight from the browser into the student's own folder (the bucket's policies check it). */
export function UploadForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [state, setState] = useState<PortfolioState>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.name) return setState({ ok: false, message: "Choose a file." });
    const problem = fileProblem(file);
    if (problem) return setState({ ok: false, message: problem });
    setBusy(true);
    const path = objectPath(userId, file.type as PortfolioMime, crypto.randomUUID());
    const { error } = await createClient().storage.from(PORTFOLIO_BUCKET).upload(path, file, { contentType: file.type });
    const result = error
      ? { ok: false, message: "The upload did not go through. Check your connection and try again." }
      : await addFile({ title: String(data.get("title") ?? ""), description: String(data.get("description") ?? ""), path, mime: file.type });
    setBusy(false);
    setState(result);
    if (result?.ok) {
      form.reset();
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} aria-label="Upload a file" className="grid gap-3 rounded-2xl border border-border bg-surface p-5 text-sm">
      <h2 className="text-lg font-semibold">Upload a file</h2>
      <label className="grid gap-1 font-semibold">
        File (PNG, JPEG or PDF, up to 10 MB)
        <input name="file" type="file" accept="image/png,image/jpeg,application/pdf" required className="field font-normal" />
      </label>
      <label className="grid gap-1 font-semibold">
        Title
        <input name="title" required maxLength={120} className="field font-normal" />
      </label>
      <label className="grid gap-1 font-semibold">
        What it shows (optional)
        <textarea name="description" maxLength={1000} rows={2} className="field font-normal" />
      </label>
      {state ? <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-verified" : "text-conflicting"}>{state.message}</p> : null}
      <button disabled={busy} className="btn btn-primary justify-self-start">{busy ? "Uploading…" : "Upload"}</button>
    </form>
  );
}
