import assert from 'node:assert/strict';
import { test } from 'node:test';
import { watchMicrophone } from '../../../src/shares/transcription/microphone-activity';

test('microphone analysis detects activity and silence, cleans up, and never connects speakers', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
  let amplitude = 0,
    disconnected = 0,
    closed = 0;
  const activity: boolean[] = [];
  let boundaries = 0,
    failures = 0;
  const analyser = {
    fftSize: 1024,
    getFloatTimeDomainData: (samples: Float32Array) => samples.fill(amplitude)
  };
  class Context {
    static current: Context;
    state = 'running';
    onstatechange: (() => void) | null = null;
    constructor() {
      Context.current = this;
    }
    createMediaStreamSource() {
      return {
        connect: (target: unknown) => assert.equal(target, analyser),
        disconnect: () => {
          disconnected++;
        }
      };
    }
    createAnalyser() {
      return analyser;
    }
    async resume() {}
    async close() {
      closed++;
    }
  }
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: Context
  });
  t.after(() => Reflect.deleteProperty(globalThis, 'AudioContext'));
  const dispose = watchMicrophone(
    {} as MediaStream,
    (value) => activity.push(value),
    () => {
      boundaries++;
    },
    () => {
      failures++;
    }
  );
  amplitude = 0.1;
  t.mock.timers.tick(50);
  amplitude = 0;
  t.mock.timers.tick(50);
  t.mock.timers.tick(800);
  assert.deepEqual(activity, [true, false]);
  assert.equal(boundaries, 1);
  t.mock.timers.tick(2_000);
  assert.equal(boundaries, 1);
  Context.current.state = 'suspended';
  Context.current.onstatechange?.();
  assert.equal(failures, 1);
  dispose();
  dispose();
  t.mock.timers.tick(5_000);
  assert.equal(disconnected, 1);
  assert.equal(closed, 1);
  assert.equal(Context.current.onstatechange, null);
});
