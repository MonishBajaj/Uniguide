import Link from "next/link";

/** Links between application tracks (1.4). `current` is the selected `?track=` value. */
export function TrackSwitcher({ href, options, current }: { href: (value: string) => string; options: { value: string; label: string }[]; current: string }) {
  return (
    <nav aria-label="Application tracks" className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Track:</span>
      {options.map((o) => (
        <Link key={o.value} href={href(o.value)} aria-current={o.value === current ? "page" : undefined} className="btn btn-secondary btn-sm aria-[current=page]:bg-border">
          {o.label}
        </Link>
      ))}
      <Link href="/app/profile#tracks" className="underline underline-offset-2">Manage tracks</Link>
    </nav>
  );
}
