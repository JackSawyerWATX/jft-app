import { z } from 'zod';

/** Temporary connection credential only; never a permanent provider key. */
export const transcriptionCredentialSchema = z.object({
  value: z
    .string()
    .min(1)
    .describe(
      'Short-lived bearer credential for establishing a provider connection. Treat as secret; never log or persist.'
    ),
  expires_at: z
    .number()
    .int()
    .positive()
    .describe(
      'Credential expiry as Unix time in seconds. Limits connection establishment, not the lifetime of an established recording.'
    )
});
