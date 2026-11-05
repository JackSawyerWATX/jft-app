import { useId } from 'react';
import { LiveTranscript } from './live-transcript';
import { RecordingControls } from './recording/recording-controls';
import { RecordingStatus } from './recording/recording-status';
import { ListeningClock } from './recording/listening-clock';
import { SaveShareButton } from './save-share-button';
import {
  useShareComposer,
  type ShareComposerOptions
} from './use-share-composer';

type ShareFormProps = ShareComposerOptions & { error: string };

/** The parent owns the draft and clears it only after a confirmed save. */
export function ShareForm({
  text,
  cleanupStatus,
  isCleanupPending,
  onCleanup,
  sessionReady,
  saving,
  error,
  onTextChange,
  onSave
}: ShareFormProps) {
  const composer = useShareComposer({
    text,
    cleanupStatus,
    isCleanupPending,
    onCleanup,
    sessionReady,
    saving,
    onTextChange,
    onSave
  });
  const { voice } = composer;
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  return (
    <form onSubmit={composer.submit} className="mt-5">
      <div
        className="voice-studio"
        data-paused={!voice.active && Boolean(voice.message)}
        data-listening={voice.state === 'listening'}
        data-speaking={voice.state === 'listening' && voice.speaking}
      >
        <RecordingControls
          state={voice.state}
          active={voice.active}
          disabled={composer.recordingDisabled}
          onToggle={composer.toggleRecording}
        />
        <ListeningClock listening={voice.state === 'listening'} />
        {cleanupStatus !== 'pending' && (
          <RecordingStatus state={voice.state} message={voice.message} />
        )}
        {cleanupStatus === 'pending' && (
          <div
            role="status"
            className="mt-3 flex items-center justify-center gap-2 text-sm text-[var(--muted)]"
          >
            <span
              aria-hidden="true"
              className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--navy)] motion-reduce:animate-none"
            />
            <span>Tidying!</span>
          </div>
        )}
        <LiveTranscript
          text={text}
          interim={voice.interim}
          onTextChange={onTextChange}
          readOnly={saving}
          errorId={error ? errorId : undefined}
        />
      </div>
      <div className="mt-3 text-sm text-[var(--muted)]" aria-live="polite">
        {cleanupStatus === 'failed' && (
          <div>
            <p role="alert">
              Your text could not be tidied. Your original words are still here.
            </p>
            <button
              type="button"
              className="secondary mt-2 w-full"
              disabled={composer.retryDisabled}
              onClick={composer.retryCleanup}
            >
              Retry cleanup
            </button>
          </div>
        )}
      </div>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="error mt-4 rounded-xl border p-4 text-sm leading-relaxed"
        >
          {error}
        </p>
      )}
      <SaveShareButton saving={saving} disabled={composer.saveDisabled} />
    </form>
  );
}
