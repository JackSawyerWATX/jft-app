import 'server-only';

/** Trusted provider policy; secrets are resolved separately by key.ts. */
export const transcriptionConfig = Object.freeze({
  model: 'gpt-live-transcribe',
  language: 'en',
  credentialLifetimeSeconds: 60,
  requestTimeoutMs: 10_000
});
export const cleanupConfig = Object.freeze({
  model: 'gpt-5.4-mini',
  requestTimeoutMs: 20_000,
  maxOutputTokens: 8_192
});
