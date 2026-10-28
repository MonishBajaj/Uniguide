import type { Metadata } from "next";
import Link from "next/link";
import { loadMatchInputs } from "@/lib/match-data";
import { getUser } from "@/lib/supabase/server";
import { WhatIf } from "./what-if";

export const metadata: Metadata = { title: "What if" };

export default async function WhatIfPage() {
  const { supabase, user } = await getUser();
  const inputs = await loadMatchInputs(supabase, user!.id);
  if (!inputs) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8">
        <h1 className="text-2xl font-semibold">Complete your profile first</h1>
        <Link href="/app/profile" className="btn btn-primary mt-6">Go to your profile</Link>
      </div>
    );
  }
  const names = Object.fromEntries(inputs.candidates.map((c) => [c.id!, { title: c.title!, institution: c.institution_name!, slug: c.slug! }]));
  return (
    <div className="grid gap-6">
      <header>
        <Link href="/app/match" className="text-sm text-muted underline underline-offset-2">My matches</Link>
        <h1 className="mt-2 text-4xl font-semibold">What if</h1>
        <p className="mt-2 max-w-[680px] text-muted">Change a number and see which courses move in or out. Nothing here is saved, and it is not a prediction of admission.</p>
      </header>
      <WhatIf programs={inputs.programs} student={inputs.student} weights={inputs.weights} fx={inputs.fx} names={names} />
    </div>
  );
}
