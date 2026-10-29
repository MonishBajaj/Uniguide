"use client";

import { submitReview } from "@/app/community/actions";
import { PostStatus } from "./post-status";
import { usePostForm } from "./use-post-form";

const SCALES = [
  { name: "teaching", label: "Teaching" },
  { name: "support", label: "Support for international students" },
  { name: "value", label: "Value for money" },
] as const;

export function ReviewForm({ programId }: { programId: string }) {
  const { state, action, pending, key, values: v } = usePostForm(submitReview.bind(null, programId));
  return (
    <form key={key} action={action} className="grid gap-4 rounded-2xl border border-border bg-surface p-5 text-sm">
      <h3 className="text-lg font-semibold">Review this course</h3>
      <label className="grid max-w-sm gap-1 font-semibold">
        Name to show (made up)
        <input name="pseudonym" defaultValue={v.pseudonym} required minLength={2} maxLength={40} className="field font-normal" />
      </label>
      {SCALES.map((s) => (
        <fieldset key={s.name} className="grid gap-1">
          <legend className="font-semibold">{s.label}</legend>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1 has-[:checked]:border-accent">
                <input type="radio" name={s.name} value={n} required defaultChecked={v[s.name] === String(n)} className="accent-[var(--accent)]" />
                {n}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <p className="text-xs text-muted">1 is poor, 5 is excellent.</p>
      <label className="grid gap-1 font-semibold">
        Your experience
        <textarea name="body" defaultValue={v.body} required minLength={100} maxLength={6000} rows={6} className="field font-normal" />
      </label>
      <PostStatus state={state} />
      <button disabled={pending} className="btn btn-primary justify-self-start">{pending ? "Sending…" : "Send for moderation"}</button>
    </form>
  );
}
