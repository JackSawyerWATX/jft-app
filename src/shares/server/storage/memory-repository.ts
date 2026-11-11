import 'server-only';
import { createStoredShare, type StoredShare } from './create-stored-share';
import type { ShareRepository } from './repository';

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
        // Reverse insertion order first so timestamp ties put the latest insert first.
        .reverse()
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    );
  }

  async findById(id: string): Promise<StoredShare | null> {
    const share = this.#shares.get(id);
    return share ? structuredClone(share) : null;
  }

  async findByOwner(id: string, ownerId: string): Promise<StoredShare | null> {
    const share = await this.findById(id);
    return share?.ownerId === ownerId ? structuredClone(share) : null;
  }
}
