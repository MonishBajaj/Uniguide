import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InstitutionFactList } from "@/components/institution-fact-list";
import { arrivalSections, factsFor, toInstitutionFact } from "@/lib/institution-facts";
import { label } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { loadCard } from "../data";

export async function generateMetadata({ params }: PageProps<"/courses/[slug]/arrival">): Promise<Metadata> {
  const card = await loadCard((await params).slug);
  return { title: card ? `Arriving at ${card.institution_name}` : "Arrival guide" };
}

export default async function ArrivalPage({ params }: PageProps<"/courses/[slug]/arrival">) {
  const card = await loadCard((await params).slug);
  if (!card) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("institution_facts").select("*").eq("institution_id", card.institution_id!).order("created_at");
  const sections = arrivalSections(factsFor((data ?? []).map(toInstitutionFact), card.id!, ["airport", "arrival_support", "course_registration"]));
  if (sections.length === 0) notFound();

  return (
    <div className="mx-auto grid max-w-3xl gap-8 px-6 py-16">
      <header className="grid gap-2">
        <Link href={`/courses/${card.slug}`} className="text-sm text-muted underline underline-offset-2">{card.title}</Link>
        <h1 className="text-4xl font-semibold">Arriving at {card.institution_name}</h1>
        <p className="max-w-[680px] text-muted">What the university publishes about getting there and registering for courses. Confirm each item on the official page.</p>
      </header>
      {sections.map((s) => (
        <section key={s.kind} aria-labelledby={s.kind} className="grid gap-3">
          <h2 id={s.kind} className="text-2xl font-semibold">{label(s.kind)}</h2>
          <InstitutionFactList facts={s.facts} />
        </section>
      ))}
    </div>
  );
}
