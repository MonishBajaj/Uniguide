import type { Metadata } from "next";
import { setLocale } from "@/app/locale-actions";
import { DISPLAY_OPTIONS, type Display } from "@/lib/display";
import { readDisplay } from "@/lib/display-server";
import { LOCALES } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { saveDisplay } from "./actions";

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
    <div className="mx-auto grid max-w-3xl gap-10 px-6 py-16">
      <header className="grid gap-2">
        <h1 className="text-4xl font-semibold">{t.title}</h1>
        <p className="text-muted">{t.intro}</p>
      </header>

      <form action={saveDisplay} aria-labelledby="display" className="grid gap-6 rounded-2xl border border-border bg-surface p-6">
        <h2 id="display" className="text-xl font-semibold">{t.display}</h2>
        {(Object.keys(DISPLAY_OPTIONS) as (keyof Display)[]).map((key) => (
          <fieldset key={key} className="grid gap-2">
            <legend className="mb-1 font-semibold">{t.legends[key]}</legend>
            <div className="flex flex-wrap gap-2">
              {DISPLAY_OPTIONS[key].map((value) => (
                <label key={value} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm has-[:checked]:border-accent">
                  <input type="radio" name={key} value={value} defaultChecked={display[key] === value} className="accent-[var(--accent)]" />
                  {(t.options[key] as Record<string, string>)[value]}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <p className="text-sm text-muted">{t.note}</p>
        <button className="btn btn-primary justify-self-start">{t.save}</button>
      </form>

      <section aria-labelledby="language" className="grid gap-3 rounded-2xl border border-border bg-surface p-6">
        <h2 id="language" className="text-xl font-semibold">{t.language}</h2>
        <div className="flex flex-wrap gap-2">
          {LOCALES.map((l) => (
            <form key={l} action={setLocale.bind(null, l)}>
              <button lang={l} aria-pressed={l === locale} className="btn btn-secondary btn-sm">{LANGUAGE_NAMES[l]}</button>
            </form>
          ))}
        </div>
        <p className="text-sm text-muted">{t.languageNote}</p>
      </section>

      <section aria-labelledby="statement" className="grid gap-3">
        <h2 id="statement" className="text-xl font-semibold">{t.testTitle}</h2>
        <ul className="grid list-disc gap-2 pl-5 text-muted">{t.tests.map((line) => <li key={line}>{line}</li>)}</ul>
        <p className="text-muted">{t.testsNote}</p>
      </section>
    </div>
  );
}
