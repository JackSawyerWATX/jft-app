import 'server-only';
import { createRoute, type RouteHandler } from '@hono/zod-openapi';
import { shareSchema } from '../../model';
import { shareRepository } from '../repository';
import type { SessionEnvironment } from '../middleware';
import {
  share,
  privateHeaders,
  sessionSecurity,
  commonFailures,
  failed
} from '../openapi';
import { createShareSchema, MAX_SHARE_TEXT_LENGTH } from '../../model';
import { MAX_SHARE_REQUEST_BYTES } from '../http';
import { anonymousSession, sameOrigin, jsonBody } from '../middleware';

export const createShareRoute = createRoute({
  middleware: [sameOrigin, anonymousSession, jsonBody] as const,
  method: 'post',
  path: '/shares',
  operationId: 'createShare',
  tags: ['Shares'],
  summary: 'Save a private text share',
  description:
    'POST is not idempotent. A supplied Origin must match Host/protocol; origin rejection precedes session handling and never issues a cookie.',
  security: sessionSecurity,
  request: {
    body: {
      required: true,
      description: `Only text is accepted: at most ${MAX_SHARE_TEXT_LENGTH} Unicode code points before trimming, then at least one non-whitespace character. Raw JSON is limited to ${MAX_SHARE_REQUEST_BYTES} bytes. JSON media types are case-insensitive; valid parameters are accepted.`,
      content: {
        'application/json': {
          schema: createShareSchema.openapi('CreateShare', {
            example: { text: 'A fictional thought.' }
          })
        }
      }
    }
  },
  responses: {
    201: {
      description:
        'Server-confirmed record with generated ID/time and reading snapshot; ownerId is omitted.',
      headers: {
        ...privateHeaders,
        Location: {
          required: true,
          description: 'Relative canonical detail URL for the created share.',
          schema: { type: 'string' as const },
          example: '/api/shares/95eff0e1-bca7-4fd1-83d2-42ba330aab22'
        }
      },
      content: { 'application/json': { schema: share } }
    },
    400: failed(['INVALID_JSON', 'INVALID_SHARE']),
    403: failed(['CROSS_ORIGIN_REQUEST']),
    413: failed(['PAYLOAD_TOO_LARGE']),
    415: failed(['UNSUPPORTED_MEDIA_TYPE']),
    ...commonFailures
  }
});

/** Ownership comes from the session; client input supplies only text. */
export const createShare: RouteHandler<
  typeof createShareRoute,
  SessionEnvironment
> = async (c) => {
  const { text } = c.req.valid('json');
  const share = await shareRepository.create(c.get('ownerId'), text);
  c.header('Location', `/api/shares/${share.id}`);
  return c.json(shareSchema.parse(share), 201);
};
