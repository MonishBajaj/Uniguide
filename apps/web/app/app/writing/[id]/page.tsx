import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { label, shortDate } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { getUser } from "@/lib/supabase/server";
import { loadFaculty } from "@/lib/faculty";
import { courseMaterial, namedInDraft, WHY_QUESTIONS, type MaterialItem } from "@/lib/why-helper";
import { outlineFor, STORY_QUESTIONS } from "@/lib/writing/prompts";
import { researchChecks } from "@/lib/writing/research";
import { classifyPrompt, PROMPT_TYPES } from "@/lib/writing/supplemental";
import { segment } from "@/lib/writing/segment";
import type { RubricResult, ComparisonResult } from "@/lib/writing/review";
import { deleteDocument, setFinalDraft } from "../actions";
import { Editor } from "./editor";
import { FeedbackButtons } from "./feedback-buttons";
import { FileText, Sparkles, BookOpen, Clock, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";

export const metadata: Metadata = { title: "Draft" };

const CRITERION: Record<string, string> = {
  clear_goals: "Clear goals",
  specific_evidence: "Specific evidence",
  program_fit: "Fit with the program",
  reflection: "Reflection",
  structure: "Structure",
};

export default async function DocumentPage({ params }: PageProps<"/app/writing/[id]">) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  const { t: all } = await getLocale();
  const ta = all.assist;
  const [{ data: doc }, { data: versions }, { data: reviews }, { data: allowance }] = await Promise.all([
    supabase.from("documents").select("*").eq("id", id).maybeSingle(),
    supabase.from("document_versions").select("id, body, word_count, created_at").eq("document_id", id).order("created_at", { ascending: false }),
    supabase.from("reviews").select("*, document_versions!reviews_version_id_fkey(body, created_at)").order("created_at", { ascending: false }),
    supabase.rpc("writing_allowance").single(),
  ]);
  if (!doc) notFound();
  const ids = new Set((versions ?? []).map((v) => v.id));
  const mine = (reviews ?? []).filter((r) => ids.has(r.version_id));
  const latest = versions?.[0];
  const outline = outlineFor(doc.kind, doc.word_limit, doc.question);
  const promptType = doc.kind === "supplemental" && doc.question ? classifyPrompt(doc.question) : null;
  const guide = promptType ? PROMPT_TYPES[promptType] : null;

  // "Why this university": material from this course's stored facts and its researchers.
  let material: MaterialItem[] = [];
  let institution: string | null = null;
  const isResearch = doc.kind === "research_statement";
  if ((doc.kind === "why_this_university" || promptType === "why_us" || isResearch) && doc.application_id) {
    const { data: app } = await supabase.from("applications").select("program_cycles(program_id)").eq("id", doc.application_id).maybeSingle();
    const programId = app?.program_cycles?.program_id;
    const [{ data: card }, { data: profile }] = await Promise.all([
      programId ? supabase.from("program_cards").select("*").eq("id", programId).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("profiles").select("research_interests").eq("user_id", user!.id).single(),
    ]);
    if (card) {
      institution = card.institution_name;
      const faculty = card.level === "master" || card.level === "doctorate" ? await loadFaculty(supabase, card, profile?.research_interests ?? null, 6) : [];
      // A research statement needs the people, not the city or the format.
      material = courseMaterial(card, faculty).filter((m) => !isResearch || m.group === "Researchers");
    }
  }
  const named = namedInDraft(latest?.body ?? "", material);
  const checks = isResearch && latest ? researchChecks(latest.body) : null;
  const countable = material.filter((m) => m.terms.length);

  return (
    <div className="grid gap-8 max-w-5xl mx-auto">
      <header className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <Link href="/app/writing" className="text-xs font-bold text-muted hover:text-primary inline-flex items-center gap-1 mb-3">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Writing Studio</span>
        </Link>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-primary/10 text-primary">
            {label(doc.kind)}
          </span>
          {doc.word_limit ? (
            <span className="px-3 py-1 rounded-full text-xs font-mono font-semibold bg-surface-2 text-muted">
              Limit: {doc.word_limit} words
            </span>
          ) : null}
        </div>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary">{doc.title}</h1>
        {doc.question ? (
          <blockquote className="mt-4 rounded-xl border-l-4 border-secondary bg-surface-2/40 p-4 text-xs italic text-muted leading-relaxed">
            {doc.question}
          </blockquote>
        ) : null}
      </header>

      <details className="rounded-xl border border-border bg-surface p-6 ambient-shadow group">
        <summary className="cursor-pointer font-serif font-bold text-base text-primary flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-secondary" />
            <span>Outline: what each section should answer</span>
          </div>
          <span className="text-xs text-muted group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <ol className="mt-4 grid gap-3 text-xs">
          {outline.map((s) => (
            <li key={s.id} className="p-3 rounded-lg bg-surface-2/40 border border-border/60">
              <span className="font-bold text-primary">{s.title}</span>
              {s.words ? <span className="text-muted"> · approx. {s.words} words</span> : null}
              <ul className="mt-2 list-disc pl-5 text-muted space-y-1">{s.questions.map((q) => <li key={q}>{q}</li>)}</ul>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted">
          <Link href="/app/writing/stories" className="font-semibold text-secondary underline underline-offset-2 hover:text-primary">Your story bank</Link> holds the personal reflections for each part.
        </p>
      </details>

      {guide ? (
        <section aria-labelledby="strategy" className="grid gap-3 rounded-xl border border-border bg-surface p-6 ambient-shadow text-xs">
          <div>
            <h2 id="strategy" className="font-serif font-bold text-lg text-primary">How to approach this question</h2>
            <p className="text-muted mt-1">
              {guide.about
                ? <>This looks like a question about <span className="font-bold text-primary">{guide.about}</span>. If it is really asking something else, follow the question, not this guess.</>
                : "We could not tell what kind of question this is, so these are general guidelines. Always follow the prompt itself."}
            </p>
          </div>
          <ul className="grid list-disc gap-1.5 pl-5 text-muted leading-relaxed">{guide.strategy.map((q) => <li key={q}>{q}</li>)}</ul>
          <div className="grid gap-2 pt-2 border-t border-border/60">
            <h3 className="font-bold text-primary">From your story bank</h3>
            <ul className="grid gap-1 text-muted">
              {guide.stories.map((sid) => {
                const q = STORY_QUESTIONS.find((s) => s.id === sid)!;
                return <li key={sid}>{q.question}</li>;
              })}
            </ul>
            <Link href="/app/writing/stories" className="justify-self-start font-semibold text-secondary underline underline-offset-2 hover:text-primary">Answer these in your story bank</Link>
          </div>
        </section>
      ) : null}

      {isResearch ? (
        <section aria-labelledby="research-checks" className="grid gap-3 rounded-xl border border-border bg-surface p-6 ambient-shadow text-xs">
          <h2 id="research-checks" className="font-serif font-bold text-lg text-primary">Research statement checks</h2>
          {checks ? (
            <ul className="grid gap-2">
              <li className="flex items-start gap-2 p-3 rounded-lg bg-surface-2/40 border border-border/60">
                <span aria-hidden="true" className={checks.questionSentences.length ? "text-verified font-bold" : "text-unverified font-bold"}>
                  {checks.questionSentences.length ? "✓" : "○"}
                </span>
                <span className="leading-relaxed">
                  {checks.questionSentences.length
                    ? `States a research question (${checks.questionSentences.join(", ")}). Could someone else tell when it has been answered?`
                    : "No research question found yet. What exactly do you want to find out?"}
                </span>
              </li>
              <li className="flex items-start gap-2 p-3 rounded-lg bg-surface-2/40 border border-border/60">
                <span aria-hidden="true" className={checks.methods.length ? "text-verified font-bold" : "text-unverified font-bold"}>
                  {checks.methods.length ? "✓" : "○"}
                </span>
                <span className="leading-relaxed">
                  {checks.methods.length
                    ? `Names how you would answer it: ${checks.methods.join(", ")}. Have you used these before, and on what?`
                    : "No method named yet. How would you answer the question, and with what data?"}
                </span>
              </li>
            </ul>
          ) : (
            <p className="text-muted">Save a draft to check whether it states a question and names how you would answer it.</p>
          )}
        </section>
      ) : null}

      {material.length ? (
        <section aria-labelledby="material" className="grid gap-4 rounded-xl border border-border bg-surface p-6 ambient-shadow text-xs">
          <div>
            <h2 id="material" className="font-serif font-bold text-lg text-primary">Material from this course</h2>
            <p className="text-muted mt-1 leading-relaxed">
              Facts we hold about {institution}, from official pages and OpenAlex. Check each one on the official page,
              and use only what connects to something you have really done. The words are yours to write.
            </p>
          </div>
          {latest ? (
            <p role="status" className={`p-3 rounded-lg text-xs font-semibold ${named.size ? "bg-verified/10 text-verified border border-verified/20" : "bg-unverified/10 text-unverified border border-unverified/20"}`}>
              {named.size
                ? `Your latest draft names ${named.size} of ${countable.length} specific things about this course.`
                : "Your latest draft does not name anything specific to this course yet. Could a reader tell which university it was written for?"}
            </p>
          ) : null}
          {(["Researchers", "Place", "Course"] as const).map((group) => {
            const list = material.filter((m) => m.group === group);
            return list.length ? (
              <div key={group} className="grid gap-2 p-3 rounded-lg bg-surface-2/40 border border-border/60">
                <h3 className="font-bold text-primary">{group}</h3>
                <ul className="grid gap-1">
                  {list.map((m) => (
                    <li key={m.key} className="flex items-baseline gap-1.5">
                      <span aria-hidden="true" className={named.has(m.key) ? "text-verified font-bold" : "text-muted"}>{named.has(m.key) ? "✓" : "·"}</span>
                      <span className="font-semibold text-primary">{m.label}</span>
                      {m.detail ? <span className="text-muted"> · {m.detail}</span> : null}
                      {named.has(m.key) ? <span className="sr-only"> (named in your draft)</span> : null}
                    </li>
                  ))}
                </ul>
                <p className="text-muted italic text-[11px]">{WHY_QUESTIONS[group]}</p>
              </div>
            ) : null;
          })}
        </section>
      ) : null}

      <Editor documentId={doc.id} initial={latest?.body ?? ""} wordLimit={doc.word_limit} />

      <section aria-labelledby="feedback" className="grid gap-6 rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-secondary" />
            <h2 id="feedback" className="font-serif text-2xl font-bold text-primary">Writing Coach Feedback</h2>
          </div>
          {latest ? <FeedbackButtons documentId={doc.id} canCompare={(versions ?? []).length > 1} freeReview={Boolean(allowance?.free_review)} /> : null}
        </div>
        {mine.length === 0 ? (
          <p className="text-xs text-muted leading-relaxed">
            Save a draft, then request coach review. Feedback references your specific sentences by number and offers probing questions—preserving your original voice and thought.
          </p>
        ) : null}
        {mine.map((r) => {
          const sentences = segment(r.document_versions?.body ?? "");
          const text = (sid: string) => sentences.find((s) => s.id === sid)?.text ?? "";
          if (r.kind === "comparison") {
            const c = r.result as unknown as ComparisonResult;
            return (
              <article key={r.id} className="rounded-xl border border-border/80 bg-surface-2/40 p-5 text-xs space-y-3">
                <p className="text-muted font-mono">Comparison of your last two drafts · {shortDate(r.created_at)}</p>
                <ul className="grid gap-2">
                  {c.criteria.map((x) => (
                    <li key={x.criterion} className="p-3 rounded-lg bg-surface border border-border/60">
                      <span className="font-bold text-primary">{CRITERION[x.criterion]}:</span>{" "}
                      <span className={x.better === "B" ? "text-verified font-semibold" : x.better === "A" ? "text-muted" : "text-primary"}>
                        {x.better === "B" ? "the newer draft is stronger" : x.better === "A" ? "the earlier draft was stronger" : "no clear difference"}
                      </span>. {x.reason}
                    </li>
                  ))}
                </ul>
                {c.flips ? <p className="text-[11px] text-muted">Judged in both orders; {c.flips} criteria disagreed and are shown as no clear difference.</p> : null}
              </article>
            );
          }
          const res = r.result as unknown as RubricResult & { lint?: unknown[] };
          return (
            <article key={r.id} className="grid gap-4 rounded-xl border border-border/80 bg-surface-2/40 p-5 text-xs">
              <p className="text-muted font-mono">Draft of {shortDate(r.document_versions?.created_at ?? r.created_at)} · reviewed {shortDate(r.created_at)}</p>
              <ul className="grid gap-3">
                {res.criteria.map((c) => (
                  <li key={c.criterion} className="rounded-xl border border-border/60 bg-surface p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-serif font-bold text-sm text-primary">{CRITERION[c.criterion]}</p>
                      <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        {c.score} / 5
                      </span>
                    </div>
                    <p className="text-foreground/90 leading-relaxed">{c.observation}</p>
                    {c.evidence.length ? (
                      <p className="text-muted text-[11px] italic">Based on {c.evidence.map((sid) => `${sid} (“${text(sid).slice(0, 80)}${text(sid).length > 80 ? "…" : ""}”)`).join(", ")}</p>
                    ) : <p className="text-muted text-[11px]">No sentence directly evidences this yet.</p>}
                    <p className="font-bold text-secondary text-xs pt-1 border-t border-border/40">{c.question}</p>
                  </li>
                ))}
              </ul>
              {res.strongest_sentence ? (
                <div className="p-3 rounded-lg bg-verified/10 border border-verified/20 text-xs">
                  <span className="font-bold text-verified">Strongest sentence:</span> {res.strongest_sentence}, “{text(res.strongest_sentence)}”
                </div>
              ) : null}
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs">
                <span className="font-bold text-primary">Key reflection before your next draft:</span> {res.biggest_question}
              </div>
            </article>
          );
        })}
      </section>

      <section aria-labelledby="history" className="grid gap-4 rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow text-xs">
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <Clock className="h-4 w-4 text-secondary" />
          <h2 id="history" className="font-serif font-bold text-lg text-primary">Drafts and Authorship Record</h2>
        </div>
        <p className="text-muted leading-relaxed">{ta.finalHelp}</p>
        {!doc.final_version_id && (versions ?? []).length ? <p className="text-muted">{ta.noFinal}</p> : null}
        <ul className="grid gap-2" id="versions">
          {(versions ?? []).map((v) => {
            const final = doc.final_version_id === v.id;
            return (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-border/60 bg-surface-2/40" data-final={final ? "true" : undefined}>
                <span className="font-mono">{shortDate(v.created_at)} · {v.word_count} words</span>
                {final ? (
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-verified/40 bg-verified/10 px-2.5 py-0.5 text-xs font-bold text-verified">{ta.isFinal}</span>
                    <form action={setFinalDraft.bind(null, doc.id, null)}>
                      <button className="btn btn-secondary btn-sm">{ta.stopFinal}</button>
                    </form>
                  </div>
                ) : (
                  <form action={setFinalDraft.bind(null, doc.id, v.id)}>
                    <button className="btn btn-secondary btn-sm">
                      {ta.useAsFinal}
                      <span className="sr-only">: {shortDate(v.created_at)}, {v.word_count} words</span>
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2 pt-2">
          <a href={`/app/writing/${doc.id}/authorship`} className="btn btn-secondary btn-sm">Export record (JSON)</a>
          <a href={`/app/writing/${doc.id}/authorship?format=csv`} className="btn btn-secondary btn-sm">Export record (CSV)</a>
        </div>
      </section>

      <form action={deleteDocument.bind(null, doc.id)}>
        <button className="btn btn-secondary btn-sm text-conflicting hover:bg-conflicting/10">Delete this document</button>
      </form>
    </div>
  );
}
