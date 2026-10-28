import Link from "next/link";
import { costScenarios } from "@uniguide/matching";
import { trackProgram } from "@/app/app/tracker/actions";
import { addCycle, addSource, removeSource } from "@/app/courses/actions";
import { Evidence, FactBadge, TierBadge } from "@/components/facts";
import { CourseQuestion } from "@/components/course-question";
import { ReportForm } from "@/components/report-form";
import { ShortlistButton } from "@/components/shortlist-button";
import { toProgramInput, type CycleFacts, type ProgramCard, type RequirementRow } from "@/lib/catalog";
import { QUALIFICATIONS } from "@/lib/fields";
import { countryName, deadlineText, label, money } from "@/lib/format";
import { deadlineIsStale, feeIsStale } from "@/lib/freshness";
import { SITE_URL } from "@/lib/env";
import type { FxTable } from "@uniguide/matching";
import type { Tables } from "@uniguide/db-types";

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
  return show ? <span className="rounded-full border border-unverified/40 px-2 py-0.5 text-xs text-unverified">{text}</span> : null;
}

export function CourseView(props: {
  card: ProgramCard;
  cycle: CycleFacts | undefined | null;
  cycles: { label: string; intake_term: string }[];
  fx: FxTable;
  signedIn: boolean;
  admin: { sources: Tables<"program_sources">[] } | null;
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
    <article className="mx-auto max-w-3xl px-6 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <TierBadge tier={card.coverage_tier!} />
        <span>{label(card.level)}</span>
        <span>·</span>
        <span>{label(card.delivery_mode)}</span>
        {card.duration_months ? <><span>·</span><span>{card.duration_months} months</span></> : null}
      </div>
      <h1 className="mt-3 text-4xl font-semibold">{card.title}</h1>
      <p className="mt-2 text-lg text-muted">{card.institution_name}, {countryName(card.country)}</p>
      <div className="mt-6 flex flex-wrap items-start gap-3">
        <ShortlistButton programId={card.id!} signedIn={signedIn} />
        {signedIn ? (
          <form action={trackProgram.bind(null, card.id!)}>
            <button className="btn btn-secondary btn-sm">Track this application</button>
          </form>
        ) : null}
        {card.official_url ? <a href={card.official_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">Official course page</a> : null}
      </div>

      {cycles.filter((c) => c.intake_term !== "any").length > 1 ? (
        <nav aria-label="Intakes" className="mt-6 flex flex-wrap gap-2 text-sm">
          {cycles.filter((c) => c.intake_term !== "any").map((c) => (
            <Link key={c.label} href={`/courses/${card.slug}/${c.label}`} aria-current={c.label === cycle?.label ? "page" : undefined} className="rounded-full bg-surface px-3 py-1 aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground">
              {c.label.replace("-", " ")}
            </Link>
          ))}
        </nav>
      ) : null}

      {!cycle ? (
        <section className="mt-12 rounded-2xl bg-surface p-6">
          <h2 className="text-xl font-semibold">Requirements not yet collected</h2>
          <p className="mt-2 text-muted">This course is listed from an official register. Its entry requirements, fees and deadlines have not been collected yet. Shortlisting it moves it up our checking queue.</p>
        </section>
      ) : (
        <>
          <p className="mt-8 text-sm text-muted">
            {register ? "Information from the official register, not tied to a particular intake." : `Facts for the ${cycle.label.replace("-", " ")} intake.`}
          </p>

          <section aria-labelledby="deadlines" className="mt-8">
            <h2 id="deadlines" className="text-2xl font-semibold">Deadlines</h2>
            {cycle.deadlines.length === 0 ? <p className="mt-3 text-muted">Not yet known.</p> : (
              <ul className="mt-4 grid gap-3">
                {cycle.deadlines.map((d) => (
                  <li key={d.id} className="rounded-2xl bg-surface p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{label(d.kind)}{d.round ? ` (${d.round})` : ""}{d.applicant_category !== "all" ? `, ${label(d.applicant_category)} applicants` : ""}</p>
                      <span className="flex flex-wrap gap-2">
                        <Stale show={deadlineIsStale(d)} text="Not re-checked in 30 days" />
                        <FactBadge status={d.status} />
                      </span>
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
                {cost.currency && cost.lines.length ? (
                  <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                    {(["low", "base", "high"] as const).map((k) => (
                      <div key={k} className="rounded-2xl bg-surface p-4">
                        <dt className="text-sm text-muted">{k === "base" ? "Base case" : k === "low" ? "Low" : "High"}</dt>
                        <dd className="mt-1 text-xl font-semibold">{money(cost[k], cost.currency!)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {!cost.complete ? <p className="mt-3 text-sm text-unverified">Incomplete: missing {cost.missing.join(", ")}. The real total is higher.</p> : null}
                {cost.assumptions.map((a) => <p key={a} className="mt-1 text-sm text-muted">{a}</p>)}
                <ul className="mt-4 grid gap-3">
                  {cycle.cost_items.map((c) => (
                    <li key={c.id} className="rounded-2xl bg-surface p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{label(c.kind)}{c.applicant_category !== "all" ? `, ${label(c.applicant_category)}` : ""}</p>
                        <span className="flex flex-wrap gap-2">
                          <Stale show={!register && feeIsStale(c, cycle.intake_year)} text="Fee is from an earlier year" />
                          <FactBadge status={c.status} />
                        </span>
                      </div>
                      <p className="mt-1">
                        {Number(c.low) === Number(c.high) ? money(Number(c.base), c.currency) : `${money(Number(c.low), c.currency)} to ${money(Number(c.high), c.currency)}`}{" "}
                        {label(c.basis)}{c.fee_year ? ` (${c.fee_year})` : ""}
                      </p>
                      {c.details ? <p className="text-sm text-muted">{c.details}</p> : null}
                      <Evidence source={c.sources} quote={c.evidence_quote} verifiedAt={c.verified_at} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}

      {props.children}

      {signedIn && cycle ? <CourseQuestion programId={card.id!} /> : null}

      <section aria-labelledby="report" className="mt-12 rounded-2xl bg-surface p-6">
        <h2 id="report" className="text-lg font-semibold">Something out of date?</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Confirm every fact on the official page before you apply. If it says something different, tell us.</p>
        {signedIn ? <ReportForm programId={card.id!} facts={facts} /> : (
          <Link href={`/login?next=/courses/${card.slug}`} className="btn btn-secondary btn-sm">Sign in to report outdated information</Link>
        )}
      </section>

      {admin ? (
        <section aria-labelledby="admin" className="mt-12 grid gap-4 rounded-2xl border border-border p-6">
          <h2 id="admin" className="text-lg font-semibold">Admin: official pages and intakes</h2>
          <ul className="grid gap-2 text-sm">
            {admin.sources.filter((s) => s.active).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface p-3">
                <span><span className="font-semibold">{label(s.kind)}</span> <a href={s.url} className="break-all underline underline-offset-2">{s.url}</a>
                  <span className="block text-muted">Last checked {s.last_checked_at?.slice(0, 10) ?? "never"}{s.last_changed_at ? `, changed ${s.last_changed_at.slice(0, 10)}` : ""}</span></span>
                <form action={removeSource.bind(null, s.id, card.slug!)}><button className="btn btn-secondary btn-sm">Remove</button></form>
              </li>
            ))}
          </ul>
          <form action={addSource.bind(null, card.id!, card.slug!)} className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="src-kind">Kind</label>
            <select id="src-kind" name="kind" className="field max-w-[180px]">
              {["admissions", "requirements", "international", "fees", "deadlines", "course"].map((k) => <option key={k} value={k}>{label(k)}</option>)}
            </select>
            <label className="sr-only" htmlFor="src-url">Official URL</label>
            <input id="src-url" name="url" type="url" required placeholder="https://official page" className="field max-w-md" />
            <button className="btn btn-secondary">Add page</button>
          </form>
          <form action={addCycle.bind(null, card.id!, card.slug!)} className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="cy-year">Intake year</label>
            <input id="cy-year" name="intake_year" type="number" min={2025} max={2035} required placeholder="2027" className="field max-w-[120px]" />
            <label className="sr-only" htmlFor="cy-term">Term</label>
            <input id="cy-term" name="intake_term" required placeholder="fall, autumn, winter" className="field max-w-[180px]" />
            <label className="sr-only" htmlFor="cy-start">Starts on</label>
            <input id="cy-start" name="starts_on" type="date" className="field max-w-[180px]" />
            <button className="btn btn-secondary">Open intake</button>
          </form>
          <p className="text-xs text-muted">Then run <code className="font-mono">uniguide-worker extract-program {card.slug}</code> to read these pages.</p>
        </section>
      ) : null}
    </article>
  );
}
