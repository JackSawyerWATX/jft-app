import { z } from 'zod';
import { shareSchema } from './model';
import { apiErrorSchema, type ApiErrorCode } from './errors';

/** Structured HTTP failure; the controller may branch on code/status without parsing messages. */
export class ShareApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ShareApiError';
  }
}

async function request(path: string, options?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    ...options,
    cache: 'no-store',
    credentials: 'same-origin'
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    if (response.ok) throw cause;
    throw new ShareApiError(
      'INTERNAL_ERROR',
      'Please try again.',
      response.status
    );
  }
  if (!response.ok) {
    const failure = apiErrorSchema.safeParse(body);
    throw new ShareApiError(
      failure.success ? failure.data.error.code : 'INTERNAL_ERROR',
      failure.success ? failure.data.error.message : 'Please try again.',
      response.status
    );
  }
  return body;
}

/** Returns validated history in server order; never retries requests. */
export async function readShares() {
  return z.array(shareSchema).parse(await request('/api/shares'));
}
/**
 * A rejected save may still have committed if its response was lost.
 * Leave draft clearing and retry decisions to the caller.
 */
export async function saveShare(text: string) {
  return shareSchema.parse(
    await request('/api/shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
  );
}
/** Private reads require ownership; missing and other-owner IDs both return 404. */
export async function readShare(id: string) {
  return shareSchema.parse(
    await request(`/api/shares/${encodeURIComponent(id)}`)
  );
}
