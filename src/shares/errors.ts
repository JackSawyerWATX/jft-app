import { z } from 'zod';

/** Stable application failure identifiers; clients must not match display messages. */
export const apiErrorCodeSchema = z.enum([
  'INVALID_JSON',
  'INVALID_SHARE',
  'CROSS_ORIGIN_REQUEST',
  'UNSUPPORTED_MEDIA_TYPE',
  'PAYLOAD_TOO_LARGE',
  'SHARE_NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'INTERNAL_ERROR'
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({ code: apiErrorCodeSchema, message: z.string() })
});
