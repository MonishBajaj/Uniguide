import Link from "next/link";
import { ModePrompt } from "@/components/mode-prompt";
import { Reveal } from "@/components/reveal";
import { TaglineReveal } from "@/components/tagline-reveal";
import { modePrompt } from "@/lib/demo-mode";
import { AUTH_DISABLED, DEMO_SWITCHER } from "@/lib/env";
import { getLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { WaitlistForm } from "./waitlist-form";

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

  return (
    <>
      {prompt ? <ModePrompt prompt={prompt} canSwitch={DEMO_SWITCHER} /> : null}
      <section className="mx-auto max-w-5xl px-6 pt-24 pb-24 text-center">
        <h1 className="hero-heading mx-auto max-w-[680px] text-4xl font-semibold sm:text-5xl lg:text-6xl">
          {t.heroTitle}
        </h1>
        <p className="mx-auto mt-6 max-w-[680px] text-lg text-muted">
          {t.heroBody}
        </p>
        <a href="#join" className="btn btn-primary mt-8">{t.join}</a>
        {count ? (
          <p className="mt-6 text-sm text-muted">
            <Link href="/courses" className="font-semibold text-foreground underline underline-offset-2">
              {t.listed(count.toLocaleString("en"))}
            </Link>{" "}
            {t.listedRest}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="how" className="mx-auto max-w-5xl px-6 py-24">
        <Reveal>
          <h2 id="how" className="text-3xl font-semibold">{t.howTitle}</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {t.steps.map((step, i) => (
              <li key={step.title} className="rounded-2xl border border-border bg-surface p-6">
                <span className="font-mono text-sm text-muted">0{i + 1}</span>
                <h3 className="mt-2 text-xl font-semibold">{step.title}</h3>
                <p className="mt-2 text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      <section aria-label={t.promiseLabel} className="px-6 py-24">
        <TaglineReveal lines={t.tagline} />
      </section>

      <section aria-labelledby="promises" className="mx-auto max-w-5xl px-6 py-24">
        <Reveal>
          <h2 id="promises" className="text-3xl font-semibold">{t.promisesTitle}</h2>
          <ul className="mt-8 grid gap-6 md:grid-cols-3">
            {t.promises.map((p) => (
              <li key={p.title} className="rounded-2xl border border-border bg-surface p-6">
                <h3 className="text-xl font-semibold">{p.title}</h3>
                <p className="mt-2 text-muted">{p.body}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      <section aria-labelledby="faq" className="mx-auto max-w-3xl px-6 py-24">
        <h2 id="faq" className="text-3xl font-semibold">{t.faqTitle}</h2>
        <div className="mt-8 grid gap-3">
          {t.faq.map((item) => (
            <details key={item.q} className="rounded-2xl border border-border bg-surface p-6">
              <summary className="cursor-pointer text-lg font-semibold">{item.q}</summary>
              <p className="mt-3 text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="join" aria-labelledby="join-heading" className="mx-auto max-w-xl px-6 py-24">
        <h2 id="join-heading" className="text-center text-3xl font-semibold">{t.joinTitle}</h2>
        <p className="mx-auto mt-3 mb-8 max-w-[680px] text-center text-muted">{t.joinBody}</p>
        <WaitlistForm utm={utm} />
      </section>
    </>
  );
}
