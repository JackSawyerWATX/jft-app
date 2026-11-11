import 'server-only';
import { parseSecretArn } from '../../config/secret-arn';
import {
  SecretsManagerClient,
  GetSecretValueCommand
} from '@aws-sdk/client-secrets-manager';

/** App-authored categories only; callers must never log upstream exceptions. */
export class SecretKeyError extends Error {
  constructor(
    readonly reason:
      'missing_key' | 'invalid_secret_arn' | 'secret_unavailable',
    message: string
  ) {
    super(message);
  }
}

const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { expires: number; value: Promise<string> }>();

/** Read a plain-string secret using the compute role, sharing normalized results. */
export async function secretKey(arn: string | undefined): Promise<string> {
  if (!arn)
    throw new SecretKeyError('missing_key', 'Transcription is not configured');
  const cached = cache.get(arn);
  if (cached && cached.expires > Date.now()) return cached.value;

  let region: string;
  try {
    const parsed = parseSecretArn(arn);
    region = parsed.region;
  } catch {
    throw new SecretKeyError('invalid_secret_arn', 'Invalid secret ARN');
  }

  const client = new SecretsManagerClient({ region, maxAttempts: 2 });
  const value: Promise<string> = client
    .send(new GetSecretValueCommand({ SecretId: arn }), {
      abortSignal: AbortSignal.timeout(5_000)
    })
    .then((result) => {
      if (!result.SecretString) throw new Error('Missing secret');
      return result.SecretString;
    })
    .finally(() => client.destroy())
    .catch(() => {
      if (cache.get(arn)?.value === value) cache.delete(arn);
      throw new SecretKeyError('secret_unavailable', 'Secret unavailable');
    });
  // Cache the sanitized promise so every concurrent caller sees the same error.
  cache.set(arn, { expires: Date.now() + CACHE_MS, value });
  return value;
}
