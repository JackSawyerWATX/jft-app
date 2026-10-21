import Link from 'next/link';

/** Displays the closing line and a quiet link to the story behind the app. */
export function AppFooter() {
  return (
    <footer className="mt-8 text-center sm:mt-12">
      <div className="divider" />
      <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
        A meeting for one.
      </p>
      <Link
        href="/about"
        className="nav-link mt-1 inline-flex items-center underline underline-offset-4"
      >
        About Doorknob
      </Link>
    </footer>
  );
}
