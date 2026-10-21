import 'server-only';
import { createRoute, type RouteConfig, z } from '@hono/zod-openapi';
import type { HeadersObject } from 'openapi3-ts/oas31';
import type { ApiErrorCode } from '../errors';
import { shareSchema } from '../model';
import { apiFailures } from './http';

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

export const privateHeaders = {
  'Cache-Control': privateHeader,
  'Set-Cookie': cookieHeader
};

export const sessionSecurity: Record<string, string[]>[] = [
  { AnonymousSession: [] },
  {}
];
/** Restrict each HTTP error response to its allowed codes. */
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

export const commonFailures = { 500: failed(['INTERNAL_ERROR']) };
/** HEAD inherits GET checks and headers; document it without response bodies. */
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

export const openApiConfiguration = {
  openapi: '3.1.0' as const,
  info: {
    title: 'Doorknob share BFF',
    version: '0.3.0',
    contact: { url: 'https://github.com/drewmalone/jft-app/issues' },
    description:
      'Local-development process-memory persistence. Restarts erase shares; serverless instances/replicas do not share data. Owner-scoped private shares and expiring UUID public reading links. No login or immediate link revocation.'
  },
  servers: [{ url: '/', description: 'Same origin as the application.' }],
  tags: [
    {
      name: 'Shares',
      description:
        'Private resources scoped to a signed anonymous session cookie, and public reads authorized by expiring bearer UUIDs.'
    }
  ]
};
