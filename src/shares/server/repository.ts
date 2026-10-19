import 'server-only';
import { createStoredShare, type StoredShare } from './create-stored-share';

/**
 * Persistence boundary for private shares; every operation is scoped to an owner.
 * Callers must obtain owner IDs from getSession, never from request bodies.
 * Implementations return detached records so callers cannot mutate storage.
 */
export interface ShareRepository {
  /**
   * Validates and trims text, generates metadata, and stores the current reading snapshot.
   * @param ownerId - UUID from a verified or newly issued anonymous session.
   * @param text - Written share; surrounding whitespace is removed.
   * @returns The stored record, including server-only ownership and generated metadata.
   * @throws When owner/text validation or server UUID generation fails. Validation failures
   * occur before writing; persistence failures must be propagated to the caller.
   */
  create(ownerId: string, text: string): Promise<StoredShare>;
  /**
   * Lists only this owner's shares, ordered by creation timestamp descending.
   * @param ownerId - Identity from the session boundary; no client ownership override.
   * @returns Detached records, or an empty array when this owner has no shares.
   * @throws If the persistence implementation cannot complete the read.
   */
  listByOwner(ownerId: string): Promise<StoredShare[]>;
  /**
   * Looks up a private share without revealing whether another owner has that ID.
   * @param id - Share ID selected by the client; possession alone grants no access.
   * @param ownerId - Identity from the session boundary.
   * @returns A detached record, or null for both missing IDs and ownership mismatches.
   * @throws If the persistence implementation cannot complete the read.
   */
  findByOwner(id: string, ownerId: string): Promise<StoredShare | null>;
}

/**
 * Isolated in-memory implementation. Reads return clones and every lookup checks ownership.
 * Instances do not share data. The application exports one process-wide instance below.
 */
export class InMemoryShareRepository implements ShareRepository {
  #shares = new Map<string, StoredShare>();

  /** {@inheritDoc ShareRepository.create} */
  async create(ownerId: string, text: string): Promise<StoredShare> {
    const share = createStoredShare(ownerId, text);
    this.#shares.set(share.id, share);
    return structuredClone(share);
  }

  /** {@inheritDoc ShareRepository.listByOwner} */
  async listByOwner(ownerId: string): Promise<StoredShare[]> {
    return structuredClone(
      [...this.#shares.values()]
        .filter((share) => share.ownerId === ownerId)
        .reverse()
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    );
  }

  /** {@inheritDoc ShareRepository.findByOwner} */
  async findByOwner(id: string, ownerId: string): Promise<StoredShare | null> {
    const share = this.#shares.get(id);
    return share?.ownerId === ownerId ? structuredClone(share) : null;
  }
}

const processState = globalThis as typeof globalThis & {
  doorknobShareRepository?: ShareRepository;
};

/**
 * One store across requests, development reloads, and route bundles in this process.
 * Restarts erase data; replicas/serverless instances do not share this instance.
 */
export const shareRepository: ShareRepository =
  (processState.doorknobShareRepository ??= new InMemoryShareRepository());
