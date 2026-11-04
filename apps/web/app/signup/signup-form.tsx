"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type SignupState } from "./actions";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Country names come from the server so they match between server render and hydration.
export function SignupForm({
  currentYear,
  countries,
  next,
}: {
  currentYear: number;
  countries: { code: string; name: string }[];
  next?: string;
}) {
  const [state, action, pending] = useActionState<SignupState, FormData>(signUp, null);
  if (state?.done) {
    return (
      <div role="status" className="rounded-xl border border-verified/40 bg-verified/10 p-6 text-sm text-foreground">
        <p className="font-semibold text-verified mb-2">Account created</p>
        <p>{state.message}</p>
      </div>
    );
  }
  const years = Array.from({ length: 80 }, (_, i) => currentYear - i);

  return (
    <form action={action} className="grid gap-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <fieldset className="grid gap-2">
        <legend className="text-xs font-bold uppercase tracking-wider text-muted">When were you born?</legend>
        <p className="text-xs text-muted">We only ask for the month. It decides whether a parent needs to confirm first.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="sr-only" htmlFor="birth_month">Month</label>
          <select id="birth_month" name="birth_month" required defaultValue="" className="field font-normal text-sm">
            <option value="" disabled>Month</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <label className="sr-only" htmlFor="birth_year">Year</label>
          <select id="birth_year" name="birth_year" required defaultValue="" className="field font-normal text-sm">
            <option value="" disabled>Year</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </fieldset>

      <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        Country you live in
        <select name="residence_country" required defaultValue="" className="field font-normal text-sm">
          <option value="" disabled>Choose a country</option>
          {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </label>

      <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        Email Address
        <input name="email" type="email" required autoComplete="email" placeholder="alex@example.com" className="field font-normal text-sm" />
      </label>

      <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        Password (min 8 characters)
        <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="••••••••" className="field font-normal text-sm" />
      </label>

      <label className="flex items-start gap-2.5 text-xs text-muted cursor-pointer">
        <input type="checkbox" name="terms" required className="mt-0.5 accent-primary h-4 w-4 rounded" />
        <span>
          I accept the <Link href="/legal/terms" className="font-semibold text-primary underline underline-offset-2">terms</Link> and the{" "}
          <Link href="/legal/privacy" className="font-semibold text-primary underline underline-offset-2">privacy policy</Link>.
        </span>
      </label>

      {state ? (
        <p role="alert" className="text-sm font-medium text-conflicting bg-conflicting/10 px-3 py-2 rounded-lg">
          {state.message}
        </p>
      ) : null}

      <button disabled={pending} className="btn btn-coral-bright w-full py-3.5 text-base font-bold shadow-sm">
        {pending ? "Creating account…" : "Create Account"}
      </button>

      <p className="text-center text-xs text-muted pt-1">
        Already have one? <Link href="/login" className="font-semibold text-primary underline underline-offset-2">Sign in</Link>
      </p>
    </form>
  );
}
