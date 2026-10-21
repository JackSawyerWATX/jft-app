import 'server-only';
import {
  createRoute,
  type RouteHandler,
  type RouteHook,
  z
} from '@hono/zod-openapi';
import { publicShareSchema } from '../../model';
import { readPublicShare } from '../public-shares';
import { failed, privateHeaders } from '../openapi';
import { errorBody } from '../http';
import type { SessionEnvironment } from '../middleware';

export const publicHeaders = {
  'Cache-Control': privateHeaders['Cache-Control'],
  'X-Robots-Tag': {
    required: true,
    description: 'Do not index or follow shared content.',
    schema: { type: 'string' as const, enum: ['noindex, nofollow'] }
  },
  'Referrer-Policy': {
    required: true,
    description: 'Do not forward bearer URLs.',
    schema: { type: 'string' as const, enum: ['no-referrer'] }
  }
};
const unavailable = { ...failed(['SHARE_NOT_FOUND']), headers: publicHeaders };

export const readPublicShareRoute = createRoute({
  method: 'get',
  path: '/public/shares/{id}',
  operationId: 'readPublicShare',
  tags: ['Shares'],
  summary: 'Read a share using an expiring UUID link',
  description:
    'Validates the UUID and enforces seven days from the server-stored creation time. Invalid, expired and missing links all return the same 404. Never creates or requires a session.',
  security: [],
  request: {
    params: z.object({ id: z.uuid({ version: 'v4' }) })
  },
  responses: {
    200: {
      description:
        'Only the original reading and written thoughts; no owner or private metadata.',
      headers: publicHeaders,
      content: {
        'application/json': {
          schema: publicShareSchema.openapi('PublicShare', {
            additionalProperties: false
          })
        }
      }
    },
    404: unavailable,
    500: { ...failed(['INTERNAL_ERROR']), headers: publicHeaders }
  }
});

export const getPublicShare: RouteHandler<
  typeof readPublicShareRoute,
  SessionEnvironment
> = async (c) => {
  const share = await readPublicShare(c.req.valid('param').id);
  return share ? c.json(share, 200) : c.json(errorBody('SHARE_NOT_FOUND'), 404);
};

/** Malformed public IDs get the same 404 as missing or expired records. */
export const publicShareValidation = ((result, c) => {
  if (!result.success) return c.json(errorBody('SHARE_NOT_FOUND'), 404);
}) satisfies RouteHook<typeof readPublicShareRoute, SessionEnvironment>;
