import { z } from 'zod';
import { shareSchema } from './model';
import { requestJson, requestJsonWithHeaders } from './http-client';

/** Return one bounded history page; absence of a continuation cursor means history is complete. */
export async function readShares(cursor?: string) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const { body, headers } = await requestJsonWithHeaders(`/api/shares${query}`);
  return {
    shares: z.array(shareSchema).parse(body),
    nextCursor: z
      .string()
      .max(512)
      .nullable()
      .parse(headers.get('X-Next-Cursor'))
  };
}
export type ShareHistoryPage = Awaited<ReturnType<typeof readShares>>;
/**
 * A rejected save may still have committed if its response was lost.
 * Leave draft clearing and retry decisions to the caller.
 */
export async function saveShare(text: string) {
  return shareSchema.parse(
    await requestJson('/api/shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
  );
}
/** Private reads require ownership; missing and other-owner IDs both return 404. */
export async function readShare(id: string) {
  return shareSchema.parse(
    await requestJson(`/api/shares/${encodeURIComponent(id)}`)
  );
}
