import 'server-only';
import { createRoute, type RouteHandler, z } from '@hono/zod-openapi';
import { shareSchema } from '../../../model';
import { shareRepository } from '../../storage/repository';
import type { SessionEnvironment } from '../middleware';
import {
  share,
  privateHeaders,
  sessionSecurity,
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
  responses: {
    200: {
      description:
        'Newest timestamp first; equal timestamps use newest insertion first. No pagination or owner query filter.',
      headers: privateHeaders,
      content: { 'application/json': { schema: z.array(share) } }
    },
    ...commonFailures
  }
});

/** Return only this owner’s shares, omitting server-only ownership fields. */
export const listShares: RouteHandler<
  typeof listSharesRoute,
  SessionEnvironment
> = async (c) => {
  const shares = await shareRepository.listByOwner(c.get('ownerId'));
  return c.json(
    shares.map((share) => shareSchema.parse(share)),
    200
  );
};
