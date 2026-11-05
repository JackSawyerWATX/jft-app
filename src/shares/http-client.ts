import { apiErrorSchema, type ApiErrorCode } from './errors';

/** Structured HTTP failure; the controller may branch on code/status without parsing messages. */
export class ApiRequestError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function requestJson(
  path: string,
  options?: RequestInit,
  failureMessage?: string
): Promise<unknown> {
  const response = await fetch(path, {
    ...options,
    cache: 'no-store',
    credentials: 'same-origin'
  });
  // Cleanup deliberately discards failure bodies, including any untrusted provider text.
  if (!response.ok && failureMessage) throw new Error(failureMessage);
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    if (response.ok) throw cause;
    throw new ApiRequestError(
      'INTERNAL_ERROR',
      'Please try again.',
      response.status
    );
  }
  if (!response.ok) {
    const failure = apiErrorSchema.safeParse(body);
    throw new ApiRequestError(
      failure.success ? failure.data.error.code : 'INTERNAL_ERROR',
      failure.success ? failure.data.error.message : 'Please try again.',
      response.status
    );
  }
  return body;
}
