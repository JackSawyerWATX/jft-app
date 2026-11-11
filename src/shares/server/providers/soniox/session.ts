import 'server-only';
import { z } from 'zod';
import { sonioxKey } from './key';
import { SonioxCredentialError } from './errors';
import { sessionConfig } from '../../../transcription/session-config';

const credential = z.object({
  api_key: z.string().min(1),
  expires_at: z.iso.datetime({ offset: true })
});

/** Permanent credentials stay on the server; never include upstream bodies in errors. */
export async function issueSonioxCredential(
  signal: AbortSignal,
  request: typeof fetch = fetch,
  key: () => Promise<string> = sonioxKey
) {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
  const permanent = await key();
  bounded.throwIfAborted();
  const response = await request(
    'https://api.soniox.com/v1/auth/temporary-api-key',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${permanent}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        usage_type: 'transcribe_websocket',
        expires_in_seconds: 60,
        single_use: true,
        max_session_duration_seconds: sessionConfig.maxSessionMs / 1000
      }),
      signal: bounded,
      cache: 'no-store'
    }
  ).catch(() => {
    throw new SonioxCredentialError(
      bounded.aborted ? 'provider_timeout' : 'provider_connection_failure'
    );
  });
  if (!response.ok)
    throw new SonioxCredentialError('provider_request_failed', response.status);
  const parsed = credential.safeParse(await response.json());
  if (!parsed.success)
    throw new SonioxCredentialError('invalid_provider_response');
  bounded.throwIfAborted();
  return {
    value: parsed.data.api_key,
    expires_at: Math.floor(Date.parse(parsed.data.expires_at) / 1000)
  };
}
