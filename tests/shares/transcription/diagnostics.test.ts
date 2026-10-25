import assert from 'node:assert/strict';
import test from 'node:test';
import { speechErrorCode } from '../../../src/shares/transcription/diagnostics';

test('diagnostic errors retain only recognized public codes', () => {
  for (const code of [
    'network',
    'audio-capture',
    'not-allowed',
    'SecurityError',
    'InvalidStateError'
  ])
    assert.equal(speechErrorCode(code), code);
  for (const value of [
    'private vendor message',
    new Error('private'),
    { error: 'network' },
    undefined
  ])
    assert.equal(speechErrorCode(value), 'unknown');
});
