import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { nextIntakeYear } from "@/lib/next-intake";
import { courseLabel } from "@/lib/own-application";
import { getUser } from "@/lib/supabase/server";
import { planNextIntake } from "./actions";

export const metadata: Metadata = { title: "Next intake" };

/** "No offers yet" (journey M5, J5.4, spec G20): kind copy and three ways forward, never an empty page. */
export default async function NextIntakePage() {
  const { supabase, user } = await getUser();
  const { t: all } = await getLocale();
  const t = all.journey.nextIntake;
  const [{ data: profile }, { data: rejected }] = await Promise.all([
    supabase.from("profiles").select("intake_year").eq("user_id", user!.id).single(),
    supabase
      .from("applications")
      .select("id, own_title, own_institution, program_cycles(intake_year, programs(title, institutions(name)))")
      .eq("user_id", user!.id)
      .eq("decision", "rejected")
      .order("created_at"),
  ]);
  const year = nextIntakeYear(
    profile?.intake_year ?? null,
    (rejected ?? []).flatMap((a) => (a.program_cycles?.intake_year ? [a.program_cycles.intake_year] : [])),
    new Date(),
  );

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <h1 className="text-4xl font-semibold">{t.title}</h1>
        <p className="max-w-2xl text-lg text-muted">{t.intro}</p>
      </header>

      <section aria-labelledby="ways" className="grid gap-4">
        <h2 id="ways" className="text-2xl font-semibold">{t.ways}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <article className="grid content-start gap-2 rounded-2xl border border-accent/40 bg-surface p-5">
            <h3 className="text-lg font-semibold">{t.planTitle(year)}</h3>
            <p className="text-sm text-muted">{t.planBody}</p>
            <form action={planNextIntake}>
              <button className="btn btn-primary">{t.plan(year)}</button>
            </form>
          </article>
          <article className="grid content-start gap-2 rounded-2xl border border-border bg-surface p-5">
            <h3 className="text-lg font-semibold">{t.changeTitle}</h3>
            <p className="text-sm text-muted">{t.changeBody}</p>
            <Link href="/app/onboarding?screen=3" className="btn btn-secondary justify-self-start">{t.change}</Link>
          </article>
          <article className="grid content-start gap-2 rounded-2xl border border-border bg-surface p-5">
            <h3 className="text-lg font-semibold">{t.whatIfTitle}</h3>
            <p className="text-sm text-muted">{t.whatIfBody}</p>
            <Link href="/app/match/what-if" className="btn btn-secondary justify-self-start">{t.whatIf}</Link>
          </article>
        </div>
      </section>

      {(rejected ?? []).length ? (
        <section aria-labelledby="decisions" className="grid gap-2">
          <h2 id="decisions" className="text-lg font-semibold">{t.decisions}</h2>
          <ul className="grid gap-1 text-sm">
            {rejected!.map((a) => (
              <li key={a.id}>
                <Link href={`/app/tracker/${a.id}`} className="underline underline-offset-2">{courseLabel(a)}</Link>
                <span className="text-muted"> · {t.rejected}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
