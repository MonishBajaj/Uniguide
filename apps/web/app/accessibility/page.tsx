import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DISPLAY_COOKIE, DISPLAY_OPTIONS, parseDisplay, type Display } from "@/lib/display";
import { saveDisplay } from "./actions";

export const metadata: Metadata = {
  title: "Accessibility and display settings",
  description: "Make text larger, raise contrast or stop motion, and read how we test Uniguide for accessibility.",
  alternates: { canonical: "/accessibility" },
};

const LABELS: { [K in keyof Display]: { legend: string; options: Record<Display[K], string> } } = {
  text: { legend: "Text size", options: { normal: "Normal", large: "Large", larger: "Larger" } },
  contrast: { legend: "Contrast", options: { normal: "Normal", high: "High" } },
  motion: { legend: "Motion", options: { normal: "Normal", reduce: "Reduce motion" } },
  data: { legend: "Data saver", options: { auto: "Automatic", saver: "Always save data", full: "Off" } },
};

export default async function AccessibilityPage() {
  const display = parseDisplay((await cookies()).get(DISPLAY_COOKIE)?.value);
  return (
    <div className="mx-auto grid max-w-3xl gap-10 px-6 py-16">
      <header className="grid gap-2">
        <h1 className="text-4xl font-semibold">Accessibility</h1>
        <p className="text-muted">Change how Uniguide looks on this device. It works signed in or not, and is kept in a cookie on this browser only.</p>
      </header>

      <form action={saveDisplay} aria-labelledby="display" className="grid gap-6 rounded-2xl border border-border bg-surface p-6">
        <h2 id="display" className="text-xl font-semibold">Display settings</h2>
        {(Object.keys(DISPLAY_OPTIONS) as (keyof Display)[]).map((key) => (
          <fieldset key={key} className="grid gap-2">
            <legend className="mb-1 font-semibold">{LABELS[key].legend}</legend>
            <div className="flex flex-wrap gap-2">
              {DISPLAY_OPTIONS[key].map((value) => (
                <label key={value} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm has-[:checked]:border-accent">
                  <input type="radio" name={key} value={value} defaultChecked={display[key] === value} className="accent-[var(--accent)]" />
                  {(LABELS[key].options as Record<string, string>)[value]}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <p className="text-sm text-muted">
          Your device&apos;s own &ldquo;reduce motion&rdquo; setting is always respected as well. The data saver drops
          animations and preloading and shows shorter lists; &ldquo;Automatic&rdquo; turns it on when your browser&apos;s
          own data saver is on.
        </p>
        <button className="btn btn-primary justify-self-start">Save display settings</button>
      </form>

      <section aria-labelledby="statement" className="grid gap-3">
        <h2 id="statement" className="text-xl font-semibold">How we test</h2>
        <ul className="grid list-disc gap-2 pl-5 text-muted">
          <li>Every change is checked automatically against WCAG 2.1 AA on our main pages, signed out, as a student and as a parent. A serious or critical problem stops the release.</li>
          <li>Everything can be done with a keyboard, and a &ldquo;Skip to content&rdquo; link comes first on every page.</li>
          <li>Forms have labels, errors are announced, and status on facts is written in words, never shown by colour alone.</li>
        </ul>
        <p className="text-muted">
          Automated checks find only some problems. If something is hard to use with your screen reader, magnifier or
          keyboard, please tell us and we will fix it.
        </p>
      </section>
    </div>
  );
}
