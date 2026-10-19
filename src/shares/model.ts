import { z } from 'zod';

/** Maximum raw text length in Unicode code points, before surrounding whitespace is trimmed. */
export const MAX_SHARE_TEXT_LENGTH = 10_000;

const nonblankText = z.string().refine((value) => value.trim().length > 0, {
  message: 'Text must not be blank'
});
const reflectionSchema = z.object({
  id: nonblankText,
  date: z.iso.date(),
  title: nonblankText,
  body: nonblankText
});

/**
 * Strict POST body contract: trim text, reject blank input and all extra fields.
 * IDs, timestamps, kind, reading snapshots, and ownership are assigned server-side.
 * Parsing invalid input throws ZodError; handlers use safeParse to return 400.
 */
export const createShareSchema = z.strictObject({
  text: z
    .string()
    .refine(
      (value) => Array.from(value).length <= MAX_SHARE_TEXT_LENGTH,
      'Text exceeds 10,000 characters'
    )
    .trim()
    .min(1, 'Write a few words before saving your share.')
    .meta({
      maxLength: MAX_SHARE_TEXT_LENGTH,
      description:
        'At most 10,000 Unicode code points before trimming; the trimmed result must contain non-whitespace text.'
    })
});

/**
 * Owner-visible response contract; parsing strips fields not declared here, including
 * the stored ownerId. Validates UUID/time/kind and the complete reading snapshot.
 * Parsing invalid records throws ZodError; this schema does not authorize access.
 * Route handlers must perform the session/ownership checks before projecting data.
 */
export const shareSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  kind: z.literal('text'),
  reflection: reflectionSchema,
  text: nonblankText
});

/** Reading snapshot with an ISO calendar date; saved snapshots do not follow later edits. */
export type Reflection = z.infer<typeof reflectionSchema>;
/** Validated API share without ownerId; its TypeScript shape alone does not grant access. */
export type Share = z.infer<typeof shareSchema>;
