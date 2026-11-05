import 'server-only';
import {
  SecretsManagerClient,
  GetSecretValueCommand
} from '@aws-sdk/client-secrets-manager';

/** Safe configuration categories for diagnostics; never includes secret values or AWS error text. */
export class OpenAIKeyError extends Error {
  constructor(
    readonly reason:
      'missing_key' | 'invalid_secret_arn' | 'secret_unavailable',
    message: string
  ) {
    super(message);
  }
}

const CACHE_MS = 5 * 60_000;
let cached:
  { arn: string; expires: number; value: Promise<string> } | undefined;

/** Local server binding or Amplify compute-role access to a plain-string Secrets Manager secret. Never client bundled. */
export async function openAIKey(): Promise<string> {
  if (process.env.STT_OPENAI_API_KEY) return process.env.STT_OPENAI_API_KEY;
  const arn = process.env.STT_OPENAI_SECRET_ARN;
  if (!arn)
    throw new OpenAIKeyError('missing_key', 'Transcription is not configured');
  if (cached?.arn === arn && cached.expires > Date.now()) return cached.value;
  const region = arn.split(':')[3];
  if (!region || !arn.startsWith('arn:aws:secretsmanager:'))
    throw new OpenAIKeyError('invalid_secret_arn', 'Invalid secret ARN');
  const client = new SecretsManagerClient({ region, maxAttempts: 2 });
  const value = client
    .send(new GetSecretValueCommand({ SecretId: arn }), {
      abortSignal: AbortSignal.timeout(5_000)
    })
    .then((result) => {
      if (!result.SecretString) throw new Error('Missing secret');
      return result.SecretString;
    })
    .finally(() => client.destroy());
  const entry = { arn, expires: Date.now() + CACHE_MS, value };
  cached = entry;
  try {
    return await value;
  } catch {
    if (cached === entry) cached = undefined;
    throw new OpenAIKeyError('secret_unavailable', 'Secret unavailable');
  }
}
