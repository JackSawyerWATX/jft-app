import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createShareSchema, shareSchema } from '../model';
import { reflection } from '../reflection-fixture';

const storedShareSchema = shareSchema.extend({ ownerId: z.uuid() });
/**
 * Persisted share and its anonymous owner, for server-side use only.
 * Route handlers project this to the shared Share schema before returning JSON.
 */
export type StoredShare = z.infer<typeof storedShareSchema>;

/**
 * Validates text/ownership and constructs a new reading snapshot without storing it.
 * @param ownerId - UUID from a verified or newly issued session.
 * @param text - Raw text; validated and trimmed before construction.
 * @returns A validated stored record with server-generated ID/time and a reading snapshot.
 * @throws On invalid input/ownership or UUID generation failure; performs no writes.
 */
export function createStoredShare(ownerId: string, text: string): StoredShare {
  const input = createShareSchema.parse({ text });
  return storedShareSchema.parse({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    kind: 'text',
    text: input.text,
    reflection: { ...reflection },
    ownerId
  });
}
