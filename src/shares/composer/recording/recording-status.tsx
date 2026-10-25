import type { TranscriptionState } from '../../transcription/types';

const statusLabels = {
  unsupported: 'Sorry, transcription is unavailable for your browser!',
  starting: 'Waiting for microphone access…',
  listening: 'Listening...',
  stopping: 'Finishing your words…'
};

/** Announce lifecycle changes without repeatedly announcing the full transcript. */
export function RecordingStatus({
  state,
  message
}: {
  state: TranscriptionState;
  message: string;
}) {
  const label =
    state === 'idle' || state === 'error'
      ? message || 'Tap the microphone to begin.'
      : statusLabels[state];
  return (
    <p
      className="mt-2 text-center text-sm text-[var(--muted)]"
      aria-live="polite"
    >
      {label}
    </p>
  );
}
