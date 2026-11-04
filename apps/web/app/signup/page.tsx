import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AUTH_DISABLED } from "@/lib/env";
import { safeNext } from "@/lib/age";
import { ALL_COUNTRIES } from "@/lib/countries";
import { SignupForm } from "./signup-form";
import { GraduationCap } from "lucide-react";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  if (AUTH_DISABLED) redirect("/");
  const next = (await searchParams).next;
  const safeNextUrl = typeof next === "string" ? safeNext(next) : undefined;

  return (
    <div className="min-h-[85vh] flex flex-col justify-center items-center px-6 py-16 hero-grid">
      <div className="w-full max-w-[520px]">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white shadow-sm mb-4">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-primary">Join UniGuide</h1>
          <p className="mt-2 text-sm text-muted">
            Build your personalized admissions roadmap with verified facts and AI guidance.
          </p>
        </div>

        <div className="bg-surface rounded-xl ambient-shadow-lg border-t-4 border-primary border-x border-b border-border overflow-hidden">
          <div className="flex border-b border-border text-sm font-semibold">
            <Link
              href={safeNextUrl ? `/login?next=${encodeURIComponent(safeNextUrl)}` : "/login"}
              className="flex-1 py-3.5 text-center text-muted hover:text-primary hover:bg-surface-2/30 transition-colors"
            >
              Sign In
            </Link>
            <span className="flex-1 py-3.5 text-center text-primary border-b-2 border-secondary bg-surface-2/40">
              Create Account
            </span>
          </div>

          <div className="p-6 sm:p-8">
            <SignupForm currentYear={new Date().getFullYear()} countries={ALL_COUNTRIES} next={safeNextUrl} />
          </div>
        </div>
      </div>
    </div>
  );
}
