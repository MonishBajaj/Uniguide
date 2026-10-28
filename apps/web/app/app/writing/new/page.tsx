import type { Metadata } from "next";
import { getUser } from "@/lib/supabase/server";
import { createDocument } from "../actions";

export const metadata: Metadata = { title: "New document" };

export default async function NewDocument({ searchParams }: PageProps<"/app/writing/new">) {
  const error = (await searchParams).error;
  const { supabase } = await getUser();
  const { data: apps } = await supabase.from("applications").select("id, program_cycles(programs(title, institutions(name)))");
  return (
    <div className="max-w-xl">
      <h1 className="text-4xl font-semibold">New document</h1>
      {error ? (
        <p role="alert" className="mt-4 text-conflicting">
          {error === "consent" ? "A parent or guardian needs to confirm your account first." : "Check the form and try again."}
        </p>
      ) : null}
      <form action={createDocument} className="mt-8 grid gap-4 rounded-2xl border border-border bg-surface p-6">
        <label className="grid gap-2 text-sm font-semibold">
          Type
          <select name="kind" className="field font-normal">
            <option value="statement_of_purpose">Statement of purpose</option>
            <option value="personal_statement">Personal statement</option>
            <option value="why_this_university">Why this university</option>
            <option value="continued_interest">Letter of continued interest (waitlist)</option>
            <option value="supplemental">Supplemental essay (needs the school&apos;s question)</option>
            <option value="other">Other essay</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Title
          <input name="title" required maxLength={200} placeholder="For example: SOP for MSc Data Science" className="field font-normal" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          For which application (optional)
          <select name="application_id" className="field font-normal" defaultValue="">
            <option value="">Not linked</option>
            {(apps ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.program_cycles?.programs?.title}, {a.program_cycles?.programs?.institutions?.name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Word limit (if the university gives one)
          <input name="word_limit" type="number" min={50} max={5000} className="field font-normal" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          The university&apos;s question (paste it exactly)
          <textarea name="question" rows={3} maxLength={2000} className="field font-normal" />
        </label>
        <button className="btn btn-primary justify-self-start">Create</button>
      </form>
    </div>
  );
}
