import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AUTH_DISABLED } from "@/lib/env";
import { safeNext } from "@/lib/age";
import { ALL_COUNTRIES } from "@/lib/countries";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  if (AUTH_DISABLED) redirect("/");
  const next = (await searchParams).next;
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold">Create an account</h1>
      <p className="mt-2 text-muted">Save a shortlist, check requirements against your profile and track deadlines.</p>
      <div className="mt-8">
        <SignupForm currentYear={new Date().getFullYear()} countries={ALL_COUNTRIES} next={typeof next === "string" ? safeNext(next) : undefined} />
      </div>
    </div>
  );
}
