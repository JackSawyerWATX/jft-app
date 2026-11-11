import {
  SonioxClient,
  AudioPermissionError,
  MicrophoneSource,
  type Recording,
  type RealtimeResult,
  type RecordOptions
} from '@soniox/client';
import type { TranscriptionEngine, TranscriptionEvents } from '../../types';
import { transcriptionCredentialSchema } from '../../model';
import { createSonioxProtocol } from './protocol';
import { sessionConfig } from '../../session-config';

const FAILURE =
  'Speech recognition could not continue. Your finalized words are still here. Please try again.';
type Phase = 'idle' | 'starting' | 'listening' | 'stopping' | 'closed';

export interface SonioxDependencies {
  available(): boolean;
  record(
    options: RecordOptions,
    credential: () => Promise<string>
  ): Pick<Recording, 'on' | 'stop' | 'cancel'>;
  request: typeof fetch;
}
const browser: SonioxDependencies = {
  available: () =>
    typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined' &&
    typeof WebSocket !== 'undefined',
  record: (options, api_key) =>
    new SonioxClient({
      config: async () => ({ api_key: await api_key() })
    }).realtime.record({
      ...options,
      source: new MicrophoneSource({
        constraints: { echoCancellation: true, channelCount: 1 }
      })
    }),
  request: (...args) => fetch(...args)
};

/** One SDK recording per explicit tap; graceful stop drains, disposal cancels. */
export class SonioxTranscriptionSession implements TranscriptionEngine {
  private phase: Phase = 'idle';
  private startup?: ReturnType<typeof setTimeout>;
  private events?: TranscriptionEvents;
  private recording?: ReturnType<SonioxDependencies['record']>;
  private protocol?: ReturnType<typeof createSonioxProtocol>;
  private abort = new AbortController();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  constructor(private readonly deps: SonioxDependencies = browser) {}

  available() {
    return this.deps.available();
  }

  start(events: TranscriptionEvents) {
    if (this.phase !== 'idle') return;
    this.phase = 'starting';
    this.events = events;
    this.protocol = createSonioxProtocol({
      ...events,
      final: (text, join) => {
        if (this.live) events.final(text, join);
      },
      interim: (text) => {
        if (this.live) events.interim(text);
      }
    });
    this.startup = this.later(
      () =>
        this.finish(
          'Microphone or transcription connection timed out. Please try again.'
        ),
      sessionConfig.startTimeoutMs
    );
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', this.visibility);
    if (typeof window !== 'undefined')
      window.addEventListener('pagehide', this.interrupted);
    try {
      // record() starts capture synchronously before resolving the async API key,
      // retaining Safari's user activation. The SDK owns late permission cleanup.
      this.recording = this.deps.record(
        {
          model: 'stt-rt-v6',
          language_hints: ['en'],
          enable_endpoint_detection: true,
          auto_reconnect: false,
          signal: this.abort.signal
        },
        this.requestCredential
      );
      this.subscribe(this.recording);
    } catch {
      this.finish(FAILURE);
    }
  }

  stop() {
    if (!this.live || this.phase === 'stopping') return;
    const connected = this.phase === 'listening';
    this.phase = 'stopping';
    if (!connected) {
      this.finish();
      return;
    }
    this.events?.activity?.(false);
    this.later(
      () =>
        this.finish(
          'Finalization timed out. Your finalized words are still here; review before saving.'
        ),
      sessionConfig.finalTimeoutMs
    );
    void this.recording?.stop().then(
      () => this.finish(),
      () => this.finish(FAILURE)
    );
  }

  dispose() {
    if (this.phase === 'closed') return;
    this.phase = 'closed';
    this.events = undefined;
    this.abort.abort();
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.recording?.cancel();
    this.recording = undefined;
    this.protocol = undefined;
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.visibility);
    if (typeof window !== 'undefined')
      window.removeEventListener('pagehide', this.interrupted);
  }

  private readonly requestCredential = async () => {
    const response = await this.deps.request('/api/transcription/session', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-stt-provider': 'soniox'
      },
      body: '{}',
      cache: 'no-store',
      signal: this.abort.signal
    });
    if (!response.ok) throw new Error('Credential unavailable');
    const parsed = transcriptionCredentialSchema.safeParse(
      await response.json()
    );
    this.abort.signal.throwIfAborted();
    if (!parsed.success) throw new Error('Credential unavailable');
    return parsed.data.value;
  };

  private subscribe(recording: ReturnType<SonioxDependencies['record']>) {
    recording.on('state_change', ({ new_state }) => {
      if (this.live && new_state === 'connecting') this.events?.connecting?.();
    });
    recording.on('connected', this.connected);
    recording.on('result', this.result);
    recording.on('endpoint', this.endpoint);
    recording.on('finished', () => this.finish());
    recording.on('source_muted', this.interrupted);
    recording.on('error', this.failed);
  }

  private readonly connected = () => {
    if (!this.live || this.phase === 'stopping') return;
    clearTimeout(this.startup);
    this.phase = 'listening';
    this.events?.listening();
    if (this.live) this.later(() => this.stop(), sessionConfig.maxSessionMs);
  };

  private readonly result = (result: RealtimeResult) => {
    if (!this.live) return;
    this.protocol?.accept(result);
    this.events?.activity?.(result.tokens.length > 0);
  };

  private readonly endpoint = () => {
    if (!this.live) return;
    this.protocol?.finish();
    this.events?.activity?.(false);
  };

  private readonly failed = (error: Error) => {
    const message =
      error instanceof AudioPermissionError
        ? 'Microphone access was denied. Allow microphone access in your browser settings and try again.'
        : FAILURE;
    this.finish(message);
  };

  private get live() {
    return this.phase !== 'idle' && this.phase !== 'closed';
  }

  private finish(error?: string) {
    if (!this.live) return;
    const events = this.events!;
    this.protocol?.finish();
    if (!this.live) return;
    this.dispose();
    if (error) events.error(error);
    else events.ended();
  }

  private readonly interrupted = () =>
    this.finish(
      'Recording was interrupted. Your finalized words are still here. Tap to record again.'
    );

  private readonly visibility = () => {
    if (document.visibilityState === 'hidden') this.interrupted();
  };

  private later(callback: () => void, ms: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (this.live) callback();
    }, ms);
    this.timers.add(timer);
    return timer;
  }
}
export const createSonioxSpeech = () => new SonioxTranscriptionSession();
