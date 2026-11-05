import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Share } from './model';
import { readShare, saveShare } from './api';
import { useShareCleanup } from './cleanup/use-share-cleanup';
import { useShareHistory } from './history/use-share-history';

type Screen =
  { view: 'today' | 'past' } | { view: 'saved' | 'detail'; share: Share };
type DetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'failed'; message: string };

/** Mounted application owns the draft and async transitions across screens; never persists draft text. */
export function useShareApplication() {
  const [screen, setScreen] = useState<Screen>({ view: 'today' });
  const [text, setText] = useState('');
  const cleanup = useShareCleanup(text, setText);
  const { history, sessionReady, refresh: loadHistory } = useShareHistory();
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const savePending = useRef(false);
  const mounted = useRef(false);
  const detailRequest = useRef(0);
  const [detailState, setDetailState] = useState<DetailState>({
    status: 'idle'
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function navigate(next: Screen) {
    cleanup.cancel();
    detailRequest.current++;
    setDetailState({ status: 'idle' });
    setScreen(next);
    if (next.view === 'past' && sessionReady) void loadHistory();
  }
  async function openShare(id: string) {
    const requestId = ++detailRequest.current;
    setDetailState({ status: 'loading' });
    try {
      const share = await readShare(id);
      if (mounted.current && requestId === detailRequest.current)
        navigate({ view: 'detail', share });
    } catch {
      if (mounted.current && requestId === detailRequest.current)
        setDetailState({
          status: 'failed',
          message: 'This share could not be opened. Please try again.'
        });
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savePending.current || !sessionReady) return;
    if (!text.trim()) {
      setSaveError('Write a few words before saving your share.');
      return;
    }
    savePending.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const share = await saveShare(text);
      if (!mounted.current) return;
      cleanup.edit('');
      navigate({ view: 'saved', share });
    } catch (cause) {
      if (!mounted.current) return;
      setSaveError(
        `Your share could not be saved. Your words are still here. ${cause instanceof Error ? cause.message : 'Check your connection and try again.'}`
      );
    } finally {
      savePending.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  return {
    screen,
    text,
    cleanup,
    history,
    sessionReady,
    loadHistory,
    saveError,
    saving,
    detailState,
    navigate,
    openShare,
    save
  };
}
