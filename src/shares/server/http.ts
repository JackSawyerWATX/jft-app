import 'server-only';
import type { ApiErrorCode } from '../errors';

/** Raw JSON request limit, including whitespace and escaping; enforced on actual streamed bytes. */
export const MAX_SHARE_REQUEST_BYTES = 64 * 1024;

export const apiFailures = {
  INVALID_JSON: { status: 400, message: 'Invalid JSON body.' },
  INVALID_SHARE: {
    status: 400,
    message:
      'Provide non-empty share text of at most 10,000 characters, without additional fields.'
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

export function errorBody<Code extends ApiErrorCode>(code: Code) {
  return { error: { code, message: apiFailures[code].message } };
}

export function error(code: ApiErrorCode, headers?: HeadersInit) {
  const failure = apiFailures[code];
  const result = Response.json(errorBody(code), {
    status: failure.status,
    headers
  });
  return result;
}

/** Never log or return raw errors: they may contain content or credentials. */
export function handleApiError(cause: Error): Response {
  void cause;
  return error('INTERNAL_ERROR');
}
