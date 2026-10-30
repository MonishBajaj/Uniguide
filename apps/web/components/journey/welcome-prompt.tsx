import Link from "next/link";
import type { Dict } from "@/lib/i18n/en";
import type { Welcome } from "@/lib/onboarding";

/**
 * What to do first on the page onboarding ended on (journey M2, J2.6). Students who are applying or
 * have offers find their courses in the catalogue; courses outside it come with own applications (M3).
 */
export function WelcomePrompt({ welcome, t }: { welcome: Welcome | null; t: Dict["journey"]["onboarding"] }) {
  if (!welcome) return null;
  return (
    <section role="status" className="mb-8 grid gap-2 rounded-2xl border border-accent/40 bg-surface p-5">
      <p className="font-semibold">{t.welcome[welcome]}</p>
      {welcome !== "knows" ? (
        <>
          <p>
            <Link href="/courses" className="font-semibold text-accent underline underline-offset-2">{t.findCourses}</Link>
          </p>
          <p className="text-sm text-muted">{t.notListed}</p>
        </>
      ) : null}
    </section>
  );
}
