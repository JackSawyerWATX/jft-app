import { requestJson } from '../http-client';
import { cleanupTextSchema } from './model';

/** One cancellable cleanup request; never retries or saves a share, and never returns provider error details. */
export async function cleanDraft(
  text: string,
  signal: AbortSignal
): Promise<string> {
  const body = await requestJson(
    '/api/shares/cleanup',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
      body: JSON.stringify({ text })
    },
    'Cleanup unavailable'
  );
  return cleanupTextSchema.parse(body).text;
}
