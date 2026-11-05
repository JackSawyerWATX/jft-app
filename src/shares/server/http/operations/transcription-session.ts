import 'server-only';
import { burstLimited } from '../../auth/burst-limit';
import { createRoute, type RouteHandler } from '@hono/zod-openapi';
import {
  reportTranscriptionFailure,
  reportTranscriptionConfiguration,
  issueTranscriptionCredential
} from '../../transcription-provider';
import {
  privateHeaders,
  commonFailures,
  failed,
  transcriptionCredential,
  retryAfterHeaders,
  browserOriginHeaders
} from '../openapi';
import {
  exactSameOrigin,
  existingSession,
  type SessionEnvironment
} from '../middleware';
import { errorBody } from '../errors';

export const transcriptionSessionRoute = createRoute({
  middleware: [exactSameOrigin, existingSession] as const,
  method: 'post',
  path: '/transcription/session',
  operationId: 'createTranscriptionSession',
  tags: ['Transcription'],
  summary: 'Issue a short-lived live transcription credential',
  description:
    'Requires an existing signed session and an exact same-origin Origin header. No audio or transcript body is accepted. Disabled unless STT_ENABLED=true. Credentials are never cached.',
  security: [{ AnonymousSession: [] }],
  request: { headers: browserOriginHeaders },
  responses: {
    200: {
      description:
        'Ephemeral OpenAI credential; expires after 60 seconds for establishing connections, not terminating active sessions.',
      headers: privateHeaders,
      content: { 'application/json': { schema: transcriptionCredential } }
    },
    403: failed(['CROSS_ORIGIN_REQUEST', 'SESSION_REQUIRED']),
    429: failed(['RATE_LIMITED'], retryAfterHeaders),
    503: failed(['TRANSCRIPTION_UNAVAILABLE']),
    ...commonFailures
  }
});

/** Validate the browser boundary before spending provider credits; failures disclose no upstream details. */
export const createTranscriptionSession: RouteHandler<
  typeof transcriptionSessionRoute,
  SessionEnvironment
> = async (c) => {
  try {
    if (process.env.STT_ENABLED !== 'true') {
      reportTranscriptionConfiguration('disabled');
      return c.json(errorBody('TRANSCRIPTION_UNAVAILABLE'), 503);
    }
    if (burstLimited('transcription', c.get('ownerId'))) {
      c.header('Retry-After', '60');
      return c.json(errorBody('RATE_LIMITED'), 429);
    }
    const token = await issueTranscriptionCredential(c.req.raw.signal);
    const result = transcriptionCredential.safeParse(token);
    if (!result.success) {
      reportTranscriptionConfiguration('invalid_provider_response');
      return c.json(errorBody('TRANSCRIPTION_UNAVAILABLE'), 503);
    }
    return c.json(result.data, 200);
  } catch (cause) {
    reportTranscriptionFailure(cause);
    return c.json(errorBody('TRANSCRIPTION_UNAVAILABLE'), 503);
  }
};
