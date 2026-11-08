import 'server-only';
import { publicShareSchema } from '../../model';
import { shareRepository, type ShareRepository } from '../storage/repository';
import { z } from 'zod';

const shareId = z.uuid({ version: 'v4' });

/**
 * The UUID is a bearer credential. Storage enforces its server-created expiry deadline;
 * this service returns only the reading and text. Missing links return null; failures throw.
 */
export async function readPublicShare(
  id: string,
  repository: ShareRepository = shareRepository
) {
  if (!shareId.safeParse(id).success) return null;
  const stored = await repository.findById(id);
  return stored ? publicShareSchema.parse(stored) : null;
}
