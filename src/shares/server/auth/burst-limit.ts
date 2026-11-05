import 'server-only';

type Entries = Map<string, { until: number; count: number }>;
const runtime = globalThis as typeof globalThis & {
  doorknobSpeechLimits?: Entries;
  doorknobCleanupLimits?: Entries;
};

/** Process-local burst protection only; each paid operation has its own allowance. */
export function burstLimited(
  operation: 'transcription' | 'cleanup',
  owner: string
) {
  const limits =
    operation === 'transcription'
      ? (runtime.doorknobSpeechLimits ??= new Map())
      : (runtime.doorknobCleanupLimits ??= new Map());
  const now = Date.now();
  for (const [key, entry] of limits) if (entry.until <= now) limits.delete(key);
  let entry = limits.get(owner);
  if (!entry) {
    if (limits.size >= 1_000) return true;
    entry = { until: now + 60_000, count: 0 };
    limits.set(owner, entry);
  }
  return ++entry.count > 5;
}
