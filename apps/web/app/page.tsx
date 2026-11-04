import Link from "next/link";
import { ModePrompt } from "@/components/mode-prompt";
import { Reveal } from "@/components/reveal";
import { TaglineReveal } from "@/components/tagline-reveal";
import { modePrompt } from "@/lib/demo-mode";
import { AUTH_DISABLED, DEMO_SWITCHER } from "@/lib/env";
import { getLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { WaitlistForm } from "./waitlist-form";
import { CheckCircle2, Compass, Sparkles, ClipboardCheck, ArrowDown, ChevronRight, ShieldCheck } from "lucide-react";

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const utm = Object.fromEntries(
    ["utm_source", "utm_medium", "utm_campaign"].flatMap((k) =>
      typeof params[k] === "string" ? [[k, params[k] as string]] : [],
    ),
  );
  const prompt = AUTH_DISABLED ? modePrompt(params.from) : null;
  const supabase = await createClient();
  const { t: all } = await getLocale();
  const t = all.home;
  const { count } = await supabase.from("programs").select("id", { count: "exact", head: true });
  const universityCount = count ? count.toLocaleString("en") : "500+";

  return (
    <>
      {prompt ? <ModePrompt prompt={prompt} canSwitch={DEMO_SWITCHER} /> : null}

      {/* Hero Section */}
      <section className="relative min-h-[85vh] flex flex-col justify-center items-center text-center px-6 hero-grid pt-16 pb-20">
        <div className="mx-auto max-w-4xl flex flex-col items-center">
          <span className="inline-flex items-center gap-1.5 bg-[#ffdad3] text-secondary px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-6 shadow-xs">
            <Sparkles className="h-3.5 w-3.5" />
            AI-Powered Admissions & Verified Requirements
          </span>

          <h1 className="hero-heading text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-primary leading-[1.15]">
            {t.heroTitle}
          </h1>

          <p className="mt-6 max-w-2xl text-lg sm:text-xl text-muted leading-relaxed">
            {t.heroBody}
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 mt-8 w-full sm:w-auto">
            <a href="#join" className="btn btn-coral-bright btn-lg min-w-[200px] shadow-sm">
              {t.join}
            </a>
            <Link href="/courses" className="btn btn-secondary btn-lg min-w-[200px] border-primary/30 text-primary hover:bg-primary hover:text-white">
              Explore Universities
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 mt-8 text-xs font-medium text-muted">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-verified" />
              Source-linked official data
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-4 w-4 text-secondary" />
              No runtime hallucinations
            </span>
            <span>·</span>
            <span>Used by students across 40+ countries</span>
          </div>

          {count ? (
            <p className="mt-5 text-sm text-muted">
              <Link href="/courses" className="font-semibold text-primary underline underline-offset-2 hover:text-secondary">
                {t.listed(universityCount)}
              </Link>{" "}
              {t.listedRest}
            </p>
          ) : null}
        </div>

        <div className="mt-12 text-muted animate-bounce">
          <a href="#proof" aria-label="Scroll down">
            <ArrowDown className="h-5 w-5 text-primary/60" />
          </a>
        </div>
      </section>

      {/* Social Proof Marquee & Stat Counters */}
      <section id="proof" className="w-full py-14 bg-surface border-y border-border">
        <div className="mx-auto max-w-[1200px] px-6">
          <p className="text-center text-xs font-bold text-muted tracking-widest uppercase mb-6">
            Trusted Official Registries & Global University Coverage
          </p>

          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-14 py-4 opacity-75 font-serif font-bold text-lg md:text-xl text-primary">
            <span>MIT</span>
            <span>Stanford</span>
            <span>Oxford</span>
            <span>ETH Zurich</span>
            <span>NUS Singapore</span>
            <span>Toronto</span>
            <span>Cambridge</span>
            <span>TU Munich</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 border-t border-border/80 pt-10 mt-8 text-center">
            <div>
              <h3 className="font-serif text-3xl sm:text-4xl font-bold text-primary">10,000+</h3>
              <p className="text-sm font-medium text-muted mt-1">Students Guided</p>
            </div>
            <div>
              <h3 className="font-serif text-3xl sm:text-4xl font-bold text-primary">40+</h3>
              <p className="text-sm font-medium text-muted mt-1">Countries Represented</p>
            </div>
            <div>
              <h3 className="font-serif text-3xl sm:text-4xl font-bold text-primary">{universityCount}</h3>
              <p className="text-sm font-medium text-muted mt-1">Verified Programs Listed</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Overview */}
      <section className="py-24 bg-surface-2/60">
        <div className="mx-auto max-w-[1200px] px-6">
          <div className="text-center mb-16">
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-3">
              Everything you need, in one platform.
            </h2>
            <div className="h-1 w-16 bg-secondary mx-auto rounded-full" />
            <p className="mt-4 text-muted max-w-xl mx-auto">
              From discovering accredited degrees to tracking every deadline and document.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-surface p-8 rounded-xl border border-border ambient-shadow transition-transform hover:-translate-y-1">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6 text-primary">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="font-serif text-xl font-bold text-primary mb-3">
                AI Counselor Sage
              </h3>
              <p className="text-muted leading-relaxed text-sm">
                Instant, structured guidance on essays, requirements, and deadlines — grounded exclusively in verified facts.
              </p>
            </div>

            <div className="bg-surface p-8 rounded-xl border border-border ambient-shadow transition-transform hover:-translate-y-1">
              <div className="w-12 h-12 bg-secondary/10 rounded-xl flex items-center justify-center mb-6 text-secondary">
                <Compass className="h-6 w-6" />
              </div>
              <h3 className="font-serif text-xl font-bold text-primary mb-3">
                Smart Course Matching
              </h3>
              <p className="text-muted leading-relaxed text-sm">
                Deterministic algorithms that match your profile, grades, test scores, and budget to verified degrees abroad.
              </p>
            </div>

            <div className="bg-surface p-8 rounded-xl border border-border ambient-shadow transition-transform hover:-translate-y-1">
              <div className="w-12 h-12 bg-verified/10 rounded-xl flex items-center justify-center mb-6 text-verified">
                <ClipboardCheck className="h-6 w-6" />
              </div>
              <h3 className="font-serif text-xl font-bold text-primary mb-3">
                End-to-End Application Tracker
              </h3>
              <p className="text-muted leading-relaxed text-sm">
                Ranked next steps, document checklists, visa milestones, and timezone-aware deadlines so you never miss a step.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section aria-labelledby="how" className="mx-auto max-w-[1200px] px-6 py-24">
        <Reveal>
          <div className="text-center mb-12">
            <h2 id="how" className="font-serif text-3xl sm:text-4xl font-bold text-primary">{t.howTitle}</h2>
            <div className="h-1 w-16 bg-primary mx-auto rounded-full mt-3" />
          </div>
          <ol className="grid gap-6 md:grid-cols-3">
            {t.steps.map((step, i) => (
              <li key={step.title} className="rounded-xl border border-border bg-surface p-8 ambient-shadow relative group">
                <span className="inline-block px-3 py-1 rounded-full bg-surface-2 font-mono text-xs font-bold text-primary mb-4">
                  0{i + 1}
                </span>
                <h3 className="text-xl font-serif font-bold text-primary">{step.title}</h3>
                <p className="mt-3 text-sm text-muted leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      {/* Tagline Reveal */}
      <section aria-label={t.promiseLabel} className="px-6 py-20 bg-primary text-white">
        <TaglineReveal lines={t.tagline} />
      </section>

      {/* Guarantees / Promises */}
      <section aria-labelledby="promises" className="mx-auto max-w-[1200px] px-6 py-24">
        <Reveal>
          <div className="text-center mb-12">
            <h2 id="promises" className="font-serif text-3xl sm:text-4xl font-bold text-primary">{t.promisesTitle}</h2>
            <div className="h-1 w-16 bg-secondary mx-auto rounded-full mt-3" />
          </div>
          <ul className="grid gap-6 md:grid-cols-3">
            {t.promises.map((p) => (
              <li key={p.title} className="rounded-xl border border-border bg-surface p-8 ambient-shadow">
                <h3 className="text-xl font-serif font-bold text-primary">{p.title}</h3>
                <p className="mt-3 text-sm text-muted leading-relaxed">{p.body}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq" className="mx-auto max-w-3xl px-6 py-24">
        <div className="text-center mb-12">
          <h2 id="faq" className="font-serif text-3xl sm:text-4xl font-bold text-primary">{t.faqTitle}</h2>
          <div className="h-1 w-16 bg-primary mx-auto rounded-full mt-3" />
        </div>
        <div className="grid gap-4">
          {t.faq.map((item) => (
            <details key={item.q} className="rounded-xl border border-border bg-surface p-6 transition-all open:ambient-shadow group">
              <summary className="cursor-pointer text-lg font-serif font-semibold text-primary list-none flex items-center justify-between">
                <span>{item.q}</span>
                <ChevronRight className="h-5 w-5 text-muted transition-transform group-open:rotate-90 shrink-0 ml-4" />
              </summary>
              <p className="mt-4 text-sm text-muted leading-relaxed border-t border-border/60 pt-4">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Join / Waitlist */}
      <section id="join" aria-labelledby="join-heading" className="mx-auto max-w-2xl px-6 py-24">
        <div className="text-center mb-8">
          <h2 id="join-heading" className="font-serif text-3xl sm:text-4xl font-bold text-primary">{t.joinTitle}</h2>
          <p className="mt-3 text-muted">{t.joinBody}</p>
        </div>
        <div className="ambient-shadow-lg rounded-2xl overflow-hidden border-t-4 border-primary">
          <WaitlistForm utm={utm} />
        </div>
      </section>
    </>
  );
}
