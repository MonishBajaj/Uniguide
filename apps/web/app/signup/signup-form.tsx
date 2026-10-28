"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type SignupState } from "./actions";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Country names come from the server so they match between server render and hydration.
export function SignupForm({ currentYear, countries }: { currentYear: number; countries: { code: string; name: string }[] }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(signUp, null);
  if (state?.done) return <p role="status" className="rounded-2xl border border-border bg-surface p-6">{state.message}</p>;
  const years = Array.from({ length: 80 }, (_, i) => currentYear - i);

  return (
    <form action={action} className="grid gap-4 rounded-2xl border border-border bg-surface p-6">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">When were you born?</legend>
        <p className="text-sm text-muted">We only ask for the month. It decides whether a parent needs to confirm first.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="sr-only" htmlFor="birth_month">Month</label>
          <select id="birth_month" name="birth_month" required defaultValue="" className="field">
            <option value="" disabled>Month</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <label className="sr-only" htmlFor="birth_year">Year</label>
          <select id="birth_year" name="birth_year" required defaultValue="" className="field">
            <option value="" disabled>Year</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </fieldset>

      <label className="grid gap-2 text-sm font-semibold">
        Country you live in
        <select name="residence_country" required defaultValue="" className="field font-normal">
          <option value="" disabled>Choose a country</option>
          {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        Email
        <input name="email" type="email" required autoComplete="email" className="field font-normal" />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        Password
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className="field font-normal" />
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="terms" required className="mt-1 accent-[var(--accent)]" />
        <span>
          I accept the <Link href="/legal/terms" className="underline underline-offset-2">terms</Link> and the{" "}
          <Link href="/legal/privacy" className="underline underline-offset-2">privacy policy</Link>.
        </span>
      </label>

      {state ? <p role="alert" className="text-sm text-conflicting">{state.message}</p> : null}
      <button disabled={pending} className="btn btn-primary">{pending ? "Creating account…" : "Create account"}</button>
      <p className="text-sm text-muted">
        Already have one? <Link href="/login" className="underline underline-offset-2">Sign in</Link>
      </p>
    </form>
  );
}
