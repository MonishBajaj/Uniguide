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
        <section aria-labelledby="how" className="grid gap-6">
          <header className="grid gap-2">
            <h1 id="how" className="text-4xl font-semibold">{o.howTitle}</h1>
            <p className="text-lg text-muted">{o.howIntro}</p>
          </header>
          <ul className="grid gap-3">
            {(["listed", "extracted", "verified"] as const).map((tier) => (
              <li key={tier} className="grid gap-1 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[8rem_1fr] sm:items-baseline">
                <span className={`font-semibold ${TIER_TONE[tier]}`}>{o.tiers[tier].name}</span>
                <span>{o.tiers[tier].text}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/app/onboarding?screen=2" className="btn btn-primary min-h-11">{o.next}</Link>
            {skip}
          </div>
        </section>
      ) : null}

      {screen === 2 ? (
        <section className="grid gap-6">
          <form action={saveEntryPath} className="grid gap-6">
            <fieldset className="grid gap-3">
              <legend className="mb-2 grid gap-2">
                <span className="text-4xl font-semibold">{o.whereTitle}</span>
                <span className="text-lg text-muted">{o.whereIntro}</span>
              </legend>
              {ENTRY_PATHS.map((path) => (
                <label
                  key={path}
                  className="flex min-h-11 cursor-pointer gap-3 rounded-2xl border border-border bg-surface p-4 has-[:checked]:border-accent has-[:checked]:ring-1 has-[:checked]:ring-accent"
                >
                  <input type="radio" name="entry_path" value={path} defaultChecked={profile.entry_path === path} required className="mt-1 accent-[var(--accent)]" />
                  <span className="grid">
                    <span className="font-semibold">{o.answers[path].label}</span>
                    <span className="text-sm text-muted">{o.answers[path].hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {params.missing ? <p role="alert" className="text-sm text-conflicting">{o.chooseOne}</p> : null}
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/app/onboarding?screen=1" className="btn btn-secondary min-h-11">{o.back}</Link>
              <button className="btn btn-primary min-h-11">{o.next}</button>
            </div>
          </form>
          {skip}
        </section>
      ) : null}

      {screen === 3 ? (
        <section aria-labelledby="short-profile" className="grid gap-6">
          <header className="grid gap-2">
            <h1 id="short-profile" className="text-4xl font-semibold">{o.profileTitle}</h1>
            <p className="text-lg text-muted">{o.profileIntro}</p>
          </header>
          {chat ? (
            <>
              <OnboardingChat />
              <FindUniversitiesButton />
              <Link href="/app/onboarding?screen=3" className="font-semibold text-accent underline underline-offset-2">{o.back}</Link>
            </>
          ) : (
            <>
              {ai ? (
                <p className="text-sm">
                  {o.chat}{" "}
                  <Link href="/app/onboarding?screen=3&chat=1" className="font-semibold text-accent underline underline-offset-2">{o.chatLink}</Link>
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
              <Link href="/app/onboarding?screen=2" className="justify-self-start font-semibold text-accent underline underline-offset-2">{o.back}</Link>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
