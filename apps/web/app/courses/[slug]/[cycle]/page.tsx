import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourseView } from "@/components/course-view";
import { CourseCommunity } from "@/components/course-community";
import { FacultyDossier } from "@/components/faculty-dossier";
import { loadCycle, loadFx } from "@/lib/catalog";
import { loadCard, loadCourseExtras } from "../data";

export async function generateMetadata({ params }: PageProps<"/courses/[slug]/[cycle]">): Promise<Metadata> {
  const { slug, cycle } = await params;
  const card = await loadCard(slug);
  const intake = cycle.replace("-", " ");
  return card
    ? {
        title: `${card.title}, ${card.institution_name}: ${intake} intake`,
        description: `Deadlines, entry requirements and fees for the ${intake} intake of ${card.title} at ${card.institution_name}, each linked to the official source.`,
        alternates: { canonical: `/courses/${card.slug}/${cycle}` },
      }
    : {};
}

export default async function CourseCyclePage({ params }: PageProps<"/courses/[slug]/[cycle]">) {
  const { slug, cycle: label } = await params;
  const card = await loadCard(slug);
  if (!card || !/^\d{4}-[a-z0-9_]+$/.test(label)) notFound();
  const { supabase, user, cycles, admin, interests, similar, facts, workRules, watching } = await loadCourseExtras(card.id!, card.institution_id!, card.country!);
  const cycle = await loadCycle(supabase, card.id!, label);
  if (!cycle) notFound();
  return (
    <CourseView card={card} cycle={cycle} cycles={cycles} fx={await loadFx(supabase)} signedIn={Boolean(user)} admin={admin} similar={similar} facts={facts} workRules={workRules} watching={watching}>
      <FacultyDossier supabase={supabase} card={card} interests={interests} />
      <CourseCommunity supabase={supabase} programId={card.id!} userId={user?.id ?? null} />
    </CourseView>
  );
}
