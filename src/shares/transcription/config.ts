import { z } from 'zod';

/** Nonsecret deployment choice, shared by runtime and build preparation. */
export const transcriptionProviderSchema = z
  .enum(['soniox', 'openai'])
  .default('soniox');
export type TranscriptionProvider = z.infer<typeof transcriptionProviderSchema>;

/** Reject invalid deployment values instead of silently falling back. */
export function parseTranscriptionProvider(
  value: string | undefined
): TranscriptionProvider {
  const parsed = transcriptionProviderSchema.safeParse(value);
  if (!parsed.success) throw new Error('STT_PROVIDER must be soniox or openai');
  return parsed.data;
}
