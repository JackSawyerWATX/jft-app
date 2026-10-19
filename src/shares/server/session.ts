import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { parse, parseSigned, serializeSigned } from 'hono/utils/cookie';
import { z } from 'zod';

const cookieName = 'doorknob-session';
const lifetimeSeconds = 60 * 60 * 24 * 30;
const processState = globalThis as typeof globalThis & {
  doorknobSessionSecret?: string;
};

function secret() {
  const configured = process.env.SESSION_SECRET;
  if (configured && Buffer.byteLength(configured) >= 32) return configured;
  if (process.env.NODE_ENV === 'production' || configured) {
    throw new Error('SESSION_SECRET must contain at least 32 bytes.');
  }
  return (processState.doorknobSessionSecret ??=
    randomBytes(32).toString('base64'));
}
const payloadSchema = z.strictObject({
  ownerId: z.uuid(),
  expiresAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
});
/** Validated owner/absolute expiry payload; types alone do not prove authenticity. */
export type SessionPayload = z.infer<typeof payloadSchema>;

/** Session boundary result; the new payload is server-only signing material. */
export type AnonymousSession = {
  /** Verified or server-generated owner; safe to use for repository ownership checks. */
  ownerId: SessionPayload['ownerId'];
  /** New typed payload for signing, or null for an existing session. Never log or return in JSON. */
  newSession: SessionPayload | null;
};

/**
 * Signals a malformed, expired, or incorrectly signed cookie.
 * The API error handler maps this to 401 without replacing the cookie or accessing shares.
 * Configuration/crypto failures use ordinary errors and map to 500 instead.
 */
export class InvalidSessionError extends Error {}

/**
 * Verifies a Hono-signed JSON payload, or issues an owner only when no cookie exists.
 * @param request - Incoming request with an optional untrusted session cookie.
 * @returns The owner and a new payload to serialize, or null for an existing session.
 * @throws InvalidSessionError for malformed, forged, or expired credentials.
 * @throws If signing configuration or cryptographic operations fail.
 */
export async function getSession(request: Request): Promise<AnonymousSession> {
  const cookie = request.headers.get('cookie') ?? '';
  const supplied = parse(cookie, cookieName)[cookieName];
  if (
    supplied === undefined &&
    cookie
      .split(';')
      .some((part) => part.trimStart().startsWith(`${cookieName}=`))
  )
    throw new InvalidSessionError();
  if (supplied === undefined) {
    secret(); // Fail closed before a route can write when configuration is invalid.
    const payload: SessionPayload = {
      ownerId: randomUUID(),
      expiresAt: Math.floor(Date.now() / 1000) + lifetimeSeconds
    };
    return { ownerId: payload.ownerId, newSession: payload };
  }
  // Hono omits some malformed signatures; only a genuinely absent cookie bootstraps.
  const verified = (await parseSigned(cookie, secret(), cookieName))[
    cookieName
  ];
  if (typeof verified !== 'string') throw new InvalidSessionError();
  let value: unknown;
  try {
    value = JSON.parse(verified);
  } catch {
    throw new InvalidSessionError();
  }
  const parsed = payloadSchema.safeParse(value);
  if (!parsed.success || parsed.data.expiresAt <= Math.floor(Date.now() / 1000))
    throw new InvalidSessionError();
  return { ownerId: parsed.data.ownerId, newSession: null };
}

/**
 * Attaches a newly issued host-only cookie to the supplied response in place.
 * Uses HttpOnly, SameSite=Lax, path /, a 30-day Max-Age, and Secure in production.
 * @param response - Response to mutate before returning it to the browser.
 * @param newSession - Server-created payload from getSession; null leaves cookies unchanged.
 * @throws On payload validation, signing configuration, crypto, or serialization failure; the API returns 500.
 * @remarks Existing sessions are not refreshed. Shape validation does not establish trust;
 * callers must supply server-created payloads, never client-provided ownership.
 */
export async function setSessionCookie(
  response: Response,
  newSession: SessionPayload | null
) {
  if (newSession)
    response.headers.append(
      'Set-Cookie',
      await serializeSigned(
        cookieName,
        JSON.stringify(payloadSchema.parse(newSession)),
        secret(),
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: lifetimeSeconds
        }
      )
    );
}
