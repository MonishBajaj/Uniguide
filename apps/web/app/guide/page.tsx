import type { Metadata } from "next";
import Link from "next/link";
import { Term } from "@/components/term";
import { GLOSSARY, glossaryAnchor, STEPS, type TermId } from "@/lib/glossary";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "How applying abroad works",
  description: "A step-by-step guide to applying to university abroad, with the jargon explained in plain language. Written for students who are the first in their family to do it.",
  alternates: { canonical: "/guide" },
};

export default async function GuidePage() {
  const { t: all } = await getLocale();
  const t = all.guide;
  const terms = (Object.keys(GLOSSARY) as TermId[]).sort((a, b) => GLOSSARY[a].term.localeCompare(GLOSSARY[b].term));
  return (
    <article className="mx-auto grid max-w-3xl gap-12 px-6 py-16">
      <header className="grid gap-3">
        <h1 className="text-4xl font-semibold text-balance">{t.title}</h1>
        <p className="text-muted">{t.intro}</p>
        <p className="text-sm text-muted">
          <Term id="sop" /> · <Term id="lor" /> · <Term id="conditional_offer">{GLOSSARY.conditional_offer.term}</Term>
        </p>
      </header>

      <section aria-labelledby="steps" className="grid gap-4">
        <h2 id="steps" className="text-2xl font-semibold">{t.stepsTitle}</h2>
        <ol className="grid gap-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-3 rounded-2xl border border-border bg-surface p-5">
              <span aria-hidden="true" className="font-mono text-lg text-muted">{i + 1}</span>
              <div className="grid gap-2">
                <h3 className="text-lg font-semibold">{t.steps[i]!.title}</h3>
                <p className="text-muted">{t.steps[i]!.body}</p>
                <p className="text-sm text-muted">
                  {t.wordsYouMeet}{" "}
                  {step.terms.map((t, j) => (
                    <span key={t}>{j ? ", " : ""}<a href={`#${glossaryAnchor(t)}`} className="underline underline-offset-2">{GLOSSARY[t].term}</a></span>
                  ))}
                </p>
                <Link href={step.href} className="justify-self-start text-sm font-semibold underline underline-offset-2">{t.steps[i]!.action}</Link>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="glossary" className="grid gap-4">
        <h2 id="glossary" className="text-2xl font-semibold">{t.glossaryTitle}</h2>
        <p className="text-sm text-muted">{t.glossaryNote}</p>
        <dl className="grid gap-4">
          {terms.map((id) => {
            const e = GLOSSARY[id];
            return (
              <div key={id} id={glossaryAnchor(id)} className="scroll-mt-24 border-t border-border pt-4">
                <dt className="font-semibold">{e.term}{"expansion" in e ? <span className="font-normal text-muted"> ({e.expansion})</span> : null}</dt>
                <dd className="mt-1">{all.glossary[id]}</dd>
                {"link" in e ? (
                  <dd className="mt-1 text-sm"><a href={e.link.href} target="_blank" rel="noreferrer" className="underline underline-offset-2">{t.officialSite(e.link.label)}</a></dd>
                ) : null}
              </div>
            );
          })}
        </dl>
      </section>
    </article>
  );
}
