"use client";

import { useActionState } from "react";
import { CURRENCIES, FIELDS } from "@/lib/fields";
import { DESTINATIONS, LEVELS, countryName, label } from "@/lib/format";
import type { Dict } from "@/lib/i18n/en";
import { intakeYears } from "@/lib/intake";
import { saveShortProfile, type ShortProfileState } from "./actions";

export interface ShortProfileValues {
  target_levels: string[];
  target_countries: string[];
  target_fields: string[];
  budget_amount: string;
  budget_currency: string;
  intake_year: string;
}

/**
 * Onboarding screen 3 (journey M2, J2.6): only what matching needs. A refused save returns what was
 * typed, and each attempt remounts the form so every field starts from it (React resets forms).
 */
/** The labels the form shows: plain strings only, since a client component can't receive functions. */
export type ShortProfileCopy = Pick<
  Dict["journey"]["onboarding"],
  "levels" | "subjects" | "countries" | "budget" | "amount" | "currency" | "notSet" | "intake" | "notDecided" | "save"
>;

export function ShortProfile({ initial, t, thisYear }: { initial: ShortProfileValues; t: ShortProfileCopy; thisYear: number }) {
  const [state, action, pending] = useActionState<(ShortProfileState & { attempt: number }) | null, FormData>(
    async (prev, form) => ({ ...(await saveShortProfile(prev, form))!, attempt: (prev?.attempt ?? 0) + 1 }),
    null,
  );
  const v = (state?.values as ShortProfileValues | undefined) ?? initial;
  const box = "flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm has-[:checked]:border-accent";

  return (
    <form key={state?.attempt ?? 0} action={action} className="grid gap-6">
      <fieldset>
        <legend className="mb-2 font-semibold">{t.levels}</legend>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => (
            <label key={l} className={box}>
              <input type="checkbox" name="target_levels" value={l} defaultChecked={v.target_levels.includes(l)} className="accent-[var(--accent)]" />
              {label(l)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 font-semibold">{t.subjects}</legend>
        <div className="flex flex-wrap gap-2">
          {/* Sorted by code: "10" would otherwise come first, since JavaScript orders number-like keys first. */}
          {Object.entries(FIELDS).sort(([a], [b]) => a.localeCompare(b)).map(([code, name]) => (
            <label key={code} className={box}>
              <input type="checkbox" name="target_fields" value={code} defaultChecked={v.target_fields.includes(code)} className="accent-[var(--accent)]" />
              {name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 font-semibold">{t.countries}</legend>
        <div className="flex flex-wrap gap-2">
          {DESTINATIONS.map((c) => (
            <label key={c} className={box}>
              <input type="checkbox" name="target_countries" value={c} defaultChecked={v.target_countries.includes(c)} className="accent-[var(--accent)]" />
              {countryName(c)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">{t.budget}</legend>
        <label className="grid gap-2 text-sm font-semibold">
          {t.amount}
          <input name="budget_amount" inputMode="numeric" defaultValue={v.budget_amount} className="field font-normal" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          {t.currency}
          <select name="budget_currency" defaultValue={v.budget_currency} className="field font-normal">
            <option value="">{t.notSet}</option>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </fieldset>
      <label className="grid max-w-xs gap-2 text-sm font-semibold">
        {t.intake}
        <select name="intake_year" defaultValue={v.intake_year} className="field font-normal">
          <option value="">{t.notDecided}</option>
          {intakeYears(thisYear, v.intake_year ? Number(v.intake_year) : null).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </label>
      {state?.message ? <p role="alert" className="text-sm text-conflicting">{state.message}</p> : null}
      <div>
        <button disabled={pending} className="btn btn-primary min-h-11">{t.save}</button>
      </div>
    </form>
  );
}
