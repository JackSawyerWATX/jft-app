'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Share } from './model';
import { readShare, saveShare } from './api';
import { ShareForm } from './composer/share-form';
import { ShareHistory } from './history/share-history';
import { useShareHistory } from './history/use-share-history';
import { ShareDetail } from './detail/share-detail';
import { ReflectionReading } from './reflection/reflection-reading';
import { AppHeader } from '../components/app-header';
import { AppFooter } from '../components/app-footer';

type Screen =
  { view: 'today' | 'past' } | { view: 'saved' | 'detail'; share: Share };
type DetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'failed'; message: string };

const screenCopy = {
  today: {
    title: 'Record your share',
    description: 'Speak from your own experience'
  },
  past: {
    title: 'Past shares',
    description: ''
  },
  saved: {
    title: 'Your share is saved.',
    description: ''
  },
  detail: {
    title: 'Your share',
    description: ''
  }
};

/** Drafts live only in this mounted app; a fresh page starts a fresh share. */
export function ShareApp() {
  const [screen, setScreen] = useState<Screen>({ view: 'today' });
  const { view } = screen;
  const [text, setText] = useState('');
  const { history, sessionReady, refresh: loadHistory } = useShareHistory();
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const savePending = useRef(false);
  const detailRequest = useRef(0);
  const [detailState, setDetailState] = useState<DetailState>({
    status: 'idle'
  });
  const heading = useRef<HTMLHeadingElement>(null);
  const navigated = useRef(false);

  useEffect(() => {
    // Remove drafts left by older versions; never restore or persist share text.
    try {
      window.sessionStorage.removeItem('doorknob:share-draft');
    } catch {
      /* Storage is optional. */
    }
  }, []);

  useEffect(
    () => () => {
      detailRequest.current++;
    },
    []
  );
  useEffect(() => {
    if (navigated.current) heading.current?.focus();
    navigated.current = true;
  }, [view]);
  function navigate(next: Screen) {
    detailRequest.current++;
    setDetailState({ status: 'idle' });
    setScreen(next);
    if (next.view === 'past' && sessionReady) void loadHistory();
    window.scrollTo({ top: 0 });
  }
  async function openShare(id: string) {
    const requestId = ++detailRequest.current;
    setDetailState({ status: 'loading' });
    try {
      const share = await readShare(id);
      if (requestId === detailRequest.current)
        navigate({ view: 'detail', share });
    } catch {
      if (requestId === detailRequest.current)
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
      setText('');
      navigate({ view: 'saved', share });
    } catch (cause) {
      setSaveError(
        `Your share could not be saved. Your words are still here. ${cause instanceof Error ? cause.message : 'Check your connection and try again.'}`
      );
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  }
  const { title, description } = screenCopy[view];
  const navigationView =
    view === 'past' || view === 'detail' ? 'today' : 'past';

  return (
    <div className="min-h-screen">
      <AppHeader
        onHome={() => navigate({ view: 'today' })}
        onNavigate={() => navigate({ view: navigationView })}
        navigationLabel={
          navigationView === 'today' ? 'Today’s reflection' : 'Past shares'
        }
      />
      <main className="mx-auto max-w-xl px-6 pb-12 pt-8 sm:px-8 sm:pt-14">
        {view === 'today' && <ReflectionReading />}
        {view === 'saved' && (
          <div
            className="check mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full text-2xl"
            aria-hidden="true"
          >
            ✓
          </div>
        )}
        <h1
          ref={heading}
          tabIndex={-1}
          className={`font-serif leading-[1.1] tracking-[-0.035em] outline-none ${view === 'today' ? 'text-center text-[36px] sm:text-5xl' : view === 'saved' ? 'text-center text-3xl sm:text-4xl' : 'text-[36px] sm:text-5xl'} ${view === 'today' ? 'mt-8 sm:mt-12' : ''}`}
        >
          {title}
        </h1>
        {description && (
          <p
            className={`mt-3 text-[16px] leading-relaxed text-[var(--muted)] ${view === 'saved' || view === 'today' ? 'text-center' : ''}`}
          >
            {description}
          </p>
        )}
        {view === 'past' && history.status === 'failed' && (
          <p
            role="alert"
            className="error mt-6 rounded-xl border p-4 text-sm leading-relaxed"
          >
            {history.message}
          </p>
        )}
        {view === 'today' &&
          !sessionReady &&
          (history.status === 'failed' ? (
            <div className="mt-6">
              <p role="alert">
                Your private session could not be prepared. Your words are still
                here. {history.message}
              </p>
              <button
                className="secondary mt-4 w-full"
                onClick={() => void loadHistory()}
              >
                Try again
              </button>
            </div>
          ) : (
            <p role="status" className="mt-6">
              Preparing your private session…
            </p>
          ))}
        {view === 'today' && (
          <ShareForm
            text={text}
            disabled={saving || !sessionReady}
            saving={saving}
            error={saveError}
            onTextChange={setText}
            onSave={save}
          />
        )}
        {view === 'past' && (
          <ShareHistory
            history={history}
            onWrite={() => navigate({ view: 'today' })}
            onOpen={(share) => {
              if (detailState.status !== 'loading') void openShare(share.id);
            }}
          />
        )}
        {view === 'past' && detailState.status === 'loading' && (
          <p role="status">Opening your share…</p>
        )}
        {view === 'past' && detailState.status === 'failed' && (
          <p role="alert" className="error mt-6 rounded-xl border p-4">
            {detailState.message}
          </p>
        )}
        {view === 'past' && history.status === 'failed' && (
          <button
            className="secondary mt-4 w-full"
            onClick={() => void loadHistory()}
          >
            Try again
          </button>
        )}
        {(screen.view === 'saved' || screen.view === 'detail') && (
          <>
            <ShareDetail share={screen.share} />
            <button
              className="secondary mt-7 w-full"
              onClick={() => navigate({ view: 'today' })}
            >
              Today&apos;s reflection
            </button>
            <button
              className="secondary mt-3 w-full"
              onClick={() => navigate({ view: 'past' })}
            >
              Past shares
            </button>
          </>
        )}
        <AppFooter />
      </main>
    </div>
  );
}
