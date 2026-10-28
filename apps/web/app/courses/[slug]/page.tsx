import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourseView } from "@/components/course-view";
import { FacultyDossier } from "@/components/faculty-dossier";
import { loadCurrentCycles, loadFx } from "@/lib/catalog";
import { loadCard, loadCourseExtras } from "./data";

export async function generateMetadata({ params }: PageProps<"/courses/[slug]">): Promise<Metadata> {
  const card = await loadCard((await params).slug);
  return card
    ? {
        title: `${card.title}, ${card.institution_name}`,
        description: `Entry requirements, fees and deadlines for ${card.title} at ${card.institution_name}, with official sources.`,
        alternates: { canonical: `/courses/${card.slug}` },
      }
    : {};
}

export default async function CoursePage({ params }: PageProps<"/courses/[slug]">) {
  const card = await loadCard((await params).slug);
  if (!card) notFound();
  const { supabase, user, cycles, admin, interests } = await loadCourseExtras(card.id!);
  const cycle = (await loadCurrentCycles(supabase, [card.id!])).get(card.id!);
  return (
    <CourseView card={card} cycle={cycle} cycles={cycles} fx={await loadFx(supabase)} signedIn={Boolean(user)} admin={admin}>
      <FacultyDossier supabase={supabase} card={card} interests={interests} />
    </CourseView>
  );
}
