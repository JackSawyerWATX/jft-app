import 'server-only';
import OpenAI from 'openai';
import { CleanupResultError } from '../../cleanup-result-error';
import { OpenAIKeyError } from './key';

const publicCodes = new Set([
  'invalid_api_key',
  'insufficient_permissions',
  'permission_denied',
  'model_not_found',
  'unsupported_model',
  'insufficient_quota',
  'rate_limit_exceeded',
  'invalid_value',
  'invalid_request_error'
]);
const publicParams = new Set([
  'session',
  'session.type',
  'session.audio.input.transcription.model',
  'session.audio.input.turn_detection',
  'session.audio.input.noise_reduction',
  'expires_after',
  'expires_after.seconds'
]);

/** Report only app-authored categories, HTTP status and allowlisted protocol enums. Never log the exception itself. */
export function reportTranscriptionFailure(
  cause: unknown,
  operation: 'transcription' | 'cleanup' = 'transcription'
) {
  const label =
    operation === 'cleanup' ? '[Doorknob cleanup]' : '[Doorknob transcription]';
  if (cause instanceof CleanupResultError) {
    console.warn(label, {
      reason: cause.reason,
      ...(cause.detail ? { code: cause.detail } : {})
    });
  } else if (cause instanceof OpenAI.APIConnectionTimeoutError) {
    console.warn(label, { reason: 'provider_timeout' });
  } else if (cause instanceof OpenAI.APIConnectionError) {
    console.warn(label, { reason: 'provider_connection_failure' });
  } else if (cause instanceof OpenAIKeyError) {
    console.warn(label, { reason: cause.reason });
  } else if (cause instanceof OpenAI.APIError) {
    console.warn(label, {
      reason: 'provider_request_failed',
      status: cause.status,
      code:
        typeof cause.code === 'string' && publicCodes.has(cause.code)
          ? cause.code
          : 'unknown',
      param:
        typeof cause.param === 'string' && publicParams.has(cause.param)
          ? cause.param
          : 'unknown'
    });
  } else {
    console.warn(label, {
      reason: 'server_or_connection_failure'
    });
  }
}

/** Configuration/protocol failure markers contain no request or credential data. */
export function reportTranscriptionConfiguration(
  reason: 'disabled' | 'invalid_provider_response'
) {
  console.warn('[Doorknob transcription]', { reason });
}
