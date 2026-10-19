import 'server-only';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import type { SessionEnvironment } from './middleware';
import { error } from './http';
import { headRoute, optionsRoute } from './openapi';
import { listSharesRoute } from './operations/list-shares';
import { readShareRoute } from './operations/read-share';

/** Supported collection methods, shared by discovery and rejected-method responses. */
export const collectionAllow = 'GET, HEAD, POST, OPTIONS';
/** Supported methods for a private share. */
export const detailAllow = 'GET, HEAD, OPTIONS';

/**
 * Adds resource-level discovery and method rejection after operation registration.
 * HEAD execution is supplied by Hono; only its documentation is registered here.
 * @param app - BFF with collection/detail operations already registered.
 * @returns Nothing; mutates the app and its OpenAPI registry.
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
  app.all('/shares', () =>
    error('METHOD_NOT_ALLOWED', { Allow: collectionAllow })
  );
  app.all('/shares/:id', () =>
    error('METHOD_NOT_ALLOWED', { Allow: detailAllow })
  );
}
