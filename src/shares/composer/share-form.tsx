import { useId, type FormEvent } from 'react';
import { LiveTranscript } from './live-transcript';
import { RecordingControls } from './recording/recording-controls';
import { RecordingStatus } from './recording/recording-status';
import { ListeningClock } from './recording/listening-clock';
import { SaveShareButton } from './save-share-button';
import { useTranscription } from '../transcription/use-transcription';

type ShareFormProps = {
  text: string;
  disabled: boolean;
  saving: boolean;
  error: string;
  onTextChange: (text: string) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
};

/** The parent owns the draft and clears it only after a confirmed save. */
export function ShareForm({
  text,
  disabled,
  saving,
  error,
  onTextChange,
  onSave
}: ShareFormProps) {
  const voice = useTranscription(text, onTextChange);
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  return (
    <form
      onSubmit={(event) => {
        if (voice.active) {
          event.preventDefault();
          return;
        }
        onSave(event);
      }}
      className="mt-5"
    >
      <div
        className="voice-studio"
        data-paused={!voice.active && Boolean(voice.message)}
        data-listening={voice.state === 'listening'}
        data-speaking={voice.state === 'listening' && voice.speaking}
      >
        <RecordingControls
          state={voice.state}
          active={voice.active}
          disabled={saving}
          onToggle={voice.active ? voice.stop : voice.start}
        />
        <ListeningClock listening={voice.state === 'listening'} />
        <RecordingStatus state={voice.state} message={voice.message} />
        <LiveTranscript
          text={text}
          interim={voice.interim}
          onTextChange={onTextChange}
          readOnly={saving}
          errorId={error ? errorId : undefined}
        />
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
      <SaveShareButton
        saving={saving}
        disabled={disabled || voice.active || !text.trim()}
      />
    </form>
  );
}
