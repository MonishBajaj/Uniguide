"use client";

import { useActionState } from "react";
import { joinWaitlist, type WaitlistState } from "./actions";
import { COUNTRIES, LEVELS, WAVE_1, countryName, label } from "@/lib/format";

const DOORS = [
  {
    value: "verified_tracker",
    title: "Verified tracker",
    body: "Shortlist courses, see which entry requirements you meet, and get reminders before each deadline.",
  },
  {
    value: "writing_coach",
    title: "Writing coach",
    body: "Feedback on your statement of purpose that quotes your own sentences. It never writes them for you.",
  },
];

export function WaitlistForm({ utm }: { utm: Record<string, string> }) {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinWaitlist, null);

  if (state?.ok) {
    return (
      <p role="status" className="rounded-2xl border border-border bg-surface p-6 text-lg">
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="grid gap-4 rounded-2xl border border-border bg-surface p-6" noValidate={false}>
      {Object.entries(utm).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-semibold">Which do you want first?</legend>
        {DOORS.map((door) => (
          <label
            key={door.value}
            className="flex cursor-pointer gap-3 rounded-lg border border-border bg-background p-3 transition-colors duration-300 has-[:checked]:border-accent"
          >
            <input type="radio" name="interest" value={door.value} required className="mt-1 accent-[var(--accent)]" />
            <span>
              <span className="block font-semibold">{door.title}</span>
              <span className="block text-sm text-muted">{door.body}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">
          Level you want to study
          <select name="target_level" required className="field font-normal" defaultValue="">
            <option value="" disabled>Choose a level</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>{label(l)}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Where you live now
          <select name="residence_country" className="field font-normal" defaultValue="">
            <option value="">Prefer not to say</option>
            {Object.keys(COUNTRIES).map((c) => (
              <option key={c} value={c}>{countryName(c)}</option>
            ))}
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Where you want to study</legend>
        <div className="flex flex-wrap gap-2">
          {WAVE_1.map((c) => (
            <label key={c} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm has-[:checked]:border-accent">
              <input type="checkbox" name="destination_countries" value={c} className="accent-[var(--accent)]" />
              {countryName(c)}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="grid gap-2 text-sm font-semibold">
        Subject (optional)
        <input name="field" maxLength={120} placeholder="For example: data science, nursing, architecture" className="field font-normal" />
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        Email
        <input name="email" type="email" required autoComplete="email" maxLength={254} className="field font-normal" />
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmed_13_plus" required className="mt-1 accent-[var(--accent)]" />
        <span>
          I am 13 or older. If I am under 18, a parent or guardian knows I am signing up.
        </span>
      </label>

      {state && !state.ok ? (
        <p role="alert" className="text-sm text-conflicting">{state.message}</p>
      ) : null}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : "Join the waitlist"}
      </button>
      <p className="text-xs text-muted">One email when it opens. No marketing lists, no selling your data.</p>
    </form>
  );
}
