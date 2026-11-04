import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { createDocument } from "../actions";
import { courseLabel } from "@/lib/own-application";
import { FilePlus, ArrowLeft } from "lucide-react";

export const metadata: Metadata = { title: "New document" };

export default async function NewDocument({ searchParams }: PageProps<"/app/writing/new">) {
  const error = (await searchParams).error;
  const { supabase } = await getUser();
  const { data: apps } = await supabase.from("applications").select("id, own_title, own_institution, program_cycles(programs(title, institutions(name)))");
  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/app/writing" className="text-xs font-bold text-muted hover:text-primary inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Back to Writing Studio</span>
      </Link>
      <header className="rounded-xl border border-border bg-surface p-6 ambient-shadow mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FilePlus className="h-4 w-4" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Statement & Essay Workshop</span>
        </div>
        <h1 className="text-3xl font-serif font-bold text-primary">Create New Document</h1>
        <p className="mt-1 text-xs text-muted leading-relaxed">
          Start drafting with live structure analysis, authorship tracking, and guided reflection questions.
        </p>
      </header>

      {error ? (
        <p role="alert" className="mb-4 p-3 rounded-lg bg-conflicting/10 text-xs font-semibold text-conflicting border border-conflicting/20">
          {error === "consent" ? "A parent or guardian needs to confirm your account first." : "Check the form and try again."}
        </p>
      ) : null}

      <form action={createDocument} className="grid gap-4 rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow text-xs">
        <label className="grid gap-1.5 font-bold text-primary">
          Document Type
          <select name="kind" className="field font-normal text-sm">
            <option value="statement_of_purpose">Statement of Purpose (SOP)</option>
            <option value="personal_statement">Personal Statement</option>
            <option value="why_this_university">Why This University</option>
            <option value="continued_interest">Letter of Continued Interest (Waitlist)</option>
            <option value="research_statement">Research Statement (Master&apos;s / PhD)</option>
            <option value="supplemental">Supplemental Essay (Specific University Question)</option>
            <option value="other">Other Essay</option>
          </select>
        </label>
        <label className="grid gap-1.5 font-bold text-primary">
          Title
          <input name="title" required maxLength={200} placeholder="For example: SOP for MSc Data Science" className="field font-normal text-sm" />
        </label>
        <label className="grid gap-1.5 font-bold text-primary">
          Target Application (Optional)
          <select name="application_id" className="field font-normal text-sm" defaultValue="">
            <option value="">Not linked to a tracked course</option>
            {(apps ?? []).map((a) => (
              <option key={a.id} value={a.id}>{courseLabel(a)}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 font-bold text-primary">
          Word Limit (if required by the department)
          <input name="word_limit" type="number" min={50} max={5000} placeholder="e.g. 500" className="field font-normal text-sm" />
        </label>
        <label className="grid gap-1.5 font-bold text-primary">
          The Official Prompt / Question (paste verbatim)
          <textarea name="question" rows={3} maxLength={2000} placeholder="Paste the university's exact question here…" className="field font-normal text-sm leading-relaxed" />
        </label>
        <div className="pt-2">
          <button className="btn btn-primary">Create Document</button>
        </div>
      </form>
    </div>
  );
}
