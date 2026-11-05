import { speechDiagnostic } from './diagnostics';

export const MICROPHONE_DENIED =
  'Microphone access was denied or blocked. In Safari, open this website’s settings and set Microphone to Allow, then try again. In other browsers, check site permissions.';

export function microphoneErrorMessage(code: string): string {
  switch (code) {
    case 'NotAllowedError':
      return MICROPHONE_DENIED;
    case 'NotFoundError':
    case 'NotReadableError':
    case 'OverconstrainedError':
      return 'Microphone unavailable. Check that a microphone is connected and another app is not using it, then try again.';
    case 'SecurityError':
      return 'Microphone access is blocked by browser security settings. Open this site over HTTPS and check site permissions.';
    case 'NotSupportedError':
      return 'This browser cannot request microphone access. Try a current version of Safari or Chrome.';
    default:
      return 'Microphone access could not start. Check your microphone and try again.';
  }
}

/** Capture once from the recording tap. The engine owns this stream and releases late grants after cancellation. */
export function requestMicrophone(): Promise<MediaStream> {
  speechDiagnostic('microphone-permission-request', {
    userActivation: navigator.userActivation?.isActive
  });
  return navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    video: false
  });
}

/** Only public microphone exception names may reach diagnostics. */
export function microphoneErrorCode(cause: unknown): string {
  const name =
    typeof cause === 'object' && cause !== null && 'name' in cause
      ? cause.name
      : undefined;
  return typeof name === 'string' &&
    [
      'NotAllowedError',
      'NotFoundError',
      'NotReadableError',
      'OverconstrainedError',
      'SecurityError',
      'NotSupportedError'
    ].includes(name)
    ? name
    : 'unknown';
}
