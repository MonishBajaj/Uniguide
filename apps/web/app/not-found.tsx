import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <p className="font-mono text-sm text-muted">404</p>
      <h1 className="mt-2 text-4xl font-semibold">This page is not on the list</h1>
      <p className="mt-3 text-muted">The course may have been renamed or removed from its register.</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/courses" className="btn btn-primary">Search courses</Link>
        <Link href="/" className="btn btn-secondary">Home</Link>
      </div>
    </div>
  );
}
