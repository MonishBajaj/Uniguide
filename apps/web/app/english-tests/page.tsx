import type { Metadata } from "next";
import Link from "next/link";
import { FactBadge } from "@/components/facts";
import { byExam, type LanguageRow } from "@/lib/english-tests";
import { countryName, label } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "English tests accepted",
  description: "Which English tests each course accepts and the minimum scores it publishes.",
};

const minimums = (r: LanguageRow) => {
  const sections = r.minSections ? Object.entries(r.minSections).map(([k, v]) => `${k} ${v}`).join(", ") : null;
  const total = r.minTotal !== null ? `overall ${r.minTotal}` : null;
  return [total, sections ? `at least ${sections}` : null].filter(Boolean).join("; ") || "minimum not stated";
};

export default async function EnglishTests({ searchParams }: PageProps<"/english-tests">) {
  const params = await searchParams;
  const exam = typeof params.exam === "string" ? params.exam.slice(0, 40) : undefined;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("requirements")
    .select(
      "exam, exam_version, min_total, min_sections, status, test_policy, program_cycles!inner(programs!inner(slug, title, institutions!inner(name, country)))",
    )
    .eq("kind", "language_test")
    .not("exam", "is", null)
    .limit(1000);

  const rows: LanguageRow[] = (data ?? []).map((r) => ({
    programSlug: r.program_cycles.programs.slug,
    programTitle: r.program_cycles.programs.title,
    institution: r.program_cycles.programs.institutions.name,
    country: r.program_cycles.programs.institutions.country,
    exam: r.exam!,
    examVersion: r.exam_version,
    minTotal: r.min_total,
    minSections: r.min_sections as Record<string, number> | null,
    status: r.status,
    testPolicy: r.test_policy,
  }));
  const groups = byExam(rows);
  const shown = exam ? groups.filter((g) => g.exam === exam) : groups;

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-4xl font-semibold">English tests accepted</h1>
      <p className="mt-3 max-w-[680px] text-muted">
        Each section lists the courses that publish a minimum for that test. Scores are not converted between tests,
        because no official conversion is published for every course. Check the course page for the exact wording.
      </p>

      {groups.length > 1 ? (
        <nav aria-label="Filter by test" className="mt-6 flex flex-wrap gap-2 text-sm">
          <Link href="/english-tests" className={`rounded-full border border-border px-3 py-1 ${!exam ? "bg-accent text-accent-foreground" : "bg-surface"}`}>All</Link>
          {[...new Set(groups.map((g) => g.exam))].map((e) => (
            <Link key={e} href={`/english-tests?exam=${e}`} className={`rounded-full border border-border px-3 py-1 ${exam === e ? "bg-accent text-accent-foreground" : "bg-surface"}`}>{label(e)}</Link>
          ))}
        </nav>
      ) : null}

      {error ? (
        <p role="alert" className="mt-8 text-conflicting">Could not load the tests. Please try again.</p>
      ) : shown.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-border bg-surface p-6 text-muted">No English test requirements have been collected yet.</p>
      ) : (
        <div className="mt-10 grid gap-10">
          {shown.map((g) => (
            <section key={`${g.exam}-${g.examVersion}`} aria-labelledby={`e-${g.exam}-${g.examVersion ?? "any"}`}>
              <h2 id={`e-${g.exam}-${g.examVersion ?? "any"}`} className="text-2xl font-semibold">
                {label(g.exam)}{g.examVersion ? ` (${g.examVersion} version)` : ""}
              </h2>
              <ul className="mt-4 grid gap-3">
                {g.courses.map((c) => (
                  <li key={`${c.programSlug}-${c.minTotal}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
                    <div>
                      <Link href={`/courses/${c.programSlug}`} className="font-semibold underline-offset-2 hover:underline">{c.programTitle}</Link>
                      <p className="text-sm text-muted">{c.institution} · {countryName(c.country)}</p>
                    </div>
                    <div className="text-right">
                      <p>{c.testPolicy && c.testPolicy !== "required" ? `${label(c.testPolicy)}; ` : ""}{minimums(c)}</p>
                      <FactBadge status={c.status as "verified" | "unverified" | "conflicting" | "unknown"} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
