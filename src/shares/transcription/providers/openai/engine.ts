import { OpenAIRealtimeWebRTC, WebRTCError } from 'openai/realtime/webrtc';
import type { TranscriptionEngine, TranscriptionEvents } from '../../types';
import { createOpenAIProtocol } from './protocol';
import {
  exchangeOpenAISdp,
  requestOpenAICredential,
  TranscriptionUnavailable
} from './connection';
import { sessionConfig } from './config';
import { browser, type SpeechDependencies } from './browser';
import {
  microphoneErrorCode,
  microphoneErrorMessage
} from '../../microphone-permission';
import { watchWebRTCStats } from '../../webrtc-diagnostics';
import { speechDiagnostic } from '../../diagnostics';

const FAILURE =
  'Speech recognition could not continue. Your finalized words are still here. Please try again.';
type Phase =
  | 'idle'
  | 'acquiring'
  | 'connecting'
  | 'listening'
  | 'draining'
  | 'finalizing'
  | 'closed';

/** One session owns all capture resources. The SDK owns negotiation and channel subscriptions. */
export class OpenAITranscriptionSession implements TranscriptionEngine {
  private phase: Phase = 'idle';
  private stream?: MediaStream;
  private connection?: OpenAIRealtimeWebRTC;
  private unwatch?: () => void;
  private unwatchStats?: () => void;
  private events?: TranscriptionEvents;
  private protocol?: ReturnType<typeof createOpenAIProtocol>;
  private readonly abort = new AbortController();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(private readonly deps: SpeechDependencies = browser) {}

  available() {
    const supported = this.deps.available();
    speechDiagnostic('availability', { supported });
    return supported;
  }

  private get live() {
    return this.phase !== 'idle' && this.phase !== 'closed';
  }

  start(events: TranscriptionEvents) {
    if (this.phase !== 'idle') return;
    this.phase = 'acquiring';
    this.events = events;
    this.protocol = createOpenAIProtocol({
      ...events,
      final: (text) => {
        if (this.live) {
          speechDiagnostic('final-committed');
          events.final(text);
        }
      },
      interim: (text) => {
        if (this.live) events.interim(text);
      }
    });
    speechDiagnostic('start-requested');
    const startup = this.later(
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
    // Calling the async method immediately preserves getUserMedia's user activation.
    void this.connect(startup);
  }

  stop() {
    if (!this.live || this.phase === 'draining' || this.phase === 'finalizing')
      return;
    const listening = this.phase === 'listening';
    this.phase = 'draining';
    this.stopMicrophone();
    this.events?.activity?.(false);
    if (!this.live) return;
    if (!listening) {
      this.finish();
      return;
    }
    // RTP and data channel delivery are independent; allow the last packets to drain.
    this.later(() => {
      this.phase = 'finalizing';
      this.commit();
    }, sessionConfig.audioDrainMs);
    this.later(
      () =>
        this.finish(
          'Finalization timed out. Your finalized words are still here; review before saving.'
        ),
      sessionConfig.finalTimeoutMs
    );
  }

  dispose() {
    if (this.phase === 'closed') return;
    this.phase = 'closed';
    this.abort.abort();
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.stopMicrophone();
    this.unwatchStats?.();
    this.unwatchStats = undefined;
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.visibility);
    if (typeof window !== 'undefined')
      window.removeEventListener('pagehide', this.interrupted);
    this.connection?.close();
    this.connection = undefined;
    this.protocol = undefined;
    this.events = undefined;
    speechDiagnostic('dispose');
  }

  private async connect(startup: ReturnType<typeof setTimeout>) {
    const started = performance.now();
    try {
      const microphone = this.deps.microphone();
      const credential = requestOpenAICredential(
        this.deps.fetch,
        this.abort.signal
      );
      // Permission may remain pending after an early credential failure.
      void credential.catch(() => {});
      const stream = await microphone;
      if (!this.live) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.phase = 'connecting';
      stream.getTracks().forEach((track) => {
        track.onended = this.interrupted;
      });
      speechDiagnostic('microphone-permission-granted', {
        elapsedMs: Math.round(performance.now() - started)
      });
      this.events?.connecting?.();
      if (!this.live) return;
      const connection = this.deps.connection();
      this.connection = connection;
      stream
        .getTracks()
        .forEach((track) => connection.peerConnection.addTrack(track, stream));
      connection.onEvent((event) => {
        if (!this.live) return;
        try {
          this.protocol!.accept(event);
          if (this.phase === 'finalizing' && !this.protocol?.pending())
            this.finish();
        } catch {
          this.finish(FAILURE);
        }
      });
      connection.onConnectionEvent((event) => {
        if (!this.live) return;
        if (
          event.type === 'error' ||
          (event.type === 'closed' && this.phase !== 'connecting')
        )
          this.finish(FAILURE);
      });
      await connection.connect({
        signal: this.abort.signal,
        timeoutMs: sessionConfig.startTimeoutMs,
        exchangeSdp: (offer, { signal }) =>
          exchangeOpenAISdp(offer, this.deps.fetch, signal, credential)
      });
      if (!this.live) return;
      clearTimeout(startup);
      this.timers.delete(startup);
      this.phase = 'listening';
      speechDiagnostic('data-channel-open', {
        elapsedMs: Math.round(performance.now() - started)
      });
      this.unwatchStats = watchWebRTCStats(connection.peerConnection);
      const unwatch = this.deps.watch(
        stream,
        (speaking) => {
          if (this.phase === 'listening') this.events?.activity?.(speaking);
        },
        () => {
          if (this.phase === 'listening') this.commit();
        },
        this.interrupted
      );
      if (!this.live) {
        unwatch();
        return;
      }
      this.unwatch = unwatch;
      speechDiagnostic('recognition-start');
      this.events?.listening();
      if (!this.live) return;
      this.later(() => this.stop(), sessionConfig.maxSessionMs);
    } catch (cause) {
      if (!this.live) return;
      if (this.phase === 'acquiring') {
        const code = microphoneErrorCode(cause);
        speechDiagnostic('microphone-permission-failed', { code });
        this.finish(microphoneErrorMessage(code));
      } else {
        const failure = cause instanceof WebRTCError ? cause.cause : cause;
        this.finish(
          failure instanceof TranscriptionUnavailable
            ? 'Transcription is unavailable. You can still type and save your share.'
            : FAILURE
        );
      }
    }
  }

  private commit() {
    if (!this.live) return;
    try {
      this.protocol!.commitRequested();
      speechDiagnostic('audio-turn-commit');
      this.connection!.send({ type: 'input_audio_buffer.commit' });
    } catch {
      this.finish(FAILURE);
    }
  }
  private stopMicrophone() {
    this.unwatch?.();
    this.unwatch = undefined;
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = undefined;
  }
  private finish(error?: string) {
    if (!this.live) return;
    const events = this.events!;
    this.dispose();
    if (error) {
      speechDiagnostic('recognition-error', { code: 'provider' });
      events.error(error);
    } else {
      speechDiagnostic('recognition-end');
      events.ended();
    }
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

export const createOpenAISpeech = (
  deps?: SpeechDependencies
): TranscriptionEngine => new OpenAITranscriptionSession(deps);
