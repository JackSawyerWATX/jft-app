import { z } from 'zod';

/** Versioned browser storage key; future incompatible records need a migration. */
export const STORAGE_KEY = 'doorknob.shares.v1';
const nonblankText = z.string().refine((value) => value.trim().length > 0, {
  message: 'Text must not be blank'
});
const reflectionSchema = z
  .object({
    id: nonblankText,
    date: z.iso.date(),
    title: nonblankText,
    body: nonblankText
  })
  .passthrough();
const shareSchema = z
  .object({
    id: z.uuid(),
    createdAt: z.iso.datetime({ offset: true }),
    kind: z.literal('text'),
    reflection: reflectionSchema,
    text: nonblankText
  })
  .passthrough();
const sharesSchema = z.array(shareSchema);

/** A reading snapshot, independent of the current hardcoded reading. */
export type Reflection = z.infer<typeof reflectionSchema>;

/** Fixed reading for the first milestone, copied into every saved share. */
export const reflection: Reflection = {
  id: 'acceptance-2025-04-23',
  date: '2025-04-23',
  title: 'Acceptance is the answer to all my problems today.',
  body: 'Today, I can practice meeting life as it is. Acceptance gives me room to pause, let go of what I cannot change, and take one small step toward what I can.'
};
/** A private text share with its original reading and an ISO creation timestamp. */
export type Share = z.infer<typeof shareSchema>;

/**
 * Validates stored history and returns newest shares first.
 * @param raw - The localStorage value; null means no history exists yet.
 * @throws When JSON or records are invalid, so callers can preserve existing data.
 */
export function parseShares(raw: string | null): Share[] {
  if (raw === null) return [];
  const shares = sharesSchema.parse(JSON.parse(raw));
  return shares.sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
}

/**
 * Creates a text share without writing to storage.
 * @param text - User input; surrounding whitespace is removed.
 * @throws When the input is blank or the browser cannot generate a UUID.
 */
export function createShare(text: string): Share {
  return shareSchema.parse({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    kind: 'text',
    reflection: { ...reflection },
    text: text.trim()
  });
}
