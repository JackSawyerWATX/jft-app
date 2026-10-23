import type { Share } from '../model';

type ShareHistoryItemProps = { share: Share; onOpen: (share: Share) => void };

export function ShareHistoryItem({ share, onOpen }: ShareHistoryItemProps) {
  const createdAt = new Date(share.createdAt);
  return (
    <li className="border-t border-[var(--line)]">
      <button
        className="share-row flex w-full items-center gap-4 py-5 text-left"
        onClick={() => {
          onOpen(share);
        }}
      >
        <div className="min-w-10 shrink-0 text-center">
          <span className="eyebrow">
            {createdAt.toLocaleDateString('en-US', {
              month: 'short'
            })}
          </span>
          <span className="block font-serif text-3xl">
            {createdAt.getDate()}
          </span>
          <span className="block text-xs text-[var(--muted)]">
            {createdAt.getFullYear()}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words font-serif text-xl leading-snug">
            {share.text.trim() || 'No written thoughts available.'}
          </p>
          <p className="mt-2 break-words text-xs leading-relaxed text-[var(--muted)]">
            {share.reflection.title} ·{' '}
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
