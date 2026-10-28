import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>Uniguide shows facts from official pages. Always confirm on the official page before you apply.</p>
        <ul className="flex gap-4">
          <li><Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link></li>
          <li><Link href="/legal/terms" className="hover:text-foreground">Terms</Link></li>
          <li><Link href="/deadlines" className="hover:text-foreground">Deadlines</Link></li>
          <li><Link href="/english-tests" className="hover:text-foreground">English tests</Link></li>
          <li><Link href="/visas" className="hover:text-foreground">Visas</Link></li>
          <li><Link href="/requirements" className="hover:text-foreground">Data sources</Link></li>
        </ul>
      </div>
    </footer>
  );
}
