'use client';

import { useEffect, useRef, useState } from 'react';

/** Opens device sharing immediately; falls back to clipboard, then a selectable link. */
export function ShareButton({ url }: { url: string }) {
  const [pending, setPending] = useState(false);
  const [manualLink, setManualLink] = useState('');
  const [status, setStatus] = useState('');
  const busy = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (manualLink) {
      input.current?.focus();
      input.current?.select();
    }
  }, [manualLink]);
  async function share() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setStatus('');
    setManualLink('');
    const link = new URL(url, window.location.origin).href;
    try {
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'A shared reflection · Doorknob',
            url: link
          });
          return;
        } catch (cause) {
          if (cause instanceof Error && cause.name === 'AbortError') return;
        }
      }
      try {
        if (!navigator.clipboard?.writeText)
          throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(link);
        setStatus('Link copied.');
      } catch {
        setManualLink(link);
        input.current?.focus();
        input.current?.select();
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <div className="mt-6">
      <button
        type="button"
        aria-label="Share with fellow alcoholic"
        title="Share with fellow alcoholic"
        disabled={pending}
        onClick={() => void share()}
        className="secondary w-full"
      >
        <svg
          className="shrink-0"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="m8.7 10.4 6.6-3.8m-6.6 7 6.6 3.8" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="5" r="3" />
          <circle cx="18" cy="19" r="3" />
        </svg>
        <span>Share with fellow alcoholic</span>
      </button>
      {status && (
        <p role="status" className="mt-2 text-sm">
          {status}
        </p>
      )}
      {manualLink && (
        <div className="mt-3">
          <label htmlFor="manual-share-link" className="text-sm">
            Copy link
          </label>
          <input
            ref={input}
            id="manual-share-link"
            aria-label="Sharing link"
            className="mt-2 min-h-11 w-full rounded border border-[var(--line)] p-2 text-sm"
            value={manualLink}
            readOnly
            onFocus={(event) => event.target.select()}
          />
        </div>
      )}
    </div>
  );
}
