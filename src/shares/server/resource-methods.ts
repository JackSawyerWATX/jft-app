import 'server-only';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import type { SessionEnvironment } from './middleware';
import { error } from './http';
import { headRoute, optionsRoute } from './openapi';
import { listSharesRoute } from './operations/list-shares';
import { readShareRoute } from './operations/read-share';

import { readPublicShareRoute } from './operations/read-public-share';

export const collectionAllow = 'GET, HEAD, POST, OPTIONS';

export const detailAllow = 'GET, HEAD, OPTIONS';
const publicAllow = 'GET, HEAD, OPTIONS';

/**
 * Register after operations so the method-rejection handlers do not mask them.
 * Hono executes HEAD through GET; only HEAD documentation is added here.
 */
export function registerResourceMethods(app: OpenAPIHono<SessionEnvironment>) {
  app.openapi(optionsRoute('/shares', collectionAllow, 'sharesOptions'), (c) =>
    c.body(null, 204, { Allow: collectionAllow })
  );
  app.openapi(
    createRoute({
      ...optionsRoute('/shares/{id}', detailAllow, 'shareOptions'),
      request: { params: readShareRoute.request.params }
    }),
    (c) => c.body(null, 204, { Allow: detailAllow })
  );
  app.openAPIRegistry.registerPath(headRoute(listSharesRoute));
  app.openAPIRegistry.registerPath(headRoute(readShareRoute));
  app.openapi(
    createRoute({
      ...optionsRoute('/public/shares/{id}', publicAllow, 'publicShareOptions'),
      request: { params: readPublicShareRoute.request.params }
    }),
    (c) => c.body(null, 204, { Allow: publicAllow })
  );
  app.all('/public/shares/:id', () =>
    error('METHOD_NOT_ALLOWED', { Allow: publicAllow })
  );
  app.openAPIRegistry.registerPath(headRoute(readPublicShareRoute));
  app.all('/shares', () =>
    error('METHOD_NOT_ALLOWED', { Allow: collectionAllow })
  );
  app.all('/shares/:id', () =>
    error('METHOD_NOT_ALLOWED', { Allow: detailAllow })
  );
}
