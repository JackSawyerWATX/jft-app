import { useLayoutEffect, useRef } from 'react';
import type { Share } from '../model';
import { AppFooter } from '../../components/app-footer';
import { ShareDetail } from './share-detail';
import { ShareButton } from './share-button';

/** Own the fixed actions and their measured clearance, including clipboard fallback and text resizing. */
export function SavedShareScreen({
  share,
  onWrite,
  onHistory
}: {
  share: Share;
  onWrite: () => void;
  onHistory: () => void;
}) {
  const screen = useRef<HTMLDivElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = screen.current!;
    const bar = actions.current!;
    const measure = () =>
      container.style.setProperty(
        '--share-actions-height',
        `${Math.ceil(bar.getBoundingClientRect().height)}px`
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={screen}
      style={{ paddingBottom: 'var(--share-actions-height, 0px)' }}
    >
      <ShareDetail share={share} />
      <button className="secondary mt-7 w-full" onClick={onWrite}>
        Today&apos;s reflection
      </button>
      <button className="secondary mt-3 w-full" onClick={onHistory}>
        Past shares
      </button>
      <AppFooter />
      <div
        ref={actions}
        role="region"
        aria-label="Share actions"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[#faf8f1] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
      >
        <div className="mx-auto max-w-xl px-6 sm:px-8">
          <ShareButton url={share.shareUrl} />
        </div>
      </div>
    </div>
  );
}
