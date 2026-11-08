import 'server-only';
import { z } from 'zod';
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
  create(ownerId: string, text: string): Promise<StoredShare>;
  /** Newest first, or [] when this owner has no shares. */
  listByOwner(ownerId: string): Promise<StoredShare[]>;
  /** Missing shares and shares owned by someone else both return null. */
  findByOwner(id: string, ownerId: string): Promise<StoredShare | null>;
  /** Trusted lookup for public links. Expired shares return null. */
  findById(id: string): Promise<StoredShare | null>;
}

export class InMemoryShareRepository implements ShareRepository {
  #shares = new Map<string, StoredShare>();

  // Prune expired shares during normal operations; the local store needs no timer.
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
        // Reverse insertion order first so timestamp ties put the latest insert first.
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

const persistenceMode = z.enum(['memory', 'dynamodb']).default('memory');

const dynamoConfig = z.object({
  DYNAMODB_TABLE_NAME: z.string().trim().min(3).max(255),
  DYNAMODB_REGION: z.string().trim().min(1)
});

export function createShareRepository(
  env: Readonly<Record<string, string | undefined>> = process.env
): ShareRepository {
  const mode = persistenceMode.safeParse(env.SHARE_PERSISTENCE);
  if (!mode.success) {
    throw new Error('SHARE_PERSISTENCE must be memory or dynamodb.');
  }
  if (mode.data === 'memory') return new InMemoryShareRepository();

  // Validate AWS settings only when DynamoDB is selected. A bad configuration
  // fails rather than silently storing shares in memory.
  const config = dynamoConfig.parse({
    DYNAMODB_TABLE_NAME: env.DYNAMODB_TABLE_NAME,
    // Prefer the app's explicit region over the AWS runtime default.
    DYNAMODB_REGION: env.DYNAMODB_REGION ?? env.AWS_REGION
  });

  return DynamoDbShareRepository.forRegion(
    config.DYNAMODB_TABLE_NAME,
    config.DYNAMODB_REGION
  );
}

// Initialize on first use so build-time OpenAPI generation needs no AWS settings.
function currentRepository() {
  return (processState.doorknobShareRepository ??= createShareRepository());
}

export const shareRepository: ShareRepository = {
  create: (ownerId, text) => currentRepository().create(ownerId, text),
  listByOwner: (ownerId) => currentRepository().listByOwner(ownerId),
  findByOwner: (id, ownerId) => currentRepository().findByOwner(id, ownerId),
  findById: (id) => currentRepository().findById(id)
};
