import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { daysUntil, deadlineText, isFuture, label } from "@/lib/format";
import { setDigest } from "@/app/family/actions";
import { getRoles } from "@/lib/roles";
import { getUser } from "@/lib/supabase/server";
import { OwnBadge } from "@/components/own-badge";
import { courseOf } from "@/lib/own-application";
import { StagePath } from "@/components/journey/stage-path";
import { getLocale } from "@/lib/i18n/server";
import { localizeProgress, parentStepTitle } from "@/lib/journey-copy";
import { shortDate } from "@/lib/format";
import { Heart, ShieldCheck, Mail, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "My child", robots: { index: false } };

interface ParentJourney {
  stage: number;
  progress: { done: number; total: number; label: string };
  computedAt: string;
  steps: { parentTitle: string; stage: number; catalogueId?: string; params?: Record<string, string> }[];
}

export default async function ParentPage() {
  const { supabase, user } = await getUser();
  if (!user) notFound();
  const { parentOf } = await getRoles(supabase, user.id);
  if (parentOf.length === 0) notFound();

  const studentIds = parentOf.map((l) => l.student_id);
  const { data: settings } = await supabase.from("parent_links").select("student_id, digest_enabled").eq("parent_id", user.id).is("revoked_at", null);
  const digestOn = new Map((settings ?? []).map((s) => [s.student_id, s.digest_enabled]));
  const [{ data: shortlist }, { data: apps }] = await Promise.all([
    supabase.from("shortlists").select("user_id, programs(slug, title, institutions(name))").in("user_id", studentIds),
    supabase
      .from("applications")
      .select("id, user_id, status, decision, own_title, own_institution, program_cycles(label, programs(slug, title, institutions(name))), checklist_items(id, title, done, sort, deadlines(due_at, timezone, precision))")
      .in("user_id", studentIds),
  ]);
  const { t, locale } = await getLocale();
  const journeys = new Map(
    await Promise.all(parentOf.map(async (l) => [l.student_id, (await supabase.rpc("parent_journey", { p_student: l.student_id })).data as ParentJourney | null] as const)),
  );

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-6 py-12">
      <header className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
            <Heart className="h-4 w-4" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Parent & Guardian Portal</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary">My Child&apos;s Journey</h1>
        <p className="mt-2 max-w-2xl text-muted text-sm leading-relaxed">
          Read-only progress updates your child chose to share. To protect their independent voice, drafts, statements, and raw grades are never shared here.
        </p>
      </header>

      {parentOf.map((link) => {
        const mine = (apps ?? []).filter((a) => a.user_id === link.student_id);
        const listed = (shortlist ?? []).filter((s) => s.user_id === link.student_id && s.programs);
        const items = mine.flatMap((a) => a.checklist_items);
        const journey = journeys.get(link.student_id);
        const digest = digestOn.get(link.student_id) ?? true;

        return (
          <div key={link.student_id} className="grid gap-8">
            {/* Student Stage Path */}
            {journey ? (
              <StagePath
                stage={journey.stage}
                progress={{ ...journey.progress, label: localizeProgress(journey.stage, journey.progress, locale) }}
                t={t.journey}
                headingId={`path-${link.student_id}`}
              />
            ) : null}

            {/* Email Digest Settings Card */}
            <section className="rounded-xl border border-border bg-surface p-6 ambient-shadow flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-secondary" />
                <div>
                  <h3 className="font-serif font-bold text-sm text-primary">Weekly Summary Digest</h3>
                  <p className="text-xs text-muted">Receive a weekly digest of upcoming milestones and deadlines.</p>
                </div>
              </div>
              <form action={setDigest.bind(null, link.student_id, !digest)}>
                <button className={`btn btn-sm ${digest ? "btn-secondary" : "btn-coral-bright shadow-xs"}`}>
                  {digest ? "Disable weekly email" : "Enable weekly email"}
                </button>
              </form>
            </section>

            {/* Applications Progress */}
            {mine.length > 0 ? (
              <section className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow space-y-4">
                <h2 className="font-serif text-2xl font-bold text-primary border-b border-border/60 pb-3">
                  Applications in Progress ({mine.length})
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {mine.map((a) => {
                    const c = courseOf(a);
                    return (
                      <div key={a.id} className="rounded-xl border border-border bg-surface-2/40 p-5 space-y-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted bg-surface px-2.5 py-0.5 rounded-full border border-border inline-block">
                          {label(a.status)}
                        </span>
                        <h3 className="font-serif font-bold text-base text-primary">{c.title}</h3>
                        <p className="text-xs text-muted">{c.institution}</p>
                        {a.decision ? (
                          <p className="text-xs font-semibold text-verified mt-2">Decision: {label(a.decision)}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
