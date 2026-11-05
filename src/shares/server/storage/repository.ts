import 'server-only';
import { createStoredShare, type StoredShare } from './create-stored-share';

/**
 * Private reads require an owner from getSession, never client input.
 * Return detached records so callers cannot mutate storage; propagate storage failures.
 */
export interface ShareRepository {
  /** Validate before writing; capture the current reading and server-generated metadata. */
  create(ownerId: string, text: string): Promise<StoredShare>;
  /** Newest first, or [] when this owner has no shares. */
  listByOwner(ownerId: string): Promise<StoredShare[]>;
  /** Return null for both missing records and ownership mismatches. */
  findByOwner(id: string, ownerId: string): Promise<StoredShare | null>;
  /** Trusted public lookup; callers enforce expiry and must not expose the stored record. */
  findById(id: string): Promise<StoredShare | null>;
}

export class InMemoryShareRepository implements ShareRepository {
  #shares = new Map<string, StoredShare>();

  async create(ownerId: string, text: string): Promise<StoredShare> {
    const share = createStoredShare(ownerId, text);
    this.#shares.set(share.id, share);
    return structuredClone(share);
  }

  async listByOwner(ownerId: string): Promise<StoredShare[]> {
    return structuredClone(
      [...this.#shares.values()]
        .filter((share) => share.ownerId === ownerId)
        .reverse()
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    );
  }

  async findById(id: string): Promise<StoredShare | null> {
    const share = this.#shares.get(id);
    return share ? structuredClone(share) : null;
  }

  async findByOwner(id: string, ownerId: string): Promise<StoredShare | null> {
    const share = this.#shares.get(id);
    return share?.ownerId === ownerId ? structuredClone(share) : null;
  }
}

const processState = globalThis as typeof globalThis & {
  doorknobShareRepository?: ShareRepository;
};

/**
 * Shared across route bundles and development reloads in this process only.
 * Restarts erase data; replicas do not share it.
 */
export const shareRepository: ShareRepository =
  (processState.doorknobShareRepository ??= new InMemoryShareRepository());
