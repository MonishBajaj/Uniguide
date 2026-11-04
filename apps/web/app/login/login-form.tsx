"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [error, action, pending] = useActionState<string | null, FormData>(signIn, null);
  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="next" value={next} />
      <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        Email Address
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="alex@example.com"
          className="field font-normal text-sm"
        />
      </label>
      <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        Password
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="field font-normal text-sm"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm font-medium text-conflicting bg-conflicting/10 px-3 py-2 rounded-lg">
          {error}
        </p>
      ) : null}
      <button
        disabled={pending}
        className="btn btn-coral-bright w-full py-3.5 text-base font-bold shadow-sm"
      >
        {pending ? "Signing in…" : "Sign In"}
      </button>
      <p className="text-center text-xs text-muted pt-2">
        New here?{" "}
        <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="font-semibold text-primary underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </form>
  );
}
