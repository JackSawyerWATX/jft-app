'use client';

import { useEffect, useRef } from 'react';
import { useShareApplication } from './use-share-application';
import { ShareForm } from './composer/share-form';
import { ShareHistory } from './history/share-history';
import { SavedShareScreen } from './detail/saved-share-screen';
import { ReflectionReading } from './reflection/reflection-reading';
import { AppHeader } from '../components/app-header';
import { AppFooter } from '../components/app-footer';

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
  const {
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
  } = useShareApplication();
  const { view } = screen;
  const heading = useRef<HTMLHeadingElement>(null);
  const navigated = useRef(false);
  useEffect(() => {
    if (navigated.current) {
      heading.current?.focus();
      window.scrollTo({ top: 0 });
    }
    navigated.current = true;
  }, [screen]);
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
            sessionReady={sessionReady}
            saving={saving}
            error={saveError}
            onTextChange={cleanup.edit}
            cleanupStatus={cleanup.state.status}
            isCleanupPending={cleanup.isPending}
            onCleanup={cleanup.run}
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
          <SavedShareScreen
            share={screen.share}
            onWrite={() => navigate({ view: 'today' })}
            onHistory={() => navigate({ view: 'past' })}
          />
        )}
        {view !== 'saved' && view !== 'detail' && <AppFooter />}
      </main>
    </div>
  );
}
