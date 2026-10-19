import 'server-only';
import { InvalidSessionError } from './session';
import type { ApiErrorCode } from '../errors';

/** Raw JSON request limit, including whitespace and escaping; enforced on actual streamed bytes. */
export const MAX_SHARE_REQUEST_BYTES = 64 * 1024;
/** Application-specific HTTP challenge; credentials are transported in the signed cookie. */
export const SESSION_CHALLENGE = 'DoorknobSession realm="doorknob"';

/** Status/message definitions shared by error responses and OpenAPI descriptions. */
export const apiFailures = {
  INVALID_JSON: { status: 400, message: 'Invalid JSON body.' },
  INVALID_SHARE: {
    status: 400,
    message:
      'Provide non-empty share text of at most 10,000 characters, without additional fields.'
  },
  INVALID_SESSION: {
    status: 401,
    message:
      'Your session is invalid or expired. Clear site cookies to start a new session; access to previous shares will be lost.'
  },
  CROSS_ORIGIN_REQUEST: {
    status: 403,
    message: 'Cross-origin requests are not allowed.'
  },
  UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    message: 'Send the share as application/json.'
  },
  PAYLOAD_TOO_LARGE: {
    status: 413,
    message: 'The JSON request must not exceed 64 KiB.'
  },
  SHARE_NOT_FOUND: { status: 404, message: 'Share not found.' },
  METHOD_NOT_ALLOWED: {
    status: 405,
    message: 'This HTTP method is not supported for this resource.'
  },
  INTERNAL_ERROR: {
    status: 500,
    message: 'The request could not be completed. Please try again.'
  }
} as const satisfies Record<ApiErrorCode, { status: number; message: string }>;

/**
 * Builds a typed error envelope shared by Hono and Web Response serialization.
 * @param code - Stable failure identifier from the server error catalog.
 * @returns The code and its safe display message, preserving the code's literal type.
 */
export function errorBody<Code extends ApiErrorCode>(code: Code) {
  return { error: { code, message: apiFailures[code].message } };
}

/**
 * Creates a consistent error from a stable code; status and message cannot drift independently.
 * @param code - Failure definition, without sensitive exception details.
 * @param headers - Optional protocol headers, for example Allow on 405.
 * @returns A JSON error; the dispatcher applies cache policy. INVALID_SESSION includes the documented custom HTTP challenge.
 * @throws If response construction fails.
 */
export function error(code: ApiErrorCode, headers?: HeadersInit) {
  const failure = apiFailures[code];
  const result = Response.json(errorBody(code), {
    status: failure.status,
    headers
  });
  if (code === 'INVALID_SESSION')
    result.headers.set('WWW-Authenticate', SESSION_CHALLENGE);
  return result;
}

/**
 * Translates the explicit session failure and hides all unexpected error details.
 * @param cause - Error caught by the Hono dispatcher; never logged or returned raw.
 * @returns A coded JSON error; the dispatcher adds the private cache policy.
 */
export function handleApiError(cause: Error): Response {
  if (cause instanceof InvalidSessionError) return error('INVALID_SESSION');
  // No request bodies, cookie values, or raw exception details enter logs/responses.
  return error('INTERNAL_ERROR');
}
