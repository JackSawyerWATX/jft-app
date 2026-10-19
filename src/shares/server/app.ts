import 'server-only';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { SessionEnvironment } from './middleware';
import { error, handleApiError } from './http';
import { createShareRoute, createShare } from './operations/create-share';
import { listSharesRoute, listShares } from './operations/list-shares';
import { readShareRoute, readShare } from './operations/read-share';
import { registerResourceMethods } from './resource-methods';
import { openApiConfiguration } from './openapi';

const specificationAllow = 'GET, HEAD, OPTIONS';

const app = new OpenAPIHono<SessionEnvironment>({
  defaultHook: (result) => {
    if (!result.success) return error('INVALID_SHARE');
  }
}).basePath('/api');

app.onError(handleApiError);
app.openapi(listSharesRoute, listShares);
app.openapi(createShareRoute, createShare);
app.openapi(readShareRoute, readShare);
registerResourceMethods(app);
app.openAPIRegistry.registerComponent('securitySchemes', 'AnonymousSession', {
  type: 'apiKey',
  in: 'cookie',
  name: 'doorknob-session',
  description:
    'Signed HttpOnly cookie. No cookie bootstraps a new owner; invalid supplied credentials are rejected. 30-day absolute expiry, SameSite=Lax, Secure in production. Custom WWW-Authenticate scheme: DoorknobSession.'
});
app.options('/openapi.json', (c) =>
  c.newResponse(null, 204, { Allow: specificationAllow })
);
app.doc31('/openapi.json', openApiConfiguration);
app.all('/openapi.json', () =>
  error('METHOD_NOT_ALLOWED', { Allow: specificationAllow })
);
app.notFound(() => new Response(null, { status: 404 }));

/**
 * Dispatches a Next.js Web Request through the OpenAPI-defined BFF.
 * @param request - Incoming share/spec request; session credentials remain in cookies.
 * @returns A Web Response; supported failures use stable codes and private/no-store.
 * HEAD reuses GET authorization/headers with no body. OPTIONS and unsupported methods
 * do not establish sessions; 405 includes Allow. Unexpected failures become generic 500.
 */
export async function dispatch(request: Request): Promise<Response> {
  const response = await app.fetch(request);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

/**
 * Generates the OpenAPI 3.1 contract from the same Zod route definitions used at runtime.
 * @returns Public schema/HTTP metadata only; never includes live records or credentials.
 * @throws If the OpenAPI library cannot represent a registered schema.
 */
export function getOpenApiDocument() {
  return app.getOpenAPI31Document(openApiConfiguration);
}
