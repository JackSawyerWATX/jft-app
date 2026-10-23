import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBrowserSpeech,
  type SpeechConstructor
} from '../../../src/shares/transcription/browser-speech';
import type { TranscriptionEvents } from '../../../src/shares/transcription/types';

class MockSpeech {
  static instance: MockSpeech;
  continuous = false;
  interimResults = false;
  lang = '';
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null = null;
  stops = 0;
  aborted = false;
  aborts = 0;
  constructor() {
    MockSpeech.instance = this;
  }
  start() {
    this.onstart?.();
  }
  stop() {
    this.stops++;
  }
  abort() {
    this.aborts++;
    this.aborted = true;
  }
  results(...segments: [string, boolean][]) {
    this.onresult?.({
      resultIndex: 0,
      results: segments.map(([transcript, isFinal]) => ({
        isFinal,
        0: { transcript }
      }))
    });
  }
}
function setup() {
  const finals: string[] = [];
  const interim: string[] = [];
  const errors: string[] = [];
  let ended = 0;
  let started = 0;
  const events: TranscriptionEvents = {
    final: (text) => finals.push(text),
    interim: (text) => interim.push(text),
    error: (error) => errors.push(error),
    ended: () => {
      ended++;
    },
    listening: () => {
      started++;
    }
  };
  const engine = createBrowserSpeech(MockSpeech as SpeechConstructor, 'fr-FR');
  engine.start(events);
  return {
    engine,
    events,
    finals,
    interim,
    errors,
    get ended() {
      return ended;
    },
    get started() {
      return started;
    },
    mock: MockSpeech.instance
  };
}
test('unsupported outside browser; supported engine starts once and waits for end on stop', () => {
  assert.equal(createBrowserSpeech().available(), false);
  const s = setup();
  assert.equal(s.engine.available(), true);
  assert.equal(s.started, 1);
  assert.equal(s.mock.lang, 'fr-FR');
  assert.equal(s.mock.continuous, true);
  assert.equal(s.mock.interimResults, true);
  s.engine.start(s.events);
  assert.equal(s.started, 1);
  s.engine.stop();
  assert.equal(s.mock.stops, 1);
  s.mock.results(['Final after stop.', true]);
  s.mock.onend?.();
  assert.deepEqual(s.finals, ['Final after stop.']);
  assert.equal(s.ended, 1);
});
test('interim replacements never commit; repeated final indices commit once', () => {
  const s = setup();
  s.mock.results(['A provisional', false]);
  s.mock.results(['A final.', true], ['Next', false]);
  s.mock.results(['A final.', true], ['Next final.', true]);
  s.mock.results(['A final.', true], ['Next final.', true]);
  assert.deepEqual(s.finals, ['A final.', 'Next final.']);
  assert.equal(s.interim[0], 'A provisional');
  assert.equal(s.interim.at(-1), '');
  s.engine.dispose();
});
test('empty/unexpected termination and disposal ignore saved stale callbacks', () => {
  const s = setup();
  const stale = s.mock.onresult!;
  s.mock.onend?.();
  assert.equal(s.ended, 1);
  stale({
    resultIndex: 0,
    results: [{ isFinal: true, 0: { transcript: 'Stale' } }]
  });
  assert.deepEqual(s.finals, []);
  const second = setup();
  const callback = second.mock.onresult!;
  second.engine.dispose();
  callback({
    resultIndex: 0,
    results: [{ isFinal: true, 0: { transcript: 'Stale' } }]
  });
  assert.deepEqual(second.finals, []);
  assert.equal(second.mock.aborted, true);
});
const expectedRecognitionErrors = {
  'not-allowed':
    'Microphone access was denied. Allow access in your browser settings.',
  'service-not-allowed':
    'Microphone access was denied. Allow access in your browser settings.',
  network:
    'Speech recognition could not continue. Check your connection and try again.',
  'audio-capture':
    'Microphone audio is unavailable. Check your microphone and browser settings, then try again.'
};
for (const [error, message] of Object.entries(expectedRecognitionErrors)) {
  test(`sanitizes ${error} errors and allows a fresh session`, () => {
    const s = setup();
    s.mock.results(['Keep this.', true]);
    s.mock.onerror?.({ error });
    assert.equal(s.errors.length, 1);
    assert.equal(s.errors[0], message);
    assert.deepEqual(s.finals, ['Keep this.']);
    assert.equal(s.mock.aborted, true);
    const next = setup();
    next.mock.results(['More.', true]);
    assert.deepEqual(next.finals, ['More.']);
    next.engine.dispose();
  });
}
test('synchronous start/stop failures release the microphone and report a safe outcome', () => {
  class StartFailure extends MockSpeech {
    start() {
      throw new Error('sensitive vendor details');
    }
  }
  const errors: string[] = [];
  let ended = 0;
  const events: TranscriptionEvents = {
    listening() {},
    interim() {},
    final() {},
    error: (message) => errors.push(message),
    ended: () => {
      ended++;
    }
  };
  const failed = createBrowserSpeech(StartFailure);
  failed.start(events);
  assert.equal(errors.length, 1);
  assert.equal(
    errors[0],
    'Speech recognition could not start. Please try again.'
  );
  assert.equal(MockSpeech.instance.aborted, true);
  class StopFailure extends MockSpeech {
    stop() {
      throw new Error('already stopped');
    }
  }
  const stopping = createBrowserSpeech(StopFailure);
  stopping.start(events);
  stopping.stop();
  assert.equal(ended, 1);
  assert.equal(MockSpeech.instance.aborted, true);
});

test('stop is idempotent while waiting for finalization and cannot return to listening', () => {
  const s = setup();
  s.engine.stop();
  s.engine.stop();
  s.mock.onstart?.();
  assert.equal(s.mock.stops, 1);
  assert.equal(s.started, 1);
  s.engine.dispose();
});

test('a browser missing its end event is cancelled after the finalization grace period', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const s = setup();
  s.engine.stop();
  context.mock.timers.tick(5000);
  assert.equal(s.ended, 1);
  assert.equal(s.mock.aborted, true);
});

test('disposal from a final callback silences remaining segments in that event', () => {
  const engine = createBrowserSpeech(MockSpeech);
  const finals: string[] = [];
  engine.start({
    listening() {},
    interim() {},
    ended() {},
    error() {},
    final(text) {
      finals.push(text);
      engine.dispose();
    }
  });
  MockSpeech.instance.results(['Accepted.', true], ['Cancelled.', true]);
  assert.deepEqual(finals, ['Accepted.']);
});

test('optional engine activity reports speech boundaries and is silenced on disposal', () => {
  const engine = createBrowserSpeech(MockSpeech);
  const activity: boolean[] = [];
  engine.start({
    listening() {},
    interim() {},
    final() {},
    error() {},
    ended() {},
    activity: (speaking) => activity.push(speaking)
  });
  const speech = MockSpeech.instance as unknown as {
    onspeechstart: (() => void) | null;
    onspeechend: (() => void) | null;
    onaudioend: (() => void) | null;
  };
  const stale = speech.onspeechstart!;
  speech.onspeechstart?.();
  speech.onspeechend?.();
  speech.onaudioend?.();
  assert.deepEqual(activity, [true, false, false]);
  engine.dispose();
  stale();
  assert.equal(speech.onspeechstart, null);
  assert.deepEqual(activity, [true, false, false]);
});

test('repeated disposal cancels an active browser session only once', () => {
  const s = setup();
  s.engine.dispose();
  s.engine.dispose();
  s.engine.stop();
  assert.equal(s.mock.aborts, 1);
  assert.equal(s.mock.onresult, null);
  assert.equal(s.mock.onend, null);
});

test('silence ends normally and preserves finalized text without a service error', () => {
  const s = setup();
  s.mock.results(['Final fictional words.', true], ['Unfinished.', false]);
  s.mock.onerror?.({ error: 'no-speech' });
  assert.equal(s.ended, 1);
  assert.deepEqual(s.errors, []);
  assert.deepEqual(s.finals, ['Final fictional words.']);
  assert.equal(s.mock.onresult, null);
});
