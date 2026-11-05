import { OpenAIRealtimeWebRTC } from 'openai/realtime/webrtc';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpenAISpeech } from '../../../src/shares/transcription/providers/openai/engine';
import type { SpeechDependencies } from '../../../src/shares/transcription/providers/openai/browser';
import type { TranscriptionEvents } from '../../../src/shares/transcription/types';

const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
function setup(overrides: Partial<SpeechDependencies> = {}) {
  const finals: string[] = [],
    partials: string[] = [],
    errors: string[] = [],
    activity: boolean[] = [];
  let ended = 0,
    listening = 0,
    stopped = 0,
    unwatched = 0,
    closed = 0;
  const sent: string[] = [];
  const track = {
    stop: () => {
      stopped++;
    },
    onended: null as (() => void) | null
  };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const channel = {
    readyState: 'connecting',
    addEventListener(type: string, listener: unknown) {
      Reflect.set(this, `on${type}`, listener);
    },
    removeEventListener(type: string) {
      Reflect.set(this, `on${type}`, null);
    },
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: (data: string) => sent.push(data),
    close: () => {
      closed++;
    }
  } as unknown as RTCDataChannel;
  const peer = {
    addEventListener(type: string, listener: unknown) {
      Reflect.set(this, `on${type}`, listener);
    },
    removeEventListener(type: string) {
      Reflect.set(this, `on${type}`, null);
    },
    localDescription: { type: 'offer', sdp: 'fictional-offer' },
    addTrack() {},
    createDataChannel: () => channel,
    createOffer: async () => ({ type: 'offer', sdp: 'fictional-offer' }),
    setLocalDescription: async () => {},
    setRemoteDescription: async () => {},
    close: () => {
      closed++;
      channel.close();
    },
    connectionState: 'connected',
    onconnectionstatechange: null
  } as unknown as RTCPeerConnection;
  let cue: (value: boolean) => void, boundary: () => void;
  const calls: { url: string; init?: RequestInit }[] = [];
  const deps: SpeechDependencies = {
    available: () => true,
    microphone: async () => stream,
    connection: () => {
      const original = Object.getOwnPropertyDescriptor(
        globalThis,
        'RTCPeerConnection'
      );
      Object.defineProperty(globalThis, 'RTCPeerConnection', {
        configurable: true,
        value: class {
          constructor() {
            return peer;
          }
        }
      });
      try {
        return new OpenAIRealtimeWebRTC();
      } finally {
        if (original)
          Object.defineProperty(globalThis, 'RTCPeerConnection', original);
        else Reflect.deleteProperty(globalThis, 'RTCPeerConnection');
      }
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return String(url).startsWith('/')
        ? Response.json({ value: 'ephemeral-fiction', expires_at: 123 })
        : new Response('fictional-answer');
    },
    watch: (_stream, active, commit) => {
      cue = active;
      boundary = commit;
      return () => {
        unwatched++;
      };
    },
    ...overrides
  };
  const engine = createOpenAISpeech(deps);
  const events: TranscriptionEvents = {
    final: (text) => finals.push(text),
    interim: (text) => partials.push(text),
    error: (text) => errors.push(text),
    activity: (value) => activity.push(value),
    ended: () => {
      ended++;
    },
    listening: () => {
      listening++;
    }
  };
  const message = (event: object) =>
    channel.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);
  const open = async () => {
    engine.start(events);
    await settle();
    Object.assign(channel, { readyState: 'open' });
    channel.onopen?.(new Event('open'));
    await settle();
  };
  const committed = (id: string, previous: string | null = null) =>
    message({
      type: 'input_audio_buffer.committed',
      item_id: id,
      previous_item_id: previous
    });
  const final = (id: string, text: string) =>
    message({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: id,
      transcript: text
    });
  return {
    engine,
    events,
    channel,
    peer,
    track,
    stream,
    open,
    message,
    committed,
    final,
    finals,
    partials,
    errors,
    activity,
    sent,
    calls,
    cue: (value: boolean) => cue(value),
    boundary: () => boundary(),
    counts: () => ({ ended, listening, stopped, unwatched, closed })
  };
}

test('live deltas are provisional, corrected finals commit once in audio order, activity is independent', async () => {
  const s = setup();
  await s.open();
  assert.equal(s.counts().listening, 1);
  s.message({
    type: 'conversation.item.input_audio_transcription.delta',
    item_id: 'a',
    event_id: 'delta1',
    delta: 'hello'
  });
  s.message({
    type: 'conversation.item.input_audio_transcription.delta',
    item_id: 'a',
    event_id: 'delta1',
    delta: 'hello'
  });
  assert.equal(s.partials.at(-1), 'hello');
  assert.deepEqual(s.finals, []);
  s.committed('a');
  s.committed('b', 'a');
  s.final('b', 'Second sentence.');
  assert.deepEqual(s.finals, []);
  s.final('a', 'Hello!');
  s.final('a', 'Duplicate.');
  assert.deepEqual(s.finals, ['Hello!', 'Second sentence.']);
  assert.equal(s.partials.at(-1), '');
  s.cue(true);
  s.cue(false);
  assert.deepEqual(s.activity, [true, false]);
  s.boundary();
  assert.match(s.sent[0], /input_audio_buffer.commit/);
  assert.equal(s.calls[1].init?.credentials, 'omit');
  assert.equal(
    new Headers(s.calls[1].init?.headers).get('authorization'),
    'Bearer ephemeral-fiction'
  );
  s.engine.dispose();
  assert.equal(s.counts().unwatched, 1);
  assert.equal(s.counts().stopped, 1);
});

test('stop releases microphone immediately, drains final audio and accepts finalization before ending', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = setup();
  await s.open();
  s.engine.stop();
  s.engine.stop();
  assert.equal(s.counts().stopped, 1);
  assert.equal(s.counts().ended, 0);
  t.mock.timers.tick(300);
  assert.equal(s.sent.length, 1);
  s.committed('a');
  s.final('a', 'Final after stop.');
  assert.deepEqual(s.finals, ['Final after stop.']);
  assert.equal(s.counts().ended, 1);
  assert.equal(s.counts().closed, 2);
});

test('empty audio commits end normally and finalization timeout preserves finals with a notice', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const empty = setup();
  await empty.open();
  empty.engine.stop();
  t.mock.timers.tick(300);
  empty.message({
    type: 'error',
    error: { code: 'input_audio_buffer_commit_empty' }
  });
  assert.equal(empty.counts().ended, 1);
  assert.deepEqual(empty.errors, []);
  const s = setup();
  await s.open();
  s.committed('a');
  s.final('a', 'Retained.');
  s.engine.stop();
  t.mock.timers.tick(5_000);
  assert.match(s.errors[0], /Finalization timed out/);
  assert.deepEqual(s.finals, ['Retained.']);
});

test('late permission grants and startup completions are cleaned up after cancel', async () => {
  let grant!: (stream: MediaStream) => void;
  const s = setup({
    microphone: () =>
      new Promise((resolve) => {
        grant = resolve;
      })
  });
  s.engine.start(s.events);
  s.engine.stop();
  grant(s.stream);
  await settle();
  assert.equal(s.counts().stopped, 1);
  assert.equal(s.calls.length, 1); // Temporary credential work overlaps permission; SDP/audio must never start after cancellation.
  assert.equal(s.calls[0].url, '/api/transcription/session');
  assert.equal(s.calls[0].init?.signal?.aborted, true);
  assert.equal(s.counts().ended, 1);
  let token!: (response: Response) => void;
  const pending = setup({
    fetch: () =>
      new Promise((resolve) => {
        token = resolve;
      })
  });
  pending.engine.start(pending.events);
  await settle();
  pending.engine.dispose();
  token(Response.json({ value: 'late', expires_at: 123 }));
  await settle();
  assert.equal(pending.counts().closed, 2);
  assert.equal(pending.counts().listening, 0);
});

test('permission, microphone, HTTP and provider failures are sanitized and release resources', async () => {
  for (const name of ['NotAllowedError', 'NotReadableError']) {
    const s = setup({
      microphone: async () => {
        throw new DOMException('sensitive vendor details', name);
      }
    });
    s.engine.start(s.events);
    await settle();
    assert.equal(s.errors.length, 1);
    assert.match(
      s.errors[0],
      name === 'NotAllowedError'
        ? /access was denied/
        : /Microphone unavailable/
    );
    assert.ok(!s.errors[0].includes('sensitive'));
  }
  const http = setup({
    fetch: async () => new Response('secret upstream details', { status: 503 })
  });
  http.engine.start(http.events);
  await settle();
  assert.match(http.errors[0], /unavailable/);
  assert.equal(http.counts().stopped, 1);
  for (const type of [
    'error',
    'conversation.item.input_audio_transcription.failed'
  ]) {
    const s = setup();
    await s.open();
    s.committed('a');
    s.final('a', 'Keep this.');
    const stale = s.channel.onmessage;
    s.message({ type, error: { message: 'sensitive provider details' } });
    stale?.call(s.channel, {
      data: JSON.stringify({
        type: 'conversation.item.input_audio_transcription.completed',
        item_id: 'b',
        transcript: 'Stale.'
      })
    } as MessageEvent);
    assert.equal(s.errors.length, 1);
    assert.ok(!s.errors[0].includes('sensitive'));
    assert.deepEqual(s.finals, ['Keep this.']);
    assert.equal(s.counts().stopped, 1);
  }
});

test('connection loss, malformed events, startup timeout and track interruptions terminate sessions', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = setup();
  await s.open();
  Object.assign(s.peer, { connectionState: 'failed' });
  s.peer.onconnectionstatechange?.(new Event('connectionstatechange'));
  assert.equal(s.errors.length, 1);
  assert.equal(s.counts().stopped, 1);
  const invalid = setup();
  await invalid.open();
  invalid.message({
    type: 'conversation.item.input_audio_transcription.delta',
    item_id: 'a',
    delta: {}
  });
  assert.equal(invalid.errors.length, 1);
  const pending = setup();
  pending.engine.start(pending.events);
  await settle();
  t.mock.timers.tick(20_000);
  assert.match(pending.errors[0], /timed out/);
  assert.equal(pending.counts().stopped, 1);
  const track = setup();
  await track.open();
  track.track.onended?.();
  assert.match(track.errors[0], /interrupted/);
});

test('session limit stops capture and repeated disposal does not emit events', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = setup();
  await s.open();
  t.mock.timers.tick(10 * 60_000);
  assert.equal(s.counts().stopped, 1);
  s.engine.dispose();
  s.engine.dispose();
  s.engine.start(s.events);
  assert.equal(s.counts().listening, 1);
  assert.deepEqual(s.errors, []);
});

test('Unicode finals reach the draft boundary without truncating by UTF-16 length', async () => {
  const s = setup();
  await s.open();
  s.committed('a');
  s.final('a', '🌱'.repeat(6_000));
  assert.equal(Array.from(s.finals[0]).length, 6_000);
  s.engine.dispose();
  s.engine.dispose();
  assert.equal(s.counts().stopped, 1);
});

test('optional predecessor links and textless delta events follow the SDK protocol', async () => {
  const s = setup();
  await s.open();
  s.message({
    type: 'conversation.item.input_audio_transcription.delta',
    item_id: 'a'
  });
  assert.deepEqual(s.errors, []);
  s.message({ type: 'input_audio_buffer.committed', item_id: 'a' });
  s.message({ type: 'input_audio_buffer.committed', item_id: 'b' });
  s.final('b', 'Second.');
  assert.deepEqual(s.finals, []);
  s.final('a', 'First.');
  assert.deepEqual(s.finals, ['First.', 'Second.']);
  s.engine.dispose();
});

test('credential acquisition starts while microphone permission is pending, without opening the audio transport', async () => {
  let grant!: (stream: MediaStream) => void;
  const s = setup({
    microphone: () =>
      new Promise((resolve) => {
        grant = resolve;
      })
  });
  s.engine.start(s.events);
  await settle();
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].url, '/api/transcription/session');
  assert.equal(s.counts().listening, 0);
  assert.equal(s.sent.length, 0);
  grant(s.stream);
  await settle();
  assert.equal(s.calls.length, 2);
  Object.assign(s.channel, { readyState: 'open' });
  s.channel.onopen?.(new Event('open'));
  await settle();
  assert.equal(s.counts().listening, 1);
  s.engine.dispose();
});

test('SDP preparation is not blocked by a pending credential, but the provider call waits for both', async () => {
  let issue!: (response: Response) => void,
    prepared = false,
    providerCalls = 0;
  const s = setup({
    fetch: async (url) => {
      if (String(url).startsWith('/'))
        return new Promise<Response>((resolve) => {
          issue = resolve;
        });
      providerCalls++;
      return new Response('fictional-answer');
    }
  });
  s.peer.setLocalDescription = async () => {
    prepared = true;
  };
  s.engine.start(s.events);
  await settle();
  assert.equal(prepared, true);
  assert.equal(providerCalls, 0);
  assert.equal(s.counts().listening, 0);
  issue(Response.json({ value: 'ephemeral-fiction', expires_at: 123 }));
  await settle();
  assert.equal(providerCalls, 1);
  s.engine.dispose();
});

test('an early credential rejection is handled while permission is pending and cancellation still releases a late grant', async () => {
  let grant!: (stream: MediaStream) => void;
  const s = setup({
    microphone: () =>
      new Promise((resolve) => {
        grant = resolve;
      }),
    fetch: async () => new Response(null, { status: 503 })
  });
  s.engine.start(s.events);
  await settle();
  s.engine.stop();
  grant(s.stream);
  await settle();
  assert.equal(s.counts().stopped, 1);
  assert.equal(s.counts().ended, 1);
  assert.deepEqual(s.errors, []);
});

test('cancellation from the connecting callback stops capture before allocating a peer', async () => {
  let peers = 0;
  const s = setup({
    connection: () => {
      peers++;
      throw new Error('Must not allocate after cancellation');
    }
  });
  s.events.connecting = () => s.engine.stop();
  s.engine.start(s.events);
  await settle();
  assert.equal(peers, 0);
  assert.equal(s.counts().stopped, 1);
  assert.equal(s.counts().ended, 1);
});

test('disposing an unused engine is terminal and never requests a microphone', async () => {
  let requests = 0;
  const s = setup({
    microphone: async () => {
      requests++;
      throw new Error('Unexpected capture');
    }
  });
  s.engine.dispose();
  s.engine.start(s.events);
  await settle();
  assert.equal(requests, 0);
  assert.deepEqual(s.errors, []);
});

test('SDK readiness requires the SDP answer, connected peer and open channel', async () => {
  let answer!: (response: Response) => void;
  const s = setup({
    fetch: async (url) =>
      String(url).startsWith('/')
        ? Response.json({ value: 'ephemeral-fiction', expires_at: 123 })
        : new Promise<Response>((resolve) => {
            answer = resolve;
          })
  });
  s.engine.start(s.events);
  await settle();
  Object.assign(s.channel, { readyState: 'open' });
  s.channel.onopen?.(new Event('open'));
  await settle();
  assert.equal(s.counts().listening, 0);
  Object.assign(s.peer, { connectionState: 'connecting' });
  answer(new Response('fictional-answer'));
  await settle();
  assert.equal(s.counts().listening, 0);
  Object.assign(s.peer, { connectionState: 'connected' });
  s.peer.onconnectionstatechange?.(new Event('connectionstatechange'));
  await settle();
  assert.equal(s.counts().listening, 1);
  s.engine.dispose();
});

test('SDK parsing errors, oversized events and remote channel closure terminate without exposing payloads', async () => {
  for (const failure of ['malformed', 'oversized', 'closed']) {
    const s = setup();
    await s.open();
    if (failure === 'malformed')
      s.channel.onmessage?.({ data: '{private words' } as MessageEvent);
    else if (failure === 'oversized')
      s.message({ type: 'unknown', payload: 'x'.repeat(65_537) });
    else s.channel.onclose?.(new Event('close'));
    assert.equal(s.errors.length, 1);
    assert.ok(!s.errors[0].includes('private'));
    assert.equal(s.counts().stopped, 1);
    assert.equal(s.channel.onmessage, null);
    assert.equal(s.peer.onconnectionstatechange, null);
  }
});

test('cancel during SDK signaling stops capture and ignores a late SDP answer', async () => {
  let answer!: (response: Response) => void;
  const s = setup({
    fetch: async (url) =>
      String(url).startsWith('/')
        ? Response.json({ value: 'ephemeral-fiction', expires_at: 123 })
        : new Promise<Response>((resolve) => {
            answer = resolve;
          })
  });
  s.engine.start(s.events);
  await settle();
  s.engine.stop();
  answer(new Response('fictional-answer'));
  await settle();
  assert.equal(s.counts().stopped, 1);
  assert.equal(s.counts().ended, 1);
  assert.equal(s.counts().listening, 0);
  assert.equal(s.calls.length, 0); // Injected signaling above does not use the default request recorder.
  assert.deepEqual(s.errors, []);
});
