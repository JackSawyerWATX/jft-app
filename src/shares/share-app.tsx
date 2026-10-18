'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Share } from './model';
import { readShares, saveShare } from './storage';
import { ShareForm } from './components/share-form';
import {
  ShareHistory,
  type ShareHistoryState
} from './components/share-history';
import { ShareDetail } from './components/share-detail';
import { ReflectionReading } from './components/reflection-reading';
import { AppHeader } from '../components/app-header';
import { AppFooter } from '../components/app-footer';

type Screen =
  { view: 'today' | 'past' } | { view: 'saved' | 'detail'; share: Share };
const screenCopy = {
  today: {
    title: 'Write your share',
    description: "What's on your mind about today's reading?"
  },
  past: {
    title: 'Past shares',
    description: 'Your personal history. A little space to look back.'
  },
  saved: {
    title: 'Your share has been saved.',
    description: 'Thank you for making space for yourself today.'
  },
  detail: {
    title: 'Your share',
    description: 'A moment you made space for yourself.'
  }
};

/** Owns the local writing, confirmation, history, and full-share views. */
export function ShareApp() {
  const [screen, setScreen] = useState<Screen>({ view: 'today' });
  const { view } = screen;
  const [text, setText] = useState('');
  const [history, setHistory] = useState<ShareHistoryState>({
    status: 'loading'
  });
  const [saveError, setSaveError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const navigated = useRef(false);

  useEffect(() => {
    try {
      setHistory({ status: 'loaded', shares: readShares(localStorage) });
    } catch {
      setHistory({
        status: 'failed',
        message:
          'Your saved shares could not be read. Check that browser storage is available, then refresh. Existing data has not been changed.'
      });
    }
  }, []);
  useEffect(() => {
    if (navigated.current) heading.current?.focus();
    navigated.current = true;
  }, [view]);
  function navigate(next: Screen) {
    setScreen(next);
    window.scrollTo({ top: 0 });
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const { share, shares: next } = saveShare(localStorage, text);
      setHistory({ status: 'loaded', shares: next });
      setText('');
      setSaveError('');
      navigate({ view: 'saved', share });
    } catch {
      setSaveError(
        text.trim()
          ? 'Your share could not be saved. Your words are still here. Check browser storage or available space and try again.'
          : 'Write a few words before saving your share.'
      );
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
      <main className="mx-auto max-w-xl px-6 pb-12 pt-10 sm:px-8 sm:pt-14">
        {view === 'today' && <ReflectionReading />}
        {view === 'saved' && (
          <div
            className="check mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-full text-3xl"
            aria-hidden="true"
          >
            ✓
          </div>
        )}
        <h1
          ref={heading}
          tabIndex={-1}
          className={`font-serif text-[40px] leading-[1.1] tracking-[-0.045em] outline-none sm:text-5xl ${view === 'today' ? 'mt-12' : ''} ${view === 'saved' ? 'text-center' : ''}`}
        >
          {title}
        </h1>
        <p
          className={`mt-3 text-[16px] leading-relaxed text-[var(--muted)] ${view === 'saved' ? 'text-center' : ''}`}
        >
          {description}
        </p>
        {history.status === 'failed' && (
          <p
            role="alert"
            className="error mt-6 rounded-xl border p-4 text-sm leading-relaxed"
          >
            {history.message}
          </p>
        )}
        {view === 'today' && (
          <ShareForm
            text={text}
            disabled={history.status === 'loading'}
            error={saveError}
            onTextChange={setText}
            onSave={save}
          />
        )}
        {view === 'past' && (
          <ShareHistory
            history={history}
            onWrite={() => navigate({ view: 'today' })}
            onOpen={(share) => navigate({ view: 'detail', share })}
          />
        )}
        {(screen.view === 'saved' || screen.view === 'detail') && (
          <>
            <ShareDetail share={screen.share} />
            <button
              className="primary mt-7 w-full"
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
