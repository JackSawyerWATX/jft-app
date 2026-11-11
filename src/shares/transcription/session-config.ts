/** Shared recording lifecycle policy; no secrets or server model configuration belong here. */
export const sessionConfig = Object.freeze({
  startTimeoutMs: 20_000,
  finalTimeoutMs: 5_000,
  maxSessionMs: 10 * 60_000
});
