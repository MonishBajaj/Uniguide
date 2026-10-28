import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { TaglineReveal } from "@/components/tagline-reveal";
import { createClient } from "@/lib/supabase/server";
import { WaitlistForm } from "./waitlist-form";

const STEPS = [
  {
    title: "Tell us where you stand",
    body: "Your qualification and grades on your own scale, test scores with their version and date, your budget and the countries you are considering.",
  },
  {
    title: "See what fits and why",
    body: "Courses you do not qualify for, cannot afford or have missed are set aside, each with the reason. The rest show which requirements you meet, a low, base and high cost, and the next deadline.",
  },
  {
    title: "Check every fact at its source",
    body: "Every requirement, fee and deadline links to the official page and the sentence it came from, with the date a person last checked it.",
  },
];

const PROMISES = [
  { title: "No admission percentages", body: "Nobody can honestly predict your chances from a form. We show whether you meet each published requirement." },
  { title: "No ghostwriting", body: "The writing coach asks questions and quotes your sentences back to you. Your statement stays yours." },
  { title: "No commissions", body: "Universities do not pay us to send you their way, so the list is ordered by fit to you." },
];

const FAQ = [
  {
    q: "Which countries and levels does it cover?",
    a: "Every country and level is searchable, from foundation courses to PhDs. Depth grows over time: the US, UK, Canada, Australia, Germany and Ireland come first, then more countries based on what people sign up for.",
  },
  {
    q: "What do Listed, Extracted and Verified mean?",
    a: "Listed means the course is in an official register. Extracted means software read its requirements, fees or deadlines from the official page and they are shown as unverified. Verified means a person checked the fact against the official page, and we show when.",
  },
  {
    q: "Where does the information come from?",
    a: "Only official sources: university pages and government registers such as CRICOS, College Scorecard and Discover Uni. Never aggregators, rankings sites or forums.",
  },
  {
    q: "What if a deadline changes?",
    a: "We check pages again during application season and flag anything that changed. Always confirm on the official page before you apply; every fact links to it.",
  },
  {
    q: "Does the AI decide anything about me?",
    a: "No. Filters, eligibility checks and costs are fixed rules you can read. AI only helps read official pages and turn your pasted CV into profile fields you confirm one by one.",
  },
  {
    q: "I am under 18. Can I use it?",
    a: "Yes, from age 13. Depending on where you live, a parent or guardian confirms by email before we store your grades or scores.",
  },
  {
    q: "What will it cost?",
    a: "Browsing courses and the public requirements table are free. We plan a one time season pass for the tracker and writing tools, not a subscription.",
  },
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const utm = Object.fromEntries(
    ["utm_source", "utm_medium", "utm_campaign"].flatMap((k) =>
      typeof params[k] === "string" ? [[k, params[k] as string]] : [],
    ),
  );
  const supabase = await createClient();
  const { count } = await supabase.from("programs").select("id", { count: "exact", head: true });

  return (
    <>
      <section className="mx-auto max-w-5xl px-6 pt-24 pb-24 text-center">
        <h1 className="hero-heading mx-auto max-w-[680px] text-4xl font-semibold sm:text-5xl lg:text-6xl">
          Course requirements and deadlines, with the source beside every fact
        </h1>
        <p className="mx-auto mt-6 max-w-[680px] text-lg text-muted">
          Find courses abroad at any level, from foundation to PhD. See which entry requirements you meet, what it
          will really cost, and when to apply, each linked to the official page.
        </p>
        <a href="#join" className="btn btn-primary mt-8">Join the waitlist</a>
        {count ? (
          <p className="mt-6 text-sm text-muted">
            <Link href="/courses" className="font-semibold text-foreground underline underline-offset-2">
              {count.toLocaleString("en")} courses
            </Link>{" "}
            already listed from official registers.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="how" className="mx-auto max-w-5xl px-6 py-24">
        <Reveal>
          <h2 id="how" className="text-3xl font-semibold">How it works</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="rounded-2xl border border-border bg-surface p-6">
                <span className="font-mono text-sm text-muted">0{i + 1}</span>
                <h3 className="mt-2 text-xl font-semibold">{step.title}</h3>
                <p className="mt-2 text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      <section aria-label="Our promise" className="px-6 py-24">
        <TaglineReveal lines={["A deadline you cannot check", "is a deadline you cannot trust."]} />
      </section>

      <section aria-labelledby="promises" className="mx-auto max-w-5xl px-6 py-24">
        <Reveal>
          <h2 id="promises" className="text-3xl font-semibold">What we will not do</h2>
          <ul className="mt-8 grid gap-6 md:grid-cols-3">
            {PROMISES.map((p) => (
              <li key={p.title} className="rounded-2xl border border-border bg-surface p-6">
                <h3 className="text-xl font-semibold">{p.title}</h3>
                <p className="mt-2 text-muted">{p.body}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      <section aria-labelledby="faq" className="mx-auto max-w-3xl px-6 py-24">
        <h2 id="faq" className="text-3xl font-semibold">Questions</h2>
        <div className="mt-8 grid gap-3">
          {FAQ.map((item) => (
            <details key={item.q} className="rounded-2xl border border-border bg-surface p-6">
              <summary className="cursor-pointer text-lg font-semibold">{item.q}</summary>
              <p className="mt-3 text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="join" aria-labelledby="join-heading" className="mx-auto max-w-xl px-6 py-24">
        <h2 id="join-heading" className="text-center text-3xl font-semibold">Applying in the 2027 cycle?</h2>
        <p className="mx-auto mt-3 mb-8 max-w-[680px] text-center text-muted">Join the waitlist and tell us where you are headed. It decides which countries we check first.</p>
        <WaitlistForm utm={utm} />
      </section>
    </>
  );
}
