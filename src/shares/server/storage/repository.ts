import type { StoredShare } from './create-stored-share';

/**
 * Private reads require an owner from getSession, never client input.
 * Return detached records so callers cannot mutate storage; propagate storage failures.
 */
export interface ShareRepository {
  /** Validate input and capture a reading snapshot; reject validation or storage failures. */
  create(ownerId: string, text: string): Promise<StoredShare>;
  /** Newest first, or [] when this owner has no shares. */
  listByOwner(ownerId: string): Promise<StoredShare[]>;
  /** Missing shares and shares owned by someone else both return null. */
  findByOwner(id: string, ownerId: string): Promise<StoredShare | null>;
  /** Trusted lookup without ownership checks; the public service separately enforces link expiry. */
  findById(id: string): Promise<StoredShare | null>;
}
