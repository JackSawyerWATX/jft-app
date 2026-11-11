import 'server-only';
import { publicShareSchema } from '../../model';
import { shareRepository } from '../storage/configured-repository';
import { type ShareRepository } from '../storage/repository';
import { z } from 'zod';

export const PUBLIC_LINK_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const shareId = z.uuid({ version: 'v4' });

/**
 * The UUID is a bearer credential. Public links expire seven days after creation; private storage is retained;
 * this service returns only the reading and text. Missing links return null; failures throw.
 */
export async function readPublicShare(
  id: string,
  repository: ShareRepository = shareRepository
) {
  if (!shareId.safeParse(id).success) return null;
  const stored = await repository.findById(id);
  if (!stored) return null;
  const age = Date.now() - Date.parse(stored.createdAt);
  if (!Number.isFinite(age) || age < 0 || age >= PUBLIC_LINK_LIFETIME_MS)
    return null;
  return publicShareSchema.parse(stored);
}
