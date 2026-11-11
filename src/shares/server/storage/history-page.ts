import 'server-only';
import { z } from 'zod';
import type { StoredShare } from './create-stored-share';

const positionSchema = z.strictObject({
  id: z.uuid({ version: 'v4' }),
  createdAt: z.iso.datetime({ offset: true })
});
export type HistoryPosition = z.infer<typeof positionSchema>;
export type HistoryOptions = { limit?: number; cursor?: string };
export type HistoryPage = { shares: StoredShare[]; nextCursor: string | null };

/** Opaque position only, never an authorization credential. Owner always comes from the verified session. */
export function encodeHistoryCursor(position: HistoryPosition): string {
  return Buffer.from(JSON.stringify(positionSchema.parse(position))).toString(
    'base64url'
  );
}
/** Reject malformed/oversized cursors before issuing a database query. Throws on invalid input. */
export function decodeHistoryCursor(cursor: string): HistoryPosition {
  z.string().min(1).max(512).parse(cursor);
  return positionSchema.parse(
    JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  );
}
export const historyOptionsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z
    .string()
    .max(512)
    .refine((value) => {
      try {
        decodeHistoryCursor(value);
        return true;
      } catch {
        return false;
      }
    }, 'Invalid history cursor.')
    .optional()
});
