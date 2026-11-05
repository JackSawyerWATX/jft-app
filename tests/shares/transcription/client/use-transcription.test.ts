import { dom } from './dom';
import { after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { useState } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useTranscription } from '../../../../src/shares/transcription/use-transcription';
import type {
  TranscriptionEngine,
  TranscriptionEvents
} from '../../../../src/shares/transcription/types';
import { MAX_SHARE_TEXT_LENGTH } from '../../../../src/shares/model';
import {
  configureSpeechDiagnostics,
  speechDiagnostic
} from '../../../../src/shares/transcription/diagnostics';

class FakeEngine implements TranscriptionEngine {
  events?: TranscriptionEvents;
  stopped = false;
  disposed = false;
  constructor(private supported = true) {}
  available() {
    return this.supported;
  }
  start(events: TranscriptionEvents) {
    this.events = events;
  }
  stop() {
    this.stopped = true;
  }
  // Keep captured callbacks callable so tests can simulate an ill-behaved/stale provider.
  dispose() {
    this.disposed = true;
  }
}
function setup(initialText = 'Typed.', supported = true) {
  const engines: FakeEngine[] = [];
  const createEngine = () => {
    const engine = new FakeEngine(supported);
    engines.push(engine);
    return engine;
  };
  const hook = renderHook(() => {
    const [text, setText] = useState(initialText);
    return { text, ...useTranscription(text, setText, { createEngine }) };
  });
  return { ...hook, engines, latest: () => engines.at(-1)! };
}
afterEach(cleanup);
after(() => dom.window.close());

test('an injected asynchronous engine finalizes after stop and ignores old sessions', () => {
  const hook = setup();
  assert.equal(hook.result.current.state, 'idle');
  assert.equal(hook.engines[0].disposed, true); // Capability probe releases resources.
  act(() => {
    hook.result.current.start();
    hook.result.current.start();
  });
  assert.equal(hook.engines.length, 2);
  const first = hook.latest();
  act(() => {
    first.events!.listening();
    first.events!.interim('Provisional fiction.');
  });
  assert.equal(hook.result.current.state, 'listening');
  assert.equal(hook.result.current.text, 'Typed.');
  assert.equal(hook.result.current.interim, 'Provisional fiction.');
  act(() => hook.result.current.stop());
  assert.equal(first.stopped, true);
  assert.equal(hook.result.current.state, 'stopping');
  act(() => first.events!.final('Final fiction.'));
  assert.equal(hook.result.current.text, 'Typed.\n\nFinal fiction.');
  act(() => first.events!.ended());
  assert.equal(hook.result.current.state, 'idle');
  assert.equal(hook.result.current.interim, '');
  assert.equal(first.disposed, true);
  act(() => hook.result.current.start());
  const second = hook.latest();
  act(() => {
    first.events!.final('Stale words.');
    first.events!.error('Stale error.');
    second.events!.final('New session.');
    second.events!.ended();
  });
  assert.equal(
    hook.result.current.text,
    'Typed.\n\nFinal fiction.\n\nNew session.'
  );
  act(() => hook.result.current.start());
  const pending = hook.latest();
  hook.unmount();
  assert.equal(pending.disposed, true);
  const finalText = hook.result.current.text;
  act(() => pending.events!.final('After unmount.'));
  assert.equal(hook.result.current.text, finalText);
});

test('the hook handles unavailable and failed replacement engines', () => {
  const unsupported = setup('', false);
  assert.equal(unsupported.result.current.state, 'unsupported');
  act(() => unsupported.result.current.start());
  assert.equal(unsupported.latest().disposed, true);
  unsupported.unmount();
  const hook = setup();
  act(() => hook.result.current.start());
  act(() =>
    hook.latest().events!.error('The transcription service is unavailable.')
  );
  assert.equal(hook.result.current.state, 'error');
  assert.equal(hook.result.current.text, 'Typed.');
  act(() => hook.result.current.start());
  act(() => hook.latest().events!.ended());
  assert.equal(hook.result.current.state, 'idle');
});

test('reaching the draft limit invalidates all subsequent engine callbacks', () => {
  const hook = setup('🌱'.repeat(MAX_SHARE_TEXT_LENGTH - 3));
  act(() => hook.result.current.start());
  const engine = hook.latest();
  act(() => {
    engine.events!.final('Fictional words.');
    engine.events!.interim('Ignored.');
    engine.events!.final('Also ignored.');
    engine.events!.ended();
  });
  assert.equal(
    Array.from(hook.result.current.text).length,
    MAX_SHARE_TEXT_LENGTH
  );
  assert.equal(hook.result.current.interim, '');
  assert.match(hook.result.current.message, /10,000 character limit/);
  assert.equal(engine.disposed, true);
});

test('diagnostic event emission does not repeatedly access browser storage', (context) => {
  dom.window.history.replaceState({}, '', '/?speechDebug=1');
  const storage = context.mock.method(dom.window.Storage.prototype, 'setItem');
  const consoleLog = context.mock.method(console, 'info', () => {});
  configureSpeechDiagnostics();
  const reads = context.mock.method(dom.window.Storage.prototype, 'getItem');
  const accesses = storage.mock.callCount();
  const initialReads = reads.mock.callCount();
  speechDiagnostic('first-event');
  speechDiagnostic('second-event');
  assert.equal(storage.mock.callCount(), accesses);
  assert.equal(reads.mock.callCount(), initialReads);
  assert.equal(consoleLog.mock.callCount(), 2);
  dom.window.history.replaceState({}, '', '/?speechDebug=0');
  configureSpeechDiagnostics();
  speechDiagnostic('disabled');
  assert.equal(consoleLog.mock.callCount(), 2);
});

test('rerendering with a new factory reference does not cancel the selected engine', () => {
  const engines: FakeEngine[] = [];
  const create = () => {
    const engine = new FakeEngine();
    engines.push(engine);
    return engine;
  };
  const hook = renderHook(
    ({ factory }) => useTranscription('', () => {}, { createEngine: factory }),
    { initialProps: { factory: () => create() } }
  );
  act(() => hook.result.current.start());
  const active = engines.at(-1)!;
  act(() => active.events!.listening());
  hook.rerender({ factory: () => create() });
  assert.equal(hook.result.current.state, 'listening');
  assert.equal(active.disposed, false);
  assert.equal(engines.length, 2);
});

test('a late startup callback cannot resume a stopping session, but final text can still arrive', () => {
  const hook = setup();
  act(() => hook.result.current.start());
  const engine = hook.latest();
  act(() => {
    hook.result.current.stop();
    engine.events!.listening();
  });
  assert.equal(hook.result.current.state, 'stopping');
  act(() => {
    engine.events!.final('Final words after cancel.');
    engine.events!.ended();
  });
  assert.equal(hook.result.current.state, 'idle');
  assert.equal(hook.result.current.text, 'Typed.\n\nFinal words after cancel.');
});

test('Strict Mode setup-cleanup-setup releases probes and unmount cancels activity and recognition', (context) => {
  const engines: FakeEngine[] = [];
  const factory = () => {
    const engine = new FakeEngine();
    engines.push(engine);
    return engine;
  };
  const hook = renderHook(
    () => {
      const [text, setText] = useState('Typed.');
      return {
        text,
        ...useTranscription(text, setText, { createEngine: factory })
      };
    },
    { reactStrictMode: true }
  );
  assert.equal(hook.result.current.state, 'idle');
  assert.equal(engines.length, 2);
  assert.ok(engines.every((engine) => engine.disposed && !engine.events));
  act(() => hook.result.current.start());
  const active = engines.at(-1)!;
  act(() => {
    active.events!.listening();
    active.events!.interim('Provisional words.');
  });
  assert.equal(hook.result.current.state, 'listening');
  const timerCleanup = context.mock.method(globalThis, 'clearTimeout');
  hook.unmount();
  assert.equal(active.disposed, true);
  assert.ok(
    timerCleanup.mock.calls.some((call) => call.arguments[0] !== undefined)
  );
  act(() => {
    active.events!.listening();
    active.events!.final('Stale.');
  });
  assert.equal(hook.result.current.text, 'Typed.');
});

test('synchronous engine startup failure preserves the draft and releases the session', () => {
  const engines: FakeEngine[] = [];
  const factory = () => {
    const engine = new FakeEngine();
    engine.start = () => {
      throw new Error('private startup details');
    };
    engines.push(engine);
    return engine;
  };
  const hook = renderHook(() =>
    useTranscription('Existing words.', () => {}, { createEngine: factory })
  );
  act(() => hook.result.current.start());
  assert.equal(hook.result.current.state, 'error');
  assert.match(hook.result.current.message, /could not start/);
  assert.equal(engines.at(-1)!.disposed, true);
  assert.ok(!hook.result.current.message.includes('private'));
});

test('automatic cleanup is notified only after an explicit stop successfully finalizes new words', () => {
  const engines: FakeEngine[] = [],
    completed: string[] = [];
  const factory = () => {
    const engine = new FakeEngine();
    engines.push(engine);
    return engine;
  };
  const hook = renderHook(() => {
    const [text, setText] = useState('Typed.');
    return {
      text,
      ...useTranscription(text, setText, {
        createEngine: factory,
        onStopped: (value) => completed.push(value)
      })
    };
  });
  act(() => hook.result.current.start());
  act(() => engines.at(-1)!.events!.final('First final.'));
  act(() => hook.result.current.stop());
  assert.deepEqual(completed, []);
  act(() => {
    engines.at(-1)!.events!.final('Trailing final.');
    engines.at(-1)!.events!.ended();
  });
  assert.deepEqual(completed, ['Typed.\n\nFirst final. Trailing final.']);
  act(() => {
    hook.result.current.start();
    engines.at(-1)!.events!.final('Automatic ending.');
    engines.at(-1)!.events!.ended();
  });
  assert.equal(completed.length, 1);
  act(() => {
    hook.result.current.start();
    hook.result.current.stop();
    engines.at(-1)!.events!.ended();
  });
  assert.equal(completed.length, 1);
  act(() => {
    hook.result.current.start();
    engines.at(-1)!.events!.final('Retained.');
    hook.result.current.stop();
    engines.at(-1)!.events!.error('Failure.');
  });
  assert.equal(completed.length, 1);
});

test('microphone grant advances to connecting and late connection callbacks cannot resume a canceled session', () => {
  const s = setup();
  act(() => s.result.current.start());
  const engine = s.latest();
  act(() => engine.events!.connecting?.());
  assert.equal(s.result.current.state, 'connecting');
  assert.equal(s.result.current.active, true);
  act(() => s.result.current.stop());
  act(() => {
    engine.events!.connecting?.();
    engine.events!.listening();
  });
  assert.equal(s.result.current.state, 'stopping');
  act(() => engine.events!.ended());
  assert.equal(s.result.current.state, 'idle');
});
