import 'server-only';
import { createRoute, type RouteHandler, z } from '@hono/zod-openapi';
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
import { errorBody } from '../http';
import { anonymousSession } from '../middleware';

const idParams = z.object({
  id: z
    .string()
    .min(1)
    .openapi({
      param: { name: 'id', in: 'path' },
      description:
        'Share ID selects a record but does not authorize access. Non-UUID strings also return 404.'
    })
});

/** Detail contract; nonexistent records and ownership mismatches intentionally share a 404. */
export const readShareRoute = createRoute({
  middleware: [anonymousSession] as const,
  method: 'get',
  path: '/shares/{id}',
  operationId: 'readShare',
  tags: ['Shares'],
  summary: 'Read one private share',
  description:
    'Requires the owning session. Missing records and records owned by another session both return 404.',
  security: sessionSecurity,
  request: { params: idParams },
  responses: {
    200: {
      description:
        'The owner-visible saved share and original reading snapshot.',
      headers: privateHeaders,
      content: { 'application/json': { schema: share } }
    },
    404: failed(['SHARE_NOT_FOUND']),
    ...commonFailures
  }
});

/**
 * Reads an owner-scoped share; missing and other-owner IDs both return 404.
 * @param c - Request context with verified ownership and validated inputs.
 * @returns The documented JSON success or controlled failure response.
 * @throws On repository/serialization failure; the shared error handler returns 500.
 */
export const readShare: RouteHandler<
  typeof readShareRoute,
  SessionEnvironment
> = async (c) => {
  const { id } = c.req.valid('param');
  const share = await shareRepository.findByOwner(id, c.get('ownerId'));
  if (!share) return c.json(errorBody('SHARE_NOT_FOUND'), 404);
  return c.json(shareSchema.parse(share), 200);
};
