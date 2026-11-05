/** UI lifecycle; stopping includes asynchronous finalization. */
export type TranscriptionState =
  | 'unsupported'
  | 'idle'
  | 'starting'
  | 'connecting'
  | 'listening'
  | 'stopping'
  | 'error';

/** Engines emit each final segment exactly once; interim text replaces its predecessor. */
export interface TranscriptionEvents {
  /** Microphone is granted; transcription transport is still connecting. */
  connecting?(): void;
  listening(): void;
  /** Optional speech activity cue; this is not an audio level measurement. */
  activity?(speaking: boolean): void;
  interim(text: string): void;
  final(text: string): void;
  error(message: string): void;
  ended(): void;
}

/** One session per instance. stop permits final results; dispose cancels and silences callbacks. */
export interface TranscriptionEngine {
  available(): boolean;
  start(events: TranscriptionEvents): void;
  stop(): void;
  dispose(): void;
}

export type TranscriptionEngineFactory = () => TranscriptionEngine;
