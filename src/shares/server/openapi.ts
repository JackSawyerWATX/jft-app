import 'server-only';
import { createRoute, type RouteConfig, z } from '@hono/zod-openapi';
import type { HeadersObject } from 'openapi3-ts/oas31';
import type { ApiErrorCode } from '../errors';
import { shareSchema } from '../model';
import { apiFailures, SESSION_CHALLENGE } from './http';

/** Owner-free share response schema reused by resource contracts. */
export const share = shareSchema.openapi('Share', {
  additionalProperties: false
});

const privateHeader = {
  description: 'Private responses are never cached.',
  required: true,
  schema: { type: 'string' as const, enum: ['private, no-store'] }
};
const cookieHeader = {
  description:
    'Issued only for a new anonymous session. HttpOnly, SameSite=Lax, path /, 30-day Max-Age; Secure in production. No rolling renewal.',
  schema: { type: 'string' as const }
};
/** Cache/cookie response headers shared by private operations. */
export const privateHeaders = {
  'Cache-Control': privateHeader,
  'Set-Cookie': cookieHeader
};
/** Missing credentials bootstrap a session; invalid supplied credentials still fail. */
export const sessionSecurity: Record<string, string[]>[] = [
  { AnonymousSession: [] },
  {}
];
/**
 * Builds an error response contract restricted to the supplied codes.
 * @param codes - Codes allowed for this HTTP status.
 * @param extraHeaders - Additional protocol response headers.
 * @returns The JSON error schema and documented headers.
 */
export function failed(
  codes: [ApiErrorCode, ...ApiErrorCode[]],
  extraHeaders: HeadersObject = {}
) {
  return {
    description: codes
      .map((code) => `${code}: ${apiFailures[code].message}`)
      .join(' '),
    headers: { ...privateHeaders, ...extraHeaders },
    content: {
      'application/json': {
        schema: z.object({
          error: z.object({ code: z.enum(codes), message: z.string() })
        })
      }
    }
  };
}
/** Session and internal failures common to private operations. */
export const commonFailures = {
  401: failed(['INVALID_SESSION'], {
    'WWW-Authenticate': {
      required: true,
      schema: { type: 'string' as const, enum: [SESSION_CHALLENGE] },
      description:
        'Private DoorknobSession scheme; send credentials via the session cookie, not an Authorization header.'
    }
  }),
  500: failed(['INTERNAL_ERROR'])
};
/**
 * Derives bodyless HEAD documentation; Hono executes the corresponding GET handler.
 * @param route - GET operation whose authorization and headers HEAD inherits.
 * @returns Contract metadata with no runtime middleware or response body schemas.
 */
export function headRoute(route: RouteConfig) {
  const { middleware: _middleware, ...contract } = route;
  void _middleware;
  return createRoute({
    ...contract,
    method: 'head',
    operationId: `${route.operationId}Head`,
    summary: `${route.summary} (headers only)`,
    responses: Object.fromEntries(
      Object.entries(route.responses).map(([status, response]) => {
        if ('$ref' in response) return [status, response];
        const { content: _content, ...headersOnly } = response;
        void _content;
        return [status, headersOnly];
      })
    )
  });
}

/**
 * Declares unauthenticated method discovery for a resource.
 * @param path - OpenAPI resource path.
 * @param allow - Methods advertised by OPTIONS and 405.
 * @param operationId - Unique specification operation name.
 * @returns Bodyless OPTIONS contract; the resource binds its handler.
 */
export function optionsRoute(path: string, allow: string, operationId: string) {
  return createRoute({
    method: 'options',
    path,
    operationId,
    tags: ['Shares'],
    summary: 'Discover supported HTTP methods',
    description:
      'No session required or issued. No CORS permission is granted.',
    security: [],
    responses: {
      204: {
        description: 'No body; Allow advertises supported methods.',
        headers: {
          'Cache-Control': privateHeader,
          Allow: { required: true, schema: { type: 'string', enum: [allow] } }
        }
      }
    }
  });
}

/** Configuration for the generated OpenAPI 3.1 document; contains no live share/session data. */
export const openApiConfiguration = {
  openapi: '3.1.0' as const,
  info: {
    title: 'Doorknob private share BFF',
    version: '0.2.0',
    contact: { url: 'https://github.com/drewmalone/jft-app/issues' },
    description:
      'Local-development process-memory persistence. Restarts erase shares; serverless instances/replicas do not share data. No public sharing links or login.'
  },
  servers: [{ url: '/', description: 'Same origin as the application.' }],
  tags: [
    {
      name: 'Shares',
      description:
        'Private resources scoped to a signed anonymous session cookie.'
    }
  ]
};
