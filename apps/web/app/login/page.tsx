import type { Metadata } from "next";
import Link from "next/link";
import { safeNext } from "@/lib/age";
import { redirect } from "next/navigation";
import { AUTH_DISABLED } from "@/lib/env";
import { LoginForm } from "./login-form";
import { GraduationCap } from "lucide-react";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (AUTH_DISABLED) redirect("/");
  const next = safeNext((await searchParams).next);
  return (
    <div className="min-h-[80vh] flex flex-col justify-center items-center px-6 py-16 hero-grid">
      <div className="w-full max-w-[480px]">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white shadow-sm mb-4">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-primary">Welcome back</h1>
          <p className="mt-2 text-sm text-muted">Sign in to your UniGuide account to access your applications.</p>
        </div>

        <div className="bg-surface rounded-xl ambient-shadow-lg border-t-4 border-primary border-x border-b border-border overflow-hidden">
          <div className="flex border-b border-border text-sm font-semibold">
            <span className="flex-1 py-3.5 text-center text-primary border-b-2 border-secondary bg-surface-2/40">
              Sign In
            </span>
            <Link
              href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
              className="flex-1 py-3.5 text-center text-muted hover:text-primary hover:bg-surface-2/30 transition-colors"
            >
              Create Account
            </Link>
          </div>

          <div className="p-6 sm:p-8">
            <LoginForm next={next} />
          </div>
        </div>
      </div>
    </div>
  );
}
