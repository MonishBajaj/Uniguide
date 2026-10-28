import type { Metadata } from "next";
import { safeNext } from "@/lib/age";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNext((await searchParams).next);
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold">Sign in</h1>
      <div className="mt-8">
        <LoginForm next={next} />
      </div>
    </div>
  );
}
