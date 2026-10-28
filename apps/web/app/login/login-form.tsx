"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [error, action, pending] = useActionState<string | null, FormData>(signIn, null);
  return (
    <form action={action} className="grid gap-4 rounded-2xl bg-surface p-6">
      <input type="hidden" name="next" value={next} />
      <label className="grid gap-2 text-sm font-semibold">
        Email
        <input name="email" type="email" required autoComplete="email" className="field font-normal" />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        Password
        <input name="password" type="password" required autoComplete="current-password" className="field font-normal" />
      </label>
      {error ? <p role="alert" className="text-sm text-conflicting">{error}</p> : null}
      <button disabled={pending} className="btn btn-primary">{pending ? "Signing in…" : "Sign in"}</button>
      <p className="text-sm text-muted">
        New here? <Link href="/signup" className="underline underline-offset-2">Create an account</Link>
      </p>
    </form>
  );
}
