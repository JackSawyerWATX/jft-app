/** Explicit submit action; recognition and session readiness are enforced by the form. */
export function SaveShareButton({
  saving,
  disabled
}: {
  saving: boolean;
  disabled: boolean;
}) {
  return (
    <button className="primary mt-5 w-full" disabled={disabled} type="submit">
      {saving ? (
        'Saving…'
      ) : (
        <>
          Save privately <span aria-hidden="true">→</span>
        </>
      )}
    </button>
  );
}
