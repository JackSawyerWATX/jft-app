import 'server-only';
import { publicShareSchema } from '../model';
import { shareRepository, type ShareRepository } from './repository';
import { z } from 'zod';

const shareId = z.uuid({ version: 'v4' });

const lifetimeMs = 7 * 24 * 60 * 60 * 1000;

/**
 * The UUID is a bearer credential. Enforce age from storage, never from client input,
 * and return only the reading and text. Missing/expired links return null; failures throw.
 */
export async function readPublicShare(
  id: string,
  repository: ShareRepository = shareRepository,
  now = Date.now()
) {
  if (!shareId.safeParse(id).success) return null;
  const stored = await repository.findById(id);
  if (!stored) return null;
  const age = now - Date.parse(stored.createdAt);
  if (!Number.isFinite(age) || age < 0 || age >= lifetimeMs) return null;
  return publicShareSchema.parse(stored);
}
