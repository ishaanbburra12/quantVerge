import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-content flex-col items-center px-4 py-28 text-center sm:px-6">
      <p className="tabular text-5xl font-semibold text-ink-faint">404</p>
      <h1 className="mt-4 text-xl font-semibold text-ink">This page does not exist</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
        The page you asked for is not here. It may be a lab that has not been built yet, or a mistyped URL.
      </p>
      <div className="mt-6 flex gap-2.5">
        <Link
          href="/labs"
          className="rounded-md border border-accent bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink transition-all hover:brightness-110"
        >
          Browse the labs
        </Link>
        <Link
          href="/"
          className="rounded-md border border-line bg-surface-raised px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
