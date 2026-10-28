import type { Metadata } from "next";
import Link from "next/link";
import { CV_SECTIONS, dateRange, orderEntries, type CvSection } from "@/lib/cv";
import { getUser } from "@/lib/supabase/server";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "CV", robots: { index: false } };

/** One clean column for printing. "compact" tightens spacing to fit more on a page. */
export default async function PrintCv({ searchParams }: PageProps<"/app/cv/print">) {
  const compact = (await searchParams).template === "compact";
  const { supabase, user } = await getUser();
  const [{ data: header }, { data: entries }] = await Promise.all([
    supabase.from("cv_headers").select("*").eq("user_id", user!.id).maybeSingle(),
    supabase.from("cv_entries").select("*"),
  ]);
  const ordered = orderEntries(entries ?? []);
  const sections = [...new Set(ordered.map((e) => e.section))];
  const gap = compact ? "gap-3" : "gap-6";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/app/cv" className="btn btn-secondary btn-sm">Back to editing</Link>
        <Link href={`/app/cv/print?template=${compact ? "classic" : "compact"}`} className="btn btn-secondary btn-sm">{compact ? "Classic layout" : "Compact layout"}</Link>
        <PrintButton />
      </div>
      <article className={`mx-auto grid w-full max-w-[800px] bg-white p-10 text-[#141414] shadow-sm print:p-0 print:shadow-none ${gap} ${compact ? "text-[13px]" : "text-[14px]"}`}>
        <header className="grid gap-1 border-b border-[#d8d8d4] pb-4">
          <h1 className={`${compact ? "text-2xl" : "text-3xl"} font-semibold`}>{header?.full_name ?? "Your name"}</h1>
          {header?.headline ? <p>{header.headline}</p> : null}
          {header?.contact_line ? <p className="text-[#5f5f5a]">{header.contact_line}</p> : null}
        </header>
        {sections.map((section) => (
          <section key={section} className={`grid ${compact ? "gap-2" : "gap-3"}`}>
            <h2 className="text-xs font-semibold tracking-[0.12em] text-[#2f6b57] uppercase">{CV_SECTIONS[section as CvSection]}</h2>
            {ordered.filter((e) => e.section === section).map((e) => (
              <div key={e.id} className="grid gap-1 break-inside-avoid">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <p className="font-semibold">{e.title}{e.organisation ? <span className="font-normal">, {e.organisation}</span> : null}</p>
                  <p className="text-[#5f5f5a]">{[e.location, dateRange(e.start_month, e.end_month)].filter(Boolean).join(" · ")}</p>
                </div>
                {e.bullets.length ? (
                  <ul className="list-disc pl-5">
                    {e.bullets.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                ) : null}
              </div>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}
