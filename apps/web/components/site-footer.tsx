import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border print:hidden">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p className="sm:max-w-sm">Uniguide shows facts from official pages. Always confirm on the official page before you apply.</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 whitespace-nowrap sm:justify-end">
          <li><Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link></li>
          <li><Link href="/legal/terms" className="hover:text-foreground">Terms</Link></li>
          <li><Link href="/guide" className="hover:text-foreground">How it works</Link></li>
          <li><Link href="/visas" className="hover:text-foreground">Visas</Link></li>
          <li><Link href="/blog" className="hover:text-foreground">Blog</Link></li>
          <li><Link href="/accessibility" className="hover:text-foreground">Accessibility</Link></li>
          <li><Link href="/requirements" className="hover:text-foreground">Data sources</Link></li>
        </ul>
      </div>
    </footer>
  );
}
