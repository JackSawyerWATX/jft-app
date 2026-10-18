import { useId, type FormEvent } from 'react';
import { LockIcon } from './lock-icon';

type ShareFormProps = {
  text: string;
  disabled: boolean;
  error: string;
  onTextChange: (text: string) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
};

/** Keeps text entry accessible while its parent owns the draft and save operation. */
export function ShareForm({
  text,
  disabled,
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
        onChange={(event) => onTextChange(event.target.value)}
        placeholder="Start wherever you are…"
        className="share-textarea"
      />
      <p
        id={helpId}
        className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-[var(--muted)]"
      >
        <LockIcon /> Saved only in this browser. Your words stay on this device.
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
        Save privately <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
