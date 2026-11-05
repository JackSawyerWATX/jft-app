import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createShareSchema, shareSchema } from '../../model';
import { reflection } from '../../reflection/reflection-fixture';

const storedShareSchema = shareSchema.extend({ ownerId: z.uuid() });
/** Server-only record; project through shareSchema before returning it to the owner. */
export type StoredShare = z.infer<typeof storedShareSchema>;

/** Construct a validated reading snapshot and metadata without writing to storage. */
export function createStoredShare(ownerId: string, text: string): StoredShare {
  const input = createShareSchema.parse({ text });
  z.uuid().parse(ownerId);
  const id = randomUUID();
  return storedShareSchema.parse({
    id,
    shareUrl: `/s/${id}`,
    createdAt: new Date(Date.now()).toISOString(),
    kind: 'text',
    text: input.text,
    reflection: { ...reflection },
    ownerId
  });
}
