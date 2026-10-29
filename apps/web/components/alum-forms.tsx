"use client";

import { requestAlum, submitAnswer, submitQuestion } from "@/app/community/actions";
import { PostStatus } from "./post-status";
import { usePostForm } from "./use-post-form";

export function QuestionForm({ programId }: { programId: string }) {
  const { state, action, pending, key, values: v } = usePostForm(submitQuestion.bind(null, programId));
  return (
    <form key={key} action={action} aria-label="Ask a question" className="grid gap-3 rounded-2xl border border-border bg-surface p-5 text-sm">
      <h3 className="text-lg font-semibold">Ask a question</h3>
      <label className="grid max-w-sm gap-1 font-semibold">
        Name to show (made up)
        <input name="pseudonym" defaultValue={v.pseudonym} required minLength={2} maxLength={40} className="field font-normal" />
      </label>
      <label className="grid gap-1 font-semibold">
        Your question
        <textarea name="body" defaultValue={v.body} required minLength={20} maxLength={1000} rows={3} placeholder="For example: how many hours a week did the course take outside lectures?" className="field font-normal" />
      </label>
      <PostStatus state={state} />
      <button disabled={pending} className="btn btn-secondary justify-self-start">{pending ? "Sending…" : "Send for moderation"}</button>
    </form>
  );
}

export function AnswerForm({ questionId }: { questionId: string }) {
  const { state, action, pending, key, values: v } = usePostForm(submitAnswer.bind(null, questionId));
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold underline underline-offset-2">Answer as an alum</summary>
      <form key={key} action={action} className="mt-2 grid gap-2">
        <label className="grid max-w-sm gap-1">
          Name to show (made up)
          <input name="pseudonym" defaultValue={v.pseudonym} required minLength={2} maxLength={40} className="field" />
        </label>
        <label className="grid gap-1">
          Your answer
          <textarea name="body" defaultValue={v.body} required minLength={20} maxLength={4000} rows={4} className="field" />
        </label>
        <PostStatus state={state} />
        <button disabled={pending} className="btn btn-secondary btn-sm justify-self-start">{pending ? "Sending…" : "Send answer for moderation"}</button>
      </form>
    </details>
  );
}

export function AlumRequestForm({ programId }: { programId: string }) {
  const { state, action, pending, key, values: v } = usePostForm(requestAlum.bind(null, programId));
  return (
    <details className="text-sm">
      <summary className="cursor-pointer underline underline-offset-2">Studied here? Offer to answer questions</summary>
      <form key={key} action={action} className="mt-2 grid gap-2">
        <label className="grid max-w-xs gap-1">
          Year you finished (or will finish)
          <input name="graduation_year" type="number" defaultValue={v.graduation_year} required min={1950} max={2100} className="field" />
        </label>
        <label className="grid gap-1">
          How a moderator can check (never shown publicly)
          <textarea name="evidence" defaultValue={v.evidence} maxLength={500} rows={2} placeholder="For example: I can send my degree certificate or student ID when asked" className="field" />
        </label>
        <PostStatus state={state} />
        <button disabled={pending} className="btn btn-secondary btn-sm justify-self-start">{pending ? "Sending…" : "Send request"}</button>
      </form>
    </details>
  );
}
