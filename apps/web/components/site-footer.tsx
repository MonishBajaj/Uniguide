import Link from "next/link";
import { setLocale } from "@/app/locale-actions";
import { dict, type Locale } from "@/lib/i18n";
import { HI_REVIEW_NOTE } from "@/lib/i18n/hi";
import { GraduationCap } from "lucide-react";

export function SiteFooter({ lite = false, locale = "en" }: { lite?: boolean; locale?: Locale }) {
  const t = dict(locale).footer;
  const other: Locale = locale === "hi" ? "en" : "hi";

  return (
    <footer className="mt-24 border-t border-border bg-surface pt-16 pb-12 print:hidden">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4 lg:gap-12 pb-12 border-b border-border/70">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
                <GraduationCap className="h-4 w-4" />
              </span>
              <span className="font-serif text-xl font-bold tracking-tight text-primary">
                UniGuide AI
              </span>
            </div>
            <p className="text-sm text-muted leading-relaxed max-w-xs">
              {t.disclaimer}
            </p>
            {locale === "hi" ? <p className="text-xs text-muted/80">{HI_REVIEW_NOTE}</p> : null}
            <div className="pt-2">
              <form action={setLocale.bind(null, other)}>
                <button
                  lang={other}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted hover:border-primary hover:text-primary transition-colors"
                >
                  🌐 {t.switchTo}
                </button>
              </form>
            </div>
          </div>

          <div>
            <h4 className="font-serif text-base font-bold text-primary mb-4">Platform</h4>
            <ul className="space-y-2.5 text-sm text-muted">
              <li><Link href="/courses" className="hover:text-primary transition-colors">Course Finder</Link></li>
              <li><Link href="/requirements" className="hover:text-primary transition-colors">{t.sources}</Link></li>
              <li><Link href="/visas" className="hover:text-primary transition-colors">{t.visas}</Link></li>
              <li><Link href="/compare/countries" className="hover:text-primary transition-colors">Compare Countries</Link></li>
              <li><Link href="/deadlines" className="hover:text-primary transition-colors">Deadlines Calendar</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-serif text-base font-bold text-primary mb-4">Resources</h4>
            <ul className="space-y-2.5 text-sm text-muted">
              <li><Link href="/guide" className="hover:text-primary transition-colors">{t.guide}</Link></li>
              <li><Link href="/english-tests" className="hover:text-primary transition-colors">English Tests</Link></li>
              <li><Link href="/blog" className="hover:text-primary transition-colors">{t.blog}</Link></li>
              <li><Link href="/insights" className="hover:text-primary transition-colors">Admissions Insights</Link></li>
              <li><Link href="/learn" className="hover:text-primary transition-colors">{t.learn}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-serif text-base font-bold text-primary mb-4">Legal & Settings</h4>
            <ul className="space-y-2.5 text-sm text-muted">
              <li><Link href="/legal/privacy" className="hover:text-primary transition-colors">{t.privacy}</Link></li>
              <li><Link href="/legal/terms" className="hover:text-primary transition-colors">{t.terms}</Link></li>
              <li><Link href="/accessibility" className="hover:text-primary transition-colors">{t.accessibility}</Link></li>
              {lite ? (
                <li className="text-xs text-muted pt-2">
                  {t.dataSaver}{" "}
                  <Link href="/accessibility" className="underline underline-offset-2 hover:text-foreground">
                    {t.change}
                  </Link>
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 text-xs text-muted sm:flex-row">
          <p>© 2026 UniGuide AI. Verified global university guidance and requirements.</p>
          <p className="text-muted/80">Every fact linked to an official university or government source.</p>
        </div>
      </div>
    </footer>
  );
}
