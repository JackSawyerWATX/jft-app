import { transcriptionCredentialSchema } from '../../model';
import { speechDiagnostic } from '../../diagnostics';

/** App-authored configuration failure; never constructed from upstream response text. */
export class TranscriptionUnavailable extends Error {}

/** Fetch only a temporary credential, after an explicit recording tap. No audio is transmitted. */
export async function requestOpenAICredential(
  request: typeof fetch,
  signal: AbortSignal
): Promise<string> {
  const started = performance.now();
  const response = await request('/api/transcription/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
    signal,
    cache: 'no-store'
  });
  signal.throwIfAborted();
  speechDiagnostic('credential-response', {
    status: response.status,
    elapsedMs: Math.round(performance.now() - started)
  });
  if (!response.ok) throw new TranscriptionUnavailable();
  const token: unknown = await response.json();
  signal.throwIfAborted();
  return transcriptionCredentialSchema.parse(token).value;
}

/** Application-owned authenticated SDP exchange; the SDK owns native negotiation. */
export async function exchangeOpenAISdp(
  offer: string,
  request: typeof fetch,
  signal: AbortSignal,
  credential = requestOpenAICredential(request, signal)
) {
  const value = await credential;
  signal.throwIfAborted();
  const started = performance.now();
  const answer = await request('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    body: offer,
    headers: {
      authorization: `Bearer ${value}`,
      'content-type': 'application/sdp'
    },
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer'
  });
  signal.throwIfAborted();
  speechDiagnostic('webrtc-answer-response', {
    status: answer.status,
    elapsedMs: Math.round(performance.now() - started)
  });
  if (!answer.ok) throw new Error('Connection failed');
  const sdp = await answer.text();
  signal.throwIfAborted();
  return sdp;
}
