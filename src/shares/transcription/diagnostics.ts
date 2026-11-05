/** Allowlisted diagnostic fields only: never pass text, URLs, event objects, or raw errors. */
type DiagnosticDetails = {
  session?: number;
  elapsedMs?: number;
  supported?: boolean;
  userActivation?: boolean;
  online?: boolean;
  visible?: boolean;
  state?: string;
  code?: string;
  stage?: string;
  status?: number;
  characters?: number;
  packets?: number;
  bytes?: number;
  speaking?: boolean;
};

let enabled = false;

/** Read the cached opt-in switch without touching browser storage during streaming. */
export function speechDiagnosticsEnabled() {
  return enabled;
}

/** Resolve the URL/tab debug switch once when the recording experience mounts. */
export function configureSpeechDiagnostics() {
  enabled = false;
  if (typeof window === 'undefined') return;
  try {
    const flag = new URLSearchParams(window.location.search).get('speechDebug');
    enabled = flag === '1';
    try {
      if (flag === '1' || flag === '0')
        window.sessionStorage.setItem('doorknob:speech-debug', flag);
      if (flag === null)
        enabled =
          window.sessionStorage.getItem('doorknob:speech-debug') === '1';
    } catch {
      // The explicit URL switch still works when tab storage is blocked.
    }
  } catch {
    // Optional diagnostics must not prevent recording.
  }
}

/** Console-only, cached opt-in logging; never pass transcript content or raw errors. */
export function speechDiagnostic(
  event: string,
  details: DiagnosticDetails = {}
) {
  if (!enabled) return;
  try {
    console.info(`[Doorknob speech] ${event}`, details);
  } catch {
    // A restricted console must not interrupt recognition.
  }
}
