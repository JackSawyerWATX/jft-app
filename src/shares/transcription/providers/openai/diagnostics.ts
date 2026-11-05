import { speechDiagnostic } from '../../diagnostics';

const eventTypes = new Set([
  'session.created',
  'session.updated',
  'transcription_session.created',
  'transcription_session.updated',
  'input_audio_buffer.committed',
  'input_audio_buffer.speech_started',
  'input_audio_buffer.speech_stopped',
  'conversation.item.created',
  'conversation.item.added',
  'conversation.item.input_audio_transcription.delta',
  'conversation.item.input_audio_transcription.completed',
  'conversation.item.input_audio_transcription.failed',
  'error'
]);
const errorCodes = new Set([
  'input_audio_buffer_commit_empty',
  'invalid_api_key',
  'insufficient_permissions',
  'permission_denied',
  'model_not_found',
  'unsupported_model',
  'insufficient_quota',
  'rate_limit_exceeded',
  'invalid_value',
  'invalid_request_error',
  'unknown_parameter',
  'unsupported_value',
  'server_error',
  'invalid_event'
]);
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};

/** Protocol categories and text lengths only; never forward provider frames, IDs, errors or transcript strings. */
export function reportProviderEvent(event: Record<string, unknown>) {
  const type =
    typeof event.type === 'string' && eventTypes.has(event.type)
      ? event.type
      : 'other';
  speechDiagnostic('provider-event', {
    stage: type,
    characters:
      typeof event.delta === 'string'
        ? event.delta.length
        : typeof event.transcript === 'string'
          ? event.transcript.length
          : undefined
  });
  if (
    type === 'error' ||
    type === 'conversation.item.input_audio_transcription.failed'
  ) {
    const error = record(event.error);
    speechDiagnostic('provider-error', {
      code:
        typeof error.code === 'string' && errorCodes.has(error.code)
          ? error.code
          : 'unknown'
    });
  }
  if (type.endsWith('session.created') || type.endsWith('session.updated')) {
    const session = record(event.session);
    const model = record(
      record(record(session.audio).input).transcription
    ).model;
    speechDiagnostic('provider-session', {
      stage:
        session.type === 'transcription' ||
        session.object === 'realtime.transcription_session'
          ? 'transcription'
          : 'other',
      code: model === 'gpt-live-transcribe' ? 'gpt-live-transcribe' : 'other'
    });
  }
}
