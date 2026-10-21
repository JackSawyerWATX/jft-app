import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About · Doorknob',
  description:
    'The story behind Doorknob: a place to reflect, share, and carry the message to another alcoholic.'
};

/** The story behind Doorknob, with a return path to the daily reflection. */
export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between border-b border-[var(--line)] px-6 py-6 sm:px-10">
        <Link
          href="/"
          className="brand flex items-center gap-3"
          aria-label="Doorknob, today's reflection"
        >
          <Image src="/doorknob-logo.svg" width={30} height={39} alt="" />
          <span>Doorknob</span>
        </Link>
        <Link href="/" className="nav-link inline-flex items-center">
          Today&apos;s reflection <span aria-hidden="true">→</span>
        </Link>
      </header>
      <main className="mx-auto max-w-xl px-6 pb-12 pt-8 sm:px-8 sm:pt-14">
        <article>
          <h1 className="font-serif text-3xl leading-snug tracking-[-0.035em] sm:text-4xl">
            The Story of the Doorknob
          </h1>
          <div className="reading-body mt-7 space-y-5">
            <p>
              In AA, there&apos;s an old saying that your Higher Power can be
              anything, even a doorknob.
            </p>
            <p>
              There&apos;s a story about a tall alcoholic who, after an
              accident, found himself in a wheelchair. The doorknobs he&apos;d
              once looked down on were now right at eye level.
            </p>
            <p>
              When asked about his Higher Power, he would say it was a doorknob.
            </p>
            <p>
              He explained that he spent his time in meetings watching the door,
              praying another alcoholic would walk through it. Someone he might
              be able to help.
            </p>
            <p>
              I&apos;ve never been able to confirm this story is true. Stories
              passed from one alcoholic to another aren&apos;t always reliable
              in their details. But the message has stayed with me.
            </p>
            <p>
              There&apos;s another old saying in AA:{' '}
              <strong>
                We can&apos;t keep what we have unless we give it away.
              </strong>
            </p>
            <p>
              That&apos;s the idea behind Doorknob. A place to reflect, to share
              our experience, strength, and hope, and to carry the message to
              another alcoholic.
            </p>
          </div>
        </article>
      </main>
    </div>
  );
}
