import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ThoughtsText } from '../../../shares/components/thoughts-text';
import { readPublicShare } from '../../../shares/server/public-shares';
import { readingDateLabel } from '../../../shares/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Static metadata never includes private reflection content or credentials. */
export const metadata: Metadata = {
  title: 'A shared reflection · Doorknob',
  description: 'A reflection shared with you.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer'
};

/** Session-free server-rendered reading; only the public access service may load content. */
export default async function SharedReflection({
  params
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  let share;
  try {
    share = await readPublicShare(shareId);
  } catch {
    // Let Next handle unexpected failures, with no request, content, or raw cause in diagnostics.
    throw new Error('The shared reflection could not be loaded.');
  }
  return (
    <div className="min-h-screen">
      <header className="mx-auto max-w-5xl border-b border-[var(--line)] px-6 py-6 sm:px-10">
        <div className="brand flex items-center gap-3">
          <Image src="/doorknob-logo.svg" width={30} height={39} alt="" />
          <span>Doorknob</span>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-6 py-12 sm:px-8">
        {share ? (
          <>
            <p className="eyebrow text-center">
              Shared with you · {readingDateLabel(share.reflection.date)}
            </p>
            <h1 className="mt-6 text-center font-serif text-4xl leading-snug">
              {share.reflection.title}
            </h1>
            <div className="divider" />
            <p className="reading-body whitespace-pre-wrap break-words">
              {share.reflection.body}
            </p>
            <section
              aria-label="Shared thoughts"
              className="share-card mt-10 rounded-xl border border-[var(--line)] p-6 sm:p-8"
            >
              <h2 className="eyebrow">Their thoughts</h2>
              <ThoughtsText key={shareId} text={share.text} />
            </section>
          </>
        ) : (
          <>
            <h1 className="font-serif text-4xl">This share is unavailable</h1>
            <p className="mt-4 leading-relaxed text-[var(--muted)]">
              This share is no longer available.
            </p>
          </>
        )}
        <Link href="/" prefetch={false} className="primary mt-7 w-full">
          Write your share
        </Link>
      </main>
    </div>
  );
}
