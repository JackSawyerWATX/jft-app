import 'server-only';
import { createStoredShare, type StoredShare } from './create-stored-share';
import {
  historyOptionsSchema,
  decodeHistoryCursor,
  encodeHistoryCursor,
  type HistoryOptions,
  type HistoryPage
} from './history-page';
import type { ShareRepository } from './repository';

export class InMemoryShareRepository implements ShareRepository {
  #shares = new Map<string, StoredShare>();

  async create(ownerId: string, text: string): Promise<StoredShare> {
    const share = createStoredShare(ownerId, text);
    this.#shares.set(share.id, share);
    return structuredClone(share);
  }

  async listByOwner(
    ownerId: string,
    options: HistoryOptions = {}
  ): Promise<HistoryPage> {
    const { limit, cursor } = historyOptionsSchema.parse(options);
    const shares = [...this.#shares.values()]
      .filter((share) => share.ownerId === ownerId)
      .reverse()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const position = cursor ? decodeHistoryCursor(cursor) : null;
    const start = position
      ? shares.findIndex(
          (share) =>
            share.id === position.id && share.createdAt === position.createdAt
        ) + 1
      : 0;
    // A cursor for another owner's record never grants access or restarts their history.
    if (position && start === 0) return { shares: [], nextCursor: null };
    const page = shares.slice(start, start + limit);
    const last = page.at(-1);
    return structuredClone({
      shares: page,
      nextCursor:
        last && start + page.length < shares.length
          ? encodeHistoryCursor({ id: last.id, createdAt: last.createdAt })
          : null
    });
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
