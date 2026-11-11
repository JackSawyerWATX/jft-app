import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SonioxTranscriptionSession,
  type SonioxDependencies
} from '../../../src/shares/transcription/providers/soniox/engine';
import { createSonioxProtocol } from '../../../src/shares/transcription/providers/soniox/protocol';
import type { Recording, RealtimeToken, RealtimeResult } from '@soniox/client';

const token = (
  text: string,
  is_final = true,
  start_ms?: number
): RealtimeToken => ({
  text,
  is_final,
  confidence: 1,
  ...(start_ms === undefined ? {} : { start_ms, end_ms: start_ms + 1 })
});
const result = (...tokens: RealtimeToken[]): RealtimeResult => ({
  tokens,
  final_audio_proc_ms: 0,
  total_audio_proc_ms: 0
});
function events() {
  const finals: string[] = [],
    interims: string[] = [],
    errors: string[] = [];
  let ended = 0,
    listening = 0;
  return {
    finals,
    interims,
    errors,
    get ended() {
      return ended;
    },
    get listening() {
      return listening;
    },
    callbacks: {
      final: (text: string) => finals.push(text),
      interim: (text: string) => interims.push(text),
      error: (text: string) => errors.push(text),
      ended: () => ended++,
      listening: () => listening++
    }
  };
}
test('Soniox replaces provisional suffix, preserves split words, punctuation, ordering and repeated words', () => {
  const e = events(),
    p = createSonioxProtocol(e.callbacks);
  p.accept(result(token('Hel', false)));
  p.accept(result(token('Hello', true, 0), token(' wrong', false)));
  p.accept(
    result(token(',', true, 1), token(' world', true, 2), token('?', false))
  );
  p.accept(result(token('!', true, 3)));
  p.accept(result(token('!', true, 3))); // timed duplicate
  p.accept(result(token(' go', true, 4), token(' go', true, 5)));
  p.finish();
  p.finish();
  assert.deepEqual(
    e.finals.map((x) => x.trim()),
    ['Hello', ', world', '!', 'go go']
  );
  assert.equal(e.interims[0], 'Hel');
  assert.ok(e.interims.includes(' wrong'));
  assert.equal(e.interims.at(-1), '');
});
function fixture() {
  const handlers = new Map<string, (...args: never[]) => void>();
  let stopped = 0,
    canceled = 0,
    resolve!: () => void;
  let credential!: () => Promise<string>;
  const drain = new Promise<void>((r) => {
    resolve = r;
  });
  const recording = {
    on(name: string, callback: (...args: never[]) => void) {
      handlers.set(name, callback);
      return recording;
    },
    stop() {
      stopped++;
      return drain;
    },
    cancel() {
      canceled++;
    }
  };
  const deps: SonioxDependencies = {
    available: () => true,
    record: (_options, key) => {
      credential = key;
      return recording as unknown as Recording;
    },
    request: async () =>
      Response.json({ value: 'temporary', expires_at: 9999999999 })
  };
  const engine = new SonioxTranscriptionSession(deps),
    e = events();
  const emit = (name: string, value?: unknown) =>
    handlers.get(name)?.(value as never);
  return {
    engine,
    e,
    emit,
    resolve,
    deps,
    get credential() {
      return credential;
    },
    get stopped() {
      return stopped;
    },
    get canceled() {
      return canceled;
    }
  };
}
test('Soniox Stop releases capture through SDK and drains trailing finals exactly once', async () => {
  const f = fixture();
  f.engine.start(f.e.callbacks);
  f.emit('connected');
  assert.equal(f.e.listening, 1);
  f.emit('result', result(token('Hello')));
  f.engine.stop();
  f.engine.stop();
  assert.equal(f.stopped, 1);
  assert.equal(f.e.ended, 0);
  f.emit('result', result(token(' world.')));
  f.emit('finished');
  f.resolve();
  await Promise.resolve();
  assert.equal(f.e.finals.map((s) => s.trim()).join(' '), 'Hello world.');
  assert.equal(f.e.ended, 1);
  assert.equal(f.canceled, 1);
  f.emit('error', new Error('private speech/key'));
  f.emit('result', result(token('stale')));
  assert.equal(f.e.errors.length, 0);
  assert.equal(f.e.finals.length, 2);
});
test('Soniox early Stop/disposal cancels connection and silences stale permission and network callbacks', () => {
  for (const action of ['stop', 'dispose'] as const) {
    const f = fixture();
    f.engine.start(f.e.callbacks);
    f.engine[action]();
    f.emit('connected');
    f.emit('result', result(token('stale')));
    f.emit('error', new Error('sensitive'));
    assert.equal(f.canceled, 1);
    assert.equal(f.stopped, 0);
    assert.equal(f.e.listening, 0);
    assert.deepEqual(f.e.finals, []);
  }
});
test('Soniox provider errors preserve final text and disclose no upstream details', () => {
  const f = fixture();
  f.engine.start(f.e.callbacks);
  f.emit('connected');
  f.emit('result', result(token('Keep me')));
  f.emit('error', new Error('private speech and credentials'));
  assert.equal(f.e.finals.map((s) => s.trim()).join(' '), 'Keep me');
  assert.equal(f.e.errors.length, 1);
  assert.ok(!f.e.errors[0].includes('private'));
});
test('Soniox credential failure and cancellation are bounded and credentials are provider-specific', async () => {
  const f = fixture();
  let headers: HeadersInit | undefined;
  f.deps.request = async (_url, options) => {
    headers = options?.headers;
    return new Response('', { status: 503 });
  };
  f.engine.start(f.e.callbacks);
  await assert.rejects(f.credential(), /Credential unavailable/);
  assert.equal((headers as Record<string, string>)['x-stt-provider'], 'soniox');
  f.engine.dispose();
  const next = fixture();
  next.engine.start(next.e.callbacks);
  next.engine.dispose();
  await assert.rejects(next.credential());
});

test('Soniox startup and finalization deadlines cancel resources without losing final text', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const startup = fixture();
  startup.engine.start(startup.e.callbacks);
  t.mock.timers.tick(20_000);
  assert.equal(startup.canceled, 1);
  assert.match(startup.e.errors[0], /timed out/);
  const drain = fixture();
  drain.engine.start(drain.e.callbacks);
  drain.emit('connected');
  drain.emit('result', result(token('Retained.')));
  drain.engine.stop();
  t.mock.timers.tick(5_000);
  assert.equal(drain.canceled, 1);
  assert.deepEqual(drain.e.finals, ['Retained.']);
  assert.match(drain.e.errors[0], /Finalization timed out/);
});

test('Soniox Unicode boundaries keep split contractions, punctuation and scripts without spaces intact', () => {
  for (const pieces of [
    ['We', "'re", ' here', '!', ' Again', '.'],
    ['Caf', 'é', '\u00a0déjà', ' vu', '.'],
    ['今日は', 'いい', '日です', '。']
  ]) {
    const e = events();
    const protocol = createSonioxProtocol(e.callbacks);
    for (const piece of pieces) protocol.accept(result(token(piece)));
    protocol.finish();
    const actual = e.finals.join('');
    const expected = pieces.join('');
    assert.equal(actual, expected);
  }
});
