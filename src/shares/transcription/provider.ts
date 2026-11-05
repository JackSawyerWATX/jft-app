import { createOpenAISpeech } from './providers/openai/engine';
import type { TranscriptionEngineFactory } from './types';

// Browser composition: only the selected adapter knows its provider's wire protocol.
// Update server/transcription-provider.ts with the matching credential issuer.
export const createTranscriptionEngine: TranscriptionEngineFactory =
  createOpenAISpeech;
