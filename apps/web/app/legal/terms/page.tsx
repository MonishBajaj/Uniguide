import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms" };

export default function Terms() {
  return (
    <article className="mx-auto grid max-w-3xl gap-4 px-6 py-16 text-muted">
      <h1 className="text-4xl font-semibold text-foreground">Terms</h1>
      <p className="rounded-2xl border border-border bg-surface p-4 text-sm">Draft for review by counsel before launch. Not yet in force.</p>
      <h2 className="mt-4 text-xl font-semibold text-foreground">Information, not advice</h2>
      <p>Uniguide collects facts from official sources and shows where each one came from. Institutions change requirements, fees and deadlines. Always confirm on the official page before you apply or pay. We are not responsible for decisions made on information that has since changed.</p>
      <h2 className="mt-4 text-xl font-semibold text-foreground">No admission predictions</h2>
      <p>Suitability scores rank courses by your stated preferences. They are not the chance of being admitted.</p>
      <h2 className="mt-4 text-xl font-semibold text-foreground">Visas</h2>
      <p>We link to official visa information only and do not give individual immigration advice.</p>
      <h2 className="mt-4 text-xl font-semibold text-foreground">Your writing</h2>
      <p>Writing tools give feedback and ask questions. They do not write your statements for you.</p>
    </article>
  );
}
