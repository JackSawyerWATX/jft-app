import { speechDiagnostic, speechErrorCode } from './diagnostics';
import { browserSpeechErrorMessage } from './browser-speech-errors';
import type { TranscriptionEngine, TranscriptionEvents } from './types';

const STOP_FINALIZATION_TIMEOUT_MS = 5_000;

type Result = { isFinal: boolean; 0: { transcript: string } };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onaudiostart?: (() => void) | null;
  onaudioend?: (() => void) | null;
  onsoundstart?: (() => void) | null;
  onsoundend?: (() => void) | null;
  onspeechstart?: (() => void) | null;
  onspeechend?: (() => void) | null;
  onnomatch?: (() => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult:
    | ((event: { resultIndex: number; results: ArrayLike<Result> }) => void)
    | null;
  start(): void;
  stop(): void;
  abort(): void;
};
/** Structural browser types also permit deterministic mocks without a microphone. */
export type SpeechConstructor = new () => Recognition;

function browserConstructor(): SpeechConstructor | undefined {
  if (typeof window === 'undefined') return;
  const browser = window as unknown as {
    SpeechRecognition?: SpeechConstructor;
    webkitSpeechRecognition?: SpeechConstructor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

let diagnosticSession = 0;

/** Browser-managed recognition may use a vendor service. No audio is captured by the app. */
export function createBrowserSpeech(
  Constructor = browserConstructor(),
  language = typeof navigator === 'undefined'
    ? 'en-US'
    : navigator.language || 'en-US'
): TranscriptionEngine {
  const session = ++diagnosticSession;
  let startedAt = 0;
  const diagnostic = (
    event: string,
    details: Parameters<typeof speechDiagnostic>[1] = {}
  ) =>
    speechDiagnostic(event, {
      session,
      elapsedMs: startedAt ? Math.round(performance.now() - startedAt) : 0,
      ...details
    });
  let recognition: Recognition | undefined;
  let live = false;
  let stopRequested = false;
  let callbacks: TranscriptionEvents | undefined;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  const detach = () => {
    clearTimeout(stopTimer);
    if (!recognition) return;
    recognition.onaudiostart =
      recognition.onaudioend =
      recognition.onsoundstart =
      recognition.onsoundend =
      recognition.onspeechstart =
      recognition.onspeechend =
      recognition.onnomatch =
        null;
    recognition.onstart =
      recognition.onend =
      recognition.onerror =
      recognition.onresult =
        null;
  };
  // Every terminal path silences callbacks and clears the finalization timer.
  // Only cancel an active browser session; repeated disposal is harmless.
  const release = (abort = false) => {
    const wasLive = live;
    live = false;
    detach();
    if (abort && wasLive) {
      try {
        recognition?.abort();
      } catch {
        /* The browser may already have ended. */
      }
    }
  };
  return {
    available: () => {
      diagnostic('availability', {
        supported: Boolean(Constructor),
        prefixed:
          typeof window !== 'undefined' &&
          !(
            'SpeechRecognition' in window &&
            Reflect.get(window, 'SpeechRecognition')
          ) &&
          Boolean(Constructor),
        secureContext: typeof window !== 'undefined' && window.isSecureContext,
        online: typeof navigator !== 'undefined' && navigator.onLine,
        visible:
          typeof document !== 'undefined' &&
          document.visibilityState === 'visible'
      });
      return Boolean(Constructor);
    },
    start(events: TranscriptionEvents) {
      if (!Constructor || recognition) {
        diagnostic('start-ignored', {
          stage: !Constructor ? 'unsupported' : 'already-created'
        });
        return;
      }
      startedAt = performance.now();
      diagnostic('start-requested', { language });
      callbacks = events;
      live = true;
      const seen = new Set<number>();
      let stage = 'constructor';
      try {
        recognition = new Constructor();
        stage = 'configuration';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language;
        for (const [property, event] of [
          ['onaudiostart', 'audio-start'],
          ['onaudioend', 'audio-end'],
          ['onsoundstart', 'sound-start'],
          ['onsoundend', 'sound-end'],
          ['onspeechstart', 'speech-start'],
          ['onspeechend', 'speech-end'],
          ['onnomatch', 'no-match']
        ] as const)
          recognition[property] = () => {
            if (!live) return;
            diagnostic(event);
            if (event === 'speech-start') events.activity?.(true);
            if (event === 'speech-end' || event === 'audio-end')
              events.activity?.(false);
          };
        recognition.onstart = () => {
          diagnostic('recognition-start', { stopRequested });
          if (live && !stopRequested) events.listening();
        };
        recognition.onresult = (event) => {
          if (!live) return;
          let interim = '';
          let finalized = 0;
          let provisional = 0;
          let duplicateFinals = 0;
          for (let i = 0; live && i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              if (!seen.has(i)) {
                finalized++;
                seen.add(i);
                events.final(result[0].transcript);
              } else duplicateFinals++;
            } else {
              provisional++;
              interim += `${result[0].transcript} `;
            }
          }
          diagnostic('results', {
            resultIndex: event.resultIndex,
            results: event.results.length,
            finalized,
            provisional,
            duplicateFinals
          });
          if (live) events.interim(interim.trim());
        };
        recognition.onerror = (event) => {
          if (!live) return;
          diagnostic('recognition-error', {
            code: speechErrorCode(event.error),
            stopRequested
          });
          release(true);
          if (event.error === 'no-speech') events.ended();
          else events.error(browserSpeechErrorMessage(event.error));
        };
        recognition.onend = () => {
          if (!live) return;
          diagnostic('recognition-end', {
            stopRequested,
            finalized: seen.size
          });
          release();
          events.ended();
        };
        stage = 'start';
        recognition.start();
        diagnostic('start-returned');
      } catch (cause) {
        diagnostic('start-failed', {
          stage,
          code: speechErrorCode(cause instanceof Error ? cause.name : undefined)
        });
        release(true);
        events.error('Speech recognition could not start. Please try again.');
      }
    },
    stop() {
      if (!live || stopRequested) {
        diagnostic('stop-ignored', { stopRequested });
        return;
      }
      diagnostic('stop-requested');
      stopRequested = true;
      stopTimer = setTimeout(() => {
        if (!live) return;
        diagnostic('stop-timeout');
        release(true);
        callbacks?.ended();
      }, STOP_FINALIZATION_TIMEOUT_MS);
      try {
        recognition?.stop();
        diagnostic('stop-returned');
      } catch (cause) {
        diagnostic('stop-failed', {
          code: speechErrorCode(cause instanceof Error ? cause.name : undefined)
        });
        release(true);
        callbacks?.ended();
      }
    },
    dispose() {
      diagnostic('dispose', { stopRequested });
      release(true);
    }
  };
}
