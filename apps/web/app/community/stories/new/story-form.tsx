"use client";

import { PostStatus } from "@/components/post-status";
import { usePostForm } from "@/components/use-post-form";
import { countryName, DESTINATIONS, label, LEVELS } from "@/lib/format";
import { submitStory } from "../../actions";

export function StoryForm() {
  const { state, action, pending, key, values: v } = usePostForm(submitStory);
  return (
    <form key={key} action={action} className="grid gap-4 rounded-2xl border border-border bg-surface p-6">
      <label className="grid max-w-sm gap-2 text-sm font-semibold">
        Name to show (made up, not your real name)
        <input name="pseudonym" defaultValue={v.pseudonym} required minLength={2} maxLength={40} className="field font-normal" />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        Title
        <input name="title" defaultValue={v.title} required minLength={3} maxLength={140} placeholder="For example: Six applications and one late test score" className="field font-normal" />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        Your story
        <textarea name="body" defaultValue={v.body} required minLength={200} maxLength={6000} rows={10} className="field font-normal" />
      </label>
      <div className="flex flex-wrap gap-4">
        <label className="grid gap-2 text-sm font-semibold">
          Where you applied (optional)
          <select name="country" defaultValue={v.country ?? ""} className="field font-normal">
            <option value="">Not saying</option>
            {DESTINATIONS.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Level (optional)
          <select name="level" defaultValue={v.level ?? ""} className="field font-normal">
            <option value="">Not saying</option>
            {LEVELS.map((l) => <option key={l} value={l}>{label(l)}</option>)}
          </select>
        </label>
      </div>
      <PostStatus state={state} />
      <button disabled={pending} className="btn btn-primary justify-self-start">{pending ? "Sending…" : "Send for moderation"}</button>
    </form>
  );
}
