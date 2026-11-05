import { z } from 'zod';
import { shareSchema } from './model';
import { requestJson } from './http-client';

/** Returns validated history in server order; never retries requests. */
export async function readShares() {
  return z.array(shareSchema).parse(await requestJson('/api/shares'));
}
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
