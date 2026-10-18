import type { Share } from '../model';
import { dateLabel } from '../dates';

type ShareHistoryItemProps = { share: Share; onOpen: (share: Share) => void };

/** Presents one saved share and opens it through the owning history screen. */
export function ShareHistoryItem({ share, onOpen }: ShareHistoryItemProps) {
  const createdAt = new Date(share.createdAt);
  return (
    <li className="border-t border-[var(--line)]">
      <button
        className="share-row flex w-full items-center gap-5 py-6 text-left"
        onClick={() => {
          onOpen(share);
        }}
      >
        <div className="min-w-10 text-center">
          <span className="eyebrow">
            {createdAt.toLocaleDateString('en-US', {
              month: 'short'
            })}
          </span>
          <span className="block font-serif text-3xl">
            {createdAt.getDate()}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-serif text-xl leading-snug">
            {share.reflection.title}
          </p>
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[var(--muted)]">
            {share.text}
          </p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            {dateLabel(createdAt)} ·{' '}
            {createdAt.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit'
            })}
          </p>
        </div>
        <span aria-hidden="true">›</span>
      </button>
    </li>
  );
}
