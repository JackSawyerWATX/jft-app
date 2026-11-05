import 'server-only';
import { transcriptionConfig } from './config';
import { openAIClient } from './client';

/** The trusted server fixes the initial transcription session and never returns the permanent key. */
export async function issueTranscriptionCredential(signal?: AbortSignal) {
  const client = await openAIClient(transcriptionConfig.requestTimeoutMs);
  return client.realtime.clientSecrets.create(
    {
      expires_after: {
        anchor: 'created_at',
        seconds: transcriptionConfig.credentialLifetimeSeconds
      },
      session: {
        type: 'transcription',
        audio: {
          input: {
            transcription: {
              model: transcriptionConfig.model,
              language: transcriptionConfig.language
            },
            turn_detection: null,
            noise_reduction: { type: 'near_field' }
          }
        }
      }
    },
    { signal }
  );
}
