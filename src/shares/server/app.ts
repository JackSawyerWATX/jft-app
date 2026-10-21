import 'server-only';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { SessionEnvironment } from './middleware';
import { error, handleApiError } from './http';
import { createShareRoute, createShare } from './operations/create-share';
import { listSharesRoute, listShares } from './operations/list-shares';
import { readShareRoute, readShare } from './operations/read-share';
import { registerResourceMethods } from './resource-methods';
import { openApiConfiguration } from './openapi';

import {
  readPublicShareRoute,
  getPublicShare,
  publicShareValidation
} from './operations/read-public-share';

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
app.openapi(readPublicShareRoute, getPublicShare, publicShareValidation);
registerResourceMethods(app);
app.openAPIRegistry.registerComponent('securitySchemes', 'AnonymousSession', {
  type: 'apiKey',
  in: 'cookie',
  name: 'doorknob-session',
  description:
    'Signed HttpOnly cookie. Missing, invalid or expired cookies start a fresh empty owner. 30-day absolute expiry, SameSite=Lax, Secure in production.'
});
app.options('/openapi.json', (c) =>
  c.newResponse(null, 204, { Allow: specificationAllow })
);
app.doc31('/openapi.json', openApiConfiguration);
app.all('/openapi.json', () =>
  error('METHOD_NOT_ALLOWED', { Allow: specificationAllow })
);
app.notFound(() => new Response(null, { status: 404 }));

/** Apply cache/privacy headers to every API response, including failures. */
export async function dispatch(request: Request): Promise<Response> {
  const response = await app.fetch(request);
  response.headers.set('Cache-Control', 'private, no-store');
  if (new URL(request.url).pathname.startsWith('/api/public/shares/')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    response.headers.set('Referrer-Policy', 'no-referrer');
  }
  return response;
}

export function getOpenApiDocument() {
  return app.getOpenAPI31Document(openApiConfiguration);
}
