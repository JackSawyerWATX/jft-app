import { useEffect, useRef, useState } from 'react';
import { configureSpeechDiagnostics, speechDiagnostic } from './diagnostics';
import { createBrowserSpeech } from './browser-speech';
import { appendTranscript } from './append-transcript';
import type { TranscriptionEngine, TranscriptionState } from './types';

const SPEECH_ACTIVITY_HOLD_MS = 1_400;

/**
 * Own one engine session and commit only final segments to the draft.
 * The factory is selected once per mount; remount to switch providers.
 */
export function useTranscription(
  text: string,
  onTextChange: (text: string) => void,
  createEngine: () => TranscriptionEngine = createBrowserSpeech
) {
  const factory = useRef(createEngine);
  const [state, setState] = useState<TranscriptionState>('unsupported');
  const [speaking, setSpeaking] = useState(false);
  const activityTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const [interim, setInterim] = useState('');
  const [message, setMessage] = useState('');
  const engine = useRef<TranscriptionEngine | null>(null);
  const generation = useRef(0);
  const current = useRef({ text, onTextChange });
  useEffect(() => {
    current.current = { text, onTextChange };
  }, [text, onTextChange]);
  useEffect(() => {
    configureSpeechDiagnostics();
    // Capability is read after hydration so SSR markup stays consistent.
    const probe = factory.current();
    const supported = probe.available();
    probe.dispose();
    setState(supported ? 'idle' : 'unsupported');
    const visibility = () =>
      speechDiagnostic('visibility-changed', {
        visible: document.visibilityState === 'visible'
      });
    const connectivity = () =>
      speechDiagnostic('connectivity-changed', { online: navigator.onLine });
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', connectivity);
    window.addEventListener('offline', connectivity);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('online', connectivity);
      window.removeEventListener('offline', connectivity);
      // This is a session counter, not a DOM ref; invalidate the latest session.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      clearTimeout(activityTimer.current);
      speechDiagnostic('editor-unmount');
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    speechDiagnostic('editor-state', { state });
  }, [state]);
  const active =
    state === 'starting' || state === 'listening' || state === 'stopping';
  function stop() {
    speechDiagnostic('editor-stop');
    if (!engine.current) return;
    setState('stopping');
    engine.current.stop();
  }
  function start() {
    speechDiagnostic('editor-start');
    if (engine.current) {
      speechDiagnostic('editor-start-ignored');
      return;
    }
    const next = factory.current();
    if (!next.available()) {
      next.dispose();
      setState('unsupported');
      return;
    }
    engine.current = next;
    const session = ++generation.current;
    let first = true;
    const live = () => generation.current === session;
    const finish = (failed: boolean, notice: string) => {
      if (!live()) {
        speechDiagnostic('stale-finish-ignored', { session });
        return;
      }
      generation.current++;
      next.dispose();
      engine.current = null;
      clearTimeout(activityTimer.current);
      setSpeaking(false);
      setInterim('');
      setState(failed ? 'error' : 'idle');
      setMessage(notice);
    };
    setMessage('');
    setInterim('');
    setState('starting');
    const pulse = () => {
      if (!live()) return;
      clearTimeout(activityTimer.current);
      setSpeaking(true);
      activityTimer.current = setTimeout(() => {
        if (live()) setSpeaking(false);
      }, SPEECH_ACTIVITY_HOLD_MS);
    };
    next.start({
      activity: (value) => {
        if (!live()) return;
        clearTimeout(activityTimer.current);
        setSpeaking(value);
      },
      listening: () => {
        if (live())
          setState((current) =>
            current === 'starting' ? 'listening' : current
          );
      },
      interim: (value) => {
        if (live()) {
          setInterim(value);
          if (value) pulse();
        }
      },
      final: (value) => {
        if (!live() || !value.trim()) {
          speechDiagnostic('final-ignored', {
            session,
            stage: !live() ? 'stale' : 'empty'
          });
          return;
        }
        pulse();
        speechDiagnostic('final-committed', { session });
        const result = appendTranscript(current.current.text, value, first);
        first = false;
        current.current.text = result.text;
        current.current.onTextChange(result.text);
        if (result.full) {
          speechDiagnostic('draft-limit-reached', { session });
          finish(
            false,
            'Your share has reached the 10,000 character limit. Review or shorten your words before adding more.'
          );
        }
      },
      error: (notice) => finish(true, notice),
      ended: () => finish(false, 'Tap to record more.')
    });
  }
  return { state, interim, message, active, speaking, start, stop };
}
