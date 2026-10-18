import { createShare, parseShares, STORAGE_KEY, type Share } from './model';

type ShareStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Reads validated history, allowing callers to handle unavailable or corrupt storage. */
export function readShares(storage: ShareStorage): Share[] {
  return parseShares(storage.getItem(STORAGE_KEY));
}

/**
 * Reads the latest history before saving and reports success only after the write.
 * @throws On blank input, corrupt history, unavailable storage, or quota failure.
 */
export function saveShare(storage: ShareStorage, text: string) {
  const share = createShare(text);
  // Reading first preserves recent saves from other tabs, but writes are not transactional.
  const shares = [share, ...readShares(storage)];
  storage.setItem(STORAGE_KEY, JSON.stringify(shares));
  return { share, shares };
}
