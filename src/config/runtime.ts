import { z } from 'zod';
import { parseSecretArn } from './secret-arn';
import { transcriptionProviderSchema } from '../shares/transcription/config';

type Environment = Readonly<Record<string, string | undefined>>;
const persistence = z.discriminatedUnion('SHARE_PERSISTENCE', [
  z.object({ SHARE_PERSISTENCE: z.literal('memory') }),
  z.object({
    SHARE_PERSISTENCE: z.literal('dynamodb'),
    DYNAMODB_TABLE_NAME: z.string().trim().min(3).max(255),
    DYNAMODB_REGION: z.string().trim().min(1)
  })
]);
/** Pure configuration parsing, shared by deployment preparation and storage. Throws on invalid settings. */
export function parsePersistenceConfig(env: Environment) {
  return persistence.parse({
    SHARE_PERSISTENCE: env.SHARE_PERSISTENCE ?? 'memory',
    DYNAMODB_TABLE_NAME: env.DYNAMODB_TABLE_NAME,
    DYNAMODB_REGION: env.DYNAMODB_REGION ?? env.AWS_REGION
  });
}
const secretArn = z.string().refine((value) => {
  if (!value) return true;
  try {
    parseSecretArn(value);
    return true;
  } catch {
    return false;
  }
}, 'Expected a regional Secrets Manager secret ARN.');
const speech = z.object({
  STT_ENABLED: z.enum(['true', 'false']),
  STT_PROVIDER: transcriptionProviderSchema,
  STT_SONIOX_SECRET_ARN: secretArn,
  STT_OPENAI_SECRET_ARN: secretArn
});
/** Return only allowlisted nonsecret runtime settings. Secret values are never copied. */
export function parseRuntimeConfig(env: Environment) {
  return {
    ...parsePersistenceConfig(env),
    ...speech.parse({
      STT_ENABLED: env.STT_ENABLED ?? 'false',
      STT_PROVIDER: env.STT_PROVIDER,
      STT_SONIOX_SECRET_ARN: env.STT_SONIOX_SECRET_ARN ?? '',
      STT_OPENAI_SECRET_ARN: env.STT_OPENAI_SECRET_ARN ?? ''
    })
  };
}
