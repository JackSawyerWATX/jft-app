'use client';

import { useEffect, useRef, useState } from 'react';
import { readShares } from './api';
import type { Share } from './model';

/**
 * History request state: only loaded carries shares, and only an empty loaded list
 * means no records exist. failed carries a displayable message, not partial results.
 */
export type ShareHistoryState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'loaded'; shares: Share[] };

/**
 * Owns history requests and the initial session bootstrap independently of the draft.
 * @returns History, successful session readiness, and a fresh-read callback. Refreshes
 * ignore stale results; failures become display state. Saving stays blocked until a read succeeds, including after bootstrap failure.
 */
export function useShareHistory() {
  const [history, setHistory] = useState<ShareHistoryState>({
    status: 'loading'
  });
  const [sessionReady, setSessionReady] = useState(false);
  const requestId = useRef(0);
  const bootstrapRequest = useRef<Promise<Share[]> | null>(null);

  async function load(request: Promise<Share[]>) {
    const current = ++requestId.current;
    setHistory({ status: 'loading' });
    try {
      const shares = await request;
      if (current === requestId.current) {
        setHistory({ status: 'loaded', shares });
        setSessionReady(true);
      }
    } catch (cause) {
      if (current === requestId.current)
        setHistory({
          status: 'failed',
          message: `Your saved shares could not be read. ${cause instanceof Error ? cause.message : 'Check your connection and try again.'}`
        });
    } finally {
      if (current === requestId.current && bootstrapRequest.current === request)
        bootstrapRequest.current = null;
    }
  }

  function invalidate() {
    requestId.current++;
  }

  useEffect(() => {
    // Reuse only the bootstrap read across Strict Mode effects to issue one cookie.
    bootstrapRequest.current ??= readShares();
    void load(bootstrapRequest.current);
    return invalidate;
  }, []);

  function refresh() {
    if (sessionReady) return load(readShares());
    // Before readiness, all retries share one request so owners cannot race.
    bootstrapRequest.current ??= readShares();
    return load(bootstrapRequest.current);
  }

  return { history, sessionReady, refresh };
}
