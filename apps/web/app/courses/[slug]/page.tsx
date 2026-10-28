import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { costScenarios } from "@uniguide/matching";
import { Evidence, FactBadge, TierBadge } from "@/components/facts";
import { ShortlistButton } from "@/components/shortlist-button";
import { loadCurrentCycles, loadFx, toProgramInput, type RequirementRow } from "@/lib/catalog";
import { QUALIFICATIONS } from "@/lib/fields";
import { countryName, deadlineText, label, money } from "@/lib/format";
import { createClient, getUser } from "@/lib/supabase/server";

async function loadCard(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("program_cards").select("*").eq("slug", slug).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/courses/[slug]">): Promise<Metadata> {
  const card = await loadCard((await params).slug);
  return card
    ? { title: `${card.title}, ${card.institution_name}`, description: `Entry requirements, fees and deadlines for ${card.title} at ${card.institution_name}, with official sources.` }
    : {};
}

function requirementText(r: RequirementRow): string {
  switch (r.kind) {
    case "entry_qualification":
      return [QUALIFICATIONS[r.qualification ?? ""] ?? label(r.qualification), r.min_grade_text ?? (r.min_grade_numeric != null ? `${r.min_grade_numeric} (${r.grade_scale})` : null)]
        .filter(Boolean)
        .join(": ") + (r.is_desirable ? " (desirable, not a strict cut-off)" : "");
    case "language_test": {
      const sections = Object.entries((r.min_sections as Record<string, number>) ?? {})
        .map(([s, v]) => `${s} ${v}`)
        .join(", ");
      return `${label(r.exam)}${r.exam_version ? ` (${r.exam_version} version)` : ""}: ${r.min_total ?? "minimum not stated"}${sections ? `; at least ${sections}` : ""}`;
    }
    case "admissions_test":
      return `${label(r.exam)}: ${label(r.test_policy)}${r.min_total ? `, minimum ${r.min_total}` : ""}`;
    case "recommendation_letters":
      return `${r.count_required} recommendation letters`;
    default:
      return r.details ?? label(r.kind);
  }
}

export default async function CoursePage({ params }: PageProps<"/courses/[slug]">) {
  const card = await loadCard((await params).slug);
  if (!card) notFound();
  const { supabase, user } = await getUser();
  const cycle = (await loadCurrentCycles(supabase, [card.id!])).get(card.id!);
  const fx = await loadFx(supabase);
  const cost = costScenarios(toProgramInput(card, cycle), { fx });
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <TierBadge tier={card.coverage_tier!} />
        <span>{label(card.level)}</span>
        <span>·</span>
        <span>{label(card.delivery_mode)}</span>
        {card.duration_months ? <><span>·</span><span>{card.duration_months} months</span></> : null}
      </div>
      <h1 className="mt-3 text-4xl font-semibold">{card.title}</h1>
      <p className="mt-2 text-lg text-muted">
        {card.institution_name}, {countryName(card.country)}
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <ShortlistButton programId={card.id!} signedIn={Boolean(user)} />
        {card.official_url ? (
          <a href={card.official_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">Official course page</a>
        ) : null}
      </div>

      {!cycle ? (
        <section className="mt-12 rounded-2xl bg-surface p-6">
          <h2 className="text-xl font-semibold">Requirements not yet collected</h2>
          <p className="mt-2 text-muted">
            This course is listed from an official register. Its entry requirements, fees and deadlines have not been
            collected yet. Shortlisting it moves it up our checking queue.
          </p>
        </section>
      ) : (
        <>
          <p className="mt-8 text-sm text-muted">Facts for the {cycle.label.replace("-", " ")} intake.</p>

          <section aria-labelledby="deadlines" className="mt-8">
            <h2 id="deadlines" className="text-2xl font-semibold">Deadlines</h2>
            {cycle.deadlines.length === 0 ? <p className="mt-3 text-muted">Not yet known.</p> : (
              <ul className="mt-4 grid gap-3">
                {cycle.deadlines.map((d) => (
                  <li key={d.id} className="rounded-2xl bg-surface p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">
                        {label(d.kind)}{d.round ? ` (${d.round})` : ""}{d.applicant_category !== "all" ? `, ${label(d.applicant_category)} applicants` : ""}
                      </p>
                      <FactBadge status={d.status} />
                    </div>
                    <p className="mt-1 text-lg">{deadlineText(d.due_at, d.timezone, d.precision)}</p>
                    {d.owning_system !== "direct" ? <p className="text-sm text-muted">Apply through {label(d.owning_system)}</p> : null}
                    <Evidence source={d.sources} quote={d.evidence_quote} verifiedAt={d.verified_at} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="requirements" className="mt-12">
            <h2 id="requirements" className="text-2xl font-semibold">Entry requirements</h2>
            {cycle.requirements.length === 0 ? <p className="mt-3 text-muted">Not yet known.</p> : (
              <ul className="mt-4 grid gap-3">
                {cycle.requirements.map((r) => (
                  <li key={r.id} className="rounded-2xl bg-surface p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-muted">{label(r.kind)}{r.applicant_category !== "all" ? `, ${label(r.applicant_category)} applicants` : ""}</p>
                      <FactBadge status={r.status} />
                    </div>
                    <p className="mt-1">{requirementText(r)}</p>
                    <Evidence source={r.sources} quote={r.evidence_quote} verifiedAt={r.verified_at} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="costs" className="mt-12">
            <h2 id="costs" className="text-2xl font-semibold">Costs</h2>
            {cycle.cost_items.length === 0 ? <p className="mt-3 text-muted">Not yet known.</p> : (
              <>
                {cost.currency ? (
                  <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                    {(["low", "base", "high"] as const).map((k) => (
                      <div key={k} className="rounded-2xl bg-surface p-4">
                        <dt className="text-sm text-muted">{k === "base" ? "Base case" : k === "low" ? "Low" : "High"}</dt>
                        <dd className="mt-1 text-xl font-semibold">{money(cost[k], cost.currency!)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {!cost.complete ? (
                  <p className="mt-3 text-sm text-unverified">Incomplete: missing {cost.missing.join(", ")}. The real total is higher.</p>
                ) : null}
                {cost.assumptions.map((a) => <p key={a} className="mt-1 text-sm text-muted">{a}</p>)}
                <ul className="mt-4 grid gap-3">
                  {cycle.cost_items.map((c) => (
                    <li key={c.id} className="rounded-2xl bg-surface p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">
                          {label(c.kind)}{c.applicant_category !== "all" ? `, ${label(c.applicant_category)}` : ""}
                        </p>
                        <FactBadge status={c.status} />
                      </div>
                      <p className="mt-1">
                        {Number(c.low) === Number(c.high)
                          ? money(Number(c.base), c.currency)
                          : `${money(Number(c.low), c.currency)} to ${money(Number(c.high), c.currency)}`}{" "}
                        {label(c.basis)}{c.fee_year ? ` (${c.fee_year})` : ""}
                      </p>
                      <Evidence source={c.sources} quote={c.evidence_quote} verifiedAt={c.verified_at} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}

      <p className="mt-12 text-sm text-muted">
        Confirm every fact on the official page before you apply.
        {contact ? (
          <>
            {" "}
            <a
              className="underline underline-offset-2"
              href={`mailto:${contact}?subject=${encodeURIComponent(`Outdated info: ${card.slug}`)}`}
            >
              Report outdated information
            </a>
          </>
        ) : null}
      </p>
    </article>
  );
}
