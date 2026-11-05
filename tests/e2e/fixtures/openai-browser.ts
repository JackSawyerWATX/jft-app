import { expect, type Page } from '@playwright/test';

/** Mock only the browser audio/transport boundaries. The real engine, hook and editor run unchanged. */
export async function mockSpeech(page: Page) {
  await page.route('**/api/transcription/session', (route) =>
    route.fulfill({ json: { value: 'ephemeral-fiction', expires_at: 123 } })
  );
  await page.route('https://api.openai.com/v1/realtime/calls', (route) =>
    route.fulfill({ body: 'fictional-answer' })
  );
  await page.addInitScript(() => {
    let sequence = 0;
    let previous: string | null = null;
    let finalized = new Set<number>();
    let ids = new Map<number, string>();
    let amplitude = 0;
    const send = (event: object) =>
      Peer.current.channel.onmessage?.({ data: JSON.stringify(event) });
    class Track {
      onended: (() => void) | null = null;
      stop() {
        Object.assign(window, { aborted: true });
      }
    }
    class Peer {
      static current: Peer;
      connectionState = 'connected';
      localDescription = { type: 'offer', sdp: 'fictional-offer' };
      addEventListener(type: string, listener: unknown) {
        Reflect.set(this, `on${type}`, listener);
      }
      removeEventListener(type: string) {
        Reflect.set(this, `on${type}`, null);
      }
      onconnectionstatechange: (() => void) | null = null;
      channel = {
        readyState: 'connecting',
        addEventListener(type: string, listener: unknown) {
          Reflect.set(this, `on${type}`, listener);
        },
        removeEventListener(type: string) {
          Reflect.set(this, `on${type}`, null);
        },
        onopen: null as (() => void) | null,
        onmessage: null as ((event: { data: string }) => void) | null,
        onerror: null,
        onclose: null,
        commits: 0,
        send: () => {
          this.channel.commits++;
        },
        close() {}
      };
      constructor() {
        Peer.current = this;
        previous = null;
        finalized = new Set();
        ids = new Map();
        amplitude = 0;
        Object.assign(window, { speechReady: false, aborted: false });
      }
      addTrack() {}
      createDataChannel() {
        return this.channel;
      }
      async createOffer() {
        return { type: 'offer', sdp: 'fictional-offer' };
      }
      async setLocalDescription() {}
      async setRemoteDescription() {
        Object.assign(window, { speechReady: true });
      }
      close() {}
    }
    class Context {
      state = 'running';
      onstatechange = null;
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
      createAnalyser() {
        return {
          fftSize: 1024,
          getFloatTimeDomainData: (data: Float32Array) => data.fill(amplitude)
        };
      }
      async resume() {}
      async close() {}
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          Reflect.set(
            window,
            'microphoneRequests',
            (Reflect.get(window, 'microphoneRequests') ?? 0) + 1
          );
          const name = Reflect.get(window, 'microphoneError');
          if (name)
            throw new DOMException('sensitive permission details', name);
          const track = new Track();
          const stream = { getTracks: () => [track] };
          if (Reflect.get(window, 'permissionPending')) {
            return new Promise((resolve) =>
              Reflect.set(window, 'grantMicrophone', () => resolve(stream))
            );
          }
          return stream;
        }
      }
    });
    Object.assign(window, {
      RTCPeerConnection: Peer,
      AudioContext: Context,
      speechStart: () => {
        Peer.current.channel.readyState = 'open';
        Peer.current.channel.onopen?.();
      },
      speechAudio: () => {},
      speechCommits: () => Peer.current.channel.commits,
      speechActivity: (active: boolean) => {
        amplitude = active ? 0.1 : 0;
      },
      speechEnd: () => {
        for (let i = 0; i < Math.max(1, Peer.current.channel.commits); i++)
          send({
            type: 'error',
            error: { code: 'input_audio_buffer_commit_empty' }
          });
      },
      speechError: (message: string) =>
        send({ type: 'error', error: { message } }),
      speechResult: (segments: [string, boolean][]) => {
        for (let i = 0; i < segments.length; i++) {
          if (finalized.has(i)) continue;
          const [text, final] = segments[i];
          const id = ids.get(i) ?? `item_${++sequence}`;
          ids.set(i, id);
          if (final) {
            send({
              type: 'input_audio_buffer.committed',
              item_id: id,
              previous_item_id: previous
            });
            previous = id;
            finalized.add(i);
            send({
              type: 'conversation.item.input_audio_transcription.completed',
              item_id: id,
              transcript: text
            });
          } else
            send({
              type: 'conversation.item.input_audio_transcription.delta',
              item_id: id,
              delta: text,
              event_id: `delta_${++sequence}`
            });
        }
      },
      captureStale: () => {
        const callback = Peer.current.channel.onmessage;
        Object.assign(window, {
          stale: () =>
            callback?.({
              data: JSON.stringify({
                type: 'conversation.item.input_audio_transcription.completed',
                item_id: 'stale',
                transcript: 'Stale fictional text'
              })
            })
        });
      }
    });
  });
}

export async function emit(page: Page, name: string, value?: unknown) {
  if (name !== 'stale')
    await page.waitForFunction(() => Reflect.get(window, 'speechReady'));
  if (name === 'speechEnd') {
    const canceling = await page
      .getByRole('button', { name: /^Cancel (microphone|connection)$/ })
      .isVisible();
    const stop = page.getByRole('button', {
      name: /^(Stop listening|Cancel microphone|Cancel connection)$/
    });
    if (await stop.isVisible()) await stop.click();
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, 'aborted')))
      .toBe(true);
    // Wait for the real engine to drain RTP and send its final commit.
    if (!canceling)
      await expect
        .poll(() => page.evaluate(() => Reflect.get(window, 'speechCommits')()))
        .toBeGreaterThan(0);
  }
  await page.evaluate(({ name, value }) => Reflect.get(window, name)(value), {
    name,
    value
  });
}
