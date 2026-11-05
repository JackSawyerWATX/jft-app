import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { parseSigned, serializeSigned } from 'hono/utils/cookie';
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

export type SessionPayload = z.infer<typeof payloadSchema>;

export type AnonymousSession = {
  ownerId: SessionPayload['ownerId'];
  /** Server-created signing payload, or null to keep the existing cookie. */
  newSession: SessionPayload | null;
};

/**
 * Invalid credentials start a fresh owner; never recover ownership from their payload.
 * Configuration/crypto failures propagate instead of silently replacing the session.
 */
export async function getSession(request: Request): Promise<AnonymousSession> {
  const key = secret();
  const cookie = request.headers.get('cookie') ?? '';
  const verified = (await parseSigned(cookie, key, cookieName))[cookieName];
  if (typeof verified === 'string') {
    let value: unknown;
    try {
      value = JSON.parse(verified);
    } catch {
      /* Invalid old cookie starts a new owner below. */
    }
    const parsed = payloadSchema.safeParse(value);
    if (parsed.success && parsed.data.expiresAt > Math.floor(Date.now() / 1000))
      return { ownerId: parsed.data.ownerId, newSession: null };
  }
  const payload: SessionPayload = {
    ownerId: randomUUID(),
    expiresAt: Math.floor(Date.now() / 1000) + lifetimeSeconds
  };
  return { ownerId: payload.ownerId, newSession: payload };
}

/**
 * Sign only server-created payloads from getSession; shape validation is not authentication.
 * Existing sessions are not renewed.
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
