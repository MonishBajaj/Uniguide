import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";
import { ENTRY_PATHS, screenOf } from "@/lib/onboarding";
import { getUser } from "@/lib/supabase/server";
import { FindUniversitiesButton } from "../matching/find-button";
import { saveEntryPath, skipOnboarding } from "./actions";
import { OnboardingChat } from "./chat";
import { ShortProfile } from "./short-profile";

export const metadata: Metadata = { title: "Get started" };

const TIER_TONE = { listed: "text-muted", extracted: "text-unverified", verified: "text-verified" } as const;

/**
 * Onboarding (spec 6.4, journey M2 J2.6): how UniGuide works, "Where are you right now?", then the
 * short profile (form, or the chat with AI consent). Each screen is its own URL, so Back works.
 */
export default async function OnboardingPage({ searchParams }: PageProps<"/app/onboarding">) {
  const params = await searchParams;
  const { supabase, user } = await getUser();
  const [{ data: profile }, { data: ai }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user!.id).single(),
    supabase.from("consents").select("id").eq("kind", "ai_processing").is("withdrawn_at", null).limit(1).maybeSingle(),
  ]);
  // Nothing can be saved without consent, so these students go back to the home (plan N12).
  if (!profile || !(profile.consent_state === "not_required" || profile.consent_state === "granted")) redirect("/app");

  const o = (await getLocale()).t.journey.onboarding;
  const screen = screenOf(params.screen);
  const chat = params.chat === "1" && Boolean(ai);
  const skip = (
    <form action={skipOnboarding}>
      <button className="btn btn-sm min-h-11 text-muted hover:text-foreground">{o.skip}</button>
    </form>
  );

  return (
    <div className="mx-auto grid max-w-3xl gap-8">
      <p className="font-mono text-xs text-muted">{o.stepOf(screen)}</p>

      {screen === 1 ? (
        <section aria-labelledby="how" className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow grid gap-6">
          <header className="grid gap-2 border-b border-border/60 pb-5">
            <h1 id="how" className="font-serif text-3xl sm:text-4xl font-bold text-primary">{o.howTitle}</h1>
            <p className="text-sm text-muted leading-relaxed max-w-2xl">{o.howIntro}</p>
          </header>
          <ul className="grid gap-3">
            {(["listed", "extracted", "verified"] as const).map((tier) => (
              <li key={tier} className="grid gap-2 rounded-xl border border-border/60 bg-surface-2/40 p-5 sm:grid-cols-[9rem_1fr] sm:items-baseline">
                <span className={`font-serif font-bold text-base ${TIER_TONE[tier]}`}>{o.tiers[tier].name}</span>
                <span className="text-sm text-foreground/80 leading-relaxed">{o.tiers[tier].text}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border/60">
            <Link href="/app/onboarding?screen=2" className="btn btn-primary">{o.next}</Link>
            {skip}
          </div>
        </section>
      ) : null}

      {screen === 2 ? (
        <section className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow grid gap-6">
          <form action={saveEntryPath} className="grid gap-6">
            <fieldset className="grid gap-4">
              <legend className="mb-4 grid gap-2 border-b border-border/60 pb-5">
                <span className="font-serif text-3xl sm:text-4xl font-bold text-primary">{o.whereTitle}</span>
                <span className="text-sm text-muted leading-relaxed">{o.whereIntro}</span>
              </legend>
              {ENTRY_PATHS.map((path) => (
                <label
                  key={path}
                  className="flex min-h-12 cursor-pointer gap-4 rounded-xl border border-border bg-surface-2/30 p-5 transition-all hover:bg-surface-2/60 has-[:checked]:border-secondary has-[:checked]:bg-secondary/5 has-[:checked]:shadow-xs"
                >
                  <input type="radio" name="entry_path" value={path} defaultChecked={profile.entry_path === path} required className="mt-1 accent-primary" />
                  <span className="grid gap-0.5">
                    <span className="font-serif font-bold text-base text-primary">{o.answers[path].label}</span>
                    <span className="text-xs text-muted">{o.answers[path].hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {params.missing ? <p role="alert" className="text-sm text-conflicting">{o.chooseOne}</p> : null}
            <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border/60">
              <Link href="/app/onboarding?screen=1" className="btn btn-secondary">{o.back}</Link>
              <button className="btn btn-primary">{o.next}</button>
            </div>
          </form>
          {skip}
        </section>
      ) : null}

      {screen === 3 ? (
        <section aria-labelledby="short-profile" className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow grid gap-6">
          <header className="grid gap-2 border-b border-border/60 pb-5">
            <h1 id="short-profile" className="font-serif text-3xl sm:text-4xl font-bold text-primary">{o.profileTitle}</h1>
            <p className="text-sm text-muted leading-relaxed max-w-2xl">{o.profileIntro}</p>
          </header>
          {chat ? (
            <>
              <OnboardingChat />
              <FindUniversitiesButton />
              <Link href="/app/onboarding?screen=3" className="font-semibold text-secondary underline underline-offset-2 hover:text-primary">{o.back}</Link>
            </>
          ) : (
            <>
              {ai ? (
                <p className="text-sm bg-surface-2/60 p-4 rounded-xl border border-border/60">
                  {o.chat}{" "}
                  <Link href="/app/onboarding?screen=3&chat=1" className="font-bold text-secondary underline underline-offset-2 hover:text-primary">{o.chatLink}</Link>
                </p>
              ) : null}
              <ShortProfile
                t={{
                  levels: o.levels,
                  subjects: o.subjects,
                  countries: o.countries,
                  budget: o.budget,
                  amount: o.amount,
                  currency: o.currency,
                  notSet: o.notSet,
                  intake: o.intake,
                  notDecided: o.notDecided,
                  save: o.save,
                }}
                thisYear={new Date().getFullYear()}
                initial={{
                  target_levels: profile.target_levels,
                  target_countries: profile.target_countries,
                  target_fields: profile.target_fields,
                  budget_amount: profile.budget_amount != null ? String(profile.budget_amount) : "",
                  budget_currency: profile.budget_currency ?? "",
                  intake_year: profile.intake_year != null ? String(profile.intake_year) : "",
                }}
              />
              <Link href="/app/onboarding?screen=2" className="justify-self-start font-semibold text-secondary underline underline-offset-2 hover:text-primary">{o.back}</Link>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
