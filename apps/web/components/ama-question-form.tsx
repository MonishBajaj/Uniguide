"use client";

import { submitAmaQuestion } from "@/app/community/actions";
import { PostStatus } from "./post-status";
import { usePostForm } from "./use-post-form";

export function AmaQuestionForm({ amaId }: { amaId: string }) {
  const { state, action, pending, key, values: v } = usePostForm(submitAmaQuestion.bind(null, amaId));
  return (
    <form key={key} action={action} aria-label="Ask the host" className="grid gap-3 rounded-2xl border border-border bg-surface p-5 text-sm">
      <h2 className="text-lg font-semibold">Ask the host</h2>
      <label className="grid max-w-sm gap-1 font-semibold">
        Name to show (made up)
        <input name="pseudonym" defaultValue={v.pseudonym} required minLength={2} maxLength={40} className="field font-normal" />
      </label>
      <label className="grid gap-1 font-semibold">
        Your question
        <textarea name="body" defaultValue={v.body} required minLength={15} maxLength={1000} rows={3} className="field font-normal" />
      </label>
      <PostStatus state={state} />
      <button disabled={pending} className="btn btn-primary justify-self-start">{pending ? "Sending…" : "Send question"}</button>
    </form>
  );
}
