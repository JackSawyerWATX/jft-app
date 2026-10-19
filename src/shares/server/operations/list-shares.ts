import 'server-only';
import { createRoute, type RouteHandler, z } from '@hono/zod-openapi';
import { shareSchema } from '../../model';
import { shareRepository } from '../repository';
import type { SessionEnvironment } from '../middleware';
import {
  share,
  privateHeaders,
  sessionSecurity,
  commonFailures
} from '../openapi';
import { anonymousSession } from '../middleware';

/** Collection read contract; history is private and newest first, with [] for no shares. */
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

/**
 * Lists the verified owner’s shares and projects out server-only ownership.
 * @param c - Request context with verified ownership and validated inputs.
 * @returns The documented JSON success or controlled failure response.
 * @throws On repository/serialization failure; the shared error handler returns 500.
 */
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
