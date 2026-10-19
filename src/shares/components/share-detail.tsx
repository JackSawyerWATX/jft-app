import type { Share } from '../model';
import { dateLabel } from '../dates';

/**
 * Presents a confirmed share and its original reading snapshot as escaped text.
 * The controller supplies a validated creation/detail response; this component does
 * not fetch, authorize, or read current reflection content in place of the snapshot.
 */
export function ShareDetail({ share }: { share: Share }) {
  return (
    <article className="share-card mt-8 rounded-xl border border-[var(--line)] p-6 sm:p-8">
      <p className="eyebrow">{dateLabel(share.createdAt)}</p>
      <h2 className="mt-4 font-serif text-2xl leading-snug">
        {share.reflection.title}
      </h2>
      <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
        {share.reflection.body}
      </p>
      <div className="my-6 border-t border-[var(--line)]" />
      <p className="eyebrow">Your thoughts</p>
      <p className="mt-3 whitespace-pre-wrap break-words font-serif text-xl leading-relaxed">
        {share.text}
      </p>
    </article>
  );
}
