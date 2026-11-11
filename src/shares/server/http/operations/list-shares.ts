import 'server-only';
import { createRoute, type RouteHandler, z } from '@hono/zod-openapi';
import { historyOptionsSchema } from '../../storage/history-page';
import { shareSchema } from '../../../model';
import { shareRepository } from '../../storage/configured-repository';
import type { SessionEnvironment } from '../middleware';
import {
  share,
  privateHeaders,
  sessionSecurity,
  failed,
  commonFailures
} from '../openapi';
import { anonymousSession } from '../middleware';

export const listSharesRoute = createRoute({
  middleware: [anonymousSession] as const,
  method: 'get',
  path: '/shares',
  operationId: 'listShares',
  tags: ['Shares'],
  summary: 'List this anonymous owner’s private shares',
  description:
    'Returns only the current session’s shares, newest first. An empty history is an empty array.',
  security: sessionSecurity,
  request: { query: historyOptionsSchema },

  responses: {
    200: {
      description:
        'Newest timestamp first; equal timestamp order is unspecified. At most 20 shares by default, maximum limit 50. X-Next-Cursor is present when another page may exist. Pass it as cursor on the next request; ownership always comes from the session.',
      headers: {
        ...privateHeaders,
        'X-Next-Cursor': {
          description:
            'Opaque continuation position; treat as private and never log it. Absent at the end of history.',
          schema: { type: 'string' as const }
        }
      },
      content: { 'application/json': { schema: z.array(share) } }
    },
    400: failed(['INVALID_HISTORY_QUERY']),
    ...commonFailures
  }
});

/** Return only this owner’s shares, omitting server-only ownership fields. */
export const listShares: RouteHandler<
  typeof listSharesRoute,
  SessionEnvironment
> = async (c) => {
  const { shares, nextCursor } = await shareRepository.listByOwner(
    c.get('ownerId'),
    c.req.valid('query')
  );
  if (nextCursor) c.header('X-Next-Cursor', nextCursor);
  return c.json(
    shares.map((share) => shareSchema.parse(share)),
    200
  );
};
