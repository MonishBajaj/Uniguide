import type { Metadata } from "next";
import { setLocale } from "@/app/locale-actions";
import { DISPLAY_OPTIONS, type Display } from "@/lib/display";
import { readDisplay } from "@/lib/display-server";
import { LOCALES } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { saveDisplay } from "./actions";
import { Sliders, Languages, Eye } from "lucide-react";

export const metadata: Metadata = {
  title: "Accessibility and display settings",
  description: "Make text larger, raise contrast or stop motion, and read how we test Uniguide for accessibility.",
  alternates: { canonical: "/accessibility" },
};

const LANGUAGE_NAMES = { en: "English", hi: "हिन्दी" } as const;

export default async function AccessibilityPage() {
  const [{ display }, { locale, t: all }] = await Promise.all([readDisplay(), getLocale()]);
  const t = all.settings;
  return (
    <div className="mx-auto grid max-w-3xl gap-10 px-6 py-12">
      <header className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Eye className="h-4 w-4" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Display & Accessibility Preferences</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary">{t.title}</h1>
        <p className="mt-2 text-sm text-muted leading-relaxed">{t.intro}</p>
      </header>

      {/* Display Form */}
      <form action={saveDisplay} aria-labelledby="display" className="grid gap-6 rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <Sliders className="h-5 w-5 text-secondary" />
          <h2 id="display" className="text-xl font-serif font-bold text-primary">{t.display}</h2>
        </div>

        {(Object.keys(DISPLAY_OPTIONS) as (keyof Display)[]).map((key) => (
          <fieldset key={key} className="grid gap-2">
            <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">{t.legends[key]}</legend>
            <div className="flex flex-wrap gap-2">
              {DISPLAY_OPTIONS[key].map((value) => (
                <label key={value} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-xs font-medium cursor-pointer transition-all has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:text-primary">
                  <input type="radio" name={key} value={value} defaultChecked={display[key] === value} className="accent-primary" />
                  {(t.options[key] as Record<string, string>)[value]}
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        <p className="text-xs text-muted pt-2">{t.note}</p>
        <button className="btn btn-coral-bright btn-sm justify-self-start shadow-xs">{t.save}</button>
      </form>

      {/* Language Section */}
      <section aria-labelledby="language" className="grid gap-4 rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <Languages className="h-5 w-5 text-primary" />
          <h2 id="language" className="text-xl font-serif font-bold text-primary">{t.language}</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          {LOCALES.map((l) => (
            <form key={l} action={setLocale.bind(null, l)}>
              <button
                lang={l}
                aria-pressed={l === locale}
                className={`btn btn-sm ${l === locale ? "btn-primary" : "btn-secondary"}`}
              >
                {LANGUAGE_NAMES[l]}
              </button>
            </form>
          ))}
        </div>
        <p className="text-xs text-muted">{t.languageNote}</p>
      </section>

      {/* Accessibility Statement */}
      <section aria-labelledby="statement" className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <h2 id="statement" className="text-xl font-serif font-bold text-primary mb-3">{t.testTitle}</h2>
        <ul className="grid list-disc gap-2 pl-5 text-xs text-muted leading-relaxed">
          {t.tests.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </section>
    </div>
  );
}
