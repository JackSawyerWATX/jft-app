import type { Share } from '../model';
import { ShareHistoryItem } from './share-history-item';

import type { ShareHistoryState } from '../use-share-history';

type ShareHistoryProps = {
  history: ShareHistoryState;
  onWrite: () => void;
  onOpen: (share: Share) => void;
};

export function ShareHistory({ history, onWrite, onOpen }: ShareHistoryProps) {
  if (history.status === 'loading')
    return <p role="status">Loading your shares…</p>;
  if (history.status === 'failed') {
    // The parent displays the API error above the view.
    return (
      <button className="secondary mt-7 w-full" onClick={onWrite}>
        Today&apos;s reflection
      </button>
    );
  }
  const { shares } = history;
  return (
    <div className="mt-9">
      {shares.length === 0 ? (
        <div className="empty rounded-xl border border-[var(--line)] p-7">
          <p className="font-serif text-2xl">A place for your words.</p>
          <p className="mt-3 leading-relaxed text-[var(--muted)]">
            Your saved shares will appear here. Start with whatever is on your
            mind today.
          </p>
          <button className="primary mt-6 w-full" onClick={onWrite}>
            Write your first share
          </button>
        </div>
      ) : (
        <ul>
          {shares.map((share) => (
            <ShareHistoryItem key={share.id} share={share} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </div>
  );
}
