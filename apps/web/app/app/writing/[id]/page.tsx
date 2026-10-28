import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { label, shortDate } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import { loadFaculty } from "@/lib/faculty";
import { courseMaterial, namedInDraft, WHY_QUESTIONS, type MaterialItem } from "@/lib/why-helper";
import { outlineFor, STORY_QUESTIONS } from "@/lib/writing/prompts";
import { classifyPrompt, PROMPT_TYPES } from "@/lib/writing/supplemental";
import { segment } from "@/lib/writing/segment";
import type { RubricResult, ComparisonResult } from "@/lib/writing/review";
import { deleteDocument } from "../actions";
import { Editor } from "./editor";
import { FeedbackButtons } from "./feedback-buttons";

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
  if ((doc.kind === "why_this_university" || promptType === "why_us") && doc.application_id) {
    const { data: app } = await supabase.from("applications").select("program_cycles(program_id)").eq("id", doc.application_id).maybeSingle();
    const programId = app?.program_cycles?.program_id;
    const [{ data: card }, { data: profile }] = await Promise.all([
      programId ? supabase.from("program_cards").select("*").eq("id", programId).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("profiles").select("research_interests").eq("user_id", user!.id).single(),
    ]);
    if (card) {
      institution = card.institution_name;
      const faculty = card.level === "master" || card.level === "doctorate" ? await loadFaculty(supabase, card, profile?.research_interests ?? null, 6) : [];
      material = courseMaterial(card, faculty);
    }
  }
  const named = namedInDraft(latest?.body ?? "", material);
  const countable = material.filter((m) => m.terms.length);

  return (
    <div className="grid gap-8">
      <header>
        <Link href="/app/writing" className="text-sm text-muted underline underline-offset-2">Writing</Link>
        <h1 className="mt-2 text-4xl font-semibold">{doc.title}</h1>
        <p className="mt-1 text-muted">{label(doc.kind)}{doc.word_limit ? ` · limit ${doc.word_limit} words` : ""}</p>
        {doc.question ? <blockquote className="mt-4 rounded-2xl border border-border bg-surface p-4 text-sm">{doc.question}</blockquote> : null}
      </header>

      <details className="rounded-2xl border border-border bg-surface p-4">
        <summary className="cursor-pointer font-semibold">Outline: what each part should answer</summary>
        <ol className="mt-3 grid gap-3 text-sm">
          {outline.map((s) => (
            <li key={s.id}>
              <span className="font-semibold">{s.title}</span>{s.words ? <span className="text-muted"> · about {s.words} words</span> : null}
              <ul className="mt-1 list-disc pl-5 text-muted">{s.questions.map((q) => <li key={q}>{q}</li>)}</ul>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-muted"><Link href="/app/writing/stories" className="underline underline-offset-2">Your story bank</Link> holds the material for each part.</p>
      </details>

      {guide ? (
        <section aria-labelledby="strategy" className="grid gap-3 rounded-2xl border border-border bg-surface p-6 text-sm">
          <div>
            <h2 id="strategy" className="text-lg font-semibold">How to approach this question</h2>
            <p className="text-muted">
              {guide.about
                ? <>This looks like a question about <span className="font-semibold text-foreground">{guide.about}</span>. If it is really asking something else, follow the question, not this guess.</>
                : "We could not tell what kind of question this is, so these are general. Work from the question itself."}
            </p>
          </div>
          <ul className="grid list-disc gap-1 pl-5">{guide.strategy.map((q) => <li key={q}>{q}</li>)}</ul>
          <div className="grid gap-1">
            <h3 className="font-semibold">From your story bank</h3>
            <ul className="grid gap-1 text-muted">
              {guide.stories.map((sid) => {
                const q = STORY_QUESTIONS.find((s) => s.id === sid)!;
                return <li key={sid}>{q.question}</li>;
              })}
            </ul>
            <Link href="/app/writing/stories" className="justify-self-start underline underline-offset-2">Answer these in your story bank</Link>
          </div>
        </section>
      ) : null}

      {material.length ? (
        <section aria-labelledby="material" className="grid gap-4 rounded-2xl border border-border bg-surface p-6 text-sm">
          <div>
            <h2 id="material" className="text-lg font-semibold">Material from this course</h2>
            <p className="text-muted">
              Facts we hold about {institution}, from official pages and OpenAlex. Check each one on the official page,
              and use only what connects to something you have really done. The words are yours to write.
            </p>
          </div>
          {latest ? (
            <p role="status" className={named.size ? "font-semibold" : "font-semibold text-unverified"}>
              {named.size
                ? `Your latest draft names ${named.size} of ${countable.length} specific things about this course.`
                : "Your latest draft does not name anything specific to this course yet. Could a reader tell which university it was written for?"}
            </p>
          ) : null}
          {(["Researchers", "Place", "Course"] as const).map((group) => {
            const list = material.filter((m) => m.group === group);
            return list.length ? (
              <div key={group} className="grid gap-2">
                <h3 className="font-semibold">{group}</h3>
                <ul className="grid gap-1">
                  {list.map((m) => (
                    <li key={m.key}>
                      <span aria-hidden="true" className={named.has(m.key) ? "text-verified" : "text-muted"}>{named.has(m.key) ? "✓ " : "· "}</span>
                      <span className="font-semibold">{m.label}</span>
                      {m.detail ? <span className="text-muted"> · {m.detail}</span> : null}
                      {named.has(m.key) ? <span className="sr-only"> (named in your draft)</span> : null}
                    </li>
                  ))}
                </ul>
                <p className="text-muted italic">{WHY_QUESTIONS[group]}</p>
              </div>
            ) : null;
          })}
        </section>
      ) : null}

      <Editor documentId={doc.id} initial={latest?.body ?? ""} wordLimit={doc.word_limit} />

      <section aria-labelledby="feedback" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="feedback" className="text-2xl font-semibold">Feedback</h2>
          {latest ? <FeedbackButtons documentId={doc.id} canCompare={(versions ?? []).length > 1} freeReview={Boolean(allowance?.free_review)} /> : null}
        </div>
        {mine.length === 0 ? <p className="text-muted">Save a draft, then ask for feedback. It will point at your sentences by number and ask questions; it will not rewrite them.</p> : null}
        {mine.map((r) => {
          const sentences = segment(r.document_versions?.body ?? "");
          const text = (sid: string) => sentences.find((s) => s.id === sid)?.text ?? "";
          if (r.kind === "comparison") {
            const c = r.result as unknown as ComparisonResult;
            return (
              <article key={r.id} className="rounded-2xl border border-border bg-surface p-5 text-sm">
                <p className="text-muted">Comparison of your last two drafts · {shortDate(r.created_at)}</p>
                <ul className="mt-3 grid gap-2">
                  {c.criteria.map((x) => (
                    <li key={x.criterion}>
                      <span className="font-semibold">{CRITERION[x.criterion]}:</span>{" "}
                      {x.better === "B" ? "the newer draft is stronger" : x.better === "A" ? "the earlier draft was stronger" : "no clear difference"}. {x.reason}
                    </li>
                  ))}
                </ul>
                {c.flips ? <p className="mt-2 text-xs text-muted">Judged in both orders; {c.flips} criteria disagreed and are shown as no clear difference.</p> : null}
              </article>
            );
          }
          const res = r.result as unknown as RubricResult & { lint?: unknown[] };
          return (
            <article key={r.id} className="grid gap-3 rounded-2xl border border-border bg-surface p-5 text-sm">
              <p className="text-muted">Draft of {shortDate(r.document_versions?.created_at ?? r.created_at)} · reviewed {shortDate(r.created_at)}</p>
              <ul className="grid gap-3">
                {res.criteria.map((c) => (
                  <li key={c.criterion} className="rounded-lg bg-background p-3">
                    <p className="font-semibold">{CRITERION[c.criterion]}: {c.score} / 5</p>
                    <p className="mt-1">{c.observation}</p>
                    {c.evidence.length ? (
                      <p className="mt-1 text-muted">Based on {c.evidence.map((sid) => `${sid} (“${text(sid).slice(0, 80)}${text(sid).length > 80 ? "…" : ""}”)`).join(", ")}</p>
                    ) : <p className="mt-1 text-muted">No sentence supports this yet.</p>}
                    <p className="mt-2 font-semibold">{c.question}</p>
                  </li>
                ))}
              </ul>
              {res.strongest_sentence ? <p><span className="font-semibold">Your strongest sentence:</span> {res.strongest_sentence}, “{text(res.strongest_sentence)}”</p> : null}
              <p><span className="font-semibold">Before the next draft:</span> {res.biggest_question}</p>
            </article>
          );
        })}
      </section>

      <section aria-labelledby="history" className="grid gap-3 rounded-2xl border border-border bg-surface p-5 text-sm">
        <h2 id="history" className="text-lg font-semibold">Drafts and authorship record</h2>
        <ul className="grid gap-1">
          {(versions ?? []).map((v) => <li key={v.id}>{shortDate(v.created_at)} · {v.word_count} words</li>)}
        </ul>
        <div className="flex gap-2">
          <a href={`/app/writing/${doc.id}/authorship`} className="btn btn-secondary btn-sm">Export record (JSON)</a>
          <a href={`/app/writing/${doc.id}/authorship?format=csv`} className="btn btn-secondary btn-sm">Export record (CSV)</a>
        </div>
      </section>

      <form action={deleteDocument.bind(null, doc.id)}>
        <button className="btn btn-secondary btn-sm">Delete this document</button>
      </form>
    </div>
  );
}
