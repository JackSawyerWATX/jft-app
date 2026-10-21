'use client';

import Link from 'next/link';

/** Unexpected server failures are distinct from missing links; retry uses Next's error boundary. */
export default function SharedReflectionError({
  retry
}: {
  retry: () => void;
}) {
  return (
    <main className="mx-auto max-w-xl px-6 py-12 sm:px-8">
      <h1 className="font-serif text-4xl">This share could not be loaded</h1>
      <button className="secondary mt-7 w-full" onClick={retry}>
        Try again
      </button>
      <Link href="/" prefetch={false} className="primary mt-3 w-full">
        Write your share
      </Link>
    </main>
  );
}
