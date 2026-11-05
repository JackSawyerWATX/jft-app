import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createShareSchema, shareSchema } from '../../model';
import { reflection } from '../../reflection/reflection-fixture';

export const SHARE_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
export const storedShareSchema = shareSchema.extend({
  ownerId: z.uuid(),
  expiresAt: z.number().int().positive()
});
/** Server-only record; project through shareSchema before returning it to the owner. */
export type StoredShare = z.infer<typeof storedShareSchema>;

/** Construct a validated reading snapshot and metadata without writing to storage. */
export function createStoredShare(ownerId: string, text: string): StoredShare {
  const input = createShareSchema.parse({ text });
  z.uuid().parse(ownerId);
  const id = randomUUID();
  const now = Date.now();
  return storedShareSchema.parse({
    id,
    shareUrl: `/s/${id}`,
    createdAt: new Date(now).toISOString(),
    expiresAt: Math.floor(now / 1000) + SHARE_LIFETIME_SECONDS,
    kind: 'text',
    text: input.text,
    reflection: { ...reflection },
    ownerId
  });
}

/** TTL has second precision. Never expose future-dated or expired records. */
export function isShareActive(share: StoredShare, now = Date.now()): boolean {
  const created = Date.parse(share.createdAt);
  return (
    Number.isFinite(now) &&
    created <= now &&
    now < share.expiresAt * 1000 &&
    now < created + SHARE_LIFETIME_SECONDS * 1000
  );
}
