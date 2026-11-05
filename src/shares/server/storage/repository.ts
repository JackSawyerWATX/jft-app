import 'server-only';
import {
  createStoredShare,
  isShareActive,
  type StoredShare
} from './create-stored-share';
import { DynamoDbShareRepository } from './dynamodb-repository';

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
  /** Trusted lookup; all implementations reject expired records on every read. */
  findById(id: string): Promise<StoredShare | null>;
}

export class InMemoryShareRepository implements ShareRepository {
  #shares = new Map<string, StoredShare>();

  #removeExpired() {
    for (const [id, share] of this.#shares) {
      if (share.expiresAt * 1000 <= Date.now()) this.#shares.delete(id);
    }
  }

  async create(ownerId: string, text: string): Promise<StoredShare> {
    this.#removeExpired();
    const share = createStoredShare(ownerId, text);
    this.#shares.set(share.id, share);
    return structuredClone(share);
  }

  async listByOwner(ownerId: string): Promise<StoredShare[]> {
    this.#removeExpired();
    return structuredClone(
      [...this.#shares.values()]
        .filter((share) => share.ownerId === ownerId && isShareActive(share))
        .reverse()
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    );
  }

  async findById(id: string): Promise<StoredShare | null> {
    this.#removeExpired();
    const share = this.#shares.get(id);
    return share && isShareActive(share) ? structuredClone(share) : null;
  }

  async findByOwner(id: string, ownerId: string): Promise<StoredShare | null> {
    const share = await this.findById(id);
    return share?.ownerId === ownerId ? structuredClone(share) : null;
  }
}

const processState = globalThis as typeof globalThis & {
  doorknobShareRepository?: ShareRepository;
};

/** Explicit opt-in; invalid configuration never silently falls back to memory. */
export function createShareRepository(
  env: Readonly<Record<string, string | undefined>> = process.env
): ShareRepository {
  const persistence = env.SHARE_PERSISTENCE ?? 'memory';
  if (persistence === 'memory') return new InMemoryShareRepository();
  if (persistence !== 'dynamodb') {
    throw new Error('SHARE_PERSISTENCE must be memory or dynamodb.');
  }
  const table = env.DYNAMODB_TABLE_NAME?.trim();
  const region = (env.DYNAMODB_REGION ?? env.AWS_REGION)?.trim();
  if (
    !table ||
    !/^[A-Za-z0-9_.-]{3,255}$/.test(table) ||
    !region ||
    !/^[a-z0-9-]+$/.test(region)
  ) {
    throw new Error(
      'DynamoDB persistence requires DYNAMODB_TABLE_NAME and DYNAMODB_REGION (or AWS_REGION).'
    );
  }
  return DynamoDbShareRepository.forRegion(table, region);
}

// Lazy initialization allows build-time OpenAPI generation without AWS configuration.
// The existing global override remains useful for isolated server-error tests.
function currentRepository() {
  return (processState.doorknobShareRepository ??= createShareRepository());
}

export const shareRepository: ShareRepository = {
  create: (ownerId, text) => currentRepository().create(ownerId, text),
  listByOwner: (ownerId) => currentRepository().listByOwner(ownerId),
  findByOwner: (id, ownerId) => currentRepository().findByOwner(id, ownerId),
  findById: (id) => currentRepository().findById(id)
};
