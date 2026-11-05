import assert from 'node:assert/strict';
import { test } from 'node:test';
import OpenAI from 'openai';
import {
  reportTranscriptionFailure,
  reportTranscriptionConfiguration
} from '../../src/shares/server/providers/openai/diagnostics';
import { CleanupResultError } from '../../src/shares/server/cleanup-result-error';
import { OpenAIKeyError } from '../../src/shares/server/providers/openai/key';

test('server transcription diagnostics reveal only safe categories, statuses and allowlisted fields', (t) => {
  const log = t.mock.method(console, 'warn', () => {});
  reportTranscriptionConfiguration('disabled');
  reportTranscriptionFailure(
    new OpenAIKeyError('missing_key', 'private configuration details')
  );
  reportTranscriptionFailure(
    new OpenAI.APIError(
      403,
      {
        message: 'private credential and transcript',
        code: 'insufficient_permissions',
        param: 'session.audio.input.transcription.model'
      },
      'private raw message',
      new Headers({ 'x-request-id': 'private' })
    )
  );
  reportTranscriptionFailure(
    new OpenAI.APIError(
      400,
      { message: 'private', code: 'private code', param: 'private parameter' },
      'private message',
      new Headers()
    )
  );
  reportTranscriptionFailure(new Error('private connection details'));
  const lines = log.mock.calls.map((call) => call.arguments);
  assert.deepEqual(lines[0], [
    '[Doorknob transcription]',
    { reason: 'disabled' }
  ]);
  assert.deepEqual(lines[1], [
    '[Doorknob transcription]',
    { reason: 'missing_key' }
  ]);
  assert.deepEqual(lines[2], [
    '[Doorknob transcription]',
    {
      reason: 'provider_request_failed',
      status: 403,
      code: 'insufficient_permissions',
      param: 'session.audio.input.transcription.model'
    }
  ]);
  assert.deepEqual(lines[3], [
    '[Doorknob transcription]',
    {
      reason: 'provider_request_failed',
      status: 400,
      code: 'unknown',
      param: 'unknown'
    }
  ]);
  assert.ok(!JSON.stringify(lines).includes('private'));
});

test('cleanup result categories and provider timeouts are distinguishable without leaking output', (t) => {
  const log = t.mock.method(console, 'warn', () => {});
  for (const reason of [
    'cleanup_not_completed',
    'cleanup_refused',
    'missing_cleanup_output',
    'invalid_cleanup_output'
  ] as const)
    reportTranscriptionFailure(new CleanupResultError(reason), 'cleanup');
  reportTranscriptionFailure(
    new CleanupResultError('cleanup_not_completed', 'max_output_tokens'),
    'cleanup'
  );
  reportTranscriptionFailure(
    new OpenAI.APIConnectionTimeoutError({
      message: 'private timeout details'
    }),
    'cleanup'
  );
  const lines = log.mock.calls.map((call) => call.arguments);
  assert.deepEqual(lines[4], [
    '[Doorknob cleanup]',
    { reason: 'cleanup_not_completed', code: 'max_output_tokens' }
  ]);
  assert.deepEqual(lines[5], [
    '[Doorknob cleanup]',
    { reason: 'provider_timeout' }
  ]);
  assert.ok(!JSON.stringify(lines).includes('private'));
});
