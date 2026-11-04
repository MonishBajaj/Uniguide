import Link from "next/link";
import { costScenarios } from "@uniguide/matching";
import { trackProgram } from "@/app/app/tracker/actions";
import { addCycle, addSource, removeSource } from "@/app/courses/actions";
import { Evidence, FactBadge, TierBadge } from "@/components/facts";
import { CourseQuestion } from "@/components/course-question";
import { ReportForm } from "@/components/report-form";
import { ProgramCard as SimilarCard } from "@/components/program-card";
import { WatchButton } from "@/components/watch-button";
import { ShortlistButton } from "@/components/shortlist-button";
import { toProgramInput, type CycleFacts, type ProgramCard, type RequirementRow } from "@/lib/catalog";
import { StudentLife } from "@/components/student-life";
import { CampusLiving } from "@/components/campus-living";
import { FundingAndWork } from "@/components/funding-and-work";
import type { InstitutionFact } from "@/lib/institution-facts";
import { AUTH_DISABLED } from "@/lib/env";
import { QUALIFICATIONS } from "@/lib/fields";
import { countryName, deadlineText, label, money, waiverAmount } from "@/lib/format";
import { deadlineIsStale, feeIsStale } from "@/lib/freshness";
import { SITE_URL } from "@/lib/env";
import type { FxTable } from "@uniguide/matching";
import type { Tables } from "@uniguide/db-types";
import { InstitutionMonogram } from "@/components/ui/monogram";
import { ExternalLink, Calendar, DollarSign, Award, BookOpen, ChevronLeft } from "lucide-react";

function requirementText(r: RequirementRow): string {
  switch (r.kind) {
    case "entry_qualification":
      return (
        [QUALIFICATIONS[r.qualification ?? ""] ?? label(r.qualification), r.min_grade_text ?? (r.min_grade_numeric != null ? `${r.min_grade_numeric} (${r.grade_scale})` : null)]
          .filter(Boolean)
          .join(": ") + (r.is_desirable ? " (desirable, not a strict cut-off)" : "")
      );
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

function Stale({ show, text }: { show: boolean; text: string }) {
  return show ? <span className="rounded-full border border-unverified/60 bg-[#ffdad3]/40 px-2.5 py-0.5 text-xs font-semibold text-unverified">{text}</span> : null;
}

export function CourseView(props: {
  card: ProgramCard;
  cycle: CycleFacts | undefined | null;
  cycles: { label: string; intake_term: string }[];
  fx: FxTable;
  signedIn: boolean;
  admin: { sources: Tables<"program_sources">[] } | null;
  similar?: ProgramCard[];
  facts?: InstitutionFact[];
  watching?: boolean;
  workRules?: Parameters<typeof FundingAndWork>[0]["workRules"];
  children?: React.ReactNode;
}) {
  const { card, cycle, cycles, fx, signedIn, admin } = props;
  const cost = costScenarios(toProgramInput(card, cycle ?? undefined), { fx });
  const register = cycle?.intake_term === "any";
  const facts = cycle
    ? [
        ...cycle.deadlines.map((d) => ({ value: `deadline:${d.id}`, label: `Deadline: ${deadlineText(d.due_at, d.timezone, d.precision)}` })),
        ...cycle.requirements.map((r) => ({ value: `requirement:${r.id}`, label: `Requirement: ${requirementText(r)}` })),
        ...cycle.cost_items.map((c) => ({ value: `cost_item:${c.id}`, label: `Cost: ${label(c.kind)} ${money(Number(c.base), c.currency)}` })),
      ]
    : [];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: card.title,
    url: `${SITE_URL}/courses/${card.slug}`,
    educationalLevel: label(card.level),
    provider: { "@type": "CollegeOrUniversity", name: card.institution_name, address: { "@type": "PostalAddress", addressCountry: card.country } },
  };

  return (
    <article className="mx-auto max-w-4xl px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <div className="mb-6">
        <Link href="/courses" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-primary transition-colors">
          <ChevronLeft className="h-4 w-4" />
          <span>Back to Courses</span>
        </Link>
      </div>

      {/* Hero Header */}
      <div className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow-lg mb-8">
        <div className="flex flex-col sm:flex-row items-start gap-5">
          <InstitutionMonogram name={card.institution_name} size="xl" className="shadow-md" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <TierBadge tier={card.coverage_tier!} />
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted border border-border/60">{label(card.level)}</span>
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted border border-border/60">{label(card.delivery_mode)}</span>
              {card.duration_months ? <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted border border-border/60">{card.duration_months} months</span> : null}
            </div>
            <h1 className="text-2xl sm:text-4xl font-serif font-bold text-primary leading-tight">{card.title}</h1>
            <p className="mt-2 text-base font-medium text-muted">{card.institution_name} · {countryName(card.country)}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 pt-6 border-t border-border/60 flex flex-wrap items-center gap-3">
          <ShortlistButton programId={card.id!} signedIn={signedIn} />
          {signedIn ? <WatchButton programId={card.id!} watching={props.watching ?? false} /> : null}
          {signedIn ? (
            <form action={trackProgram.bind(null, card.id!)}>
              <button className="btn btn-coral-bright btn-sm whitespace-nowrap shadow-xs">Track this application</button>
            </form>
          ) : null}
          {card.official_url ? (
            <a href={card.official_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm gap-1.5 whitespace-nowrap">
              <span>Official course page</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>

        {/* Intakes Navigation */}
        {cycles.filter((c) => c.intake_term !== "any").length > 1 ? (
          <nav aria-label="Intakes" className="mt-6 pt-4 border-t border-border/60 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-muted mr-1">Available Intakes:</span>
            {cycles.filter((c) => c.intake_term !== "any").map((c) => (
              <Link
                key={c.label}
                href={`/courses/${card.slug}/${c.label}`}
                aria-current={c.label === cycle?.label ? "page" : undefined}
                className="rounded-full border border-border bg-surface px-3 py-1 font-semibold transition-colors aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-white hover:border-primary/40"
              >
                {c.label.replace("-", " ")}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      {!cycle ? (
        <section className="rounded-xl border border-border bg-surface p-8 ambient-shadow">
          <h2 className="text-xl font-serif font-bold text-primary">Requirements not yet collected</h2>
          <p className="mt-2 text-muted text-sm leading-relaxed">
            This course is listed from an official register. Its entry requirements, fees and deadlines have not been collected yet. Shortlisting it moves it up our checking queue.
          </p>
        </section>
      ) : (
        <div className="space-y-8">
          <p className="text-xs text-muted font-medium bg-surface-2 px-3 py-1.5 rounded-lg inline-block border border-border/60">
            {register ? "Information from the official register, not tied to a particular intake." : `Verified facts for the ${cycle.label.replace("-", " ")} intake.`}
          </p>

          {/* Deadlines Section */}
          <section aria-labelledby="deadlines" className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
            <div className="flex items-center gap-2 mb-4 border-b border-border/60 pb-3">
              <Calendar className="h-5 w-5 text-secondary" />
              <h2 id="deadlines" className="text-2xl font-serif font-bold text-primary">Deadlines</h2>
            </div>
            {cycle.deadlines.length === 0 ? <p className="text-muted text-sm">Not yet known.</p> : (
              <ul className="grid gap-4">
                {cycle.deadlines.map((d) => (
                  <li key={d.id} className="rounded-xl border border-border bg-surface-2/40 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-primary">{label(d.kind)}{d.round ? ` (${d.round})` : ""}{d.applicant_category !== "all" ? `, ${label(d.applicant_category)} applicants` : ""}</p>
                      <span className="flex flex-wrap gap-2">
                        <Stale show={deadlineIsStale(d)} text="Not re-checked in 30 days" />
                        <FactBadge status={d.status} />
                      </span>
                    </div>
                    <p className="mt-2 text-xl font-serif font-bold text-primary">{deadlineText(d.due_at, d.timezone, d.precision)}</p>
                    {d.owning_system !== "direct" ? <p className="text-xs text-muted mt-1">Apply through {label(d.owning_system)}</p> : null}
                    <Evidence source={d.sources} quote={d.evidence_quote} verifiedAt={d.verified_at} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Fee Waivers Section */}
          {cycle.fee_waivers.length > 0 ? (
            <section aria-labelledby="waivers" className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
              <div className="flex items-center gap-2 mb-4 border-b border-border/60 pb-3">
                <Award className="h-5 w-5 text-secondary" />
                <h2 id="waivers" className="text-2xl font-serif font-bold text-primary">Application fee waivers</h2>
              </div>
              <ul className="grid gap-4">
                {cycle.fee_waivers.map((w) => (
                  <li key={w.id} className="rounded-xl border border-border bg-surface-2/40 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-muted">{label(w.kind)}{w.applicant_category !== "all" ? `, ${label(w.applicant_category)} applicants` : ""}</p>
                      <FactBadge status={w.status} />
                    </div>
                    <p className="mt-2 text-xl font-serif font-bold text-primary">{waiverAmount(w.amount, w.currency)}</p>
                    {w.conditions ? <p className="text-sm text-muted mt-1">{w.conditions}</p> : null}
                    <Evidence source={w.sources} quote={w.evidence_quote} verifiedAt={w.verified_at} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Requirements Section */}
          <section aria-labelledby="requirements" className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
            <div className="flex items-center gap-2 mb-4 border-b border-border/60 pb-3">
              <BookOpen className="h-5 w-5 text-primary" />
              <h2 id="requirements" className="text-2xl font-serif font-bold text-primary">Entry requirements</h2>
            </div>
            {cycle.requirements.length === 0 ? <p className="text-muted text-sm">Not yet known.</p> : (
              <ul className="grid gap-4">
                {cycle.requirements.map((r) => (
                  <li key={r.id} className="rounded-xl border border-border bg-surface-2/40 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted">{label(r.kind)}{r.applicant_category !== "all" ? `, ${label(r.applicant_category)} applicants` : ""}</p>
                      <FactBadge status={r.status} />
                    </div>
                    <p className="mt-2 text-base font-semibold text-primary">{requirementText(r)}</p>
                    <Evidence source={r.sources} quote={r.evidence_quote} verifiedAt={r.verified_at} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Costs Section */}
          <section aria-labelledby="costs" className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
            <div className="flex items-center gap-2 mb-4 border-b border-border/60 pb-3">
              <DollarSign className="h-5 w-5 text-verified" />
              <h2 id="costs" className="text-2xl font-serif font-bold text-primary">Costs & Tuition</h2>
            </div>
            {cycle.cost_items.length === 0 ? <p className="text-muted text-sm">Not yet known.</p> : (
              <>
                {cost.currency && cost.lines.length ? (
                  <dl className="mb-6 grid grid-cols-3 gap-3 text-center">
                    {(["low", "base", "high"] as const).map((k) => (
                      <div key={k} className="rounded-xl border border-border bg-surface-2/60 p-4">
                        <dt className="text-xs font-bold uppercase tracking-wider text-muted">{k === "base" ? "Base case" : k === "low" ? "Low" : "High"}</dt>
                        <dd className="mt-1 font-serif text-2xl font-bold text-primary">{money(cost[k], cost.currency!)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {!cost.complete ? <p className="mb-3 text-xs font-semibold text-unverified bg-[#ffdad3]/40 p-2.5 rounded-lg border border-[#ffb4a4]/60">Incomplete: missing {cost.missing.join(", ")}. The real total is higher.</p> : null}
                {cost.assumptions.map((a) => <p key={a} className="mt-1 text-xs text-muted">{a}</p>)}
                <ul className="mt-4 grid gap-4">
                  {cycle.cost_items.map((c) => (
                    <li key={c.id} className="rounded-xl border border-border bg-surface-2/40 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-primary">{label(c.kind)}{c.applicant_category !== "all" ? `, ${label(c.applicant_category)}` : ""}</p>
                        <span className="flex flex-wrap gap-2">
                          <Stale show={!register && feeIsStale(c, cycle.intake_year)} text="Fee is from an earlier year" />
                          <FactBadge status={c.status} />
                        </span>
                      </div>
                      <p className="mt-2 text-lg font-serif font-bold text-primary">
                        {Number(c.low) === Number(c.high) ? money(Number(c.base), c.currency) : `${money(Number(c.low), c.currency)} to ${money(Number(c.high), c.currency)}`}{" "}
                        <span className="text-sm font-sans font-normal text-muted">{label(c.basis)}{c.fee_year ? ` (${c.fee_year})` : ""}</span>
                      </p>
                      {c.details ? <p className="text-xs text-muted mt-1">{c.details}</p> : null}
                      <Evidence source={c.sources} quote={c.evidence_quote} verifiedAt={c.verified_at} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* Student Life & Campus Living */}
          {props.facts?.length ? (
            <div className="space-y-8">
              <StudentLife facts={props.facts} />
              <CampusLiving facts={props.facts} />
            </div>
          ) : null}

          {/* Funding and Work rules */}
          {props.workRules ? (
            <FundingAndWork facts={props.facts ?? []} workRules={props.workRules} />
          ) : null}

          {/* Similar Programs */}
          {props.similar?.length ? (
            <section aria-labelledby="similar" className="mt-12">
              <h2 id="similar" className="text-2xl font-serif font-bold text-primary mb-4">Similar courses</h2>
              <div className="grid gap-6 md:grid-cols-2">
                {props.similar.map((s) => (
                  <SimilarCard key={s.id} card={s} signedIn={signedIn} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Course Q&A grounded fact answers */}
          <CourseQuestion programId={card.id!} />

          {/* Report Outdated Info */}
          <section id="report" aria-labelledby="report-heading" className="mt-8 rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
            <h2 id="report-heading" className="text-lg font-serif font-bold text-primary mb-2">Report outdated or missing information</h2>
            <p className="text-xs text-muted mb-4">Help keep global course data accurate for everyone. Accepted submissions earn review credits.</p>
            <ReportForm programId={card.id!} facts={facts} />
          </section>

          {/* Admin Tools */}
          {admin ? (
            <section aria-labelledby="admin-tools" className="mt-12 rounded-xl border border-primary/20 bg-primary/5 p-6">
              <h2 id="admin-tools" className="text-lg font-bold text-primary mb-4">Reviewer Tools</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <form action={addCycle.bind(null, card.id!, card.slug!)} className="grid gap-2">
                  <label htmlFor="cy-term" className="text-xs font-semibold">Add intake cycle</label>
                  <div className="flex flex-wrap gap-2">
                    <input id="cy-year" name="intake_year" type="number" min={2025} max={2035} required placeholder="2027" className="field text-sm w-24" />
                    <input id="cy-term" name="intake_term" required placeholder="fall, autumn" className="field text-sm flex-1 min-w-[120px]" />
                    <button className="btn btn-secondary btn-sm">Add</button>
                  </div>
                </form>
                <form action={addSource.bind(null, card.id!, card.slug!)} className="grid gap-2">
                  <label htmlFor="source_url" className="text-xs font-semibold">Add source link</label>
                  <div className="flex flex-wrap gap-2">
                    <select id="src-kind" name="kind" className="field text-sm w-32">
                      {["admissions", "requirements", "international", "fees", "deadlines", "course"].map((k) => <option key={k} value={k}>{label(k)}</option>)}
                    </select>
                    <input id="source_url" name="url" type="url" placeholder="https://..." required className="field text-sm flex-1 min-w-[180px]" />
                    <button className="btn btn-secondary btn-sm">Add</button>
                  </div>
                </form>
              </div>
              {admin.sources.length ? (
                <div className="mt-4 pt-4 border-t border-border/60">
                  <p className="text-xs font-semibold text-muted mb-2">Registered source links:</p>
                  <ul className="space-y-1 text-xs">
                    {admin.sources.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2">
                        <a href={s.url} target="_blank" rel="noreferrer" className="text-primary underline truncate">{s.url}</a>
                        <form action={removeSource.bind(null, s.id, card.slug)}>
                          <button className="text-conflicting hover:underline text-xs">Remove</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      )}

      {props.children}
    </article>
  );
}
