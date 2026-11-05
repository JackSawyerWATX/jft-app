import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { configureSpeechDiagnostics } from '../../../src/shares/transcription/diagnostics';
import { reportProviderEvent } from '../../../src/shares/transcription/providers/openai/diagnostics';
import { watchWebRTCStats } from '../../../src/shares/transcription/webrtc-diagnostics';

function diagnostics(t: TestContext) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { search: '?speechDebug=1' } }
  });
  configureSpeechDiagnostics();
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
    configureSpeechDiagnostics();
  });
  return t.mock.method(console, 'info', () => {});
}

test('browser provider diagnostics retain event categories and lengths without frame contents or IDs', (t) => {
  const log = diagnostics(t);
  reportProviderEvent({
    type: 'conversation.item.input_audio_transcription.delta',
    delta: 'private speech',
    item_id: 'private ID'
  });
  reportProviderEvent({
    type: 'error',
    error: {
      code: 'model_not_found',
      message: 'private provider error',
      token: 'private token'
    }
  });
  reportProviderEvent({
    type: 'private event',
    error: { code: 'private code' }
  });
  reportProviderEvent({
    type: 'session.created',
    session: {
      type: 'transcription',
      audio: { input: { transcription: { model: 'gpt-live-transcribe' } } },
      client_secret: 'private token'
    }
  });
  const lines = log.mock.calls.map((call) => call.arguments);
  assert.ok(JSON.stringify(lines).includes('model_not_found'));
  assert.ok(JSON.stringify(lines).includes('transcription'));
  assert.ok(JSON.stringify(lines).includes('gpt-live-transcribe'));
  assert.ok(JSON.stringify(lines).includes('other'));
  assert.ok(!JSON.stringify(lines).includes('private'));
  assert.deepEqual(lines[0], [
    '[Doorknob speech] provider-event',
    {
      stage: 'conversation.item.input_audio_transcription.delta',
      characters: 14
    }
  ]);
});

test('outbound audio sampling logs only counters and releases its timer and pending samples', async (t) => {
  const log = diagnostics(t);
  t.mock.timers.enable({ apis: ['setInterval'] });
  let samples = 0;
  let resolve!: (report: RTCStatsReport) => void;
  const peer = {
    getStats: () => {
      samples++;
      return new Promise<RTCStatsReport>((done) => {
        resolve = done;
      });
    }
  } as RTCPeerConnection;
  const stop = watchWebRTCStats(peer);
  t.mock.timers.tick(2_000);
  resolve(
    new Map([
      [
        'audio',
        {
          type: 'outbound-rtp',
          kind: 'audio',
          packetsSent: 20,
          bytesSent: 400,
          trackIdentifier: 'private'
        }
      ],
      [
        'video',
        { type: 'outbound-rtp', kind: 'video', packetsSent: 10, bytesSent: 900 }
      ]
    ]) as unknown as RTCStatsReport
  );
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(log.mock.calls[0].arguments, [
    '[Doorknob speech] webrtc-audio-sent',
    { packets: 20, bytes: 400 }
  ]);
  t.mock.timers.tick(2_000);
  stop();
  resolve(new Map() as unknown as RTCStatsReport);
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(10_000);
  assert.equal(samples, 2);
  assert.equal(log.mock.callCount(), 1);
});

test('outbound audio sampling does not run without diagnostic opt-in', (t) => {
  configureSpeechDiagnostics();
  let samples = 0;
  const peer = {
    getStats: async () => {
      samples++;
      return new Map();
    }
  } as unknown as RTCPeerConnection;
  t.mock.timers.enable({ apis: ['setInterval'] });
  const stop = watchWebRTCStats(peer);
  t.mock.timers.tick(5_000);
  stop();
  assert.equal(samples, 0);
});
