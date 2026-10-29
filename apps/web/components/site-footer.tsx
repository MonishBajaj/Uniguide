import Link from "next/link";
import { setLocale } from "@/app/locale-actions";
import { dict, type Locale } from "@/lib/i18n";
import { HI_REVIEW_NOTE } from "@/lib/i18n/hi";

export function SiteFooter({ lite = false, locale = "en" }: { lite?: boolean; locale?: Locale }) {
  const t = dict(locale).footer;
  const other: Locale = locale === "hi" ? "en" : "hi";
  return (
    <footer className="mt-24 border-t border-border print:hidden">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-1 sm:max-w-sm">
          <p>{t.disclaimer}</p>
          {lite ? (
            <p>
              {t.dataSaver}{" "}
              <Link href="/accessibility" className="underline underline-offset-2">{t.change}</Link>
            </p>
          ) : null}
          {locale === "hi" ? <p>{HI_REVIEW_NOTE}</p> : null}
          <form action={setLocale.bind(null, other)}>
            <button lang={other} className="underline underline-offset-2 hover:text-foreground">{t.switchTo}</button>
          </form>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 whitespace-nowrap sm:justify-end">
          <li><Link href="/legal/privacy" className="hover:text-foreground">{t.privacy}</Link></li>
          <li><Link href="/legal/terms" className="hover:text-foreground">{t.terms}</Link></li>
          <li><Link href="/guide" className="hover:text-foreground">{t.guide}</Link></li>
          <li><Link href="/deadlines" className="hover:text-foreground">Deadlines</Link></li>
          <li><Link href="/compare/countries" className="hover:text-foreground">Compare countries</Link></li>
          <li><Link href="/english-tests" className="hover:text-foreground">English tests</Link></li>
          <li><Link href="/insights" className="hover:text-foreground">Insights</Link></li>
          <li><Link href="/visas" className="hover:text-foreground">{t.visas}</Link></li>
          <li><Link href="/blog" className="hover:text-foreground">{t.blog}</Link></li>
          <li><Link href="/learn" className="hover:text-foreground">{t.learn}</Link></li>
          <li><Link href="/accessibility" className="hover:text-foreground">{t.accessibility}</Link></li>
          <li><Link href="/requirements" className="hover:text-foreground">{t.sources}</Link></li>
        </ul>
      </div>
    </footer>
  );
}
