import type { FormEvent } from 'react';
import type { CleanupStatus } from '../cleanup/model';
import { useTranscription } from '../transcription/use-transcription';

export interface ShareComposerOptions {
  text: string;
  cleanupStatus: CleanupStatus;
  /** Synchronous guard covers a request starting before React has rendered pending state. */
  isCleanupPending: () => boolean;
  onCleanup: (text: string) => Promise<void>;
  sessionReady: boolean;
  saving: boolean;
  onTextChange: (text: string) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}

/** Coordinates mounted editor workflows; the parent retains draft/save ownership across views. */
export function useShareComposer({
  text,
  cleanupStatus,
  isCleanupPending,
  onCleanup,
  sessionReady,
  saving,
  onTextChange,
  onSave
}: ShareComposerOptions) {
  const voice = useTranscription(text, onTextChange, {
    onStopped: (value) => {
      void onCleanup(value);
    }
  });
  return {
    voice,
    recordingDisabled: !sessionReady || saving || cleanupStatus === 'pending',
    saveDisabled:
      !sessionReady ||
      saving ||
      voice.active ||
      cleanupStatus === 'pending' ||
      !text.trim(),
    retryDisabled: voice.active || saving,
    submit(event: FormEvent<HTMLFormElement>) {
      if (!sessionReady || saving || voice.active || isCleanupPending()) {
        event.preventDefault();
        return;
      }
      onSave(event);
    },
    toggleRecording() {
      if (!sessionReady || saving || isCleanupPending()) return;
      if (voice.active) voice.stop();
      else voice.start();
    },
    retryCleanup() {
      if (!voice.active && !saving && !isCleanupPending()) void onCleanup(text);
    }
  };
}
