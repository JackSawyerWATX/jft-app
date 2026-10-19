import { useId, type FormEvent } from 'react';
import { LockIcon } from './lock-icon';

type ShareFormProps = {
  text: string;
  disabled: boolean;
  saving: boolean;
  error: string;
  onTextChange: (text: string) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
};

/**
 * Controlled draft form; the parent owns text, errors, and asynchronous persistence.
 * disabled blocks submission; saving also makes the textarea read-only. Empty trimmed
 * input disables the button, but server validation remains authoritative. onSave owns
 * preventDefault and failure handling. Help/error IDs describe the field accessibly.
 */
export function ShareForm({
  text,
  disabled,
  saving,
  error,
  onTextChange,
  onSave
}: ShareFormProps) {
  const fieldId = useId();
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  return (
    <form onSubmit={onSave} className="mt-7">
      <label htmlFor={fieldId} className="sr-only">
        Your thoughts about today&apos;s reading
      </label>
      <textarea
        id={fieldId}
        aria-describedby={error ? `${helpId} ${errorId}` : helpId}
        value={text}
        readOnly={saving}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder="Start wherever you are…"
        className="share-textarea"
      />
      <p
        id={helpId}
        className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-[var(--muted)]"
      >
        <LockIcon /> Saved privately on the server for this browser session.
      </p>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="error mt-4 rounded-xl border p-4 text-sm leading-relaxed"
        >
          {error}
        </p>
      )}
      <button
        className="primary mt-7 w-full"
        disabled={disabled || !text.trim()}
        type="submit"
      >
        {saving ? (
          'Saving…'
        ) : (
          <>
            Save privately <span aria-hidden="true">→</span>
          </>
        )}
      </button>
    </form>
  );
}
