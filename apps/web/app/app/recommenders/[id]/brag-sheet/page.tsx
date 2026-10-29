import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/app/app/cv/print/print-button";
import { CV_SECTIONS, dateRange, orderEntries, type CvSection } from "@/lib/cv";
import { shortDate } from "@/lib/format";
import { bragPoints } from "@/lib/recommendations";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Brag sheet", robots: { index: false } };

/** 6.3 A page for one recommender: what the student is applying for, what to mention, and their record. */
export default async function BragSheet({ params }: PageProps<"/app/recommenders/[id]/brag-sheet">) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  const [{ data: rec }, { data: header }, { data: entries }] = await Promise.all([
    supabase
      .from("recommenders")
      .select("name, relationship, brag_notes, recommendation_requests(id, due_on, status, applications(program_cycles(label, programs(title, institutions(name)))))")
      .eq("id", id)
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase.from("cv_headers").select("full_name, contact_line").eq("user_id", user!.id).maybeSingle(),
    supabase.from("cv_entries").select("*").eq("user_id", user!.id),
  ]);
  if (!rec) notFound();
  const points = bragPoints(rec.brag_notes);
  const letters = [...rec.recommendation_requests].sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999"));
  const ordered = orderEntries(entries ?? []);
  const sections = [...new Set(ordered.map((e) => e.section))];
  const name = header?.full_name ?? "Me";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/app/recommenders" className="btn btn-secondary btn-sm">Back to recommenders</Link>
        <PrintButton />
        <p className="text-sm text-muted">Built from your notes, your CV and the letters you track. Share it as a PDF or on paper.</p>
      </div>
      <article className="mx-auto grid w-full max-w-[800px] gap-6 bg-white p-10 text-[14px] text-[#141414] shadow-sm print:p-0 print:shadow-none">
        <header className="grid gap-1 border-b border-[#d8d8d4] pb-4">
          <p className="text-xs font-semibold tracking-[0.12em] text-[#2f6b57] uppercase">For {rec.name}</p>
          <h1 className="text-3xl font-semibold">{name}: notes for my recommendation letters</h1>
          {header?.contact_line ? <p className="text-[#5f5f5a]">{header.contact_line}</p> : null}
          <p className="mt-2">Thank you for writing for me. Here is what I am applying for and what I hope you might mention.</p>
        </header>

        <section className="grid gap-2">
          <h2 className="text-xs font-semibold tracking-[0.12em] text-[#2f6b57] uppercase">What I am applying for</h2>
          {letters.length ? (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#d8d8d4]">
                  <th className="py-1 pr-4 font-semibold">Course</th>
                  <th className="py-1 pr-4 font-semibold">University</th>
                  <th className="py-1 font-semibold">Letter due</th>
                </tr>
              </thead>
              <tbody>
                {letters.map((q) => {
                  const program = q.applications?.program_cycles?.programs;
                  return (
                    <tr key={q.id} className="border-b border-[#ececea]">
                      <td className="py-1 pr-4">{program?.title ?? "Course"}</td>
                      <td className="py-1 pr-4">{program?.institutions?.name ?? ""}</td>
                      <td className="py-1">{q.due_on ? shortDate(q.due_on) : "To confirm"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-[#5f5f5a]">No applications linked yet.</p>
          )}
        </section>

        {points.length ? (
          <section className="grid gap-2">
            <h2 className="text-xs font-semibold tracking-[0.12em] text-[#2f6b57] uppercase">What I hope you might mention</h2>
            <ul className="list-disc pl-5">{points.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </section>
        ) : null}

        {sections.map((section) => (
          <section key={section} className="grid gap-3">
            <h2 className="text-xs font-semibold tracking-[0.12em] text-[#2f6b57] uppercase">{CV_SECTIONS[section as CvSection]}</h2>
            {ordered.filter((e) => e.section === section).map((e) => (
              <div key={e.id} className="grid gap-1 break-inside-avoid">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <p className="font-semibold">{e.title}{e.organisation ? <span className="font-normal">, {e.organisation}</span> : null}</p>
                  <p className="text-[#5f5f5a]">{dateRange(e.start_month, e.end_month)}</p>
                </div>
                {e.bullets.length ? <ul className="list-disc pl-5">{e.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul> : null}
              </div>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}
