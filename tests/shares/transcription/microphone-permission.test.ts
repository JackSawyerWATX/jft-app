import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  requestMicrophone,
  microphoneErrorCode,
  microphoneErrorMessage,
  MICROPHONE_DENIED
} from '../../../src/shares/transcription/microphone-permission';

test('requests capture synchronously and returns the same stream for transcription without preflight capture', async (t) => {
  let requests = 0,
    stopped = 0;
  const stream = {
    getTracks: () => [
      {
        stop() {
          stopped++;
        }
      }
    ]
  } as unknown as MediaStream;
  const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: async (constraints: MediaStreamConstraints) => {
        requests++;
        assert.deepEqual(constraints, {
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true
          },
          video: false
        });
        return stream;
      }
    }
  });
  t.after(() => {
    if (original) Object.defineProperty(navigator, 'mediaDevices', original);
    else Reflect.deleteProperty(navigator, 'mediaDevices');
  });
  assert.equal(requests, 0);
  const pending = requestMicrophone();
  assert.equal(requests, 1);
  assert.equal(await pending, stream);
  assert.equal(stopped, 0);
});

test('permission errors distinguish Safari site settings, security, and unavailable devices without exposing raw errors', () => {
  assert.equal(microphoneErrorMessage('NotAllowedError'), MICROPHONE_DENIED);
  assert.match(MICROPHONE_DENIED, /Safari/);
  assert.match(microphoneErrorMessage('SecurityError'), /HTTPS/);
  for (const name of [
    'NotFoundError',
    'NotReadableError',
    'OverconstrainedError'
  ]) {
    assert.equal(microphoneErrorCode({ name }), name);
    assert.match(microphoneErrorMessage(name), /Microphone unavailable/);
  }
  assert.match(microphoneErrorMessage('NotSupportedError'), /current version/);
  const cause = { name: 'private provider detail', message: 'private content' };
  assert.equal(microphoneErrorCode(cause), 'unknown');
  assert.ok(
    !microphoneErrorMessage(microphoneErrorCode(cause)).includes('private')
  );
});
