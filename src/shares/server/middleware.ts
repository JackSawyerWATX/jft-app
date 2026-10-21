import 'server-only';
import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { parse as parseContentType } from 'content-type';
import { getSession, setSessionCookie } from './session';
import { error, MAX_SHARE_REQUEST_BYTES } from './http';

/** Request-local owner established by the protected operation's session middleware. */
export type SessionEnvironment = { Variables: { ownerId: string } };

/** Resolves verified or fresh anonymous ownership after origin checks; only non-500 responses issue new cookies. */
export const anonymousSession: MiddlewareHandler<SessionEnvironment> = async (
  c,
  next
) => {
  const session = await getSession(c.req.raw);
  c.set('ownerId', session.ownerId);
  await next();
  // Validation responses may issue a cookie; internal failures must not establish one.
  if (c.res.status < 500) await setSessionCookie(c.res, session.newSession);
};

const limitShareBody = bodyLimit({
  maxSize: MAX_SHARE_REQUEST_BYTES,
  onError: () => error('PAYLOAD_TOO_LARGE')
});

/** Rejects foreign browser origins before reading a write body. */
export const sameOrigin: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header('origin');
  const url = new URL(c.req.url);
  const authority = c.req.header('host') ?? url.host;
  if (origin && origin !== `${url.protocol}//${authority}`)
    return error('CROSS_ORIGIN_REQUEST');
  await next();
};

/** Normalizes JSON media types and enforces actual byte limits before validation. */
export const jsonBody: MiddlewareHandler = async (c, next) => {
  try {
    if (
      parseContentType(c.req.header('content-type') ?? '').type !==
      'application/json'
    )
      return error('UNSUPPORTED_MEDIA_TYPE');
  } catch {
    return error('UNSUPPORTED_MEDIA_TYPE');
  }
  // Canonicalize a valid media type for the OpenAPI validator. Force bodyLimit to
  // count actual bytes rather than trusting a potentially incorrect Content-Length.
  const headers = new Headers(c.req.raw.headers);
  headers.set('content-type', 'application/json');
  headers.delete('content-length');
  c.req.raw = new Request(c.req.raw, { headers });
  return limitShareBody(c, async () => {
    // Cache the parsed JSON for Hono's Zod validator; classify syntax errors here,
    // rather than assigning domain meaning to every HTTPException(400).
    try {
      await c.req.json();
    } catch (cause) {
      if (!(cause instanceof SyntaxError)) throw cause;
      c.res = error('INVALID_JSON');
      return;
    }
    await next();
  });
};
