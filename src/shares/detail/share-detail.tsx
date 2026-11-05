import type { Share } from '../model';
import { ExpandableThoughts } from './expandable-thoughts';
import { dateLabel, readingDateLabel } from '../dates';

/** Render the saved reading snapshot, not the current reading. */
export function ShareDetail({ share }: { share: Share }) {
  return (
    <section aria-label="Saved share">
      <article className="share-card mt-8 rounded-xl border border-[var(--line)] p-6 sm:p-8">
        <p className="eyebrow">
          Saved {dateLabel(share.createdAt)} ·{' '}
          {new Date(share.createdAt).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
          })}
        </p>
        <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
          Sample reading · {readingDateLabel(share.reflection.date)}
        </p>
        <h2 className="mt-2 font-serif text-2xl leading-snug">
          {share.reflection.title}
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
          {share.reflection.body}
        </p>
        <div className="my-6 border-t border-[var(--line)]" />
        <h2 className="font-serif text-2xl">Your thoughts</h2>
        <ExpandableThoughts key={share.id} text={share.text} />
      </article>
    </section>
  );
}
