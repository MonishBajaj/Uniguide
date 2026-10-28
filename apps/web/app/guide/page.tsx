import type { Metadata } from "next";
import Link from "next/link";
import { Term } from "@/components/term";
import { GLOSSARY, glossaryAnchor, STEPS, type TermId } from "@/lib/glossary";

export const metadata: Metadata = {
  title: "How applying abroad works",
  description: "A step-by-step guide to applying to university abroad, with the jargon explained in plain language. Written for students who are the first in their family to do it.",
  alternates: { canonical: "/guide" },
};

export default function GuidePage() {
  const terms = (Object.keys(GLOSSARY) as TermId[]).sort((a, b) => GLOSSARY[a].term.localeCompare(GLOSSARY[b].term));
  return (
    <article className="mx-auto grid max-w-3xl gap-12 px-6 py-16">
      <header className="grid gap-3">
        <h1 className="text-4xl font-semibold text-balance">How applying abroad works</h1>
        <p className="text-muted">
          If nobody in your family has done this before, this page is for you. It walks through the steps in order, links
          to where you can do each one here, and explains the words universities use, such as an <Term id="sop" /> or
          a <Term id="conditional_offer">conditional offer</Term>. Tap a dotted word to see what it means.
        </p>
      </header>

      <section aria-labelledby="steps" className="grid gap-4">
        <h2 id="steps" className="text-2xl font-semibold">The steps, in order</h2>
        <ol className="grid gap-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-3 rounded-2xl border border-border bg-surface p-5">
              <span aria-hidden="true" className="font-mono text-lg text-muted">{i + 1}</span>
              <div className="grid gap-2">
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-muted">{step.body}</p>
                <p className="text-sm text-muted">
                  Words you will meet:{" "}
                  {step.terms.map((t, j) => (
                    <span key={t}>{j ? ", " : ""}<a href={`#${glossaryAnchor(t)}`} className="underline underline-offset-2">{GLOSSARY[t].term}</a></span>
                  ))}
                </p>
                <Link href={step.href} className="justify-self-start text-sm font-semibold underline underline-offset-2">{step.action}</Link>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="glossary" className="grid gap-4">
        <h2 id="glossary" className="text-2xl font-semibold">Words universities use</h2>
        <p className="text-sm text-muted">General explanations. What a particular course asks for is on its own page, from its official sources.</p>
        <dl className="grid gap-4">
          {terms.map((id) => {
            const e = GLOSSARY[id];
            return (
              <div key={id} id={glossaryAnchor(id)} className="scroll-mt-24 border-t border-border pt-4">
                <dt className="font-semibold">{e.term}{"expansion" in e ? <span className="font-normal text-muted"> ({e.expansion})</span> : null}</dt>
                <dd className="mt-1">{e.definition}</dd>
                {"link" in e ? (
                  <dd className="mt-1 text-sm"><a href={e.link.href} target="_blank" rel="noreferrer" className="underline underline-offset-2">Official site: {e.link.label}</a></dd>
                ) : null}
              </div>
            );
          })}
        </dl>
      </section>
    </article>
  );
}
