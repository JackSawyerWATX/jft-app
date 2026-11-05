import 'server-only';
import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { parse as parseContentType } from 'content-type';
import { getSession, setSessionCookie } from '../auth/session';
import { error, MAX_SHARE_REQUEST_BYTES } from './errors';

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

/** Browser request policy only. Origin is not proof of client identity. */
function matchesOrigin(request: Request, required: boolean) {
  const origin = request.headers.get('origin');
  if (!origin) return !required;
  const url = new URL(request.url);
  return (
    origin === `${url.protocol}//${request.headers.get('host') ?? url.host}`
  );
}

/** Existing share writes permit an absent Origin; a foreign supplied Origin is rejected. */
export const sameOrigin: MiddlewareHandler = async (c, next) => {
  if (!matchesOrigin(c.req.raw, false)) return error('CROSS_ORIGIN_REQUEST');
  await next();
};

/** Paid browser operations require an exact Origin, before inspecting session credentials. */
export const exactSameOrigin: MiddlewareHandler = async (c, next) => {
  if (!matchesOrigin(c.req.raw, true)) return error('CROSS_ORIGIN_REQUEST');
  await next();
};

/** Identity boundary only: verify an existing cookie without establishing or renewing ownership. */
export const existingSession: MiddlewareHandler<SessionEnvironment> = async (
  c,
  next
) => {
  const session = await getSession(c.req.raw);
  if (session.newSession) return error('SESSION_REQUIRED');
  c.set('ownerId', session.ownerId);
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
