import { useId, type FormEvent } from 'react';

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
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  return (
    <form onSubmit={onSave} className="mt-5">
      <label htmlFor={fieldId} className="sr-only">
        Your thoughts about today&apos;s reading
      </label>
      <textarea
        id={fieldId}
        aria-describedby={error ? errorId : undefined}
        value={text}
        readOnly={saving}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder="Start writing…"
        className="share-textarea"
      />
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
        className="primary mt-5 w-full"
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
